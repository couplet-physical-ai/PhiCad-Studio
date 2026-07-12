import type {
  DesignerPcbProjection,
  PcbCopperLayerId,
  PcbPointMm,
  PourIsland,
  SnapshotCopperLayerId,
} from "../../../../sdks/designer";
import {
  buildCopperFillPourPaths,
  resolveCopperFillClearanceMm,
} from "../../../../shared/rendering/copper-fill/copper-fill-geometry";
import {
  escapeStructuralIdSegment,
  fnv1a64,
} from "../drc/violation-id";

const SNAPSHOT_LAYER_SET = new Set<string>(["F.Cu", "In1.Cu", "In2.Cu", "B.Cu"]);
const COPPER_LAYER_ORDER: readonly SnapshotCopperLayerId[] = [
  "F.Cu",
  "In1.Cu",
  "In2.Cu",
  "B.Cu",
];
const COORD_DECIMALS = 4;
const COORD_SCALE = 10 ** COORD_DECIMALS;

type PourSource = {
  readonly kind: "board" | "zone";
  readonly sourceId: string;
  readonly layer: SnapshotCopperLayerId;
  readonly pourNetId: string | null;
  readonly padConnection: "solid" | "thermal";
  readonly clipPolygonMm?: readonly PcbPointMm[];
};

type PendingPourIsland = PourIsland & {
  readonly sourceOrder: string;
  readonly geometryOrder: string;
};

export function buildSnapshotPourIslands(
  projection: DesignerPcbProjection,
): PourIsland[] {
  const padNetIds = new Map(Object.entries(projection.padNets ?? {}));
  const dr = projection.board.designRules;
  const baseParams = {
    outline: projection.board.outline,
    placements: projection.placements,
    traces: projection.traces,
    vias: projection.vias,
    padNetIds,
    clearanceMm: resolveCopperFillClearanceMm(dr.clearance),
    copperToBoardEdgeMm: dr.clearance.copperToBoardEdgeMm,
    cutouts: projection.board.cutouts,
    freeHoles: projection.freeHoles,
    freePads: projection.freePads,
    minThicknessMm: dr.minimums.traceWidthMm,
  };
  const pending: PendingPourIsland[] = [];
  for (const source of pourSources(projection)) {
    const islands = buildCopperFillPourPaths({
      ...baseParams,
      layer: source.layer,
      pourNetId: source.pourNetId,
      padConnection: source.padConnection,
      ...(source.clipPolygonMm ? { clipPolygonMm: source.clipPolygonMm } : {}),
    });
    for (const rings of islands) {
      const normalized = normalizeIslandRings(rings);
      if (!normalized) continue;
      const geometryOrder = ringsKey(normalized);
      const sourceOrder = sourceSortKey(source);
      pending.push({
        islandId: `pour-${fnv1a64(`${sourceOrder}|${geometryOrder}`)}`,
        layer: source.layer,
        pourNetId: source.pourNetId,
        rings: normalized,
        sourceOrder,
        geometryOrder,
      });
    }
  }
  return pending
    .sort((a, b) => comparePendingPourIsland(a, b))
    .map(({ islandId, layer, pourNetId, rings }) => ({
      islandId,
      layer,
      pourNetId,
      rings,
    }));
}

function pourSources(projection: DesignerPcbProjection): PourSource[] {
  const view = projection.board.viewState;
  const boardConnection = view?.copperFillPadConnection ?? "solid";
  const sources: PourSource[] = [];
  if (view) {
    for (const layer of sortedLayers(view.copperFillLayers)) {
      if (!SNAPSHOT_LAYER_SET.has(layer)) continue;
      sources.push({
        kind: "board",
        sourceId: `board:${layer}`,
        layer: layer as SnapshotCopperLayerId,
        pourNetId: view.copperFillPourNetIds[layer] ?? null,
        padConnection: boardConnection,
      });
    }
  }
  for (const zone of projection.zones) {
    if (!zone.netId || zone.polygonPointsMm.length < 3) continue;
    if (!SNAPSHOT_LAYER_SET.has(zone.layer)) continue;
    sources.push({
      kind: "zone",
      sourceId: zone.id,
      layer: zone.layer as SnapshotCopperLayerId,
      pourNetId: zone.netId,
      padConnection: zone.connection ?? boardConnection,
      clipPolygonMm: zone.polygonPointsMm,
    });
  }
  return sources.sort((a, b) => sourceSortKey(a).localeCompare(sourceSortKey(b)));
}

