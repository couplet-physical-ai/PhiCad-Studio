/**
 * Scoped priority clearance resolver (DRC_HARDENING_PLAN.md P6). Compiled once
 * per DRC context; answers per-pair clearance queries cheaply inside the O(n²)
 * clearance loops.
 *
 * Resolution (Altium-style with a KiCad floor):
 *   1. Explicit tier — enabled clearance rules, priority-desc then array order;
 *      the FIRST whose scopes all match wins and CAN relax below the implicit
 *      tier.
 *   2. Implicit tier — max(boardRule[pairKind], netClass(a), netClass(b)).
 *      Byte-identical to the pre-P6 `max(...)` when no explicit rules exist.
 *   3. Absolute floor — max(result, minimums.clearanceMm ?? 0).
 */
import type {
  DrcPairKind,
  DrcRuleScope,
  PcbBoardSettings,
  PcbCopperLayerId,
  PcbDrcRule,
  PcbPointMm,
} from "../../sdks/designer";
import { pointInPolygon } from "../pcb-geometry/pcb-clearance-geometry";

/** Reference to one side of a clearance pair. */
export interface ClearanceItemRef {
  netId: string | null;
  netClassId: string;
  /** Bitmask of area-scoped rules this item falls inside (≤ 32 areas). */
  areaMask: number;
}

interface CompiledClearanceRule {
  valueMm: number;
  netIdSet: ReadonlySet<string> | null;
  netClassIdSet: ReadonlySet<string> | null;
  layerSet: ReadonlySet<PcbCopperLayerId> | null;
  pairKindSet: ReadonlySet<DrcPairKind> | null;
  areaBit: number; // 0 = no area scope
}

export interface CompiledRuleSet {
  clearanceRules: CompiledClearanceRule[];
  areaPolygons: PcbPointMm[][];
  hasAreaRules: boolean;
  floorMm: number;
  boardClearanceByPairKind: Record<DrcPairKind, number>;
}

export function compileRuleSet(board: PcbBoardSettings): CompiledRuleSet {
  const clr = board.designRules.clearance;
  const boardClearanceByPairKind = {
    traceToTrace: clr.traceToTraceMm,
    traceToPad: clr.traceToPadMm,
    traceToVia: clr.traceToViaMm,
    padToPad: clr.padToPadMm,
    padToVia: clr.traceToViaMm,
    viaToVia: clr.viaToViaMm,
  } satisfies Record<DrcPairKind, number>;

  const areaPolygons: PcbPointMm[][] = [];
  const clearanceRules: CompiledClearanceRule[] = [];

  const enabled = (board.drcRules ?? [])
    .filter((r) => r.enabled && r.constraint.kind === "clearance")
    .map((r, index) => ({ r, index }))
    // priority desc, ties by earlier array index
    .sort((x, y) => y.r.priority - x.r.priority || x.index - y.index);

  for (const { r } of enabled) {
    if (r.constraint.kind !== "clearance") continue;
    let areaBit = 0;
    let areaOverflow = false;
    let netIdSet: Set<string> | null = null;
    let netClassIdSet: Set<string> | null = null;
    let layerSet: Set<PcbCopperLayerId> | null = null;
    let pairKindSet: Set<DrcPairKind> | null = null;
    // Repeated scopes of the same kind UNION (a rule scoped to net A and net B
    // targets "either item on A or B"); they never silently overwrite.
    const union = <T>(cur: Set<T> | null, add: Set<T>): Set<T> => {
      if (!cur) return add;
      for (const v of add) cur.add(v);
      return cur;
    };
    for (const scope of r.scopes) {
      applyScope(scope, {
        setNet: (v) => (netIdSet = union(netIdSet, v)),
        setNetClass: (v) => (netClassIdSet = union(netClassIdSet, v)),
        setLayer: (v) => (layerSet = union(layerSet, v)),
        setPairKind: (v) => (pairKindSet = union(pairKindSet, v)),
        addArea: (poly) => {
          if (areaPolygons.length < 32) {
            areaPolygons.push(poly);
            // Multiple area scopes on one rule can't be represented by a single
            // bit; keep the FIRST (a second is dropped rather than aliasing).
            if (areaBit === 0) areaBit = 1 << (areaPolygons.length - 1);
          } else {
            areaOverflow = true;
          }
        },
      });
    }
    // An area scope that couldn't be registered (>32 areas) must NOT collapse
    // to a global rule — drop the rule entirely.
    if (areaOverflow) continue;
    clearanceRules.push({
      valueMm: r.constraint.mm,
      netIdSet,
      netClassIdSet,
      layerSet,
      pairKindSet,
      areaBit,
    });
  }

  return {
    clearanceRules,
    areaPolygons,
    hasAreaRules: areaPolygons.length > 0,
    floorMm: board.designRules.minimums.clearanceMm ?? 0,
    boardClearanceByPairKind,
  };
}

