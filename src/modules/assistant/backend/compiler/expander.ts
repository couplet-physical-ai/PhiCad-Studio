/**
 * Expander: CircuitIr → ResolvedNetlist.
 *
 * Pure and deterministic (same IR → byte-identical output — the golden-IR
 * property that makes the compiler testable in isolation). Expands each block's
 * parts + internal wiring, namespaces handles by instance id, then stitches the
 * IR's port-level nets into concrete pin lists. Lowering the resolved netlist to
 * a DesignerCommand batch (with apply-time pin resolution) is the next increment.
 */

import { getBlockDef, type BlockPin } from "./blocks";
import type {
  CircuitIr,
  NetlistPin,
  ResolvedNet,
  ResolvedNetlist,
  ResolvedPart,
} from "./ir";

export interface ExpandOptions {
  /** Resolve a block-part role (e.g. "resistor") to a library component id. */
  resolveRole?: (role: string) => string | undefined;
}

export function expandCircuit(ir: CircuitIr, opts: ExpandOptions = {}): ResolvedNetlist {
  const parts: ResolvedPart[] = [];
  const nets: ResolvedNet[] = [];
  const assumptions: string[] = [];
  // "<blockId>.<PORT>" → the pin behind that port (namespaced handle + pin).
  const portIndex = new Map<string, NetlistPin>();
  const seenIds = new Set<string>();

  for (const block of ir.blocks) {
    if (seenIds.has(block.id)) {
      throw new Error(`Duplicate block id "${block.id}" in IR.`);
    }
    seenIds.add(block.id);
    const def = getBlockDef(block.recipe);
    if (!def) {
      throw new Error(`Unknown block recipe "${block.recipe}" (block "${block.id}").`);
    }
    const expansion = def.expand(block.params);
    const ns = (handle: string) => `${block.id}.${handle}`;

    for (const part of expansion.parts) {
      parts.push({
        handle: ns(part.handle),
        role: part.role,
        value: part.value ?? null,
        refPrefix: part.refPrefix,
        ...(opts.resolveRole ? withComponentId(opts.resolveRole(part.role)) : {}),
      });
    }

    expansion.internalNets.forEach((net, i) => {
      nets.push({
        name: `${block.id}.n${i}`,
        pins: net.pins.map((p) => nsPin(block.id, p)),
        isPower: false,
      });
    });

    for (const [portName, pin] of Object.entries(expansion.ports)) {
      portIndex.set(`${block.id}.${portName}`, nsPin(block.id, pin));
    }

    for (const note of expansion.assumptions) assumptions.push(`${block.id}: ${note}`);
  }

  const powerNets = new Set([ir.power.vcc, ir.power.gnd]);
  for (const net of ir.nets) {
    const pins = net.ports.map((ref) => resolvePortRef(ref, portIndex));
    nets.push({ name: net.name, pins, isPower: powerNets.has(net.name) });
  }

  return { parts, nets, assumptions };
}

function withComponentId(componentId: string | undefined): { componentId?: string } {
  return componentId ? { componentId } : {};
}

function nsPin(blockId: string, pin: BlockPin): NetlistPin {
  return { handle: `${blockId}.${pin.part}`, pin: pin.pin };
}

function resolvePortRef(ref: string, portIndex: Map<string, NetlistPin>): NetlistPin {
  const dot = ref.indexOf(".");
  if (dot <= 0 || dot === ref.length - 1) {
    throw new Error(`Net port ref "${ref}" must be "<blockId>.<PORT>".`);
  }
  const pin = portIndex.get(ref);
  if (!pin) {
    throw new Error(`Unknown port "${ref}" — no such block port is exposed.`);
  }
  return pin;
}
