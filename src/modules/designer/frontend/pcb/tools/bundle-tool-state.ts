import type { PcbCopperLayerId, PcbTraceSegmentMode } from "../../../../../sdks";
import type { PointNm } from "./route-tool-state";

/**
 * Pure state machine for bundle routing (pcb.bundleRouting): collect N pads
 * by clicking them (toggle), then click free space to route ONE centerline —
 * the ghost fans the collected pads into N parallel lanes at `pitchNm`.
 * `,`/`.` adjust pitch live; Enter commits every lane in a single atomic
 * `pcb_commit_route`; Esc cancels. Lane geometry lives in
 * shared/pcb-routing/bundle-geometry.ts — this file only tracks intent.
 */
export interface BundlePad {
  /** "placementId|padNumber" */
  padId: string;
  netId: string | null;
  netName: string | null;
  centerNm: PointNm;
}

export interface BundleSession {
  /** Insertion-ordered collection; lane mapping is monotone by geometry. */
  pads: BundlePad[];
  layer: PcbCopperLayerId;
  segmentMode: PcbTraceSegmentMode;
  widthMm: number;
  netClassId: string;
  /** Center-to-center lane pitch (nm). */
  pitchNm: number;
  /** Centerline waypoints; non-empty = routing (collection locked). */
  waypointsNm: PointNm[];
}

export type BundleToolState =
  | { kind: "idle" }
  | { kind: "bundling"; session: BundleSession };

export type BundleToolEvent =
  /**
   * Click on a pad: adds it (starting the session from the carried defaults
   * on the first pad) or removes it again. Ignored once routing started.
   */
  | {
      kind: "toggle-pad";
      pad: BundlePad;
      layer: PcbCopperLayerId;
      segmentMode: PcbTraceSegmentMode;
      widthMm: number;
      netClassId: string;
      pitchNm: number;
    }
  /** Free-space click with ≥2 pads: extend the centerline. */
  | { kind: "commit-waypoint"; pointNm: PointNm }
  | { kind: "nudge-pitch"; direction: 1 | -1; minPitchNm: number }
  /** Absolute pitch (diff-pair gap adoption on partner auto-add). */
  | { kind: "set-pitch"; pitchNm: number }
  /** Pop the last waypoint; with none, pop the last pad; empty → idle. */
  | { kind: "step-back" }
  | { kind: "cancel" };

export const initialBundleToolState: BundleToolState = { kind: "idle" };

/** Additive pitch nudge for ,/. keys (nm). */
const PITCH_STEP_NM = 50_000;
const PITCH_MAX_NM = 5_000_000;

export function bundleToolReducer(
  state: BundleToolState,
  event: BundleToolEvent,
): BundleToolState {
  switch (event.kind) {
    case "toggle-pad": {
      if (state.kind === "idle") {
        return {
          kind: "bundling",
          session: {
            pads: [event.pad],
            layer: event.layer,
            segmentMode: event.segmentMode,
            widthMm: event.widthMm,
            netClassId: event.netClassId,
            pitchNm: event.pitchNm,
            waypointsNm: [],
          },
        };
      }
      const s = state.session;
      if (s.waypointsNm.length > 0) return state; // collection locked
      const existing = s.pads.findIndex((p) => p.padId === event.pad.padId);
      if (existing >= 0) {
        const pads = s.pads.filter((_, i) => i !== existing);
        if (pads.length === 0) return { kind: "idle" };
        return { kind: "bundling", session: { ...s, pads } };
      }
      return {
        kind: "bundling",
        session: { ...s, pads: [...s.pads, event.pad] },
      };
    }
    case "cancel":
      return { kind: "idle" };
    default:
      break;
  }
  if (state.kind !== "bundling") return state;
  const s = state.session;
  switch (event.kind) {
    case "commit-waypoint": {
      if (s.pads.length < 2) return state;
      const last = s.waypointsNm[s.waypointsNm.length - 1];
      if (last && last.x === event.pointNm.x && last.y === event.pointNm.y) {
        return state;
      }
      return {
        kind: "bundling",
        session: { ...s, waypointsNm: [...s.waypointsNm, event.pointNm] },
      };
    }
    case "nudge-pitch": {
      const next = Math.max(
        event.minPitchNm,
        Math.min(PITCH_MAX_NM, s.pitchNm + event.direction * PITCH_STEP_NM),
      );
      if (next === s.pitchNm) return state;
      return { kind: "bundling", session: { ...s, pitchNm: next } };
    }
    case "set-pitch": {
      if (event.pitchNm <= 0 || event.pitchNm === s.pitchNm) return state;
      return {
        kind: "bundling",
        session: { ...s, pitchNm: Math.min(PITCH_MAX_NM, event.pitchNm) },
      };
    }
    case "step-back": {
      if (s.waypointsNm.length > 0) {
        return {
          kind: "bundling",
          session: { ...s, waypointsNm: s.waypointsNm.slice(0, -1) },
        };
      }
      const pads = s.pads.slice(0, -1);
      if (pads.length === 0) return { kind: "idle" };
      return { kind: "bundling", session: { ...s, pads } };
    }
    default:
      return state;
  }
}

/** Centerline start = centroid of the collected pad centers (rounded). */
export function bundleAnchorNm(session: BundleSession): PointNm {
  let x = 0;
  let y = 0;
  for (const pad of session.pads) {
    x += pad.centerNm.x;
    y += pad.centerNm.y;
  }
  return {
    x: Math.round(x / session.pads.length),
    y: Math.round(y / session.pads.length),
  };
}