function applyScope(
  scope: DrcRuleScope,
  h: {
    setNet: (v: Set<string>) => void;
    setNetClass: (v: Set<string>) => void;
    setLayer: (v: Set<PcbCopperLayerId>) => void;
    setPairKind: (v: Set<DrcPairKind>) => void;
    addArea: (poly: PcbPointMm[]) => void;
  },
): void {
  switch (scope.kind) {
    case "net":
      h.setNet(new Set(scope.netIds));
      break;
    case "netClass":
      h.setNetClass(new Set(scope.netClassIds));
      break;
    case "layer":
      h.setLayer(new Set(scope.layers));
      break;
    case "pairKind":
      h.setPairKind(new Set(scope.pairKinds));
      break;
    case "area":
      h.addArea(scope.polygonMm);
      break;
  }
}

/** Area bitmask for a point against a compiled rule set's area polygons. */
export function areaMaskForPoint(
  set: CompiledRuleSet,
  p: PcbPointMm,
): number {
  if (!set.hasAreaRules) return 0;
  let mask = 0;
  for (let i = 0; i < set.areaPolygons.length; i += 1) {
    if (pointInPolygon(p, set.areaPolygons[i]!)) mask |= 1 << i;
  }
  return mask;
}

/** Result of a clearance query: effective value + which rule (if any) set it. */
export interface ResolvedClearance {
  mm: number;
  ruleIndex: number | null;
}

/**
 * Resolve the effective clearance for a pair. `implicitMax` is the pre-P6
 * `max(boardRule, classA, classB)` value — passed in so the caller keeps its
 * existing (already-memoized) net-class lookups and the implicit tier stays
 * byte-identical when no rules match.
 */
export function resolveClearance(
  set: CompiledRuleSet,
  pairKind: DrcPairKind,
  layer: PcbCopperLayerId,
  a: ClearanceItemRef,
  b: ClearanceItemRef,
  implicitMax: number,
): ResolvedClearance {
  let value = implicitMax;
  let ruleIndex: number | null = null;
  for (let i = 0; i < set.clearanceRules.length; i += 1) {
    const rule = set.clearanceRules[i]!;
    if (rule.pairKindSet && !rule.pairKindSet.has(pairKind)) continue;
    if (rule.layerSet && !rule.layerSet.has(layer)) continue;
    // net / netClass: either item may satisfy.
    if (
      rule.netIdSet &&
      !(
        (a.netId !== null && rule.netIdSet.has(a.netId)) ||
        (b.netId !== null && rule.netIdSet.has(b.netId))
      )
    ) {
      continue;
    }
    if (
      rule.netClassIdSet &&
      !(rule.netClassIdSet.has(a.netClassId) || rule.netClassIdSet.has(b.netClassId))
    ) {
      continue;
    }
    // area: BOTH items must be inside (BGA-fanout relaxation).
    if (rule.areaBit && !(a.areaMask & rule.areaBit && b.areaMask & rule.areaBit)) {
      continue;
    }
    value = rule.valueMm; // first match wins (can relax)
    ruleIndex = i;
    break;
  }
  // Absolute floor.
  return { mm: Math.max(value, set.floorMm), ruleIndex };
}
