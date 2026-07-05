import { and, eq, inArray, or } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type {
  DesignerPin,
  DesignerSchematicProjection,
} from "../../../sdks/designer/types";
import { asNumber, asRecord } from "./value-guards";
import { schematicWires } from "./schema";
import {
  buildManhattanPathThroughAnchors,
  orthogonalProjection,
  pointKey,
  sanitizePath,
  simplifyCollinearPath,
  type Point,
} from "./routing/manhattan";
import { autoRouteWirePointsDetailed } from "./routing/wire-obstacles";

type DbClient = BetterSQLite3Database<Record<string, unknown>>;

// Re-export shared helpers consumed elsewhere (command-executor imports
// `sanitizePath` from this module).
export { sanitizePath };

export function parseWirePointsJson(pointsJson: string): Point[] {
  const parsed = JSON.parse(pointsJson) as unknown;
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed
    .map((point) => {
      const record = asRecord(point);
      const x = asNumber(record?.x);
      const y = asNumber(record?.y);
      return x === null || y === null ? null : { x, y };
    })
    .filter((point): point is Point => point !== null);
}

export function insertVertexOnWire(
  points: Point[],
  point: Point,
): { points: Point[]; insertIndex: number } | null {
  if (points.length < 2) {
    return null;
  }

  let bestIndex = -1;
  let bestPoint: Point | null = null;
  let bestDistanceSq: bigint | null = null;
  for (let index = 1; index < points.length; index += 1) {
    const prev = points[index - 1];
    const curr = points[index];
    if (!prev || !curr) continue;
    const projection = orthogonalProjection(point, prev, curr);
    if (bestDistanceSq === null || projection.distanceSq < bestDistanceSq) {
      bestDistanceSq = projection.distanceSq;
      bestPoint = projection.point;
      bestIndex = index;
    }
  }

  if (!bestPoint || bestIndex < 1) return null;
  const result = [...points];
  const prev = result[bestIndex - 1];
  const curr = result[bestIndex];
  if (!prev || !curr) return null;
  if (pointKey(prev) === pointKey(bestPoint))
    return { points: result, insertIndex: bestIndex - 1 };
  if (pointKey(curr) === pointKey(bestPoint))
    return { points: result, insertIndex: bestIndex };
  result.splice(bestIndex, 0, { x: bestPoint.x, y: bestPoint.y });
  return { points: result, insertIndex: bestIndex };
}

/** Minimal pin shell for the auto-router: only `id` (owner exclusion) and
 *  `worldPositionNm` (route endpoints) are consumed by obstacle collection. */
function pinShell(pinId: string, worldPositionNm: Point): DesignerPin {
  return {
    id: pinId,
    originPinKey: pinId,
    number: null,
    name: "",
    electricalType: "passive",
    unit: 1,
    localPositionNm: { x: 0, y: 0 },
    worldPositionNm: { ...worldPositionNm },
  };
}

function rerouteWireWithUpdatedEndpoints(
  points: Point[],
  source: Point,
  target: Point,
  route: {
    projection: DesignerSchematicProjection;
    sourcePinId: string;
    targetPinId: string;
  },
): { points: Point[]; routeStatus: "colliding" | null | undefined } {
  if (points.length <= 2) {
    // No user-placed interior waypoints — the wire is a plain pin-to-pin run,
    // so re-route it through the obstacle-aware router (audit §4.3). The wire
    // itself is skipped as an obstacle because it shares both endpoint pins.
    const routed = autoRouteWirePointsDetailed(
      route.projection,
      pinShell(route.sourcePinId, source),
      pinShell(route.targetPinId, target),
    );
    return {
      points: simplifyCollinearPath(routed.points),
      routeStatus: routed.clean ? null : "colliding",
    };
  }
  // Explicit interior waypoints are user intent — keep them verbatim and only
  // re-Manhattan the connection to the moved endpoints. The route flag is
  // creation-time information; leave it untouched (undefined) here.
  return {
    points: simplifyCollinearPath(
      buildManhattanPathThroughAnchors([
        source,
        ...points.slice(1, -1),
        target,
      ]),
    ),
    routeStatus: undefined,
  };
}

export function updateConnectedWireGeometry(params: {
  tx: DbClient;
  designId: string;
  movedPinIds: string[];
  nextByPinId: Map<string, Point>;
  timestamp: string;
  projection: DesignerSchematicProjection;
}): void {
  const { tx, designId, movedPinIds, nextByPinId, timestamp, projection } =
    params;
  if (movedPinIds.length === 0) return;

  const wireRows = tx
    .select()
    .from(schematicWires)
    .where(
      and(
        eq(schematicWires.designId, designId),
        or(
          inArray(schematicWires.sourcePinId, movedPinIds),
          inArray(schematicWires.targetPinId, movedPinIds),
        ),
      ),
    )
    .all();

  for (const wireRow of wireRows) {
    const points = parseWirePointsJson(wireRow.pointsJson);
    const source = nextByPinId.get(wireRow.sourcePinId) ?? points[0];
    const target =
      nextByPinId.get(wireRow.targetPinId) ?? points[points.length - 1];
    if (!source || !target) continue;
    const rerouted = rerouteWireWithUpdatedEndpoints(points, source, target, {
      projection,
      sourcePinId: wireRow.sourcePinId,
      targetPinId: wireRow.targetPinId,
    });
    tx.update(schematicWires)
      .set({
        pointsJson: JSON.stringify(rerouted.points),
        ...(rerouted.routeStatus !== undefined
          ? { routeStatus: rerouted.routeStatus }
          : {}),
        updatedAt: timestamp,
      })
      .where(eq(schematicWires.id, wireRow.id))
      .run();
  }
}
