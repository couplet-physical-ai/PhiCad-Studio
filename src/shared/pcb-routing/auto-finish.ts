import {
  buildTracePathThroughAnchors,
  simplifyCollinearPath,
  validatePath,
  type TracePosture,
} from "../pcb-geometry/pcb-trace-geometry";
import {
  canonicalizeObstacles,
  inflateRectNm,
  pathIntersectsAny,
  segmentIntersectsRectNm,
} from "./collision";
import { fixup45Corners, SAFETY_NM } from "./corner-fixup";
import { pullTight } from "./pull-tight";
import type { ObstacleRectNm, PointNm, RouteMode } from "./types";

export interface AutoFinishInput {
  /** Session's last committed anchor (route head). */
  sourceNm: PointNm;
  /** Target pad center. */
  targetNm: PointNm;
  /** Gate-parity keep-outs from buildRouteObstacles. */
  obstacles: readonly ObstacleRectNm[];
  mode: RouteMode;
  posture: TracePosture;
  caps?: {
    maxExpansions?: number;
    /** Corridor slack around bbox(source, target). Default 2 mm. */
    corridorMarginNm?: number;
    /** Upper bound on grid step (e.g. clearance+width when pads are near). */
    maxStepNm?: number;
  };
}

export type AutoFinishResult =
  | {
      status: "ok";
      /** Extra anchors between source and target (both excluded). */
      anchorsNm: PointNm[];
      stats: { expansions: number; escalation: "direct" | "elbow" | "astar" };
    }
  | { status: "no-path" | "over-cap" | "target-blocked" };

// Search margin above gate-required clearance (see corner-fixup.ts): the
// search runs SAFETY_NM stricter than the gate so bounded corner cuts still
// clear the TRUE keep-outs at the gate-exact final self-check.
const DEFAULT_MAX_EXPANSIONS = 120_000;
const DEFAULT_CORRIDOR_MARGIN_NM = 2_000_000;
const GRID_TARGET_CELLS = 192;
const MIN_STEP_NM = 50_000;
const MAX_NODES = 65_536;

const AXIS_COST = 1000;
const DIAG_COST = 1414;

interface Dir {
  dx: number;
  dy: number;
  cost: number;
}

const DIRS_90: readonly Dir[] = [
  { dx: 1, dy: 0, cost: AXIS_COST },
  { dx: -1, dy: 0, cost: AXIS_COST },
  { dx: 0, dy: 1, cost: AXIS_COST },
  { dx: 0, dy: -1, cost: AXIS_COST },
];

const DIRS_45: readonly Dir[] = [
  ...DIRS_90,
  { dx: 1, dy: 1, cost: DIAG_COST },
  { dx: 1, dy: -1, cost: DIAG_COST },
  { dx: -1, dy: 1, cost: DIAG_COST },
  { dx: -1, dy: -1, cost: DIAG_COST },
];

function pointInsideAny(
  point: PointNm,
  rects: readonly ObstacleRectNm[],
): boolean {
  for (const rect of rects) {
    if (segmentIntersectsRectNm(point, point, rect)) return true;
  }
  return false;
}

/** Fixed-order candidate anchor lists for the pre-A* escalation rungs. */
function elbowCandidates(
  s: PointNm,
  t: PointNm,
  mode: RouteMode,
): PointNm[][] {
  const out: PointNm[][] = [];
  const dx = t.x - s.x;
  const dy = t.y - s.y;
  if (dx !== 0 && dy !== 0) {
    if (mode === "manhattan-45") {
      const diagLen = Math.min(Math.abs(dx), Math.abs(dy));
      const sx = Math.sign(dx);
      const sy = Math.sign(dy);
      out.push([{ x: s.x + sx * diagLen, y: s.y + sy * diagLen }]);
      out.push(
        Math.abs(dx) > Math.abs(dy)
          ? [{ x: t.x - sx * diagLen, y: s.y }]
          : [{ x: s.x, y: t.y - sy * diagLen }],
      );
    }
    out.push([{ x: t.x, y: s.y }]);
    out.push([{ x: s.x, y: t.y }]);
  }
  const mx = s.x + Math.trunc(dx / 2);
  const my = s.y + Math.trunc(dy / 2);
  if (dx !== 0) {
    out.push([
      { x: mx, y: s.y },
      { x: mx, y: t.y },
    ]);
  }
  if (dy !== 0) {
    out.push([
      { x: s.x, y: my },
      { x: t.x, y: my },
    ]);
  }
  return out;
}

