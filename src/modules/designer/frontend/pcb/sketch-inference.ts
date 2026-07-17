/**
 * Lightweight sketch inference for the Board Shape draw tool — NO constraint
 * solver. Soft-snaps the rubber-band point to an existing vertex (coincidence)
 * or to a horizontal/vertical edge relative to the previous vertex, and reports
 * a reference guide + constraint kind for the overlay. Shift (hard 45° lock)
 * suppresses inference at the call site; typed dimensions also take precedence.
 *
 * Pure: millimetres in, millimetres out. Tolerance is supplied in mm by the
 * caller (px-scaled by the current zoom) so the same code unit-tests cleanly.
 */
import type { PcbPointMm } from "../../../../sdks";
import { applyLengthAngle } from "./sketch-dimensions";
import { constrainAngle } from "./sketch-geometry";

export type InferKind = "horizontal" | "vertical" | "vertex" | "none";

export interface InferGuide {
  fromMm: PcbPointMm;
  toMm: PcbPointMm;
}

export interface InferResult {
  point: PcbPointMm;
  kind: InferKind;
  /** Reference line to draw (axis guide), or null for a vertex/none snap. */
  guide: InferGuide | null;
}

/** How far past the edge the axis reference line extends. */
const GUIDE_MARGIN_MM = 4;

function axisGuide(
  prev: PcbPointMm,
  point: PcbPointMm,
  axis: "h" | "v",
): InferGuide {
  if (axis === "h") {
    const lo = Math.min(prev.x, point.x) - GUIDE_MARGIN_MM;
    const hi = Math.max(prev.x, point.x) + GUIDE_MARGIN_MM;
    return { fromMm: { x: lo, y: prev.y }, toMm: { x: hi, y: prev.y } };
  }
  const lo = Math.min(prev.y, point.y) - GUIDE_MARGIN_MM;
  const hi = Math.max(prev.y, point.y) + GUIDE_MARGIN_MM;
  return { fromMm: { x: prev.x, y: lo }, toMm: { x: prev.x, y: hi } };
}

/**
 * Infer a snapped point for the edge `prev → cursor`. Priority: snap to the
 * nearest `others` vertex within `tolMm` (coincidence), else lock the edge to
 * horizontal/vertical when the cursor is within `tolMm` of that axis.
 */
export function inferSketchPoint(
  prev: PcbPointMm,
  cursor: PcbPointMm,
  others: readonly PcbPointMm[],
  tolMm: number,
): InferResult {
  // 1. Coincidence: snap onto an existing vertex.
  let best: { v: PcbPointMm; d: number } | null = null;
  for (const v of others) {
    const d = Math.hypot(cursor.x - v.x, cursor.y - v.y);
    if (d <= tolMm && (best === null || d < best.d)) best = { v, d };
  }
  if (best) {
    return { point: { x: best.v.x, y: best.v.y }, kind: "vertex", guide: null };
  }

  // 2. Horizontal / vertical relative to prev.
  const dx = cursor.x - prev.x;
  const dy = cursor.y - prev.y;
  if (Math.hypot(dx, dy) < tolMm) {
    return { point: cursor, kind: "none", guide: null };
  }
  if (Math.abs(dy) <= tolMm && Math.abs(dx) >= Math.abs(dy)) {
    const point = { x: cursor.x, y: prev.y };
    return { point, kind: "horizontal", guide: axisGuide(prev, point, "h") };
  }
  if (Math.abs(dx) <= tolMm && Math.abs(dy) >= Math.abs(dx)) {
    const point = { x: prev.x, y: cursor.y };
    return { point, kind: "vertical", guide: axisGuide(prev, point, "v") };
  }
  return { point: cursor, kind: "none", guide: null };
}

export interface SketchTargetOpts {
  shiftLock: boolean;
  lengthMm?: number;
  angleDeg?: number;
  /** Existing vertices to snap to (exclude the anchor `prev` to avoid self-snap). */
  others: readonly PcbPointMm[];
  tolMm: number;
}

/**
 * Single resolver every producer (live preview, click commit) calls, so what
 * the readout shows is exactly what commits. Precedence:
 *   typed dims  >  Shift 45° lock  >  soft inference  >  raw cursor.
 */
export function resolveSketchTarget(
  prev: PcbPointMm,
  cursorSnapped: PcbPointMm,
  opts: SketchTargetOpts,
): { point: PcbPointMm; infer: InferResult | null } {
  const hasTyped = opts.lengthMm != null || opts.angleDeg != null;
  if (hasTyped) {
    const base = opts.shiftLock
      ? constrainAngle(prev, cursorSnapped, true)
      : cursorSnapped;
    return {
      point: applyLengthAngle(prev, base, {
        lengthMm: opts.lengthMm,
        angleDeg: opts.angleDeg,
      }),
      infer: null,
    };
  }
  if (opts.shiftLock) {
    return { point: constrainAngle(prev, cursorSnapped, true), infer: null };
  }
  const infer = inferSketchPoint(prev, cursorSnapped, opts.others, opts.tolMm);
  return { point: infer.point, infer: infer.kind === "none" ? null : infer };
}
