/**
 * Pure fillet / chamfer for board-outline corners. v1 handles **line-line**
 * corners only (both edges meeting at the vertex are straight) — arc-adjacent
 * corners are deferred. Produces a canonical contour via {@link normalizeContour}
 * so results flow through the same validator as every other outline producer.
 *
 * Every operation returns `null` when it cannot be applied (non-line edges,
 * degenerate/near-straight corner, or a radius/setback that overruns an
 * adjacent edge) — the caller leaves the outline unchanged.
 */
import type {
  PcbBoardContour,
  PcbOutlineSegment,
  PcbPointMm,
} from "../../../../sdks";
import { normalizeContour } from "../../backend/pcb/contour-validation";

type V = PcbPointMm;

const sub = (a: V, b: V): V => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: V, b: V): V => ({ x: a.x + b.x, y: a.y + b.y });
const scale = (a: V, s: number): V => ({ x: a.x * s, y: a.y * s });
const len = (a: V): number => Math.hypot(a.x, a.y);
const dot = (a: V, b: V): number => a.x * b.x + a.y * b.y;
function norm(a: V): V {
  const l = len(a);
  return l < 1e-12 ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l };
}

/** Vertices of a canonical (explicit-closure) contour, in ring order. */
export function contourVertices(contour: PcbBoardContour): V[] {
  return [
    { x: contour.start.x, y: contour.start.y },
    ...contour.segments.slice(0, -1).map((s) => ({ x: s.to.x, y: s.to.y })),
  ];
}

/**
 * Re-express the same closed contour starting at vertex `k` (pure relabel of a
 * ring). Lets a corner operation rotate its target vertex into the interior,
 * sidestepping the start/closing-edge wrap cases.
 */
export function rotateContourStart(
  contour: PcbBoardContour,
  k: number,
): PcbBoardContour {
  const n = contour.segments.length;
  const verts = contourVertices(contour);
  const start = verts[((k % n) + n) % n]!;
  const segments: PcbOutlineSegment[] = [];
  for (let i = 0; i < n; i += 1) {
    segments.push(contour.segments[(k + i) % n]!);
  }
  return { ...contour, start: { x: start.x, y: start.y }, segments };
}

interface CornerFrame {
  rotated: PcbBoardContour;
  /** Previous vertex (== rotated.start). */
  P: V;
  /** The corner vertex being operated on. */
  Vc: V;
  /** Next vertex. */
  N: V;
}

/**
 * Rotate `contour` so the corner at `vIndex` sits between `segments[0]` and
 * `segments[1]`, and confirm both are lines. Returns null when either adjacent
 * edge is an arc (v1 restriction) or the contour is too small.
 */
function cornerFrame(
  contour: PcbBoardContour,
  vIndex: number,
): CornerFrame | null {
  const n = contour.segments.length;
  if (n < 3) return null;
  const rotated = rotateContourStart(contour, (vIndex - 1 + n) % n);
  const inEdge = rotated.segments[0]!;
  const outEdge = rotated.segments[1]!;
  if (inEdge.type !== "line" || outEdge.type !== "line") return null;
  return { rotated, P: rotated.start, Vc: inEdge.to, N: outEdge.to };
}

interface CornerTangents {
  d1: V;
  d2: V;
  /** Distance from the corner to each tangent point along its edges. */
  edge1: number;
  edge2: number;
}

function cornerTangents(frame: CornerFrame): CornerTangents | null {
  const d1 = norm(sub(frame.P, frame.Vc));
  const d2 = norm(sub(frame.N, frame.Vc));
  if (len(d1) < 0.5 || len(d2) < 0.5) return null; // degenerate edge
  const cosT = Math.max(-1, Math.min(1, dot(d1, d2)));
  const theta = Math.acos(cosT);
  // Reject near-straight (θ≈π) and folded-back (θ≈0) corners — nothing to round.
  if (theta < 1e-3 || Math.PI - theta < 1e-3) return null;
  return {
    d1,
    d2,
    edge1: len(sub(frame.P, frame.Vc)),
    edge2: len(sub(frame.N, frame.Vc)),
  };
}

/**
 * Round the corner at `vIndex` with a tangent arc of `radiusMm`. Returns null
 * unless both adjacent edges are lines and the radius fits within them.
 */
export function filletCorner(
  contour: PcbBoardContour,
  vIndex: number,
  radiusMm: number,
): PcbBoardContour | null {
  if (!(radiusMm > 0)) return null;
  const frame = cornerFrame(contour, vIndex);
  if (!frame) return null;
  const t = cornerTangents(frame);
  if (!t) return null;

  const theta = Math.acos(Math.max(-1, Math.min(1, dot(t.d1, t.d2))));
  const half = theta / 2;
  const setback = radiusMm / Math.tan(half);
  if (setback >= t.edge1 - 1e-6 || setback >= t.edge2 - 1e-6) return null;

  const tangentP = add(frame.Vc, scale(t.d1, setback));
  const tangentN = add(frame.Vc, scale(t.d2, setback));
  const bis = norm(add(t.d1, t.d2));
  const center = add(frame.Vc, scale(bis, radiusMm / Math.sin(half)));

  // Pick the winding that sweeps the minor (< π) arc — the actual fillet.
  const a0 = Math.atan2(tangentP.y - center.y, tangentP.x - center.x);
  const a1 = Math.atan2(tangentN.y - center.y, tangentN.x - center.x);
  let ccw = a1 - a0;
  while (ccw <= 0) ccw += Math.PI * 2;
  const cw = ccw > Math.PI;

  const [, out, ...rest] = frame.rotated.segments;
  const segments: PcbOutlineSegment[] = [
    { type: "line", to: tangentP },
    { type: "arc", to: tangentN, centerMm: center, cw },
    out!,
    ...rest,
  ];
  return normalizeContour({ ...frame.rotated, segments });
}

/**
 * Bevel the corner at `vIndex` by `setbackMm` along each edge. Returns null
 * unless both adjacent edges are lines and the setback fits within them.
 */
export function chamferCorner(
  contour: PcbBoardContour,
  vIndex: number,
  setbackMm: number,
): PcbBoardContour | null {
  if (!(setbackMm > 0)) return null;
  const frame = cornerFrame(contour, vIndex);
  if (!frame) return null;
  const t = cornerTangents(frame);
  if (!t) return null;
  if (setbackMm >= t.edge1 - 1e-6 || setbackMm >= t.edge2 - 1e-6) return null;

  const tangentP = add(frame.Vc, scale(t.d1, setbackMm));
  const tangentN = add(frame.Vc, scale(t.d2, setbackMm));
  const [, out, ...rest] = frame.rotated.segments;
  const segments: PcbOutlineSegment[] = [
    { type: "line", to: tangentP },
    { type: "line", to: tangentN },
    out!,
    ...rest,
  ];
  return normalizeContour({ ...frame.rotated, segments });
}
