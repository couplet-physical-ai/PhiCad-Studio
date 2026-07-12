import type {
  PcbCopperLayerId,
  PcbTraceSegmentMode,
} from "../../../../../sdks";

export interface PointNm {
  x: number;
  y: number;
}

/** Posture cycle order (matches PcbCanvas `/` key cycling). */
export type RoutePosture = "auto" | "axis" | "diagonal";

export const POSTURE_CYCLE: ReadonlyArray<RoutePosture> = [
  "auto",
  "axis",
  "diagonal",
];

export function nextPosture(current: RoutePosture): RoutePosture {
  const idx = POSTURE_CYCLE.indexOf(current);
  return POSTURE_CYCLE[(idx + 1) % POSTURE_CYCLE.length]!;
}

/**
 * Where the session's active trace width came from. Drives the width badge in
 * the route HUD ("0.3 mm — netclass 'power'" vs "manual") so the user always
 * knows why a width is in effect — the #1 reported confusion in KiCad's
 * router. Precedence: manual > preset > netclass.
 */
export type RouteWidthSource = "netclass" | "preset" | "manual";

/** A finished run of the session: one polyline on one layer at one width. */
export interface PendingTraceRun {
  layer: PcbCopperLayerId;
  widthMm: number;
  pointsNm: PointNm[];
  segmentMode: PcbTraceSegmentMode;
}

/** A via dropped mid-session (sizes resolved from net class at commit). */
export interface PendingVia {
  centerNm: PointNm;
  diameterMmOverride?: number;
  drillMmOverride?: number;
}

/**
 * One accumulated session boundary — a layer change (run + via), a bare via
 * drop (via only), or a width split (run only). `prev*` snapshot the active
 * state BEFORE the boundary so `step-back` can reopen it losslessly: the
 * run's path vertices become anchor+waypoints again (they reproduce the same
 * path under buildPreviewPath).
 */
export interface RouteSessionBoundary {
  run?: PendingTraceRun;
  via?: PendingVia;
  prevLayer: PcbCopperLayerId;
  prevWidthMm: number;
  prevWidthSource: RouteWidthSource;
}

/**
 * RouteSession captures the state of an in-progress trace placement.
 *
 *  - `anchorNm`: the last committed vertex of the route (start = first pad/click).
 *  - `waypointsNm`: subsequent committed vertices (intermediate clicks). The
 *    cursor extends a *pending* segment from the last waypoint to the snapped
 *    cursor; that pending segment is committed on the next click.
 *  - `layer`: the active copper layer the segments are being routed on. Smart
 *    Via commits the in-progress trace, drops a via, then `rebase-layer`s the
 *    session to start a fresh segment on the opposite layer.
 *  - `posture`: corner-posture for elbows in the current session (`auto` infers
 *    from prior segment direction; `/` key cycles auto→axis→diagonal).
 *  - `viaDiameterMmOverride` / `viaDrillMmOverride`: optional route-time
 *    overrides; when undefined the via uses the active net class defaults.
 */
export interface RouteSession {
  anchorNm: PointNm;
  waypointsNm: PointNm[];
  layer: PcbCopperLayerId;
  segmentMode: PcbTraceSegmentMode;
  netId: string | null;
  netClassId: string;
  widthMm: number;
  widthSource: RouteWidthSource;
  posture: RoutePosture;
  /**
   * Accumulated boundaries (finished runs + vias) of the session, in order.
   * NOTHING is dispatched to the backend mid-session — the whole log commits
   * as one atomic `pcb_commit_route` on finish (one revision, one undo).
   */
  boundaries: RouteSessionBoundary[];
  viaDiameterMmOverride?: number;
  viaDrillMmOverride?: number;
  /**
   * `"placementId|padNumber"` of the pad the user clicked to start this
   * route, when the start anchor was on a pad. Used by the dynamic ratsnest
   * guide to exclude the source pad — the guide should always point at the
   * destination, never back at the pad we already came from.
   */
  startPadId?: string;
}

export type RouteToolState =
  | { kind: "idle" }
  | { kind: "routing"; session: RouteSession };

