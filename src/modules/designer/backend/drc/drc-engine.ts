import type {
  DesignerPcbProjection,
  DrcReport,
  DrcRuleCode,
  DrcSeverity,
  DrcViolation,
} from "../../../../sdks/designer";
import { checkBoard } from "./checks/board";
import { checkClearance } from "./checks/clearance";
import { checkConnectivity } from "./checks/connectivity";
import { checkConstraints } from "./checks/constraints";
import { checkCopperPour } from "./checks/copper-pour";
import { checkDangling } from "./checks/dangling";
import { checkElectrical } from "./checks/electrical";
import { checkSignalIntegrity } from "./checks/signal-integrity";
import { checkLength } from "./checks/length";
import { checkManufacturability } from "./checks/manufacturability";
import { checkNetClass } from "./checks/netclass";
import { checkOutline } from "./checks/outline";
import { checkStructural } from "./checks/structural";
import { buildDrcContext } from "./drc-context";
import type { DrcOptions } from "./types";
import { DEFAULT_SEVERITY_BY_CODE, resolveSeverity } from "./severity";
import { computeViolationId } from "./violation-id";

/**
 * DRC engine — pure function over the PCB projection, mirroring `runErc`.
 * Builds an mm-domain context, runs every check group, then assigns stable
 * ids, applies ignore/waive options, and tallies the summary.
 */
export function runDrc(
  projection: DesignerPcbProjection,
  options: DrcOptions = {},
): DrcReport {
  const ctx = buildDrcContext(projection);
  const ignored = new Set(options.ignoredRuleClasses ?? []);
  const waived = new Set(options.waivedIds ?? []);
  const overrides = options.severityOverrides;

  const drafts = [
    ...checkOutline(ctx),
    ...checkConstraints(ctx),
    ...checkStructural(ctx),
    ...checkManufacturability(ctx),
    ...checkNetClass(ctx),
    ...checkClearance(ctx),
    ...checkConnectivity(ctx),
    ...checkCopperPour(ctx),
    ...checkDangling(ctx),
    ...checkElectrical(ctx),
    ...checkSignalIntegrity(ctx),
    ...checkLength(ctx),
    ...checkBoard(ctx),
  ];

  const violations: DrcViolation[] = [];
  const countsByCode: Partial<Record<DrcRuleCode, number>> = {};
  let errors = 0;
  let warnings = 0;
  let infos = 0;

  for (const draft of drafts) {
    // Safety-critical codes (dead shorts, layer-invalid items) can never be
    // suppressed — not by a class-level ignore, a per-code "ignore" override,
    // or a waiver. `waivable: false` marks exactly that set.
    const safetyCritical = draft.waivable === false;
    if (!safetyCritical && ignored.has(draft.ruleClass)) continue;
    // Per-code severity: override → draft (rule) severity → default table.
    // "ignore" drops the violation entirely (except safety-critical codes).
    const resolvedSeverity = resolveSeverity(draft.code, draft.severity, overrides);
    if (resolvedSeverity === "ignore" && !safetyCritical) continue;
    // Safety-critical codes are NON_OVERRIDABLE, so resolveSeverity always
    // returns their default (never "ignore"); this coercion is defensive.
    const severity: DrcSeverity =
      resolvedSeverity === "ignore"
        ? DEFAULT_SEVERITY_BY_CODE[draft.code]
        : resolvedSeverity;

    const { waivable, ...rest } = draft;
    const id = computeViolationId({
      code: draft.code,
      anchors: draft.anchors,
      layer: draft.layer,
      locationMm: draft.locationMm,
    });
    // `waivable: false` drafts (dead shorts, layer-invalid items) can never be
    // suppressed by a user waiver — audit B5-VIA-MASK / NET_SHORT_CIRCUIT.
    const isWaived = waivable !== false && waived.has(id);
    const resolved = { ...rest, severity, id };
    violations.push(isWaived ? { ...resolved, waived: true } : resolved);
    countsByCode[draft.code] = (countsByCode[draft.code] ?? 0) + 1;
    if (!isWaived) {
      if (severity === "error") errors += 1;
      else if (severity === "warning") warnings += 1;
      else infos += 1;
    }
  }

  return {
    designId: projection.designId,
    revision: projection.revision,
    violations,
    summary: { errors, warnings, infos },
    countsByCode,
  };
}
