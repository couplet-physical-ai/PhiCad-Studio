/**
 * Circuit-spec IR — the compiler agent's OUTPUT contract.
 *
 * The LLM emits this declarative spec (blocks + port-level nets); a deterministic
 * expander (`expander.ts`) lowers it to a resolved netlist and, later, to a
 * DesignerCommand batch. The IR stays TS-internal — it never crosses a wire; only
 * the expanded DesignerCommand batch does (see plan: "IR internal, batch on wire").
 *
 * Composition is at the PORT level ("osc.OUT" → "cnt.CLK"), never pin level: the
 * model connects a handful of semantic ports, and each block owns its own
 * pin-accurate internal wiring deterministically.
 */

export type IrParamValue = string | number | boolean;

/** One instantiated block, addressed by a proposal-local handle. */
export interface BlockInstance {
  /** Unique within the IR; namespaces the block's parts/ports (e.g. "led0"). */
  id: string;
  /** Registered block recipe name (e.g. "led_indicator"). */
  recipe: string;
  params?: Record<string, IrParamValue>;
}

/** A net connecting block ports. Each port ref is "<blockId>.<PORT>". */
export interface IrNet {
  name: string;
  ports: string[];
}

export interface CircuitIr {
  version: 1;
  blocks: BlockInstance[];
  nets: IrNet[];
  /** Net names that are power rails — expanded as gnd/pwr port primitives, not plain wires. */
  power: { vcc: string; gnd: string };
}

// ─── Expander output (the golden-IR artifact) ─────────────────────────────

/** A pin addressed by its owning part handle + the symbol pin number/name. */
export interface NetlistPin {
  /** Namespaced part handle, "<blockId>.<partHandle>" (e.g. "led0.R"). */
  handle: string;
  /** Symbol pin number ("1") or name ("A"); resolved to a pin id at apply time. */
  pin: string;
}

export interface ResolvedPart {
  /** Namespaced part handle, unique across the netlist. */
  handle: string;
  /** Library role/query (e.g. "resistor", "led") — resolved to a componentId later. */
  role: string;
  /** Resolved library component id, when a resolver was supplied. */
  componentId?: string;
  /** Literal or computed value (e.g. "330Ω"); null when the part carries no value. */
  value: string | null;
  /** Expected reference prefix (R/D/U…) — for debug/labels; the designer assigns the real ref. */
  refPrefix: string;
}

export interface ResolvedNet {
  name: string;
  pins: NetlistPin[];
  /** True for power rails (vcc/gnd) — lowered to gnd/pwr port primitives. */
  isPower: boolean;
}

export interface ResolvedNetlist {
  parts: ResolvedPart[];
  nets: ResolvedNet[];
  /** Human-readable notes from param calc (e.g. the Ohm's-law derivation). */
  assumptions: string[];
}
