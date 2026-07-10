/**
 * Lowering: ResolvedNetlist → CompiledPlan.
 *
 * Pure/deterministic data transform (no SDK). Decides a grid layout, splits nets
 * into pin-to-pin wires vs power-rail ports, and reports any part whose role did
 * not resolve to a library component (installed-parts-only guardrail — the caller
 * flags/imports rather than substituting a wrong part).
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
}

export interface LowerOptions {
  origin?: { x: number; y: number };
  /** Grid pitch in nm (default 20 mm). */
  pitchNm?: number;
  columns?: number;
}

const GROUND_RE = /^(gnd|ground)$/i;

export function lowerNetlist(netlist: ResolvedNetlist, opts: LowerOptions = {}): CompiledPlan {
  const origin = opts.origin ?? { x: 0, y: 0 };
  const pitchNm = opts.pitchNm ?? 20_000_000;
  const columns = Math.max(1, opts.columns ?? 6);

  const placements: PlacementOp[] = [];
  const unresolvedRoles: string[] = [];
  for (const part of netlist.parts) {
    if (!part.componentId) {
      unresolvedRoles.push(part.role);
      continue;
    }
    const slot = placements.length;
    placements.push({
      handle: part.handle,
      componentId: part.componentId,
      positionNm: {
        x: origin.x + (slot % columns) * pitchNm,
        y: origin.y + Math.floor(slot / columns) * pitchNm,
      },
      value: part.value,
      refPrefix: part.refPrefix,
    });
  }

  const wires: WireOp[] = [];
  const powerPorts: PowerPortOp[] = [];
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
    }
    // A non-power net with <2 pins has nothing to connect — silently dropped.
  }

  return {
    placements,
    wires,
    powerPorts,
    assumptions: netlist.assumptions,
    unresolvedRoles,
  };
}
