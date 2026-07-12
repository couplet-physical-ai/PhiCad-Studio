import { pointToPolylineDistance } from "../../../../../shared/pcb-geometry/pcb-trace-geometry";
import type { PointNm } from "./route-tool-state";

/**
 * Pure state machine for the modal length-Tune tool (pcb.lengthTuning),
 * mirroring route-tool-state.ts: events carry data, geometry generation
 * happens outside (PcbCanvas memo → shared/pcb-routing/meander.ts).
 *
 * Flow: click a routed trace → tuning with a cursor-following span
 * (`sweeping`) → second click freezes the span → +/- and ,/. nudge
 * amplitude/spacing → Enter commits via pcb_update_trace_geometry →
 * Esc cancels. Stateless v1: the baseline lives only in this session;
 * re-tuning an already-meandered trace treats its current geometry as the
 * new baseline (undo is the recovery path).
 */
export interface TuneSession {
  traceId: string;
  /** Trace geometry at session start (integer nm). */
  baselinePointsNm: PointNm[];
  /** Tuned span as distances along the baseline (nm). */
  spanStartNm: number;
  spanEndNm: number;
  /** Span end follows the cursor until frozen by a second click. */
  sweeping: boolean;
  amplitudeNm: number;
  spacingNm: number;
  /** In-tool typed target (mm) — wins over any group rule. */
  targetOverrideMm?: number;
}

export type TuneToolState =
  | { kind: "idle" }
  | { kind: "tuning"; session: TuneSession };

export type TuneToolEvent =
  | {
      kind: "start";
      traceId: string;
      baselinePointsNm: PointNm[];
      spanStartNm: number;
      amplitudeNm?: number;
      spacingNm?: number;
    }
  /** Cursor projected onto the baseline; only applies while sweeping. */
  | { kind: "sweep"; spanEndNm: number }
  | { kind: "freeze-span" }
  | { kind: "nudge-amplitude"; direction: 1 | -1 }
  | { kind: "nudge-spacing"; direction: 1 | -1 }
  | { kind: "set-target-override"; targetMm: number | undefined }
  | { kind: "cancel" };

export const initialTuneToolState: TuneToolState = { kind: "idle" };

/**
 * Arc-length position (nm) of the point on `polyline` closest to `pointNm` —
 * how pointer sweeps map onto the tuned span.
 */
export function distanceAlongPolylineNm(
  polyline: readonly PointNm[],
  pointNm: PointNm,
): number {
  if (polyline.length < 2) return 0;
  const hit = pointToPolylineDistance(pointNm, [...polyline]);
  let along = 0;
  for (let i = 1; i <= hit.segmentIndex; i += 1) {
    const a = polyline[i - 1]!;
    const b = polyline[i]!;
    along += Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
  }
  const segStart = polyline[hit.segmentIndex]!;
  along += Math.sqrt(
    (hit.closest.x - segStart.x) ** 2 + (hit.closest.y - segStart.y) ** 2,
  );
  return along;
}

export const TUNE_DEFAULT_AMPLITUDE_NM = 2_000_000;
export const TUNE_DEFAULT_SPACING_NM = 1_000_000;
const AMPLITUDE_MIN_NM = 200_000;
const AMPLITUDE_MAX_NM = 20_000_000;
const SPACING_MIN_NM = 200_000;
const SPACING_MAX_NM = 10_000_000;
/** Multiplicative nudge step for +/- and ,/. keys. */
const NUDGE_FACTOR = 1.25;

function nudge(
  value: number,
  direction: 1 | -1,
  min: number,
  max: number,
): number {
  const next = Math.round(
    direction === 1 ? value * NUDGE_FACTOR : value / NUDGE_FACTOR,
  );
  return Math.max(min, Math.min(max, next));
}

export function tuneToolReducer(
  state: TuneToolState,
  event: TuneToolEvent,
): TuneToolState {
  switch (event.kind) {
    case "start":
      return {
        kind: "tuning",
        session: {
          traceId: event.traceId,
          baselinePointsNm: event.baselinePointsNm,
          spanStartNm: event.spanStartNm,
          spanEndNm: event.spanStartNm,
          sweeping: true,
          amplitudeNm: event.amplitudeNm ?? TUNE_DEFAULT_AMPLITUDE_NM,
          spacingNm: event.spacingNm ?? TUNE_DEFAULT_SPACING_NM,
        },
      };
    case "cancel":
      return { kind: "idle" };
    default:
      break;
  }
  if (state.kind !== "tuning") return state;
  const s = state.session;
  switch (event.kind) {
    case "sweep":
      if (!s.sweeping || event.spanEndNm === s.spanEndNm) return state;
      return { kind: "tuning", session: { ...s, spanEndNm: event.spanEndNm } };
    case "freeze-span":
      if (!s.sweeping) return state;
      return { kind: "tuning", session: { ...s, sweeping: false } };
    case "nudge-amplitude":
      return {
        kind: "tuning",
        session: {
          ...s,
          amplitudeNm: nudge(
            s.amplitudeNm,
            event.direction,
            AMPLITUDE_MIN_NM,
            AMPLITUDE_MAX_NM,
          ),
        },
      };
    case "nudge-spacing":
      return {
        kind: "tuning",
        session: {
          ...s,
          spacingNm: nudge(
            s.spacingNm,
            event.direction,
            SPACING_MIN_NM,
            SPACING_MAX_NM,
          ),
        },
      };
    case "set-target-override": {
      if (event.targetMm === undefined) {
        const { targetOverrideMm: _drop, ...rest } = s;
        return { kind: "tuning", session: rest };
      }
      if (!(event.targetMm > 0)) return state;
      return {
        kind: "tuning",
        session: { ...s, targetOverrideMm: event.targetMm },
      };
    }
    default:
      return state;
  }
}
