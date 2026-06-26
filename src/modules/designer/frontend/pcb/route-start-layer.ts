import type { PcbCopperLayerId, PcbViewSide } from "../../../../sdks";

/**
 * Pick the copper layer a new route should start on.
 *
 * - **Locked** (a layer is focused): always the locked layer — the user's
 *   explicit override, regardless of what was clicked.
 * - **Auto** (no focus): follow the clicked object's layer (`anchorLayer`).
 *   Click a top pad → F.Cu, a bottom pad → B.Cu. When the anchor spans all
 *   copper (through-hole pad / via → `null`) or carries no layer hint
 *   (free/dangling → `undefined`), fall back to the viewed side.
 */
export function pickRouteStartLayer(input: {
  focusedLayer: PcbCopperLayerId | null;
  anchorLayer: PcbCopperLayerId | null | undefined;
  viewSide: PcbViewSide;
}): PcbCopperLayerId {
  if (input.focusedLayer !== null) return input.focusedLayer;
  if (input.anchorLayer != null) return input.anchorLayer;
  return input.viewSide === "bottom" ? "B.Cu" : "F.Cu";
}
