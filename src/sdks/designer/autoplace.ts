// Wire contracts for the cloud auto-place service (cloud-auto-place, port 3004).
//
// Hand-mirrored from the service's Python-canonical Pydantic models
// (`app/contracts/place_result.py` + `progress_frame.py`), which are also emitted to
// `contracts/*.schema.json` in that repo. The desktop is the authoritative DRC engine:
// it serializes a self-contained `BoardSnapshot` (the SAME shape it sends the autorouter,
// extended with each component's current transform — see `SnapshotPlacement` /
// `PlaceOptions` in ./autoroute), the service optimizes the placement, and returns a
// cherry-pickable `PlacementResultEnvelope` (a batch of pcb_move_placement /
// pcb_rotate_placement / pcb_flip_placement ops the user approves and the desktop
// re-validates + DRC-checks on apply). Auto-place runs BEFORE the autorouter.
//
// Names are `Place`-prefixed so the barrel (`export type * from "./autoroute"` +
// `"./autoplace"`) never collides with the autorouter's Route* / ProgressFrame types.
// The request shapes (`BoardSnapshot`, `SnapshotPlacement`, `PlaceOptions`, `PlaceWeights`)
// are reused verbatim from ./autoroute — do NOT redefine them here.

import type {
  DesignerPcbFlipPlacementCommand,
  DesignerPcbMovePlacementCommand,
  DesignerPcbRotatePlacementCommand,
} from "./types";

export type AutoplaceRiskLevel = "low" | "medium" | "high" | "destructive";

// ── PlacementResultEnvelope (response) ───────────────────────────────────

export type PlaceOperationKind =
  | "pcb_move_placement"
  | "pcb_rotate_placement"
  | "pcb_flip_placement";

/** The op body — already a valid desktop designer command (carries `type`). */
export type PlaceOperationPayload =
  | DesignerPcbMovePlacementCommand
  | DesignerPcbRotatePlacementCommand
  | DesignerPcbFlipPlacementCommand;

export interface PlaceOperation {
  id: string;
  kind: PlaceOperationKind;
  title: string;
  summary: string;
  riskLevel: AutoplaceRiskLevel;
  payload: PlaceOperationPayload;
  sources: unknown[];
  warnings: string[];
}

export type UnplacedReason =
  | "no_legal_position"
  | "locked"
  | "oversized_for_board"
  | "non_cardinal_rotation"
  | "cancelled";

export interface UnplacedComponent {
  placementId: string;
  reason: UnplacedReason;
}

export interface PlaceMetrics {
  /** Σ Euclidean over the snapshot ratsnest pad-pairs (the baseline to beat). */
  ratsnestLengthBeforeMm: number;
  /** Recomputed at the final transforms. */
  ratsnestLengthAfterMm: number;
  ratsnestImprovementPct: number;
  /** The optimization objective (reported for transparency). */
  hpwlBeforeMm: number;
  hpwlAfterMm: number;
  /** Ratsnest-segment crossings (descriptive, not optimized). */
  crossingsBefore: number;
  crossingsAfter: number;
  /** Courtyard-overlapping component pairs (target 0 — legality gate). */
  overlapPairsAfter: number;
  overlapAreaAfterMm2: number;
  /** Components outside the outline / in the edge keepband (target 0). */
  edgeViolations: number;
}

export interface PlaceDeterminism {
  seed: number;
  snapshotHash: string;
  placeVersion: string;
  budget: Record<string, number> | null;
}

/** One SA restart's outcome (the winner flagged `selected`). */
export interface RestartStat {
  index: number;
  /** "force_directed" | "random". */
  seedKind: string;
  hpwlMm: number;
  ratsnestMm: number;
  overlapPairs: number;
  crossings: number;
  selected: boolean;
}

export interface PlacePayloadSummary {
  /** Components moved/rotated/flipped. */
  placedCount: number;
  totalComponents: number;
  locked: number;
  metrics: PlaceMetrics;
  determinism: PlaceDeterminism;
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
  riskLevel: AutoplaceRiskLevel;
  designId: string | null;
  baseRevision: number | null;
  operations: PlaceOperation[];
  payload: PlacePayloadSummary;
  sources: unknown[];
  warnings: string[];
}

// ── Async job wire shapes ────────────────────────────────────────────────

export interface SubmitPlaceResponse {
  jobId: string;
  statusUrl: string;
  streamUrl: string;
  snapshotHash: string;
}

/** Job-record status from `GET /v1/place/{id}` (distinct from a progress-frame type). */
export type PlaceJobStatus =
  | "queued"
  | "running"
  | "done"
  | "failed"
  | "cancelled";

export interface PlaceStatusResponse {
  jobId: string;
  status: PlaceJobStatus;
  error: string | null;
  result: PlacementResultEnvelope | null;
}

export type PlaceProgressFrameType =
  | "place.started"
  | "place.seed.ready"
  | "place.restart.started"
  | "place.progress"
  | "place.restart.completed"
  | "place.legalized"
  | "place.completed"
  | "place.failed"
  | "place.cancelled";

export interface PlaceProgressFrame {
  type: PlaceProgressFrameType;
  jobId: string;
  seq: number;
  data: Record<string, unknown>;
}
