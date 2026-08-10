// GENERATED FILE — DO NOT EDIT.
//
// Source: src/sdks/designer/contracts/SelectionResponse.schema.json (vendored from cloud-auto-layout's
// `contracts/SelectionResponse.schema.json` — see that dir's README.md for provenance + sync instructions).
//
// Regenerate with `npm run gen:contracts` after re-vendoring the schema.
// `npm run gen:contracts -- --check` fails CI on drift.

/**
 * 202 body of ``POST /v1/layout/{jobId}/selection`` — advisory label, never mutates
 * the result.
 */
export interface SelectionResponse {
  jobId: string;
  candidateId: string;
  recorded: boolean;
}
