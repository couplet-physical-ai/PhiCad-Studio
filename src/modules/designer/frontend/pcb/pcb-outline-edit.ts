/**
 * Pure vertex / edge editing for board outlines (polygon + contour). Direct
 * manipulation of the polyline: move a vertex, insert one mid-edge, delete one.
 * v1 edits **line** edges only — an operation touching an arc segment is a
 * no-op (returns the outline unchanged / null), matching the fillet/chamfer
 * restriction. Fillet/chamfer themselves live in `outline-corners.ts`.
 */
import type {
  PcbBoardContour,
  PcbBoardOutline,
  PcbBoardOutlinePolygon,
  PcbOutlineSegment,
  PcbPointMm,
} from "../../../../sdks";
import { computeOutlineBboxMm } from "../../backend/pcb/outline-geometry";
import { normalizeContour } from "../../backend/pcb/contour-validation";
import { contourVertices, rotateContourStart } from "./outline-corners";

type V = PcbPointMm;

/** Outlines whose vertices can be edited (line-based rings). */
export type EditableOutline = PcbBoardOutlinePolygon | PcbBoardContour;

export function isEditableOutline(
  outline: PcbBoardOutline,
): outline is EditableOutline {
  return outline.kind === "polygon" || outline.kind === "contour";
}

/** True when a contour carries any arc segment (blocks bbox-resize / some edits). */
export function outlineHasArcs(outline: PcbBoardOutline): boolean {
  return (
    outline.kind === "contour" &&
    outline.segments.some((s) => s.type === "arc")
  );
}

/** Ring vertices of an editable outline, in order. */
export function outlineVertices(outline: EditableOutline): V[] {
  return outline.kind === "polygon"
    ? outline.pointsMm.map((p) => ({ x: p.x, y: p.y }))
    : contourVertices(outline);
}

function withPolygonPoints(
  outline: PcbBoardOutlinePolygon,
  pointsMm: V[],
): PcbBoardOutlinePolygon {
  const next: PcbBoardOutlinePolygon = { ...outline, pointsMm };
  return { ...next, ...computeOutlineBboxMm(next) };
}

