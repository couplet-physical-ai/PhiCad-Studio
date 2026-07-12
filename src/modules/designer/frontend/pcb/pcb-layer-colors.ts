/**
 * Copper-layer render colors for any stackup up to 32 layers (P2). The base
 * four (F.Cu / In1 / In2 / B.Cu) keep the published `PCB_TRACE_COLORS`; inner
 * layers In3+ get a deterministic hue ramp so 6/8/…-layer boards render with
 * distinct, stable per-layer colors. Keyed only by layer id so it needs no
 * board context.
 */
import type { PcbCopperLayerId, PcbLayerId } from "../../../../sdks";
import { isCopperLayerId } from "../../../../sdks";
import { PCB_TRACE_COLORS } from "../../../../shared/frontend/canvas/layers";

const BASE: Record<string, string> = PCB_TRACE_COLORS as Record<string, string>;

function innerLayerNumber(layer: PcbCopperLayerId): number | null {
  const m = /^In(\d+)\.Cu$/.exec(layer);
  return m ? Number(m[1]) : null;
}

/**
 * HSL→hex for the inner-layer ramp. Inner layer k (k ≥ 3) is spaced around the
 * hue wheel by the golden angle so adjacent layers stay visually separated.
 */
function rampColor(innerIndex: number): string {
  const hue = (innerIndex * 137.508) % 360;
  const s = 0.6;
  const l = 0.55;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    hue < 60
      ? [c, x, 0]
      : hue < 120
        ? [x, c, 0]
        : hue < 180
          ? [0, c, x]
          : hue < 240
            ? [0, x, c]
            : hue < 300
              ? [x, 0, c]
              : [c, 0, x];
  const to = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

/** Render color for a copper layer (base 4 published; inner In3+ ramped). */
export function copperLayerColor(layer: PcbCopperLayerId): string {
  const base = BASE[layer];
  if (base) return base;
  const inner = innerLayerNumber(layer);
  // In1/In2 are in BASE; In3+ ramp from index 3.
  return inner !== null ? rampColor(inner) : (BASE["F.Cu"] ?? "#ff0000");
}

/**
 * Render color for ANY board layer (copper or otherwise). Copper layers route
 * through the ramp helper; non-copper layers use the published color map.
 */
export function layerColor(layer: PcbLayerId): string {
  if (isCopperLayerId(layer)) return copperLayerColor(layer);
  const c = (BASE as Record<string, string>)[layer];
  return c ?? "#94a3b8";
}
