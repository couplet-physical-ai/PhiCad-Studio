// GENERATED FILE — DO NOT EDIT.
//
// Source: src/sdks/designer/contracts/ProgressFrameLayout.schema.json (vendored from cloud-auto-layout's
// `contracts/ProgressFrameLayout.schema.json` — see that dir's README.md for provenance + sync instructions).
//
// Regenerate with `npm run gen:contracts` after re-vendoring the schema.
// `npm run gen:contracts -- --check` fails CI on drift.

export interface ProgressFrameLayout {
  type: "layout.accepted" | "layout.candidate.started" | "layout.candidate.stage" | "layout.candidate.finished" | "layout.progress" | "layout.candidate.selected" | "layout.completed" | "layout.failed" | "layout.cancelled";
  jobId: string;
  seq: number;
  data: Record<string, unknown>;
}
