// Place-side wire contracts for the cloud auto-layout service
// (cloud-auto-layout, /v1/place, port 3002 — formerly the standalone cloud-auto-place).
//
// THESE ARE NO LONGER HAND-WRITTEN — every shape aliases a type generated from the
// service's emitted JSON Schema (./cloud-autolayout). This module survives as the stable
// import surface; new code should import from ./cloud-autolayout directly.
//
// Boundary is unchanged: the desktop serializes a self-contained `BoardSnapshot` (the same
// shape the autorouter gets, carrying each component's current transform), the service
// optimizes the placement and returns a cherry-pickable `PlacementResultEnvelope` — a batch
// of pcb_move_placement / pcb_rotate_placement / pcb_flip_placement ops the desktop
// re-validates + DRC-checks on apply. Auto-place runs BEFORE the autorouter.
//
// Names are `Place`-prefixed so the barrel (`export type * from "./autoroute"` +
// `"./autoplace"`) never collides with the route side. Request shapes (`BoardSnapshot`,
// `SnapshotPlacement`, `PlaceOptions`, `PlaceWeights`) come from ./autoroute — never
// redefine them here.

import type {
  JobStatusResponse,
  PlaceOperation,
  PlacementResultEnvelope as GeneratedPlacementResultEnvelope,
  ProgressFramePlace,
} from "./cloud-autolayout";

// ── PlacementResultEnvelope (response) ───────────────────────────────────

export type {
  PlaceDeterminism,
  PlaceMetrics,
  PlaceOperation,
  PlacePayloadSummary,
  PlacementResultEnvelope,
  RestartStat,
  UnplacedComponent,
} from "./cloud-autolayout";

export type AutoplaceRiskLevel = PlaceOperation["riskLevel"];
export type PlaceOperationKind = PlaceOperation["kind"];
/** The op body — already a valid desktop designer command (carries `type`). */
export type PlaceOperationPayload = PlaceOperation["payload"];
export type UnplacedReason =
  import("./cloud-autolayout").UnplacedComponent["reason"];

// ── Async job wire shapes ────────────────────────────────────────────────

export type { SubmitJobResponse as SubmitPlaceResponse } from "./cloud-autolayout";

/** Job-record status from `GET /v1/place/{id}` (distinct from a progress-frame type). */
export type PlaceJobStatus = NonNullable<JobStatusResponse["status"]>;

/** `GET /v1/place/{id}` with `result` narrowed to the placement envelope. */
export interface PlaceStatusResponse
  extends Omit<JobStatusResponse, "result" | "status"> {
  status: PlaceJobStatus;
  result: GeneratedPlacementResultEnvelope | null;
}

/** Unrecognized frame types are ignorable progress ticks, not errors. */
export type PlaceProgressFrameType = ProgressFramePlace["type"];
export type PlaceProgressFrame = ProgressFramePlace;
