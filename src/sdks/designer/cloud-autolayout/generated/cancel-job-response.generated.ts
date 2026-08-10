// GENERATED FILE — DO NOT EDIT.
//
// Source: src/sdks/designer/contracts/CancelJobResponse.schema.json (vendored from cloud-auto-layout's
// `contracts/CancelJobResponse.schema.json` — see that dir's README.md for provenance + sync instructions).
//
// Regenerate with `npm run gen:contracts` after re-vendoring the schema.
// `npm run gen:contracts -- --check` fails CI on drift.

/**
 * 202 body of ``POST /v1/{engine}/{jobId}/cancel``. Cancellation is cooperative:
 * ``cancelRequested`` acknowledges the flag, it does not mean the job has stopped.
 */
export interface CancelJobResponse {
  jobId: string;
  cancelRequested: boolean;
}
