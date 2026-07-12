import type { PointNm } from "./types";

/**
 * Safety slack (nm) shared by the search passes: obstacles are inflated by
 * this much beyond gate-required clearance, so bounded corner cuts that stay
 * under it still clear the TRUE keep-outs at final validation.
 */
export const SAFETY_NM = 1_000;

/**
 * In 45-mode the elbow builder chamfers axis⟂axis corners with cut length
 * half the shorter leg — at a corner hugging a keep-out that cut slices into
 * it. Replace every surviving axis⟂axis corner: prefer an explicit
 * `cutNm`-sized diagonal cut when it clears (`segmentBlocked` false);
 * otherwise shorten the legs with collinear anchors so the automatic chamfer
 * stays under the SAFETY margin.
 */
export function fixup45Corners(
  anchors: readonly PointNm[],
  segmentBlocked: (a: PointNm, b: PointNm) => boolean,
  cutNm: number,
): PointNm[] {
  if (anchors.length < 3) return [...anchors];
  const out: PointNm[] = [anchors[0]!];
  for (let i = 1; i < anchors.length - 1; i += 1) {
    const prev = out[out.length - 1]!;
    const corner = anchors[i]!;
    const next = anchors[i + 1]!;
    const inDx = corner.x - prev.x;
    const inDy = corner.y - prev.y;
    const outDx = next.x - corner.x;
    const outDy = next.y - corner.y;
    const perpendicular =
      (inDx !== 0 && inDy === 0 && outDx === 0 && outDy !== 0) ||
      (inDx === 0 && inDy !== 0 && outDx !== 0 && outDy === 0);
    if (!perpendicular) {
      out.push(corner);
      continue;
    }
    const legIn = Math.abs(inDx) + Math.abs(inDy);
    const legOut = Math.abs(outDx) + Math.abs(outDy);
    const sInX = Math.sign(inDx);
    const sInY = Math.sign(inDy);
    const sOutX = Math.sign(outDx);
    const sOutY = Math.sign(outDy);
    const cutMax = Math.min(cutNm, legIn - 1, legOut - 1);
    let replaced = false;
    if (cutMax >= 2) {
      const a = { x: corner.x - sInX * cutMax, y: corner.y - sInY * cutMax };
      const b = { x: corner.x + sOutX * cutMax, y: corner.y + sOutY * cutMax };
      if (!segmentBlocked(a, b)) {
        out.push(a, b);
        replaced = true;
      }
    }
    if (!replaced) {
      // Chamfer = floor(leg/2); legs of 2·SAFETY bound the cut depth to
      // SAFETY/√2 — inside the search margin, outside the true keep-out.
      const shorten = Math.min(2 * SAFETY_NM, legIn - 1, legOut - 1);
      if (shorten >= 2) {
        out.push({
          x: corner.x - sInX * shorten,
          y: corner.y - sInY * shorten,
        });
        out.push(corner);
        out.push({
          x: corner.x + sOutX * shorten,
          y: corner.y + sOutY * shorten,
        });
      } else {
        out.push(corner);
      }
    }
  }
  out.push(anchors[anchors.length - 1]!);
  return out;
}
