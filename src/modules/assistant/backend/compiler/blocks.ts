/**
 * Primitive block registry (code tier).
 *
 * Each block is a deterministic parametric generator: params in → parts +
 * pin-accurate internal wiring + exposed semantic ports. This is where the
 * pin-level correctness lives, so the LLM never hand-wires pins (plan L1). The
 * primitive tier ships in code (stable); functional/reference blocks come later
 * as cloud-fetched DATA recipes interpreted by the same expander.
 *
 * Pin numbers below are ground truth from CoreLibrary symbols:
 *   resistor: pins "1"/"2" (passive, non-polar)
 *   led:      pin "1" = K (cathode), pin "2" = A (anode)
 */

import type { IrParamValue } from "./ir";
import { ceilE12, formatOhms, numParam } from "./units";

/** A pin within a block, addressed by part handle + symbol pin number/name. */
export interface BlockPin {
  part: string;
  pin: string;
}

export interface BlockPart {
  /** Handle local to the block (namespaced by the instance id at expand time). */
  handle: string;
  role: string;
  refPrefix: string;
  value?: string;
}

export interface BlockExpansion {
  parts: BlockPart[];
  /** Wires internal to the block (pin-to-pin). */
  internalNets: Array<{ pins: BlockPin[] }>;
  /** Exposed ports the IR wires to other blocks: PORT name → the pin behind it. */
  ports: Record<string, BlockPin>;
  assumptions: string[];
}

export interface BlockDef {
  recipe: string;
  /** Exposed port names (documentation + IR validation). */
  ports: string[];
  expand(params?: Record<string, IrParamValue>): BlockExpansion;
}

/**
 * A single indicator LED with its series current-limiting resistor.
 * Ports: IN (resistor high side → driver/rail), GND (LED cathode → ground).
 * R is sized by Ohm's law and rounded up to the nearest E12 value.
 */
const ledIndicator: BlockDef = {
  recipe: "led_indicator",
  ports: ["IN", "GND"],
  expand(params) {
    const vsupply = numParam(params, "supplyV", 5);
    const vf = numParam(params, "vf", 2.0);
    const iled = numParam(params, "currentA", 0.01);
    const raw = (vsupply - vf) / iled;
    const rValue = ceilE12(raw);
    return {
      parts: [
        { handle: "R", role: "resistor", refPrefix: "R", value: formatOhms(rValue) },
        { handle: "D", role: "led", refPrefix: "D" },
      ],
      // R.2 → LED anode (pin "2" = A). Current flows IN → R → A → K → GND.
      internalNets: [{ pins: [{ part: "R", pin: "2" }, { part: "D", pin: "2" }] }],
      ports: {
        IN: { part: "R", pin: "1" },
        GND: { part: "D", pin: "1" }, // LED cathode (K / pin "1")
      },
      assumptions: [
        `R = (Vsupply ${vsupply}V − Vf ${vf}V) / I ${(iled * 1000).toFixed(0)}mA ≈ ${raw.toFixed(0)}Ω → ${formatOhms(rValue)} (E12)`,
      ],
    };
  },
};

const REGISTRY = new Map<string, BlockDef>([[ledIndicator.recipe, ledIndicator]]);

export function getBlockDef(recipe: string): BlockDef | undefined {
  return REGISTRY.get(recipe);
}

export function listBlockRecipes(): string[] {
  return [...REGISTRY.keys()];
}
