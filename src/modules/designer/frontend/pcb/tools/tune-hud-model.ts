import type { TuneSession } from "./tune-tool-state";
import type { MeanderResult } from "../../../../../shared/pcb-routing/meander";

const NM_PER_MM = 1_000_000;

export type TuneMeanderStatus = MeanderResult["status"];

/**
 * Pure view-model for the Tune HUD: which target applies (typed override >
 * group rule > none), the live net total with the proposed serpentine, and
 * the tolerance band verdict.
 */
export interface TuneHudModel {
  netName: string | null;
  targetSource: "override" | "group" | "none";
  groupName: string | null;
  targetMm: number | null;
  toleranceMm: number | null;
  /** Net total with the proposal applied (mm). */
  currentMm: number;
  /** current − target; null without a target. */
  deltaMm: number | null;
  band: "short" | "ok" | "long" | null;
  amplitudeMm: number;
  spacingMm: number;
  /** Generator verdict for the current parameters (null = no proposal). */
  meanderStatus: TuneMeanderStatus | null;
  /** Enter commits only when a proposal actually adds length. */
  canApply: boolean;
}

/** Tolerance applied to a typed override when no group rule supplies one. */
export const TUNE_OVERRIDE_TOLERANCE_MM = 0.5;

export function buildTuneHudModel(input: {
  session: TuneSession;
  netName: string | null;
  /** Matching length-match rule for the trace's net, if any. */
  group: { name: string; targetMm: number; toleranceMm: number } | null;
  /** Net copper committed OUTSIDE the tuned trace (mm). */
  netOtherMm: number;
  /** Baseline length of the tuned trace (mm). */
  baselineMm: number;
  /** Extra length the current proposal adds (mm, 0 without a proposal). */
  proposalExtraMm: number;
  meanderStatus: TuneMeanderStatus | null;
}): TuneHudModel {
  const s = input.session;
  const targetSource =
    s.targetOverrideMm !== undefined
      ? "override"
      : input.group
        ? "group"
        : "none";
  const targetMm =
    s.targetOverrideMm !== undefined
      ? s.targetOverrideMm
      : (input.group?.targetMm ?? null);
  const toleranceMm =
    targetMm === null
      ? null
      : (input.group?.toleranceMm ?? TUNE_OVERRIDE_TOLERANCE_MM);
  const currentMm = input.netOtherMm + input.baselineMm + input.proposalExtraMm;
  const deltaMm = targetMm === null ? null : currentMm - targetMm;
  const band =
    deltaMm === null || toleranceMm === null
      ? null
      : deltaMm < -toleranceMm
        ? "short"
        : deltaMm > toleranceMm
          ? "long"
          : "ok";
  return {
    netName: input.netName,
    targetSource,
    groupName: input.group?.name ?? null,
    targetMm,
    toleranceMm,
    currentMm,
    deltaMm,
    band,
    amplitudeMm: s.amplitudeNm / NM_PER_MM,
    spacingMm: s.spacingNm / NM_PER_MM,
    meanderStatus: input.meanderStatus,
    canApply: input.proposalExtraMm > 0,
  };
}
