import type { ObstacleRectNm, PointNm } from "./types";

/**
 * Sub-nm slack for the strict-interior test. Inputs are integer nm, so any
 * real penetration is ≥ 1 nm deep; the slack only absorbs float rounding from
 * the parametric clip, never a legitimate collision.
 */
const INTERIOR_EPS_NM = 1e-3;

/**
 * Does segment AB (any slope, including 45°) penetrate the OPEN interior of
 * the rect? Boundary contact is allowed — routing along an inflated obstacle
 * edge is legal, mirroring the schematic router's touch semantics.
 *
 * Liang-Barsky clip to the closed rect, then test the clipped midpoint for
 * strict interiority: a segment running along an edge or touching a corner
 * clips to a span whose midpoint sits ON the boundary → no hit.
 */
export function segmentIntersectsRectNm(
  a: PointNm,
  b: PointNm,
  rect: ObstacleRectNm,
): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  const edges: Array<[number, number]> = [
    [-dx, a.x - rect.minX],
    [dx, rect.maxX - a.x],
    [-dy, a.y - rect.minY],
    [dy, rect.maxY - a.y],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return false; // parallel and fully outside this slab
      continue;
    }
    const t = q / p;
    if (p < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
  }
  if (t1 < t0) return false;
  const tMid = (t0 + t1) / 2;
  const mx = a.x + tMid * dx;
  const my = a.y + tMid * dy;
  return (
    mx > rect.minX + INTERIOR_EPS_NM &&
    mx < rect.maxX - INTERIOR_EPS_NM &&
    my > rect.minY + INTERIOR_EPS_NM &&
    my < rect.maxY - INTERIOR_EPS_NM
  );
}

export function pathIntersectsAny(
  path: readonly PointNm[],
  rects: readonly ObstacleRectNm[],
): boolean {
  for (let i = 1; i < path.length; i += 1) {
    const a = path[i - 1]!;
    const b = path[i]!;
    for (const rect of rects) {
      if (segmentIntersectsRectNm(a, b, rect)) return true;
    }
  }
  return false;
}

export function inflateRectNm(
  rect: ObstacleRectNm,
  padNm: number,
): ObstacleRectNm {
  return {
    minX: rect.minX - padNm,
    minY: rect.minY - padNm,
    maxX: rect.maxX + padNm,
    maxY: rect.maxY + padNm,
    id: rect.id,
  };
}

/**
 * Canonical deterministic ordering — applied once at every algorithm entry so
 * output never depends on the caller's (e.g. rbush query) result ordering.
 */
export function canonicalizeObstacles(
  rects: readonly ObstacleRectNm[],
): ObstacleRectNm[] {
  return [...rects].sort(
    (a, b) =>
      a.minX - b.minX ||
      a.minY - b.minY ||
      a.maxX - b.maxX ||
      a.maxY - b.maxY ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

export interface ObstacleCluster {
  bounds: ObstacleRectNm;
  memberIds: string[];
}

function rectsTouch(a: ObstacleRectNm, b: ObstacleRectNm): boolean {
  return (
    a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY
  );
}

/**
 * Merge overlapping/touching rects into cluster AABBs (walkaround wrap
 * targets). Union-find over canonicalized input; clusters and memberIds come
 * out canonically sorted, so the result is order-independent.
 */
export function clusterObstacles(
  rects: readonly ObstacleRectNm[],
): ObstacleCluster[] {
  const sorted = canonicalizeObstacles(rects);
  const parent = sorted.map((_, i) => i);
  const find = (i: number): number => {
    let root = i;
    while (parent[root]! !== root) root = parent[root]!;
    while (parent[i]! !== i) {
      const next = parent[i]!;
      parent[i] = root;
      i = next;
    }
    return root;
  };
  for (let i = 0; i < sorted.length; i += 1) {
    for (let j = i + 1; j < sorted.length; j += 1) {
      if (rectsTouch(sorted[i]!, sorted[j]!)) {
        parent[find(j)] = find(i);
      }
    }
  }
  const byRoot = new Map<number, ObstacleRectNm[]>();
  for (let i = 0; i < sorted.length; i += 1) {
    const root = find(i);
    const list = byRoot.get(root);
    if (list) list.push(sorted[i]!);
    else byRoot.set(root, [sorted[i]!]);
  }
  const clusters: ObstacleCluster[] = [];
  for (const members of byRoot.values()) {
    const first = members[0]!;
    const bounds: ObstacleRectNm = { ...first };
    for (const rect of members) {
      bounds.minX = Math.min(bounds.minX, rect.minX);
      bounds.minY = Math.min(bounds.minY, rect.minY);
      bounds.maxX = Math.max(bounds.maxX, rect.maxX);
      bounds.maxY = Math.max(bounds.maxY, rect.maxY);
    }
    const memberIds = members.map((m) => m.id).sort();
    clusters.push({ bounds: { ...bounds, id: memberIds[0]! }, memberIds });
  }
  clusters.sort(
    (a, b) =>
      a.bounds.minX - b.bounds.minX ||
      a.bounds.minY - b.bounds.minY ||
      (a.memberIds[0]! < b.memberIds[0]! ? -1 : 1),
  );
  return clusters;
}
