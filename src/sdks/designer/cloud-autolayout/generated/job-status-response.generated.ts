// GENERATED FILE — DO NOT EDIT.
//
// Source: src/sdks/designer/contracts/JobStatusResponse.schema.json (vendored from cloud-auto-layout's
// `contracts/JobStatusResponse.schema.json` — see that dir's README.md for provenance + sync instructions).
//
// Regenerate with `npm run gen:contracts` after re-vendoring the schema.
// `npm run gen:contracts -- --check` fails CI on drift.

export interface Diagnostic {
  code: string;
  severity: "error" | "warning" | "info";
  message: string;
  path?: string | null;
  context: Record<string, unknown>;
}

/**
 * ``GET /v1/{engine}/{jobId}``. ``result`` is present only in a terminal state that
 * produced one (a cancelled job may carry a partial envelope). ``diagnostics`` are the
 * submit-time warning/info items — available immediately, and also merged into a completed
 * result's ``warnings[]``.
 */
export interface JobStatusResponse {
  jobId: string;
  status?: "queued" | "running" | "done" | "failed" | "cancelled" | null;
  error?: string | null;
  diagnostics: Diagnostic[];
  result?: Record<string, unknown> | null;
}
