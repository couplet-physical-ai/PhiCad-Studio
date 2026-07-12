import type { DrcRuleClass, DrcViolation } from "../../../../sdks/designer";
import type { DrcSeverityOverrides } from "./severity";

/**
 * A violation before the engine assigns its stable id / waived flag. Checks
 * may set `waivable: false` on drafts that must never be suppressed by a
 * user waiver (dead shorts, layer-invalid items) — audit B5-VIA-MASK.
 */
export type DrcViolationDraft = Omit<DrcViolation, "id" | "waived"> & {
  waivable?: false;
};

/** Per-run engine options, sourced by the route from `board.viewState`. */
export interface DrcOptions {
  /** Rule-classes the user ignores wholesale — not emitted at all. */
  ignoredRuleClasses?: DrcRuleClass[];
  /** Stable ids of waived violations — emitted with `waived:true`, excluded from summary. */
  waivedIds?: string[];
  /** Per-code severity overrides (from board settings). `"ignore"` drops the code. */
  severityOverrides?: DrcSeverityOverrides;
}
