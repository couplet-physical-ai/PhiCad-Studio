// Cloud auto-layout transport surface — the ONE place the desktop names shapes owned by
// the `cloud-auto-layout` service (/v1/route, /v1/place, /v1/layout, /v1/version).
//
// Everything re-exported here is GENERATED from that service's emitted JSON Schemas
// (src/sdks/designer/contracts/*.schema.json → ./generated/*.generated.ts, via
// `npm run gen:contracts`). Nothing in this directory may hand-retype a service shape:
// hand mirrors are exactly what drifted before (six tracked gaps at the last count —
// constraintGroups, placement metadata, subset placement, 9 of 15 place weights).
//
// Two things are deliberately NOT generated and live in ./types.ts instead:
//   * Designer-facing views (a job with a typed `result`, a flattened capability record) —
//     UI props should not carry whole generated schema types;
//   * desktop POLICY narrowings (the 2/4-layer cloud contract), which are a desktop
//     decision about what we send, not a description of what the service accepts.
//
// Each generated module carries its own copy of shared `$defs` (Pydantic emits per-schema
// `$defs`), so e.g. `RouteResultEnvelope` exists in both route-result and layout-result.
// They are structurally identical and TS treats them as interchangeable; this module
// re-exports the standalone one as canonical and prefixes the rest to avoid collisions.

// ── request: BoardSnapshot ───────────────────────────────────────────────
export type {
  BoardGeometry,
  BoardSnapshot,
  ClearanceRules,
  ConstraintGroup,
  DesignRules,
  ExistingTrace,
  FreeHole,
  MinimumRules,
  NetClass,
  PadOutline,
  PlaceOptions,
  PlaceWeights,
  Placement,
  PointMm,
  PointNm,
  PourIsland,
  RatsnestTarget,
  RouteOptions,
  Stackup,
  ViaObstacle,
} from "../board-snapshot.generated";

// ── response: route ──────────────────────────────────────────────────────
export type {
  Completion as RouteCompletion,
  Determinism as RouteDeterminism,
  Metrics as RouteMetrics,
  NetProbeStats,
  NetRouteStats,
  PairRouteStats,
  RelaxationAdvisory,
  RouteOperation,
  RoutePayloadSummary,
  RouteResultEnvelope,
  TopBlocker,
  UnroutedNet,
  VariantStats,
} from "./generated/route-result.generated";

// ── response: place ──────────────────────────────────────────────────────
export type {
  Determinism as PlaceDeterminism,
  PlaceMetrics,
  PlaceOperation,
  PlacePayloadSummary,
  PlacementResultEnvelope,
  RestartStat,
  UnplacedComponent,
} from "./generated/place-result.generated";

// ── response: layout (composite) ─────────────────────────────────────────
export type {
  Determinism as LayoutDeterminism,
  LayoutCandidate,
  LayoutCandidateFailure,
  LayoutManifest,
  LayoutResultEnvelope,
  LayoutScorecard,
} from "./generated/layout-result.generated";

// ── progress frames ──────────────────────────────────────────────────────
export type { ProgressFrameRoute } from "./generated/progress-route.generated";
export type { ProgressFramePlace } from "./generated/progress-place.generated";
export type { ProgressFrameLayout } from "./generated/progress-layout.generated";

// ── job + service responses ──────────────────────────────────────────────
export type { Diagnostic } from "./generated/diagnostic.generated";
export type { SubmitJobResponse } from "./generated/submit-job-response.generated";
export type { JobStatusResponse } from "./generated/job-status-response.generated";
export type { CancelJobResponse } from "./generated/cancel-job-response.generated";
export type { SelectionResponse } from "./generated/selection-response.generated";
export type {
  Capabilities,
  EngineCapabilities,
  LayoutCapabilities,
  PoursCapability,
  VersionResponse,
} from "./generated/version-response.generated";

// ── Designer-facing views + desktop policy types ─────────────────────────
export type {
  AutoLayoutServiceCapabilities,
  CloudEdaEngine,
  CloudEdaJob,
  CloudEdaJobStatus,
  LayoutCandidateTag,
  SnapshotCopperLayerId,
  SnapshotLayerCount,
} from "./types";
export {
  CLOUD_EDA_TERMINAL_STATUSES,
  isTerminalJobStatus,
  readCapabilities,
} from "./types";
