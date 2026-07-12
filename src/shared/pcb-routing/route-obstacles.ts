import type {
  PcbCopperLayerId,
  PcbDesignRules,
  PcbNetClass,
  PcbPlacedPart,
  PcbTrace,
  PcbVia,
} from "../../sdks/designer";
import {
  padWorldHalfExtentsMm,
  padWorldPositionMm,
  placementPads,
} from "../pcb-geometry/pad-geometry";
import { canonicalizeObstacles } from "./collision";
import { mmToNm, type ObstacleRectNm } from "./types";

/**
 * The one shared definition of the live-DRC clearance formula
 * (live-drc.ts runLiveDrc): net class can only tighten the board floor.
 */
export function resolveRouteClearancesMm(input: {
  netClass: Pick<PcbNetClass, "clearanceMm"> | null;
  designRules: Pick<PcbDesignRules, "clearance">;
}): { traceClearanceMm: number; padClearanceMm: number } {
  const classClearance = input.netClass?.clearanceMm ?? 0;
  return {
    traceClearanceMm: Math.max(
      classClearance,
      input.designRules.clearance.traceToTraceMm,
    ),
    padClearanceMm: Math.max(
      classClearance,
      input.designRules.clearance.traceToPadMm,
    ),
  };
}

export interface BuildObstaclesInput {
  /** Pre-filtered by the caller's broad-phase (rbush) query. */
  traces: readonly PcbTrace[];
  placements: readonly PcbPlacedPart[];
  vias: readonly PcbVia[];
  /** Routing layer — other-layer copper is transparent (live-DRC parity). */
  layer: PcbCopperLayerId;
  /** Session net — same-net copper is transparent (live-DRC parity). */
  netId: string | null;
  /** Pad key `${placementId}|${padNumber}` → net id. */
  padNetMap: ReadonlyMap<string, string>;
  traceClearanceMm: number;
  padClearanceMm: number;
  /** Width of the trace being routed. */
  routeWidthMm: number;
  /** Pad keys (`${placementId}|${padNumber}`) that must stay routable: target + start pad. */
  excludePadIds?: ReadonlySet<string>;
}

function sameNet(a: string | null, b: string | null): boolean {
  return a !== null && b !== null && a === b;
}

/**
 * Build clearance-inflated keep-out rects for auto-finish / walkaround /
 * meander fitting. Avoiding these rects is SUFFICIENT to pass the live-DRC
 * commit gate (inflations replicate its `required` math exactly; AABBs are
 * conservative near corners — proposals may be stricter than the gate, never
 * looser).
 */
export function buildRouteObstacles(
  input: BuildObstaclesInput,
): ObstacleRectNm[] {
  const out: ObstacleRectNm[] = [];
  const routeHalfNm = mmToNm(input.routeWidthMm / 2);

  for (const trace of input.traces) {
    if (trace.layer !== input.layer) continue;
    if (sameNet(trace.netId, input.netId)) continue;
    // required = traceClearance + pendingHalf + otherHalf (live-drc parity),
    // one rect per segment — whole-polyline boxes over-block long traces.
    const inflateNm =
      mmToNm(input.traceClearanceMm + trace.widthMm / 2) + routeHalfNm;
    for (let i = 1; i < trace.pointsNm.length; i += 1) {
      const a = trace.pointsNm[i - 1]!;
      const b = trace.pointsNm[i]!;
      out.push({
        minX: Math.min(a.x, b.x) - inflateNm,
        minY: Math.min(a.y, b.y) - inflateNm,
        maxX: Math.max(a.x, b.x) + inflateNm,
        maxY: Math.max(a.y, b.y) + inflateNm,
        id: `trace:${trace.id}:${i - 1}`,
      });
    }
  }

  const padInflateNm = mmToNm(input.padClearanceMm) + routeHalfNm;
  for (const placement of input.placements) {
    // Live-DRC layer model: pads block F.Cu or B.Cu only.
    const padLayer: PcbCopperLayerId =
      placement.layer === "B.Cu" ? "B.Cu" : "F.Cu";
    if (padLayer !== input.layer) continue;
    for (const pad of placementPads(placement)) {
      const key = `${placement.id}|${pad.number}`;
      if (input.excludePadIds?.has(key)) continue;
      const padNetId = input.padNetMap.get(key) ?? null;
      if (sameNet(padNetId, input.netId)) continue;
      const center = padWorldPositionMm(placement, pad);
      // Per-axis max of the swap-aware world AABB and live-DRC's un-swapped
      // model — the union clears both the physical pad and the commit gate.
      const swapped = padWorldHalfExtentsMm(placement, pad);
      const halfX = Math.max(swapped.x, pad.widthMm / 2);
      const halfY = Math.max(swapped.y, pad.heightMm / 2);
      out.push({
        minX: mmToNm(center.x - halfX) - padInflateNm,
        minY: mmToNm(center.y - halfY) - padInflateNm,
        maxX: mmToNm(center.x + halfX) + padInflateNm,
        maxY: mmToNm(center.y + halfY) + padInflateNm,
        id: `pad:${key}`,
      });
    }
  }

  for (const via of input.vias) {
    if (sameNet(via.netId, input.netId)) continue;
    // Vias block every layer (through barrels span the stack). Live DRC has
    // no trace↔via check — these rects only stop physical overlap.
    const halfNm =
      mmToNm(via.diameterMm / 2 + input.traceClearanceMm) + routeHalfNm;
    const cx = mmToNm(via.centerMm.x);
    const cy = mmToNm(via.centerMm.y);
    out.push({
      minX: cx - halfNm,
      minY: cy - halfNm,
      maxX: cx + halfNm,
      maxY: cy + halfNm,
      id: `via:${via.id}`,
    });
  }

  return canonicalizeObstacles(out);
}