/** Coarse uniform-bucket index so per-move collision tests stay local. */
class ObstacleBuckets {
  private readonly cell: number;
  private readonly map = new Map<string, number[]>();

  constructor(
    private readonly rects: readonly ObstacleRectNm[],
    cellNm: number,
    corridor: { minX: number; minY: number; maxX: number; maxY: number },
  ) {
    this.cell = cellNm;
    for (let i = 0; i < rects.length; i += 1) {
      const r = rects[i]!;
      const minX = Math.max(r.minX, corridor.minX);
      const minY = Math.max(r.minY, corridor.minY);
      const maxX = Math.min(r.maxX, corridor.maxX);
      const maxY = Math.min(r.maxY, corridor.maxY);
      if (minX > maxX || minY > maxY) continue;
      const c0 = Math.floor(minX / cellNm);
      const c1 = Math.floor(maxX / cellNm);
      const r0 = Math.floor(minY / cellNm);
      const r1 = Math.floor(maxY / cellNm);
      for (let cx = c0; cx <= c1; cx += 1) {
        for (let cy = r0; cy <= r1; cy += 1) {
          const key = `${cx},${cy}`;
          const list = this.map.get(key);
          if (list) list.push(i);
          else this.map.set(key, [i]);
        }
      }
    }
  }

  segmentBlocked(a: PointNm, b: PointNm): boolean {
    const c0 = Math.floor(Math.min(a.x, b.x) / this.cell);
    const c1 = Math.floor(Math.max(a.x, b.x) / this.cell);
    const r0 = Math.floor(Math.min(a.y, b.y) / this.cell);
    const r1 = Math.floor(Math.max(a.y, b.y) / this.cell);
    const seen = new Set<number>();
    for (let cx = c0; cx <= c1; cx += 1) {
      for (let cy = r0; cy <= r1; cy += 1) {
        const list = this.map.get(`${cx},${cy}`);
        if (!list) continue;
        for (const i of list) {
          if (seen.has(i)) continue;
          seen.add(i);
          if (segmentIntersectsRectNm(a, b, this.rects[i]!)) return true;
        }
      }
    }
    return false;
  }
}

interface HeapEntry {
  f: number;
  g: number;
  ix: number;
  iy: number;
  dir: number;
}

/** Binary min-heap with a total-order comparator → deterministic pops. */
class Frontier {
  private readonly items: HeapEntry[] = [];

  private static less(a: HeapEntry, b: HeapEntry): boolean {
    if (a.f !== b.f) return a.f < b.f;
    if (a.g !== b.g) return a.g < b.g;
    if (a.iy !== b.iy) return a.iy < b.iy;
    if (a.ix !== b.ix) return a.ix < b.ix;
    return a.dir < b.dir;
  }

  get size(): number {
    return this.items.length;
  }

  push(entry: HeapEntry): void {
    const items = this.items;
    items.push(entry);
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!Frontier.less(items[i]!, items[parent]!)) break;
      [items[i], items[parent]] = [items[parent]!, items[i]!];
      i = parent;
    }
  }

  pop(): HeapEntry | undefined {
    const items = this.items;
    const top = items[0];
    const last = items.pop();
    if (top === undefined || last === undefined) return top;
    if (items.length === 0) return top;
    items[0] = last;
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let smallest = i;
      if (l < items.length && Frontier.less(items[l]!, items[smallest]!)) {
        smallest = l;
      }
      if (r < items.length && Frontier.less(items[r]!, items[smallest]!)) {
        smallest = r;
      }
      if (smallest === i) return top;
      [items[i], items[smallest]] = [items[smallest]!, items[i]!];
      i = smallest;
    }
  }
}

