// Wire contracts for the cloud auto-router service (cloud-auto-router, port 3002).
//
// Hand-mirrored from the service's Python-canonical Pydantic models, which are
// also emitted to `contracts/*.schema.json` in that repo. The desktop is the
// authoritative DRC + ZoneFiller engine: it serializes a self-contained
// `BoardSnapshot`, the service routes bulk nets, and returns a cherry-pickable
// `RouteResultEnvelope` (a batch of pcb_add_trace / pcb_add_via /
// pcb_add_trace_via ops the user approves and the desktop re-validates on apply).
//
// Units (load-bearing): `traces[].pointsNm` and operation trace `pointsNm` are
// integer NANOMETERS; every other coordinate/dimension is MILLIMETERS (mm).
//
// Reuse: op payloads and net-class / design-rule / point shapes are taken
// verbatim from ./types — they already mirror this service. A future follow-up
// will codegen these from the service schemas into @openpcb/contracts.

import type {
  DesignerPcbAddTraceCommand,
  DesignerPcbAddViaCommand,
  DesignerPcbAddTraceViaCommand,
  PcbCopperLayerId,
  PcbDesignRules,
  PcbFabricatorId,
  PcbLayerCount,
  PcbNetClass,
  PcbPointMm,
  PcbTraceSegmentMode,
  RatsnestSegment,
} from "./types";

/** Integer nanometer point (trace polylines). 1 mm = 1_000_000 nm. */
export interface PointNm {
  x: number;
  y: number;
}

/** A pad-pair to route. Field-identical to the desktop `RatsnestSegment`. */
export type RatsnestTarget = RatsnestSegment;

export type AutorouteRiskLevel = "low" | "medium" | "high" | "destructive";

// ── BoardSnapshot (request) ──────────────────────────────────────────────

export interface BoardGeometry {
  /** Outline rings (mm). Outer ring CCW; hole rings CW. Open (implicitly closed). */
  outline: PcbPointMm[][];
  /** Internal cutout rings (mm). */
  cutouts?: PcbPointMm[][];
  copperToEdgeMm: number;
}

export interface Stackup {
  layerCount: PcbLayerCount;
  /** Z-ordered copper layers, e.g. ["F.Cu","B.Cu"]. */
  copperLayers: PcbCopperLayerId[];
  boardThicknessMm?: number;
}

export interface SnapshotDesignRules {
  clearance: PcbDesignRules["clearance"];
  minimums: PcbDesignRules["minimums"];
  fabPresetId: PcbFabricatorId;
}

/** Net class as the service consumes it — identical to the desktop `PcbNetClass`. */
export type SnapshotNetClass = PcbNetClass;

export interface SnapshotPlacement {
  id: string;
  reference: string;
  layer: PcbCopperLayerId;
  /**
   * Current component transform — consumed by cloud-auto-place (the autorouter ignores
   * these). The footprint ORIGIN (mm), absolute rotation (may be non-cardinal for KiCad
   * imports), and the side-mirror flag, mirroring `PcbPlacedPart`. Auto-place needs them
   * to seed from the real layout, emit minimal move diffs, and emit faithful absolute
   * rotate / side-aware flip commands.
   */
  positionMm: PcbPointMm;
  rotationDeg: number;
  mirrored: boolean;
}

export interface PadOutline {
  placementId: string;
  padNumber: string;
  netId: string | null;
  layer: PcbCopperLayerId;
  /** Pre-polygonized world-space pad ring (mm, CCW). */
  ring: PcbPointMm[];
  isConnectable: boolean;
}

export interface ViaObstacle {
  id: string;
  netId: string | null;
  centerMm: PcbPointMm;
  diameterMm: number;
  drillMm: number;
  fromLayer: PcbCopperLayerId;
  toLayer: PcbCopperLayerId;
  /** Mechanical hole (no net, keepout on all layers). */
  isHoleOnly: boolean;
}

export interface ExistingTrace {
  id: string;
  netId: string | null;
  netClassId: string;
  layer: PcbCopperLayerId;
  widthMm: number;
  /** Polyline in NANOMETERS. */
  pointsNm: PointNm[];
  segmentMode: PcbTraceSegmentMode;
}

