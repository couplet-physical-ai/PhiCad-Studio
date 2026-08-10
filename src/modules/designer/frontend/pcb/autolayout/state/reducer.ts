// Pure reducer for the Auto Layout run. No fetching, no timers — the hook owns those, so
// every transition here is testable without a network.

import type { LayoutResultEnvelope } from "../../../../../../sdks/designer/cloud-autolayout";
import {
  EMPTY_PROGRESS,
  type AutoLayoutAction,
  type AutoLayoutRunState,
  type CandidateProgress,
  type LayoutProgressState,
} from "./types";

export const INITIAL_STATE: AutoLayoutRunState = { type: "idle" };

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Fold one SSE frame into progress.
 *
 * Unknown frame types are IGNORED rather than treated as errors: the service can add frames
 * without a desktop release (portfolio-variant frames already exist in the engine ahead of
 * the contract), and a progress tick must never be able to fail a run.
 *
 * Progress is deterministic work (`workConsumed/workTotal`), never wall-clock: the engine
 * reports work, and converting that into a time estimate would be a promise the service
 * never made.
 */
export function foldProgressFrame(
  progress: LayoutProgressState,
  frame: Record<string, unknown>,
): LayoutProgressState {
  const type = typeof frame.type === "string" ? frame.type : null;
  const data = (frame.data ?? {}) as Record<string, unknown>;
  const next: LayoutProgressState = { ...progress, lastFrame: type ?? progress.lastFrame };

  const candidateId =
    typeof data.candidateId === "string" ? data.candidateId : null;
  const index = asNumber(data.index) ?? asNumber(data.candidateIndex);
  const total = asNumber(data.candidates) ?? asNumber(data.k) ?? asNumber(data.total);
  if (total !== null) next.candidatesTotal = total;

  const upsert = (patch: Partial<CandidateProgress>): CandidateProgress[] => {
    if (!candidateId) return next.candidates;
    const existing = next.candidates.find((c) => c.candidateId === candidateId);
    const merged: CandidateProgress = {
      candidateId,
      index: existing?.index ?? index ?? next.candidates.length,
      stage: existing?.stage ?? null,
      finished: existing?.finished ?? false,
      ...patch,
    };
    return existing
      ? next.candidates.map((c) => (c.candidateId === candidateId ? merged : c))
      : [...next.candidates, merged];
  };

  switch (type) {
    case "layout.candidate.started":
      next.candidates = upsert({ stage: "starting", finished: false });
      break;
    case "layout.candidate.stage":
      next.candidates = upsert({
        stage: typeof data.stage === "string" ? data.stage : null,
      });
      break;
    case "layout.candidate.finished":
      next.candidates = upsert({ stage: "done", finished: true });
      next.candidatesFinished = next.candidates.filter((c) => c.finished).length;
      break;
    case "layout.progress": {
      const consumed = asNumber(data.workConsumed);
      const workTotal = asNumber(data.workTotal);
      if (consumed !== null && workTotal !== null && workTotal > 0) {
        next.fraction = Math.min(1, Math.max(0, consumed / workTotal));
      }
      break;
    }
    default:
      break;
  }
  return next;
}

export function autoLayoutReducer(
  state: AutoLayoutRunState,
  action: AutoLayoutAction,
): AutoLayoutRunState {
  switch (action.type) {
    case "submit":
      return { type: "submitting" };

    case "submitted":
      return {
        type: "running",
        run: action.run,
        progress: EMPTY_PROGRESS,
        cancelling: false,
      };

    case "progress":
      if (state.type !== "running") return state;
      return {
        ...state,
        progress: foldProgressFrame(state.progress, action.frame),
      };

    case "polling":
      if (state.type !== "running") return state;
      return { ...state, progress: { ...state.progress, polling: true } };

    case "result": {
      // A result can arrive while cancelling (a cancelled job may still carry a partial
      // envelope) — review it, the candidates carry their own applicability.
      const run =
        state.type === "running" || state.type === "review" ? state.run : null;
      if (!run) return state;
      return {
        type: "review",
        run,
        result: action.result,
        // The service ranks; rank 0 is the recommendation and it is SELECTED, never
        // auto-applied.
        selectedCandidateId: defaultCandidateId(action.result),
        stale: false,
      };
    }

    case "selectCandidate":
      if (state.type !== "review") return state;
      return { ...state, selectedCandidateId: action.candidateId };

    case "markStale":
      if (state.type !== "review") return state;
      return { ...state, stale: true };

    case "applyStarted":
      if (state.type !== "review" || !state.selectedCandidateId) return state;
      return {
        type: "applying",
        run: state.run,
        result: state.result,
        selectedCandidateId: state.selectedCandidateId,
      };

    case "applied":
      if (state.type !== "applying") return state;
      return {
        type: "completed",
        run: state.run,
        candidateId: action.candidateId,
        revision: action.revision,
        drcErrors: action.drcErrors,
        drcWarnings: action.drcWarnings,
        warnings: action.warnings,
      };

    case "cancelRequested":
      if (state.type !== "running") return state;
      return { ...state, cancelling: true };

    case "cancelled":
      if (state.type !== "running") return state;
      return { type: "cancelled", run: state.run };

    case "failed": {
      // An apply failure must fall BACK to review, not to a dead end: the result is still
      // valid and the user may pick another candidate (or rerun after a stale warning).
      if (state.type === "applying") {
        return {
          type: "review",
          run: state.run,
          result: state.result,
          selectedCandidateId: state.selectedCandidateId,
          stale: action.error.code === "AUTO_LAYOUT_STALE",
        };
      }
      const run =
        state.type === "running" || state.type === "review" ? state.run : null;
      return { type: "failed", error: action.error, run };
    }

    case "reset":
      return INITIAL_STATE;

    default:
      return state;
  }
}

export function defaultCandidateId(result: LayoutResultEnvelope): string | null {
  if (result.recommendedCandidateId) return result.recommendedCandidateId;
  const applicable = result.candidates.find((c) => !c.failure);
  return applicable?.candidateId ?? result.candidates[0]?.candidateId ?? null;
}
