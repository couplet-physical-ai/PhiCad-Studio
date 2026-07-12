/**
 * Lowering: ResolvedNetlist → CompiledPlan.
 *
 * Pure/deterministic data transform (no SDK). Decides a per-block column layout,
 * splits nets into pin-to-pin wires vs power-rail ports, and reports any part
 * whose role did not resolve to a library component (installed-parts-only
 * guardrail — the caller flags/imports rather than substituting a wrong part).
 *
 * Layout invariant: a wire's auto-route must never pass through a foreign pin —
 * pin-on-wire is a junction (standard EDA semantics), so a straight route
 * through a sibling pin silently shorts it into the net (a one-row grid did
 * exactly that: R.2→LED.A ran straight through LED.K). Blocks therefore get one
 * COLUMN each with their parts stacked vertically: intra-block routes bend
 * inside the column's corridor, and power-flag stubs (8 mm, placed on the pin's
 * outward side) stay clear of the neighbouring column's pins and wires.
 *
 * The plan is still symbolic: wires reference pins by {handle, pin}. Turning those
 * into real pin ids happens at APPLY time (P1.2b), after placement lands — because
 * `place_part` assigns references + pin ids itself (types.ts:1069).
 */

import type { NetlistPin, ResolvedNetlist } from "./ir";

export interface PlacementOp {
  handle: string;
  componentId: string;
  positionNm: { x: number; y: number };
  value: string | null;
  refPrefix: string;
}

export interface WireOp {
  net: string;
  /** Ordered pin chain; apply wires consecutive pairs (net inference unions them). */
  pins: NetlistPin[];
}

export interface PowerPortOp {
  net: string;
  kind: "gnd" | "pwr";
  /** Rail label for pwr ports (e.g. "+5V"); absent for gnd. */
  railText?: string;
  pins: NetlistPin[];
}

export interface CompiledPlan {
  placements: PlacementOp[];
  wires: WireOp[];
  powerPorts: PowerPortOp[];
  assumptions: string[];
  /** Roles that did not resolve to a component id — the circuit is incomplete. */
  unresolvedRoles: string[];
  /** Structural IR issues that silently reduce the circuit (e.g. dropped 1-pin nets). */
  warnings: string[];
}

export interface LowerOptions {
  origin?: { x: number; y: number };
  /** Grid pitch in nm (default 20 mm). */
  pitchNm?: number;
  /** Block columns per row (default 6); a full row wraps below the tallest block. */
  columns?: number;
}

export const DEFAULT_PITCH_NM = 20_000_000;

const GROUND_RE = /^(gnd|ground)$/i;

/** Block id from a namespaced part handle ("led0.R" → "led0"). */
function blockIdOf(handle: string): string {
  const dot = handle.indexOf(".");
  return dot === -1 ? handle : handle.slice(0, dot);
}

export function lowerNetlist(netlist: ResolvedNetlist, opts: LowerOptions = {}): CompiledPlan {
  const origin = opts.origin ?? { x: 0, y: 0 };
  const pitchNm = opts.pitchNm ?? DEFAULT_PITCH_NM;
  const columns = Math.max(1, opts.columns ?? 6);

  const unresolvedRoles: string[] = [];
  const placeable = netlist.parts.filter((part) => {
    if (part.componentId) return true;
    unresolvedRoles.push(part.role);
    return false;
  });

  // One column per block (first-appearance order), parts stacked top-down.
  const blockColumn = new Map<string, number>();
  const blockSize = new Map<string, number>();
  for (const part of placeable) {
    const blockId = blockIdOf(part.handle);
    if (!blockColumn.has(blockId)) blockColumn.set(blockId, blockColumn.size);
    blockSize.set(blockId, (blockSize.get(blockId) ?? 0) + 1);
  }
  const tallest = Math.max(1, ...blockSize.values());

  const placements: PlacementOp[] = [];
  const rowInBlock = new Map<string, number>();
  for (const part of placeable) {
    const blockId = blockIdOf(part.handle);
    const blockIdx = blockColumn.get(blockId)!;
    const row = rowInBlock.get(blockId) ?? 0;
    rowInBlock.set(blockId, row + 1);
    placements.push({
      handle: part.handle,
      componentId: part.componentId!,
      positionNm: {
        x: origin.x + (blockIdx % columns) * pitchNm,
        y:
          origin.y +
          (Math.floor(blockIdx / columns) * tallest + row) * pitchNm,
      },
      value: part.value,
      refPrefix: part.refPrefix,
    });
  }

  const wires: WireOp[] = [];
  const powerPorts: PowerPortOp[] = [];
  const warnings: string[] = [];
  for (const net of netlist.nets) {
    if (net.isPower) {
      if (net.pins.length === 0) continue;
      const kind: "gnd" | "pwr" = GROUND_RE.test(net.name) ? "gnd" : "pwr";
      powerPorts.push({
        net: net.name,
        kind,
        ...(kind === "pwr" ? { railText: net.name } : {}),
        pins: net.pins,
      });
    } else if (net.pins.length >= 2) {
      wires.push({ net: net.name, pins: net.pins });
    } else {
      // The IR asked for a connection that cannot exist — surface it instead of
      // quietly building a smaller circuit (a 1-pin "drive" net is usually a
      // mis-named rail or a missing second port ref).
      warnings.push(
        `Net "${net.name}" connects ${net.pins.length} pin(s) — dropped, nothing to wire.`,
      );
    }
  }

  return {
    placements,
    wires,
    powerPorts,
    assumptions: netlist.assumptions,
    unresolvedRoles,
    warnings,
  };
}
