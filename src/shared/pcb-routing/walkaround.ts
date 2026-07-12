import {
  buildTracePathThroughAnchors,
  type TracePosture,
} from "../pcb-geometry/pcb-trace-geometry";
import {
  canonicalizeObstacles,
  clusterObstacles,
  inflateRectNm,
  pathIntersectsAny,
  segmentIntersectsRectNm,
  type ObstacleCluster,
} from "./collision";
import { fixup45Corners, SAFETY_NM } from "./corner-fixup";
import type { ObstacleRectNm, PointNm, RouteMode } from "./types";

export interface WalkaroundInput {
  /** Last committed anchor (head start). */
  headStartNm: PointNm;
  /** Resolved cursor anchor — snap already applied; NEVER moved by walkaround. */
  headEndNm: PointNm;
  /** Gate-parity keep-outs from buildRouteObstacles (few, pre-queried). */
  obstacles: readonly ObstacleRectNm[];
  mode: RouteMode;
  posture: TracePosture;
  /** Previous pointer-move's pick, for anti-flip-flop hysteresis. */
  previousChoice?: { clusterSignature: string; side: "cw" | "ccw" } | null;
}

export type WalkaroundResult =
  /** Direct head is collision-free — ghost identical to no-walkaround. */
  | { status: "clear" }
  | {
      status: "detour";
      /** Extra anchors between head start and end (both excluded). */
      anchorsNm: PointNm[];
      side: "cw" | "ccw";
      clusterSignature: string;
      lengthNm: number;
    }
  /** No clean local detour — caller falls back to today's collision ghost. */
  | { status: "blocked" };

/** Keep the previous side while its detour is within this factor of the other. */
const HYSTERESIS_FACTOR = 1.25;
/** Preferred visible diagonal corner-cut size for detour corners. */
const CORNER_CUT_NM = 500_000;

function pathLengthNm(path: readonly PointNm[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i += 1) {
    const dx = path[i]!.x - path[i - 1]!.x;
    const dy = path[i]!.y - path[i - 1]!.y;
    total += Math.sqrt(dx * dx + dy * dy);
  }
  return total;
}

function pointInsideRect(point: PointNm, rect: ObstacleRectNm): boolean {
  return segmentIntersectsRectNm(point, point, rect);
}

interface Candidate {
  anchorsNm: PointNm[];
  lengthNm: number;
}

/**
 * Best wrap on one rotational side: try 1, 2, then 3 consecutive nudged
 * cluster-AABB corners (all 4 rotational starts each), keep the shortest
 * clean render at the first depth that yields any. Fixed enumeration order —
 * deterministic.
 */
function bestSideCandidate(
  side: "cw" | "ccw",
  corners: readonly PointNm[],
  input: WalkaroundInput,
  searchObstacles: readonly ObstacleRectNm[],
): Candidate | null {
  const dir = side === "ccw" ? 1 : -1;
  const segmentBlocked = (a: PointNm, b: PointNm): boolean =>
    searchObstacles.some((rect) => segmentIntersectsRectNm(a, b, rect));
  for (let depth = 1; depth <= 3; depth += 1) {
    let best: Candidate | null = null;
    for (let start = 0; start < 4; start += 1) {
      const waypoints: PointNm[] = [];
      for (let i = 0; i < depth; i += 1) {
        waypoints.push(corners[(((start + dir * i) % 4) + 4) % 4]!);
      }
      let anchors = [input.headStartNm, ...waypoints, input.headEndNm];
      if (input.mode === "manhattan-45") {
        anchors = fixup45Corners(anchors, segmentBlocked, CORNER_CUT_NM);
      }
      const rendered = buildTracePathThroughAnchors(
        anchors,
        input.mode,
        input.posture,
      );
      if (pathIntersectsAny(rendered, searchObstacles)) continue;
      const candidate: Candidate = {
        anchorsNm: anchors.slice(1, -1),
        lengthNm: pathLengthNm(rendered),
      };
      if (best === null || candidate.lengthNm < best.lengthNm) {
        best = candidate;
      }
    }
    if (best) return best;
  }
  return null;
}

