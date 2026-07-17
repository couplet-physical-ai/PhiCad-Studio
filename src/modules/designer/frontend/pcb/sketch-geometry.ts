/**
 * Pure geometry for the Board Shape draw tool. No THREE, no store — unit-tested
 * standalone. Produces a canonical (explicit-closure) `PcbBoardContour` that the
 * shared validator accepts, so the draw tool feeds the exact same pipeline as
 * every other outline producer.
 */
import type { PcbBoardContour, PcbOutlineSegment, PcbPointMm } from "../../../../sdks";
import { normalizeContour } from "../../backend/pcb/contour-validation";

/**
 * Snap the segment `prev → cursor` to the nearest 45° increment when `enabled`
 * (Shift-held ortho/diagonal lock), preserving the cursor's distance from
 * `prev`. Returns the cursor unchanged when disabled or degenerate.
 */
export function constrainAngle(
  prev: PcbPointMm,
  cursor: PcbPointMm,
  enabled: boolean,
): PcbPointMm {
  if (!enabled) return cursor;
  const dx = cursor.x - prev.x;
  const dy = cursor.y - prev.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-9) return cursor;
  const step = Math.PI / 4;
  const angle = Math.round(Math.atan2(dy, dx) / step) * step;
  return { x: prev.x + Math.cos(angle) * dist, y: prev.y + Math.sin(angle) * dist };
}

/**
 * Build a canonical closed contour from ordered polygon vertices (>= 3). The
 * last edge closes explicitly back to the first vertex; {@link normalizeContour}
 * drops any degenerate edges, snaps the closure, and refreshes the bbox.
 */
export function verticesToContour(verticesMm: readonly PcbPointMm[]): PcbBoardContour {
  const start: PcbPointMm = { x: verticesMm[0]!.x, y: verticesMm[0]!.y };
  const segments: PcbOutlineSegment[] = verticesMm
    .slice(1)
    .map((v) => ({ type: "line", to: { x: v.x, y: v.y } }) as PcbOutlineSegment);
  segments.push({ type: "line", to: { x: start.x, y: start.y } });
  return normalizeContour({
    kind: "contour",
    widthMm: 0,
    heightMm: 0,
    centerMm: { x: 0, y: 0 },
    start,
    segments,
  });
}
