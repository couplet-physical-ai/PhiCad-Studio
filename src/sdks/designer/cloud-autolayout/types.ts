// Designer-facing views over the generated cloud-autolayout transport types, plus the
// desktop-side POLICY narrowings. Nothing here re-describes a service shape — it either
// wraps a generated one or states a decision the desktop makes about what it sends.

import type { JobStatusResponse } from "./generated/job-status-response.generated";
import type { LayoutResultEnvelope } from "./generated/layout-result.generated";
import type { PlacementResultEnvelope } from "./generated/place-result.generated";
import type { RouteResultEnvelope } from "./generated/route-result.generated";
import type {
  Capabilities,
  EngineCapabilities,
  VersionResponse,
} from "./generated/version-response.generated";

/**
 * Cloud contract layer vocabulary — deliberately pinned to the 2/4-layer stackup the
 * cloud engines support, and decoupled from the desktop's wider `PcbLayerCount` /
 * `PcbCopperLayerId` (2..32). The generated transport types carry the service's full
 * enum; this narrowing is the DESKTOP's rule about what it is willing to send, enforced
 * in the board-snapshot builder, which rejects 6+ layer boards before serialization.
 */
export type SnapshotLayerCount = 2 | 4;
export type SnapshotCopperLayerId = "F.Cu" | "In1.Cu" | "In2.Cu" | "B.Cu";

/** The three engines behind the shared job API. */
export type CloudEdaEngine = "route" | "place" | "layout";

/** Job lifecycle, identical across all three engines (one `create_job_router` service-side). */
export type CloudEdaJobStatus =
  | "queued"
  | "running"
  | "done"
  | "failed"
  | "cancelled";

export const CLOUD_EDA_TERMINAL_STATUSES = [
  "done",
  "failed",
  "cancelled",
] as const satisfies readonly CloudEdaJobStatus[];

export function isTerminalJobStatus(status: CloudEdaJobStatus | null | undefined): boolean {
  return status != null && (CLOUD_EDA_TERMINAL_STATUSES as readonly string[]).includes(status);
}

/**
 * A job status response with its engine-specific result narrowed.
 *
 * The wire shape leaves `result` an open object because one endpoint family serves three
 * engines; the caller knows which endpoint it hit, so it knows the envelope type.
 */
export interface CloudEdaJob<TResult>
  extends Omit<JobStatusResponse, "result" | "status"> {
  status: CloudEdaJobStatus | null;
  result: TResult | null;
}

export type RouteJob = CloudEdaJob<RouteResultEnvelope>;
export type PlaceJob = CloudEdaJob<PlacementResultEnvelope>;
export type LayoutJob = CloudEdaJob<LayoutResultEnvelope>;

/**
 * Service tags on a layout candidate. The service may add tags without a desktop release,
 * so consumers must render an unknown tag verbatim rather than dropping it — the union is
 * documentation + autocomplete, not a filter.
 */
export type LayoutCandidateTag =
  | "most_complete"
  | "shortest_copper"
  | "fewest_vias"
  | "closest_to_your_layout"
  | (string & {});

/**
 * Flattened capability view for gating decisions.
 *
 * Every field answers one question the UI asks ("can I offer Auto Layout?", "may I send
 * pours?", "is subset placement supported?"). Feature negotiation reads the service's
 * `capabilities.engines.*.features` map — NEVER compares engine version strings, which is
 * why the service publishes booleans in the first place.
 */
export interface AutoLayoutServiceCapabilities {
  schemaVersion: string;
  schemaMajor: number;
  routeEngineVersion: string | null;
  placeEngineVersion: string | null;
  layoutEngineVersion: string | null;
  /** Endpoint paths the deployment advertises, e.g. ["/v1/route", "/v1/place"]. */
  endpoints: string[];
  /** `/v1/route` is mounted — Route Board is offerable. */
  route: boolean;
  /** `/v1/place` is mounted — standalone Auto Place is offerable. */
  place: boolean;
  /** `/v1/layout` is mounted — full Auto Layout is offerable. */
  layout: boolean;
  /** Layout negotiation block; null when the deployment does not mount layout. */
  layoutLimits: {
    maxCandidates: number;
    objectiveVersion: string;
    budgetModes: string[];
  } | null;
  /** Route engine consumes a `pours` block if sent. */
  poursAccepted: boolean;
  poursRouteAware: boolean;
  /** Per-engine feature switches (booleans / numeric ceilings), verbatim from the service. */
  features: Record<CloudEdaEngine, Record<string, unknown>>;
  async: boolean;
  progressStream: string;
  cancel: boolean;
  viaSpans: string[];
}

function engineFeatures(engine: EngineCapabilities | undefined): Record<string, unknown> {
  return engine?.features ?? {};
}

/**
 * Project a `/v1/version` body onto the flattened view. Total and defensive: a deployment
 * older than these fields, or a truncated body, yields "unsupported" rather than throwing —
 * the gate must fail closed, not crash the PCB editor.
 */
export function readCapabilities(
  version: VersionResponse | null | undefined,
): AutoLayoutServiceCapabilities | null {
  if (!version) return null;
  const caps = (version.capabilities ?? {}) as Partial<Capabilities>;
  const engines = (caps.engines ?? {}) as Record<string, EngineCapabilities>;
  const endpoints = caps.endpoints ?? [];
  return {
    schemaVersion: version.schemaVersion,
    schemaMajor: version.schemaMajor,
    routeEngineVersion: version.routeEngineVersion ?? version.engineVersion ?? null,
    placeEngineVersion: version.placeEngineVersion ?? null,
    layoutEngineVersion: version.layoutEngineVersion ?? null,
    endpoints,
    // Presence of the engine block is the gate the service itself keys on: it POPS
    // `engines.layout` and drops "/v1/layout" from `endpoints` when LAYOUT_ENABLED is off.
    route: Boolean(engines.route) || endpoints.includes("/v1/route"),
    place: Boolean(engines.place) || endpoints.includes("/v1/place"),
    layout: Boolean(engines.layout) && endpoints.includes("/v1/layout"),
    layoutLimits: caps.layout
      ? {
          maxCandidates: caps.layout.maxCandidates,
          objectiveVersion: caps.layout.objectiveVersion,
          budgetModes: caps.layout.budgetModes ?? [],
        }
      : null,
    poursAccepted: Boolean(caps.pours?.accepted),
    poursRouteAware: Boolean(caps.pours?.routeAware),
    features: {
      route: engineFeatures(engines.route),
      place: engineFeatures(engines.place),
      layout: engineFeatures(engines.layout),
    },
    async: caps.async ?? false,
    progressStream: caps.progressStream ?? "",
    cancel: caps.cancel ?? false,
    viaSpans: caps.viaSpans ?? [],
  };
}