/** Zone-filler island. Sent empty in v1 (the service rejects non-empty pours). */
export interface PourIsland {
  islandId: string;
  layer: PcbCopperLayerId;
  pourNetId: string | null;
  /** Clipper2 rings (mm): [outer, hole1, ...]. */
  rings: PcbPointMm[][];
}

export interface FreeHole {
  id: string;
  centerMm: PcbPointMm;
  drillMm: number;
}

/** Per-layer preferred routing axis, or "auto" for neutral. */
export type LayerPolicy = "auto" | Record<string, "h" | "v" | "any">;

export interface RouteOptions {
  seed?: number;
  geometryMode?: PcbTraceSegmentMode;
  allowVias?: boolean;
  maxViasPerNet?: number | null;
  layerPolicy?: LayerPolicy;
  epsilonNm?: number | null;
  maxExpansions?: number | null;
  maxRipupPasses?: number | null;
  maxShoveNodes?: number | null;
  maxShoveDepthTraces?: number;
  maxShoveDepthVias?: number;
  netOrder?: string[] | null;
  progressEveryNNets?: number;
  /**
   * [M7] Deterministic portfolio routing — number of net-ordering variants the
   * service routes sequentially (best kept by its objective). 1 = off (single
   * baseline pass); clamped 1..8 server-side. The desktop sends 4 (the
   * recommended production accuracy/latency default).
   */
  portfolio?: number;
}

/** Cost-term weights for cloud-auto-place (scale-normalized terms). */
export interface PlaceWeights {
  hpwl?: number;
  spread?: number;
  overlap?: number;
  edge?: number;
  connector?: number;
  side?: number;
}

/** Options for cloud-auto-place (the autorouter ignores this block). */
export interface PlaceOptions {
  seed?: number;
  restarts?: number | null;
  maxMoves?: number | null;
  /** v1 only re-optimizes all unlocked parts. */
  mode?: "all";
  /** placementIds the user pinned (always locked). */
  lockReferences?: string[];
  allowRotate?: boolean;
  allowFlip?: boolean;
  /** When false, connectors are fixed anchors rather than movable. */
  moveConnectors?: boolean;
  /** Lock any component with existing routed copper on a pad. */
  respectExistingTraces?: boolean;
  targetUtilization?: number;
  gridSnapMm?: number;
  weights?: PlaceWeights | null;
}

export interface BoardSnapshot {
  schemaVersion?: string;
  designId: string;
  baseRevision?: number | null;
  sessionId?: string | null;
  board: BoardGeometry;
  stackup: Stackup;
  designRules: SnapshotDesignRules;
  netClasses: SnapshotNetClass[];
  netAssignments?: Record<string, string>;
  routableNetClassIds: string[];
  excludedNetIds?: string[];
  placements?: SnapshotPlacement[];
  padOutlines?: PadOutline[];
  vias?: ViaObstacle[];
  traces?: ExistingTrace[];
  pours?: PourIsland[];
  freeHoles?: FreeHole[];
  ratsnest: RatsnestTarget[];
  netNames?: Record<string, string>;
  options?: RouteOptions;
  /** Consumed by cloud-auto-place; ignored by the autorouter. */
  placeOptions?: PlaceOptions;
}

// ── RouteResultEnvelope (response) ───────────────────────────────────────

export type RouteOperationKind =
  | "pcb_add_trace"
  | "pcb_add_via"
  | "pcb_add_trace_via";

/** The op body — already a valid desktop designer command (carries `type`). */
export type RouteOperationPayload =
  | DesignerPcbAddTraceCommand
  | DesignerPcbAddViaCommand
  | DesignerPcbAddTraceViaCommand;

export interface RouteOperation {
  id: string;
  kind: RouteOperationKind;
  title: string;
  summary: string;
  riskLevel: AutorouteRiskLevel;
  payload: RouteOperationPayload;
  sources: unknown[];
  warnings: string[];
}