export type RouteToolEvent =
  | {
      kind: "start";
      anchorNm: PointNm;
      layer: PcbCopperLayerId;
      segmentMode: PcbTraceSegmentMode;
      netId: string | null;
      netClassId: string;
      widthMm: number;
      /** Defaults to `"netclass"` — the width came from the session's class. */
      widthSource?: RouteWidthSource;
      posture?: RoutePosture;
      /** Pad the route originated from (`"placementId|padNumber"`), if any. */
      startPadId?: string;
    }
  | { kind: "commit-waypoint"; pointNm: PointNm }
  /**
   * Ordered batch append — a walkaround detour's corner anchors followed by
   * the clicked waypoint land as ONE event so ghost === committed geometry.
   * Consecutive duplicates collapse exactly like single commits.
   */
  | { kind: "commit-waypoints"; pointsNm: PointNm[] }
  /**
   * Mid-route layer change: pushes the finished run (`runPointsNm`, built by
   * the caller through the corner-mode preview builder) and the dropped via
   * into the session's boundary log, then resets to a single anchor at
   * `anchorNm` (the via centre) on the new copper layer. Purely local — no
   * backend command until finish.
   */
  | {
      kind: "rebase-layer";
      anchorNm: PointNm;
      layer: PcbCopperLayerId;
      runPointsNm: PointNm[];
      via?: PendingVia;
    }
  | { kind: "set-mode"; mode: PcbTraceSegmentMode }
  | { kind: "set-width"; widthMm: number; source: RouteWidthSource }
  | { kind: "set-posture"; posture: RoutePosture }
  | { kind: "cycle-posture" }
  | {
      kind: "set-via-diameter";
      diameterMmOverride: number | undefined;
    }
  | {
      kind: "set-via-drill";
      drillMmOverride: number | undefined;
    }
  /**
   * Width split: pushes the finished run (`runPointsNm`, at the OLD width)
   * into the boundary log, then resets to a single anchor at `anchorNm` with
   * the new width. Purely local — no backend command until finish.
   */
  | {
      kind: "rebase";
      anchorNm: PointNm;
      widthMm: number;
      /** Absent = keep the session's current width source. */
      widthSource?: RouteWidthSource;
      runPointsNm: PointNm[];
    }
  | { kind: "step-back" }
  | { kind: "cancel" };

export const initialRouteToolState: RouteToolState = { kind: "idle" };

