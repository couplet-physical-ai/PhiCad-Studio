/**
 * Pure view-model builder for the route HUD. Keeps every displayed value —
 * net, layer, width + its source, via sizes, live length, DRC status — in one
 * testable place so the HUD component stays dumb.
 */
import type {
  PcbCopperLayerId,
  PcbNetClass,
  PcbTraceSegmentMode,
} from "../../../../../sdks";
import type {
  PointNm,
  RoutePosture,
  RouteSession,
  RouteWidthSource,
} from "./route-tool-state";
import { routeKeyHints, type RouteKeyBinding } from "./route-keymap";

const NM_PER_MM = 1_000_000;

/** Polyline length in mm (input points in integer nm). */
export function routeLengthMm(pathNm: readonly PointNm[]): number {
  let total = 0;
  for (let i = 1; i < pathNm.length; i += 1) {
    const dx = (pathNm[i]!.x - pathNm[i - 1]!.x) / NM_PER_MM;
    const dy = (pathNm[i]!.y - pathNm[i - 1]!.y) / NM_PER_MM;
    total += Math.hypot(dx, dy);
  }
  return total;
}

export interface RouteHudModel {
  netName: string | null;
  layer: PcbCopperLayerId;
  widthMm: number;
  widthSource: RouteWidthSource;
  /** Session net-class name — attributes the width/via defaults. */
  netClassName: string | null;
  viaDiameterMm: number | null;
  viaDrillMm: number | null;
  /** True when a route-time via size override is active. */
  viaOverridden: boolean;
  segmentMode: PcbTraceSegmentMode;
  posture: RoutePosture;
  /** Committed segments + pending ghost, mm. */
  lengthMm: number;
  drcConflictCount: number;
  hints: readonly RouteKeyBinding[];
}

export function buildRouteHudModel(input: {
  session: RouteSession;
  /** Full ghost path incl. the pending segment (nm). */
  previewPathNm: readonly PointNm[];
  netName: string | null;
  netClass: PcbNetClass | null;
  drcConflictCount: number;
}): RouteHudModel {
  const s = input.session;
  return {
    netName: input.netName,
    layer: s.layer,
    widthMm: s.widthMm,
    widthSource: s.widthSource,
    netClassName: input.netClass?.name ?? null,
    viaDiameterMm:
      s.viaDiameterMmOverride ?? input.netClass?.viaDiameterMm ?? null,
    viaDrillMm: s.viaDrillMmOverride ?? input.netClass?.viaDrillMm ?? null,
    viaOverridden:
      s.viaDiameterMmOverride !== undefined ||
      s.viaDrillMmOverride !== undefined,
    segmentMode: s.segmentMode,
    posture: s.posture,
    lengthMm: routeLengthMm(input.previewPathNm),
    drcConflictCount: input.drcConflictCount,
    hints: routeKeyHints({ routing: true, primaryOnly: true }),
  };
}
