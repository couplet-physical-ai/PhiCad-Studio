// GENERATED FILE — DO NOT EDIT.
//
// Source: src/sdks/designer/contracts/SubmitJobResponse.schema.json (vendored from cloud-auto-layout's
// `contracts/SubmitJobResponse.schema.json` — see that dir's README.md for provenance + sync instructions).
//
// Regenerate with `npm run gen:contracts` after re-vendoring the schema.
// `npm run gen:contracts -- --check` fails CI on drift.

/**
 * 202 body of ``POST /v1/{route,place,layout}``.
 * 
 * ``statusUrl``/``streamUrl`` are service-absolute paths (no origin) — the caller joins
 * them onto the base URL it already used. ``snapshotHash`` is the engine's canonical hash
 * of the accepted snapshot (route projects out the place-only fields; place and layout
 * keep them), usable as job provenance.
 */
export interface SubmitJobResponse {
  jobId: string;
  statusUrl: string;
  streamUrl: string;
  snapshotHash: string;
}