function dist(a: V, b: V): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Index of the vertex within `tolMm` of the cursor (nearest wins), or null. */
export function hitVertex(
  outline: EditableOutline,
  cursorMm: V,
  tolMm: number,
): number | null {
  const verts = outlineVertices(outline);
  let best: number | null = null;
  let bestD = tolMm;
  verts.forEach((v, i) => {
    const d = dist(v, cursorMm);
    if (d <= bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

interface ProjectedPoint {
  pointMm: V;
  /** Parameter t in [0,1] along the segment. */
  t: number;
  distMm: number;
}

function projectOnSegment(a: V, b: V, p: V): ProjectedPoint {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  const t =
    len2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2));
  const pointMm = { x: a.x + abx * t, y: a.y + aby * t };
  return { pointMm, t, distMm: dist(pointMm, p) };
}

/**
 * Nearest LINE edge within `tolMm` for inserting a vertex — excluding the
 * segment ends (those are vertex grabs). `edgeIndex` addresses the ring edge
 * (segment index for contours, point-pair index for polygons).
 */
export function hitEdge(
  outline: EditableOutline,
  cursorMm: V,
  tolMm: number,
): { edgeIndex: number; pointMm: V } | null {
  const verts = outlineVertices(outline);
  const n = verts.length;
  let best: { edgeIndex: number; pointMm: V } | null = null;
  let bestD = tolMm;
  for (let i = 0; i < n; i += 1) {
    if (outline.kind === "contour" && outline.segments[i]!.type !== "line") {
      continue; // only straight edges take a mid-edge insert in v1
    }
    const a = verts[i]!;
    const b = verts[(i + 1) % n]!;
    const proj = projectOnSegment(a, b, cursorMm);
    // Keep away from the endpoints so this doesn't shadow a vertex grab.
    if (dist(proj.pointMm, a) <= tolMm || dist(proj.pointMm, b) <= tolMm) continue;
    if (proj.distMm <= bestD) {
      bestD = proj.distMm;
      best = { edgeIndex: i, pointMm: proj.pointMm };
    }
  }
  return best;
}

/** Move vertex `vIndex` to `toMm`. No-op when an adjacent edge is an arc. */
export function moveVertex(
  outline: EditableOutline,
  vIndex: number,
  toMm: V,
): EditableOutline {
  const to = { x: toMm.x, y: toMm.y };
  if (outline.kind === "polygon") {
    const pointsMm = outline.pointsMm.map((p, i) => (i === vIndex ? to : { x: p.x, y: p.y }));
    return withPolygonPoints(outline, pointsMm);
  }
  const n = outline.segments.length;
  const inc = (vIndex - 1 + n) % n; // edge ending at the vertex
  const out = vIndex; // edge leaving the vertex
  if (outline.segments[inc]!.type === "arc" || outline.segments[out]!.type === "arc") {
    return outline; // arc-adjacent vertex is not draggable in v1
  }
  const start = vIndex === 0 ? to : outline.start;
  const segments: PcbOutlineSegment[] = outline.segments.map((s, i) =>
    i === inc ? { type: "line", to } : s,
  );
  return normalizeContour({ ...outline, start, segments });
}

/** Insert a vertex at `atMm` splitting ring edge `edgeIndex` (line edges only). */
export function insertVertexAtEdge(
  outline: EditableOutline,
  edgeIndex: number,
  atMm: V,
): EditableOutline {
  const at = { x: atMm.x, y: atMm.y };
  if (outline.kind === "polygon") {
    const pointsMm = [
      ...outline.pointsMm.slice(0, edgeIndex + 1).map((p) => ({ x: p.x, y: p.y })),
      at,
      ...outline.pointsMm.slice(edgeIndex + 1).map((p) => ({ x: p.x, y: p.y })),
    ];
    return withPolygonPoints(outline, pointsMm);
  }
  if (outline.segments[edgeIndex]!.type !== "line") return outline;
  const original = outline.segments[edgeIndex]!;
  const segments: PcbOutlineSegment[] = [
    ...outline.segments.slice(0, edgeIndex),
    { type: "line", to: at },
    { type: "line", to: { x: original.to.x, y: original.to.y } },
    ...outline.segments.slice(edgeIndex + 1),
  ];
  return normalizeContour({ ...outline, segments });
}

/**
 * Delete vertex `vIndex`, merging its two edges into one straight edge. Returns
 * null when the ring is already a triangle or an adjacent edge is an arc.
 */
export function deleteVertex(
  outline: EditableOutline,
  vIndex: number,
): EditableOutline | null {
  if (outline.kind === "polygon") {
    if (outline.pointsMm.length <= 3) return null;
    const pointsMm = outline.pointsMm
      .filter((_, i) => i !== vIndex)
      .map((p) => ({ x: p.x, y: p.y }));
    return withPolygonPoints(outline, pointsMm);
  }
  const n = outline.segments.length;
  if (n <= 3) return null;
  const inc = (vIndex - 1 + n) % n;
  const out = vIndex;
  if (outline.segments[inc]!.type === "arc" || outline.segments[out]!.type === "arc") {
    return null;
  }
  // Rotate so the deleted vertex sits between segments[0] (P→V) and [1] (V→N);
  // replace both with one straight edge P→N.
  const rotated = rotateContourStart(outline, (vIndex - 1 + n) % n);
  const merged: PcbOutlineSegment = {
    type: "line",
    to: { x: rotated.segments[1]!.to.x, y: rotated.segments[1]!.to.y },
  };
  const segments = [merged, ...rotated.segments.slice(2)];
  return normalizeContour({ ...rotated, segments });
}