/**
 * Local head walkaround: when the direct ghost segment collides, bend it
 * around the hit obstacle cluster via nudged cluster-AABB corners. CW and
 * CCW candidates, shorter side wins with hysteresis against flip-flopping.
 * Strictly local — no search, fixed candidate count, no wall-clock.
 */
export function walkaroundHead(input: WalkaroundInput): WalkaroundResult {
  const trueObstacles = canonicalizeObstacles(input.obstacles);
  const direct = buildTracePathThroughAnchors(
    [input.headStartNm, input.headEndNm],
    input.mode,
    input.posture,
  );
  const hit = trueObstacles.filter((rect) => {
    for (let i = 1; i < direct.length; i += 1) {
      if (segmentIntersectsRectNm(direct[i - 1]!, direct[i]!, rect)) {
        return true;
      }
    }
    return false;
  });
  if (hit.length === 0) return { status: "clear" };

  // Wrap target = the hit cluster, expanded once with every obstacle touching
  // its bounds (so the wrap doesn't immediately collide with a neighbor).
  const seed = clusterObstacles(hit)[0]!;
  const expandedMembers = trueObstacles.filter(
    (rect) =>
      seed.memberIds.includes(rect.id) ||
      (rect.minX <= seed.bounds.maxX &&
        seed.bounds.minX <= rect.maxX &&
        rect.minY <= seed.bounds.maxY &&
        seed.bounds.minY <= rect.maxY),
  );
  const cluster: ObstacleCluster = clusterObstacles(expandedMembers)[0]!;
  const signature = cluster.memberIds.join("|");

  if (
    pointInsideRect(input.headEndNm, cluster.bounds) ||
    pointInsideRect(input.headStartNm, cluster.bounds)
  ) {
    return { status: "blocked" };
  }

  const searchObstacles = trueObstacles.map((rect) =>
    inflateRectNm(rect, SAFETY_NM),
  );
  // Corner waypoints sit SAFETY outside the search bounds so boundary-exact
  // renders stay clear of the true keep-outs with margin.
  const b = inflateRectNm(cluster.bounds, 2 * SAFETY_NM);
  const corners: readonly PointNm[] = [
    { x: b.minX, y: b.minY },
    { x: b.maxX, y: b.minY },
    { x: b.maxX, y: b.maxY },
    { x: b.minX, y: b.maxY },
  ];

  const cw = bestSideCandidate("cw", corners, input, searchObstacles);
  const ccw = bestSideCandidate("ccw", corners, input, searchObstacles);
  if (!cw && !ccw) return { status: "blocked" };

  let side: "cw" | "ccw";
  if (cw && ccw) {
    side = ccw.lengthNm <= cw.lengthNm ? "ccw" : "cw";
    const prev = input.previousChoice;
    if (prev && prev.clusterSignature === signature && prev.side !== side) {
      const kept = prev.side === "cw" ? cw : ccw;
      const other = prev.side === "cw" ? ccw : cw;
      if (kept.lengthNm <= other.lengthNm * HYSTERESIS_FACTOR) {
        side = prev.side;
      }
    }
  } else {
    side = cw ? "cw" : "ccw";
  }
  const chosen = side === "cw" ? cw! : ccw!;

  // Gate-exact self-check (candidates were validated against the stricter
  // search set, so this is belt-and-braces).
  const rendered = buildTracePathThroughAnchors(
    [input.headStartNm, ...chosen.anchorsNm, input.headEndNm],
    input.mode,
    input.posture,
  );
  if (pathIntersectsAny(rendered, trueObstacles)) return { status: "blocked" };

  return {
    status: "detour",
    anchorsNm: chosen.anchorsNm,
    side,
    clusterSignature: signature,
    lengthNm: chosen.lengthNm,
  };
}