function renderClean(
  s: PointNm,
  t: PointNm,
  anchors: readonly PointNm[],
  mode: RouteMode,
  posture: TracePosture,
  obstacles: readonly ObstacleRectNm[],
): boolean {
  const rendered = buildTracePathThroughAnchors(
    [s, ...anchors, t],
    mode,
    posture,
  );
  if (validatePath(rendered, mode) !== null) return false;
  return !pathIntersectsAny(rendered, obstacles);
}

/**
 * Complete the current route from `sourceNm` to `targetNm` on one layer.
 * Escalation: direct elbow → fixed elbow/midpoint variants → corridor-bounded
 * octile-grid A* with pull-tight. Anchors come back mode/posture-valid when
 * rendered by the same elbow builder the ghost and commit paths use.
 */
export function routeAutoFinish(input: AutoFinishInput): AutoFinishResult {
  const trueObstacles = canonicalizeObstacles(input.obstacles);
  const searchObstacles = trueObstacles.map((r) => inflateRectNm(r, SAFETY_NM));
  const s = input.sourceNm;
  const t = input.targetNm;

  if (pointInsideAny(t, searchObstacles)) return { status: "target-blocked" };
  if (pointInsideAny(s, searchObstacles)) return { status: "no-path" };

  if (renderClean(s, t, [], input.mode, input.posture, searchObstacles)) {
    return {
      status: "ok",
      anchorsNm: [],
      stats: { expansions: 0, escalation: "direct" },
    };
  }
  for (const candidate of elbowCandidates(s, t, input.mode)) {
    if (
      renderClean(s, t, candidate, input.mode, input.posture, searchObstacles)
    ) {
      return {
        status: "ok",
        anchorsNm: candidate,
        stats: { expansions: 0, escalation: "elbow" },
      };
    }
  }

  // --- Corridor-bounded grid A* ---
  // The corridor spans the endpoints AND every supplied obstacle: a detour
  // around a tall wall lies outside bbox(source, target). The caller's
  // broad-phase query bounds how far obstacles (and thus the corridor) reach.
  const margin = input.caps?.corridorMarginNm ?? DEFAULT_CORRIDOR_MARGIN_NM;
  const corridor = {
    minX: Math.min(s.x, t.x),
    minY: Math.min(s.y, t.y),
    maxX: Math.max(s.x, t.x),
    maxY: Math.max(s.y, t.y),
  };
  for (const rect of searchObstacles) {
    corridor.minX = Math.min(corridor.minX, rect.minX);
    corridor.minY = Math.min(corridor.minY, rect.minY);
    corridor.maxX = Math.max(corridor.maxX, rect.maxX);
    corridor.maxY = Math.max(corridor.maxY, rect.maxY);
  }
  corridor.minX -= margin;
  corridor.minY -= margin;
  corridor.maxX += margin;
  corridor.maxY += margin;
  const spanX = corridor.maxX - corridor.minX;
  const spanY = corridor.maxY - corridor.minY;
  let step = Math.max(
    MIN_STEP_NM,
    Math.ceil(Math.max(spanX, spanY) / GRID_TARGET_CELLS),
  );
  if (input.caps?.maxStepNm !== undefined) {
    step = Math.max(MIN_STEP_NM, Math.min(step, input.caps.maxStepNm));
  }
  while (
    (Math.floor(spanX / step) + 1) * (Math.floor(spanY / step) + 1) >
    MAX_NODES
  ) {
    step *= 2;
  }

  const ixMin = Math.ceil((corridor.minX - s.x) / step);
  const ixMax = Math.floor((corridor.maxX - s.x) / step);
  const iyMin = Math.ceil((corridor.minY - s.y) / step);
  const iyMax = Math.floor((corridor.maxY - s.y) / step);
  const nodePoint = (ix: number, iy: number): PointNm => ({
    x: s.x + ix * step,
    y: s.y + iy * step,
  });

  const buckets = new ObstacleBuckets(searchObstacles, step * 4, corridor);
  const dirs = input.mode === "manhattan-45" ? DIRS_45 : DIRS_90;
  const bendPenalty = Math.max(
    AXIS_COST,
    Math.round(500_000 / step) * AXIS_COST,
  );
  const heuristic = (ix: number, iy: number): number => {
    const dx = Math.abs(t.x - (s.x + ix * step)) / step;
    const dy = Math.abs(t.y - (s.y + iy * step)) / step;
    if (input.mode === "manhattan-45") {
      return (
        Math.max(dx, dy) * AXIS_COST + Math.min(dx, dy) * (DIAG_COST - AXIS_COST)
      );
    }
    return (dx + dy) * AXIS_COST;
  };

  const maxExpansions = input.caps?.maxExpansions ?? DEFAULT_MAX_EXPANSIONS;
  const bestG = new Map<string, number>();
  const cameFrom = new Map<string, string>();
  const frontier = new Frontier();
  const startKey = "0,0,-1";
  bestG.set(startKey, 0);
  frontier.push({ f: heuristic(0, 0), g: 0, ix: 0, iy: 0, dir: -1 });

  let expansions = 0;
  let goalKey: string | null = null;

  while (frontier.size > 0) {
    const current = frontier.pop()!;
    const key = `${current.ix},${current.iy},${current.dir}`;
    if ((bestG.get(key) ?? Infinity) < current.g) continue;
    expansions += 1;
    if (expansions > maxExpansions) return { status: "over-cap" };

    const point = nodePoint(current.ix, current.iy);
    if (
      Math.abs(point.x - t.x) <= step &&
      Math.abs(point.y - t.y) <= step &&
      renderClean(point, t, [], input.mode, input.posture, searchObstacles)
    ) {
      goalKey = key;
      break;
    }

    for (let d = 0; d < dirs.length; d += 1) {
      const dir = dirs[d]!;
      const nix = current.ix + dir.dx;
      const niy = current.iy + dir.dy;
      if (nix < ixMin || nix > ixMax || niy < iyMin || niy > iyMax) continue;
      const nextPoint = nodePoint(nix, niy);
      if (buckets.segmentBlocked(point, nextPoint)) continue;
      const g =
        current.g +
        dir.cost +
        (current.dir !== -1 && current.dir !== d ? bendPenalty : 0);
      const nextKey = `${nix},${niy},${d}`;
      if (g >= (bestG.get(nextKey) ?? Infinity)) continue;
      bestG.set(nextKey, g);
      cameFrom.set(nextKey, key);
      frontier.push({ f: g + heuristic(nix, niy), g, ix: nix, iy: niy, dir: d });
    }
  }

  if (goalKey === null) return { status: "no-path" };

  const rawPoints: PointNm[] = [];
  let cursor: string | undefined = goalKey;
  while (cursor !== undefined) {
    const [ix, iy] = cursor.split(",").map(Number) as [number, number];
    rawPoints.push(nodePoint(ix, iy));
    cursor = cameFrom.get(cursor);
  }
  rawPoints.reverse();
  const fullPath = [s, ...rawPoints, t];

  const finish = (anchors: readonly PointNm[]): AutoFinishResult | null => {
    const fixed =
      input.mode === "manhattan-45"
        ? fixup45Corners(anchors, (a, b) => buckets.segmentBlocked(a, b), step)
        : [...anchors];
    if (!renderClean(
      s,
      t,
      fixed.slice(1, -1),
      input.mode,
      input.posture,
      trueObstacles,
    )) {
      return null;
    }
    return {
      status: "ok",
      anchorsNm: fixed.slice(1, -1),
      stats: { expansions, escalation: "astar" },
    };
  };

  const tightened = pullTight({
    pathNm: fullPath,
    obstacles: searchObstacles,
    mode: input.mode,
    posture: input.posture,
  });
  // Pull-tight is heuristic under posture "auto" — if the full render fails
  // the gate-exact self-check, retry with the raw (staircase) grid path.
  return (
    finish(tightened) ??
    finish(simplifyCollinearPath(fullPath)) ?? { status: "no-path" }
  );
}
