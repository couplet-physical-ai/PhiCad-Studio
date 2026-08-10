// GENERATED FILE — DO NOT EDIT.
//
// Source: src/sdks/designer/contracts/PlacementResultEnvelope.schema.json (vendored from cloud-auto-layout's
// `contracts/PlacementResultEnvelope.schema.json` — see that dir's README.md for provenance + sync instructions).
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

export interface PointMm {
  x: number;
  y: number;
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

export interface UnplacedComponent {
  placementId: string;
  reason: "no_legal_position" | "locked" | "oversized_for_board" | "non_cardinal_rotation" | "cancelled";
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
