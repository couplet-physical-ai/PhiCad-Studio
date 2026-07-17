/**
 * Numeric dimension edits for an existing board outline: retype an edge length
 * or a vertex position. Both ride the arc-safe {@link moveVertex} primitive and
 * return null when the change cannot apply cleanly (arc-adjacent vertex, or the
 * move collapses an edge). Pure — unit-tested standalone.
 */
import type { PcbPointMm } from "../../../../sdks";
import {
  moveVertex,
  outlineVertices,
  type EditableOutline,
} from "./pcb-outline-edit";

/**
 * Set the length of ring edge `edgeIndex` (verts[i] → verts[i+1]) by sliding
 * the FAR endpoint along the edge direction; the near endpoint stays put. The
 * neighbouring edge stretches to follow (direct manipulation, no solver).
 * Returns null for a non-positive length, a degenerate edge, or when the far
 * vertex is arc-adjacent (the move would break the arc).
 */
export function setEdgeLength(
  outline: EditableOutline,
  edgeIndex: number,
  lengthMm: number,
): EditableOutline | null {
  if (!(lengthMm > 0)) return null;
  const verts = outlineVertices(outline);
  const n = verts.length;
  if (n < 3 || edgeIndex < 0 || edgeIndex >= n) return null;
  const a = verts[edgeIndex]!;
  const bIndex = (edgeIndex + 1) % n;
  const b = verts[bIndex]!;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const cur = Math.hypot(dx, dy);
  if (cur < 1e-9) return null;
  const to = { x: a.x + (dx / cur) * lengthMm, y: a.y + (dy / cur) * lengthMm };
  const next = moveVertex(outline, bIndex, to);
  const nv = outlineVertices(next);
  if (nv.length !== n) return null; // move collapsed an edge → reject
  const na = nv[edgeIndex]!;
  const nb = nv[bIndex]!;
  const newLen = Math.hypot(nb.x - na.x, nb.y - na.y);
  if (Math.abs(newLen - lengthMm) > 1e-4) return null; // arc-adjacent no-op
  return next;
}

/**
 * Move vertex `vIndex` to an exact position. Returns null when the vertex is
 * arc-adjacent (the {@link moveVertex} no-op) or the move degenerates the ring.
 */
export function setVertexPosition(
  outline: EditableOutline,
  vIndex: number,
  toMm: PcbPointMm,
): EditableOutline | null {
  const verts = outlineVertices(outline);
  if (vIndex < 0 || vIndex >= verts.length) return null;
  const to = { x: toMm.x, y: toMm.y };
  const next = moveVertex(outline, vIndex, to);
  const nv = outlineVertices(next);
  if (nv.length !== verts.length) return null;
  const m = nv[vIndex]!;
  if (Math.hypot(m.x - to.x, m.y - to.y) > 1e-6) return null;
  return next;
}