export function routeToolReducer(
  state: RouteToolState,
  event: RouteToolEvent,
): RouteToolState {
  switch (event.kind) {
    case "start":
      return {
        kind: "routing",
        session: {
          anchorNm: event.anchorNm,
          waypointsNm: [],
          layer: event.layer,
          segmentMode: event.segmentMode,
          netId: event.netId,
          netClassId: event.netClassId,
          widthMm: event.widthMm,
          widthSource: event.widthSource ?? "netclass",
          posture: event.posture ?? "auto",
          boundaries: [],
          ...(event.startPadId !== undefined
            ? { startPadId: event.startPadId }
            : {}),
        },
      };
    case "cancel":
      return { kind: "idle" };
    default:
      break;
  }
  if (state.kind !== "routing") return state;
  switch (event.kind) {
    case "commit-waypoint": {
      const last =
        state.session.waypointsNm[state.session.waypointsNm.length - 1] ??
        state.session.anchorNm;
      if (last.x === event.pointNm.x && last.y === event.pointNm.y) {
        return state;
      }
      return {
        kind: "routing",
        session: {
          ...state.session,
          waypointsNm: [...state.session.waypointsNm, event.pointNm],
        },
      };
    }
    case "commit-waypoints": {
      const waypoints = [...state.session.waypointsNm];
      for (const pointNm of event.pointsNm) {
        const last =
          waypoints[waypoints.length - 1] ?? state.session.anchorNm;
        if (last.x === pointNm.x && last.y === pointNm.y) continue;
        waypoints.push(pointNm);
      }
      if (waypoints.length === state.session.waypointsNm.length) return state;
      return {
        kind: "routing",
        session: { ...state.session, waypointsNm: waypoints },
      };
    }
    case "rebase-layer": {
      const s = state.session;
      const run: PendingTraceRun | undefined =
        event.runPointsNm.length >= 2
          ? {
              layer: s.layer,
              widthMm: s.widthMm,
              pointsNm: event.runPointsNm,
              segmentMode: s.segmentMode,
            }
          : undefined;
      const boundaries =
        run || event.via
          ? [
              ...s.boundaries,
              {
                ...(run ? { run } : {}),
                ...(event.via ? { via: event.via } : {}),
                prevLayer: s.layer,
                prevWidthMm: s.widthMm,
                prevWidthSource: s.widthSource,
              },
            ]
          : s.boundaries;
      return {
        kind: "routing",
        session: {
          ...s,
          anchorNm: event.anchorNm,
          waypointsNm: [],
          layer: event.layer,
          boundaries,
        },
      };
    }
    case "set-mode":
      return {
        kind: "routing",
        session: { ...state.session, segmentMode: event.mode },
      };
    case "set-width":
      return {
        kind: "routing",
        session: {
          ...state.session,
          widthMm: event.widthMm,
          widthSource: event.source,
        },
      };
    case "set-via-diameter":
      return {
        kind: "routing",
        session: {
          ...state.session,
          viaDiameterMmOverride: event.diameterMmOverride,
        },
      };
    case "set-via-drill":
      return {
        kind: "routing",
        session: {
          ...state.session,
          viaDrillMmOverride: event.drillMmOverride,
        },
      };
    case "set-posture":
      return {
        kind: "routing",
        session: { ...state.session, posture: event.posture },
      };
    case "cycle-posture":
      return {
        kind: "routing",
        session: {
          ...state.session,
          posture: nextPosture(state.session.posture),
        },
      };
    case "rebase": {
      const s = state.session;
      const run: PendingTraceRun | undefined =
        event.runPointsNm.length >= 2
          ? {
              layer: s.layer,
              widthMm: s.widthMm,
              pointsNm: event.runPointsNm,
              segmentMode: s.segmentMode,
            }
          : undefined;
      return {
        kind: "routing",
        session: {
          ...s,
          anchorNm: event.anchorNm,
          waypointsNm: [],
          widthMm: event.widthMm,
          widthSource: event.widthSource ?? s.widthSource,
          boundaries: run
            ? [
                ...s.boundaries,
                {
                  run,
                  prevLayer: s.layer,
                  prevWidthMm: s.widthMm,
                  prevWidthSource: s.widthSource,
                },
              ]
            : s.boundaries,
        },
      };
    }
    case "step-back": {
      const s = state.session;
      if (s.waypointsNm.length > 0) {
        return {
          kind: "routing",
          session: { ...s, waypointsNm: s.waypointsNm.slice(0, -1) },
        };
      }
      // Active run is empty — pop the last boundary and reopen it. One
      // Backspace undoes a via drop (and reopens the run before it) or a
      // width split. The run's path vertices become anchor+waypoints again.
      const last = s.boundaries[s.boundaries.length - 1];
      if (!last) return { kind: "idle" };
      const remaining = s.boundaries.slice(0, -1);
      if (last.run) {
        return {
          kind: "routing",
          session: {
            ...s,
            anchorNm: last.run.pointsNm[0]!,
            waypointsNm: last.run.pointsNm.slice(1),
            layer: last.prevLayer,
            widthMm: last.prevWidthMm,
            widthSource: last.prevWidthSource,
            boundaries: remaining,
          },
        };
      }
      // Via-only boundary (via dropped with no segments): keep the anchor
      // (it IS the via centre), just restore the pre-via layer/width.
      return {
        kind: "routing",
        session: {
          ...s,
          layer: last.prevLayer,
          widthMm: last.prevWidthMm,
          widthSource: last.prevWidthSource,
          boundaries: remaining,
        },
      };
    }
    default:
      return state;
  }
}

/** All committed anchors (anchor + waypoints) of the current session. */
export function sessionAnchors(session: RouteSession): PointNm[] {
  return [session.anchorNm, ...session.waypointsNm];
}
