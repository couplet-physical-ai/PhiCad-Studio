/**
 * Pure layer-cycling logic for the route tool's V key. The active LAYER PAIR
 * (KiCad concept) decides where a smart via jumps: V toggles between the two
 * pair layers; 1/2/3/4 hotkeys still jump to any routable layer directly.
 */
import type { PcbCopperLayerId, PcbLayerCount } from "../../../../../sdks";
import { copperLayersForCount } from "../../../../../sdks";

export type RouteLayerPair = readonly [PcbCopperLayerId, PcbCopperLayerId];

export const DEFAULT_LAYER_PAIR: RouteLayerPair = ["F.Cu", "B.Cu"];

/** Pairs offered in the toolbar selector: F/B plus each adjacent layer pair. */
export function layerPairPresets(
  layerCount: PcbLayerCount,
): readonly RouteLayerPair[] {
  const layers = copperLayersForCount(layerCount);
  const pairs: RouteLayerPair[] = [["F.Cu", "B.Cu"]];
  for (let i = 0; i < layers.length - 1; i += 1) {
    pairs.push([layers[i]!, layers[i + 1]!]);
  }
  return pairs;
}

/** Static 4-layer preset list retained for existing 2/4 callers. */
export const LAYER_PAIR_PRESETS: readonly RouteLayerPair[] = layerPairPresets(4);

export function routableCopperLayers(
  layerCount: PcbLayerCount,
): readonly PcbCopperLayerId[] {
  return copperLayersForCount(layerCount);
}

/**
 * Layer the V key jumps to: toggles within the active pair; a current layer
 * outside the pair jumps to the pair's first entry. A pair that isn't
 * routable on this board (e.g. inner layers on a 2-layer board) falls back
 * to F.Cu↔B.Cu.
 */
export function nextRouteLayer(
  current: PcbCopperLayerId,
  layerCount: PcbLayerCount,
  pair: RouteLayerPair = DEFAULT_LAYER_PAIR,
): PcbCopperLayerId {
  const routable = routableCopperLayers(layerCount);
  const effective: RouteLayerPair =
    routable.includes(pair[0]) &&
    routable.includes(pair[1]) &&
    pair[0] !== pair[1]
      ? pair
      : DEFAULT_LAYER_PAIR;
  if (current === effective[0]) return effective[1];
  if (current === effective[1]) return effective[0];
  return effective[0];
}