export type UnroutedReason =
  | "no_path_proven"
  | "search_incomplete"
  | "budget_exceeded"
  | "geometry_degenerate"
  | "policy_excluded"
  | "cancelled";

export interface RouteCompletion {
  routedNets: number;
  totalNets: number;
  percent: number;
}

export interface UnroutedNet {
  netId: string;
  reason: UnroutedReason;
  targetsRemaining: number;
}

export interface RouteMetrics {
  totalLengthNm: number;
  viaCount: number;
  layerTransitions: number;
  traceCount: number;
  ripupPasses: number;
  /** [M4] Total turn vertices over all emitted copper. */
  bendCount: number;
  /** [M-ML] Exact `A + B·√2` length aggregate (nm): `totalLengthA` = axis nm, */
  totalLengthA: number;
  /** `totalLengthB` = diagonal-segment nm (multiply by √2 for physical length). */
  totalLengthB: number;
}

/**
 * [M-ML] Per-net routing features + labels (training data for a future learned
 * net-ordering model). Rides the payload; never affects apply. Integers only.
 */
export interface NetRouteStats {
  netId: string;
  // features (captured at the net's first routing attempt):
  pinCount: number;
  bboxWNm: number;
  bboxHNm: number;
  bboxOverlapCount: number;
  congestionInBbox: number;
  attemptOrder: number;
  blockedEscapes: number;
  // labels:
  routed: boolean;
  lengthA: number;
  lengthB: number;
  viaCount: number;
  bendCount: number;
  ripCount: number;
  /** Pass index the net first completed, or -1 if never. */
  passFirstRouted: number;
  failureReason: string | null;
}

/**
 * [M7] One portfolio variant's outcome summary (the winner flagged `selected`).
 * Empty when `options.portfolio` <= 1.
 */
export interface VariantStats {
  /** 0 = baseline ordering. */
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

export interface RouteDeterminism {
  seed: number;
  snapshotHash: string;
  engineVersion: string;
  budget: Record<string, number> | null;
}

export interface RoutePayloadSummary {
  completion: RouteCompletion;
  unroutedNets: UnroutedNet[];
  metrics: RouteMetrics;
  determinism: RouteDeterminism;
  diagnostics: string[];
  /** [M-ML] Per-net features+labels, sorted by `netId`. */
  netStats: NetRouteStats[];
  /** [M7] Per-variant summaries; empty unless `options.portfolio` > 1. */
  portfolio: VariantStats[];
}

export interface RouteResultEnvelope {
  id: string;
  kind: "designer_pcb_autoroute";
  toolName: string;
  title: string;
  summary: string;
  riskLevel: AutorouteRiskLevel;
  designId: string | null;
  baseRevision: number | null;
  operations: RouteOperation[];
  payload: RoutePayloadSummary;
  sources: unknown[];
  warnings: string[];
}

// ── Async job wire shapes ────────────────────────────────────────────────

export interface SubmitRouteResponse {
  jobId: string;
  statusUrl: string;
  streamUrl: string;
  snapshotHash: string;
}

/** Job-record status from `GET /v1/route/{id}` (distinct from ProgressFrame.type). */
export type RouteJobStatus =
  | "queued"
  | "running"
  | "done"
  | "failed"
  | "cancelled";

export interface RouteStatusResponse {
  jobId: string;
  status: RouteJobStatus;
  error: string | null;
  result: RouteResultEnvelope | null;
}

export type ProgressFrameType =
  | "route.started"
  | "route.progress"
  | "route.net.routed"
  | "route.net.failed"
  | "route.warning"
  // [M7] variant-scoped frames (only emitted when options.portfolio > 1).
  | "route.variant.started"
  | "route.variant.completed"
  | "route.completed"
  | "route.failed"
  | "route.cancelled";

export interface ProgressFrame {
  type: ProgressFrameType;
  jobId: string;
  seq: number;
  data: Record<string, unknown>;
}

export interface VersionResponse {
  engineVersion: string;
  contractVersion: string;
  schemaMajor: number;
  capabilities: {
    async: boolean;
    progressStream: string;
    cancel: boolean;
    viaSpans: string[];
    engineImplemented: boolean;
  };
}
