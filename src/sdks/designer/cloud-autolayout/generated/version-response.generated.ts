// GENERATED FILE — DO NOT EDIT.
//
// Source: src/sdks/designer/contracts/VersionResponse.schema.json (vendored from cloud-auto-layout's
// `contracts/VersionResponse.schema.json` — see that dir's README.md for provenance + sync instructions).
//
// Regenerate with `npm run gen:contracts` after re-vendoring the schema.
// `npm run gen:contracts -- --check` fails CI on drift.

export interface Capabilities {
  async: boolean;
  progressStream: string;
  cancel: boolean;
  endpoints: string[];
  viaSpans: string[];
  engineImplemented: boolean;
  schemaMajor: number;
  schemaMinor: number;
  schemaVersion: string;
  engines: Record<string, EngineCapabilities>;
  layout?: LayoutCapabilities | null;
  pours: PoursCapability;
}

/**
 * Per-engine field-usage catalog + negotiable feature switches.
 * 
 * ``features`` is the field a producer should branch on; it lists only levers that are
 * consumed TODAY (an accepted-but-unwired field appears in ``reserved`` instead). Values
 * are booleans except numeric ceilings such as ``ripQuotaMax``. Never gate behaviour on
 * ``version`` string comparisons.
 */
export interface EngineCapabilities {
  version?: string | null;
  consumesTop: string[];
  consumesConditional: string[];
  ignoresTop: string[];
  reserved: string[];
  budgetModes: string[];
  features: Record<string, unknown>;
}

/**
 * Present only when the deployment mounts ``/v1/layout``. ``maxCandidates`` is a
 * ceiling, not the K a job will produce — K is service-side policy and has no request
 * field; read the actual count off the result.
 */
export interface LayoutCapabilities {
  maxCandidates: number;
  objectiveVersion: string;
  budgetModes: string[];
}

/**
 * ``accepted`` = the route engine consumes ``pours``; ``routeAware`` describes how
 * (same-net islands as goals, diff-net as obstacles); ``producerDefault`` is the
 * recommended desktop default when the user has not chosen.
 */
export interface PoursCapability {
  accepted: boolean;
  routeAware: boolean;
  producerDefault: string;
}

/**
 * ``GET /v1/version`` — unauthenticated, so a signed-out desktop can still decide
 * whether the deployment supports Auto Layout. ``layoutEngineVersion`` and the
 * ``capabilities.engines.layout`` / ``capabilities.layout`` blocks are absent when the
 * deployment runs with ``LAYOUT_ENABLED=false``.
 */
export interface VersionResponse {
  service: string;
  engineVersion: string;
  routeEngineVersion: string;
  placeEngineVersion: string;
  layoutEngineVersion?: string | null;
  contractVersion: string;
  schemaMajor: number;
  schemaMinor: number;
  schemaVersion: string;
  capabilities: Capabilities;
}