function sortedLayers(
  layers: readonly PcbCopperLayerId[],
): PcbCopperLayerId[] {
  return [...layers].sort(
    (a, b) =>
      (COPPER_LAYER_ORDER as readonly string[]).indexOf(a) -
      (COPPER_LAYER_ORDER as readonly string[]).indexOf(b),
  );
}

function normalizeIslandRings(
  rings: ReadonlyArray<ReadonlyArray<PcbPointMm>>,
): PcbPointMm[][] | null {
  const outer = rings.at(0);
  if (!outer) return null;
  const normalizedOuter = normalizeRing(outer, "ccw");
  if (!normalizedOuter) return null;
  const holes = rings
    .slice(1)
    .map((ring) => normalizeRing(ring, "cw"))
    .filter((ring): ring is PcbPointMm[] => ring !== null)
    .sort((a, b) => ringsKey([a]).localeCompare(ringsKey([b])));
  return [normalizedOuter, ...holes];
}

function normalizeRing(
  ring: ReadonlyArray<PcbPointMm>,
  winding: "ccw" | "cw",
): PcbPointMm[] | null {
  const points = removeClosingDuplicate(removeConsecutiveDuplicates(ring.map(quantizePoint)));
  if (points.length < 3 || ringSignedArea(points) === 0) return null;
  const area = ringSignedArea(points);
  const shouldReverse = winding === "ccw" ? area < 0 : area > 0;
  return shouldReverse ? [...points].reverse() : points;
}

function quantizePoint(point: PcbPointMm): PcbPointMm {
  return {
    x: quantizeCoord(point.x),
    y: quantizeCoord(point.y),
  };
}

function quantizeCoord(value: number): number {
  const rounded = Math.round(value * COORD_SCALE) / COORD_SCALE;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function removeConsecutiveDuplicates(points: readonly PcbPointMm[]): PcbPointMm[] {
  const result: PcbPointMm[] = [];
  for (const point of points) {
    const previous = result.at(-1);
    if (previous && samePoint(previous, point)) continue;
    result.push(point);
  }
  return result;
}

function removeClosingDuplicate(points: readonly PcbPointMm[]): PcbPointMm[] {
  const first = points.at(0);
  const last = points.at(-1);
  if (first && last && points.length > 1 && samePoint(first, last)) {
    return points.slice(0, -1);
  }
  return [...points];
}

function samePoint(a: PcbPointMm, b: PcbPointMm): boolean {
  return a.x === b.x && a.y === b.y;
}

function ringSignedArea(ring: readonly PcbPointMm[]): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    if (!a || !b) continue;
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

function sourceSortKey(source: PourSource): string {
  return [
    COPPER_LAYER_ORDER.indexOf(source.layer).toString().padStart(2, "0"),
    source.kind === "board" ? "0" : "1",
    escapeStructuralIdSegment(source.sourceId),
    escapeStructuralIdSegment(source.pourNetId ?? ""),
  ].join("|");
}

function ringsKey(rings: readonly (readonly PcbPointMm[])[]): string {
  return rings
    .map((ring) => ring.map((point) => `${point.x},${point.y}`).join(";"))
    .join("/");
}

function comparePendingPourIsland(
  a: PendingPourIsland,
  b: PendingPourIsland,
): number {
  const source = a.sourceOrder.localeCompare(b.sourceOrder);
  if (source !== 0) return source;
  return a.geometryOrder.localeCompare(b.geometryOrder);
}
