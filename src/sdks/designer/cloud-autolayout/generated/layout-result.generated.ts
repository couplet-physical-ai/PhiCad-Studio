// GENERATED FILE — DO NOT EDIT.
//
// Source: src/sdks/designer/contracts/LayoutResultEnvelope.schema.json (vendored from cloud-auto-layout's
// `contracts/LayoutResultEnvelope.schema.json` — see that dir's README.md for provenance + sync instructions).
//
// Regenerate with `npm run gen:contracts` after re-vendoring the schema.
// `npm run gen:contracts -- --check` fails CI on drift.

export interface AiSourceRef {
  id: string;
  kind: string;
  label: string;
  refId?: string | null;
  path?: string | null;
  excerpt?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface Completion {
  routedNets: number;
  totalNets: number;
  percent: number;
}

export interface DesignerPcbAddTraceCommand {
  type: "pcb_add_trace";
  layer: "F.Cu" | "In1.Cu" | "In2.Cu" | "In3.Cu" | "In4.Cu" | "In5.Cu" | "In6.Cu" | "In7.Cu" | "In8.Cu" | "In9.Cu" | "In10.Cu" | "In11.Cu" | "In12.Cu" | "In13.Cu" | "In14.Cu" | "In15.Cu" | "In16.Cu" | "In17.Cu" | "In18.Cu" | "In19.Cu" | "In20.Cu" | "In21.Cu" | "In22.Cu" | "In23.Cu" | "In24.Cu" | "In25.Cu" | "In26.Cu" | "In27.Cu" | "In28.Cu" | "In29.Cu" | "In30.Cu" | "B.Cu";
  pointsNm: PointNm[];
  widthMm: number;
  netId: string | null;
  netClassId: string;
  segmentMode: "manhattan-90" | "manhattan-45";
}

/**
 * Atomic trace+via for a layer change (keeps the pair dependency-closed).
 */
export interface DesignerPcbAddTraceViaCommand {
  type: "pcb_add_trace_via";
  trace: _AddTraceBody;
  via: _AddViaBody;
}

export interface DesignerPcbAddViaCommand {
  type: "pcb_add_via";
  centerMm: PointMm;
  netId: string | null;
  netClassId: string;
  diameterMmOverride?: number | null;
  drillMmOverride?: number | null;
}

export interface DesignerPcbFlipPlacementCommand {
  type: "pcb_flip_placement";
  placementId: string;
}

export interface DesignerPcbMovePlacementCommand {
  type: "pcb_move_placement";
  placementId: string;
  positionMm: PointMm;
}

export interface DesignerPcbRotatePlacementCommand {
  type: "pcb_rotate_placement";
  placementId: string;
  rotationDeg: 0 | 90 | 180 | 270;
}

export interface Determinism {
  seed: number;
  snapshotHash: string;
  engineVersion: string;
  budget?: Record<string, number> | null;
}

export interface LayoutCandidate {
  candidateId: string;
  kind: string;
  rank: number;
  recommended: boolean;
  scorecard: LayoutScorecard;
  explanation: string;
  tags: string[];
  placeEnvelope?: PlacementResultEnvelope | null;
  routeEnvelope?: RouteResultEnvelope | null;
  warnings: string[];
  failure?: LayoutCandidateFailure | null;
}

export interface LayoutCandidateFailure {
  code: string;
  stage: string;
  sourceReason?: string | null;
  detail?: string | null;
}

export interface LayoutManifest {
  candidateSpecs: Record<string, unknown>[];
  seeds: Record<string, number>;
  W: number;
  budgetMode: string;
  engineVersions: Record<string, string>;
  objectiveVersion: string;
  placementDigests: Record<string, string>;
}

export interface LayoutScorecard {
  objectiveKey: (number | number | string)[];
  completionRatio?: number | null;
  unroutedNetsIndependent?: number | null;
  unconnectedTerminals?: number | null;
  addedIllegality?: number | null;
  routedLengthNm?: number | null;
  viaCount?: number | null;
  bendCount?: number | null;
  layerTransitions?: number | null;
  rmstAfterMm?: number | null;
  hpwlAfterMm?: number | null;
  work?: number | null;
  placementDigest?: string | null;
}

export interface Metrics {
  totalLengthNm: number;
  viaCount: number;
  layerTransitions: number;
  traceCount: number;
  ripupPasses: number;
  bendCount: number;
  totalLengthA: number;
  totalLengthB: number;
}

/**
 * [W1] Search-box widening probe, present ONLY on offline bench runs with the probe enabled
 * (``ROUTE_BOUNDS_PROBE``). Diagnostic: it never influenced the emitted route.
 * 
 * ``minLevel`` = smallest widening level at which a natively-exhausted leg found a path (1-based;
 * the board-outline domain is the last level), -1 if none did. ``legsBudgetBound`` legs ran out
 * of PROBE budget at a wider box — the box is implicated, but recoverability is unresolved, so
 * they must never be counted as recoveries. ``legsProbed`` counts LEGS; ``levelSearches`` counts
 * the widening searches those legs cost.
 */
export interface NetProbeStats {
  legsProbed: number;
  levelSearches: number;
  legsRecovered: number;
  legsBudgetBound: number;
  minLevel: number;
  expansions: number;
}

/**
 * [M-ML] Per-net features (first attempt) + labels (emit-best) — first-class ML training
 * data riding the payload (not the envelope id). Integers only (no 2^53 JSON overflow:
 * bbox is W/H, not area). The existing 2-proc determinism suite gates these because they ride
 * the envelope — do NOT move them out of it.
 */
export interface NetRouteStats {
  netId: string;
  pinCount: number;
  bboxWNm: number;
  bboxHNm: number;
  bboxOverlapCount: number;
  congestionInBbox: number;
  attemptOrder: number;
  blockedEscapes: number;
  routed: boolean;
  lengthA: number;
  lengthB: number;
  viaCount: number;
  bendCount: number;
  ripCount: number;
  passFirstRouted: number;
  expansionsSpent: number;
  failureReason?: string | null;
  boundaryBlockedNodes: number;
  rejectedFixed: number;
  rejectedRouter: number;
  firstContactExpansion: number;
  topBlockers: TopBlocker[];
  probe?: NetProbeStats | null;
}

/**
 * [DP1] Per differential-pair length + skew REPORT. Present only when the compiled pair
 * registry is non-empty (an explicit ``constraintGroups[kind=diff_pair]`` declaration, or
 * ``options.inferDiffPairs``); the whole list is OMITTED from the serialized envelope
 * otherwise — see ``RoutePayloadSummary``.
 * 
 * Reporting only: no routing decision reads these numbers. Lengths are exact integer nm (axis
 * total + ``isqrt(2·D²)``, ``app/router/pairs.py::net_length_nm``); ``routedP``/``routedN`` say
 * whether that side COMPLETED (all terminals connected), so a 0 length with ``routed*`` false is
 * "not routed", not "zero-length".
 * 
 * [DP2] ``coupled`` says whether the two members were routed TOGETHER as one fat centerline
 * expanded into an offset pair holding the declared gap (``app/router/pair_route.py``), or
 * independently. It is a plain ``bool`` defaulting to False, NOT an ``Optional`` three-state:
 * ``false`` has to mean the same thing for "``diffPairs`` was never armed" and "coupling was
 * attempted and fell back", because the never-worse gate requires an infeasible pair's envelope
 * to be BYTE-IDENTICAL to the same board routed with ``diffPairs`` absent — a ``null`` vs
 * ``false`` split would break exactly that comparison. ``skewNm`` remains a measurement, not a
 * tolerance the router honoured: DP2 couples the gap, not the length.
 */
export interface PairRouteStats {
  pairId: string;
  tier: string;
  netIdP: string;
  netIdN: string;
  lengthPNm: number;
  lengthNNm: number;
  skewNm: number;
  routedP: boolean;
  routedN: boolean;
  coupled: boolean;
}

export interface PlaceMetrics {
  ratsnestLengthBeforeMm: number;
  ratsnestLengthAfterMm: number;
  ratsnestImprovementPct: number;
  hpwlBeforeMm: number;
  hpwlAfterMm: number;
  crossingsBefore: number;
  crossingsAfter: number;
  congestionBefore: number;
  congestionAfter: number;
  overlapPairsAfter: number;
  overlapAreaAfterMm2: number;
  edgeViolations: number;
  diffPairSkewBeforeMm: number;
  diffPairSkewAfterMm: number;
}

export interface PlaceOperation {
  id: string;
  kind: "pcb_move_placement" | "pcb_rotate_placement" | "pcb_flip_placement";
  title: string;
  summary: string;
  riskLevel: "low" | "medium" | "high" | "destructive";
  payload: DesignerPcbMovePlacementCommand | DesignerPcbRotatePlacementCommand | DesignerPcbFlipPlacementCommand;
  sources: AiSourceRef[];
  warnings: string[];
}

export interface PlacePayloadSummary {
  placedCount: number;
  totalComponents: number;
  locked: number;
  metrics: PlaceMetrics;
  determinism: Determinism;
  restartStats: RestartStat[];
  unplaced: UnplacedComponent[];
  diagnostics: string[];
}

export interface PlacementResultEnvelope {
  id: string;
  kind: "designer_pcb_autoplace";
  toolName: string;
  title: string;
  summary: string;
  riskLevel: "low" | "medium" | "high" | "destructive";
  designId?: string | null;
  baseRevision?: number | null;
  operations: PlaceOperation[];
  payload: PlacePayloadSummary;
  sources: AiSourceRef[];
  warnings: string[];
}

export interface PointMm {
  x: number;
  y: number;
}

export interface PointNm {
  x: number;
  y: number;
}

/**
 * [C3] "Which single rule would have opened this pad?" — one row per terminal the flag-gated
 * escape precheck retired at DECLARED rules, present only under ``options.adviseRelaxations``.
 * 
 * ADVISORY, never applied. The router does not relax a rule, does not re-search under one, and
 * emits no copper a relaxed rule would have allowed; every operation in this envelope is legal
 * at the rules the snapshot declared. The row says what the DESIGNER could change.
 * 
 * ``rule`` is the single knob the candidate moved: ``clearance`` (the whole copper-clearance
 * family scaled together, ``valueNm`` reporting the net's governing value after the scale) or
 * ``traceWidth`` (this net's trace width, ``valueNm`` the relaxed width — the minimum-width rule
 * moves with it). ``factor`` is the ladder step that unblocked it (0.9 → 0.5, least aggressive
 * first, clearance before width at equal aggressiveness). ``rule == "none_within_ladder"`` means
 * no candidate on the ladder unsealed the terminal — ``factor``/``valueNm`` are then null and the
 * terminal is not a rules problem the desktop can dial away (board-edge clearance, drill/annular
 * fab minimums and pure geometry are deliberately outside the ladder).
 */
export interface RelaxationAdvisory {
  netId: string;
  placementId: string;
  padNumber: string;
  rule: "clearance" | "traceWidth" | "none_within_ladder";
  factor?: number | null;
  valueNm?: number | null;
}

/**
 * One SA restart's outcome (the winner flagged ``selected``).
 */
export interface RestartStat {
  index: number;
  seedKind: string;
  hpwlMm: number;
  ratsnestMm: number;
  overlapPairs: number;
  crossings: number;
  selected: boolean;
}

export interface RouteOperation {
  id: string;
  kind: "pcb_add_trace" | "pcb_add_via" | "pcb_add_trace_via";
  title: string;
  summary: string;
  riskLevel: "low" | "medium" | "high" | "destructive";
  payload: DesignerPcbAddTraceCommand | DesignerPcbAddViaCommand | DesignerPcbAddTraceViaCommand;
  sources: AiSourceRef[];
  warnings: string[];
}

export interface RoutePayloadSummary {
  completion: Completion;
  unroutedNets: UnroutedNet[];
  metrics: Metrics;
  determinism: Determinism;
  diagnostics: string[];
  netStats: NetRouteStats[];
  portfolio: VariantStats[];
  pairStats?: PairRouteStats[] | null;
  relaxationAdvisories?: RelaxationAdvisory[] | null;
}

export interface RouteResultEnvelope {
  id: string;
  kind: "designer_pcb_autoroute";
  toolName: string;
  title: string;
  summary: string;
  riskLevel: "low" | "medium" | "high" | "destructive";
  designId?: string | null;
  baseRevision?: number | null;
  operations: RouteOperation[];
  payload: RoutePayloadSummary;
  sources: AiSourceRef[];
  warnings: string[];
}

/**
 * [S0] One obstacle and how many of the net's A* candidate edges it rejected.
 * 
 * ``obstacleId`` is engine-internal (compiled-board ids for snapshot geometry, ``State``-minted
 * ids for copper this run committed): stable WITHIN one job, meaningless across jobs. Use it to
 * tell "one wall rejected everything" from "a thousand obstacles each rejected once", not as a
 * durable handle on a board feature.
 */
export interface TopBlocker {
  obstacleId: string;
  rejectedEdges: number;
}

export interface UnplacedComponent {
  placementId: string;
  reason: "no_legal_position" | "locked" | "oversized_for_board" | "non_cardinal_rotation" | "cancelled";
}

export interface UnroutedNet {
  netId: string;
  reason: "no_path_proven" | "search_incomplete" | "budget_exceeded" | "geometry_degenerate" | "policy_excluded" | "escape_blocked_by_rules" | "cancelled";
  targetsRemaining: number;
}

/**
 * [M7] One portfolio variant's outcome summary (the winner flagged ``selected``). First-class
 * ML training data: which net-ordering won, per board.
 */
export interface VariantStats {
  index: number;
  routedNets: number;
  totalNets: number;
  connectedTerminals: number;
  totalLengthA: number;
  totalLengthB: number;
  viaCount: number;
  bendCount: number;
  selected: boolean;
}

/**
 * ``pcb_add_trace`` payload without the discriminator (TS ``Omit<…,"type">``).
 */
export interface _AddTraceBody {
  layer: "F.Cu" | "In1.Cu" | "In2.Cu" | "In3.Cu" | "In4.Cu" | "In5.Cu" | "In6.Cu" | "In7.Cu" | "In8.Cu" | "In9.Cu" | "In10.Cu" | "In11.Cu" | "In12.Cu" | "In13.Cu" | "In14.Cu" | "In15.Cu" | "In16.Cu" | "In17.Cu" | "In18.Cu" | "In19.Cu" | "In20.Cu" | "In21.Cu" | "In22.Cu" | "In23.Cu" | "In24.Cu" | "In25.Cu" | "In26.Cu" | "In27.Cu" | "In28.Cu" | "In29.Cu" | "In30.Cu" | "B.Cu";
  pointsNm: PointNm[];
  widthMm: number;
  netId: string | null;
  netClassId: string;
  segmentMode: "manhattan-90" | "manhattan-45";
}

/**
 * ``pcb_add_via`` payload without the discriminator.
 */
export interface _AddViaBody {
  centerMm: PointMm;
  netId: string | null;
  netClassId: string;
  diameterMmOverride?: number | null;
  drillMmOverride?: number | null;
}

export interface LayoutResultEnvelope {
  kind: "designer_pcb_autolayout";
  envelopeId: string;
  snapshotHash: string;
  engineVersions: Record<string, string>;
  objectiveVersion: string;
  recommendedCandidateId?: string | null;
  candidates: LayoutCandidate[];
  warnings: string[];
  determinism: Determinism;
  manifest: LayoutManifest;
}
