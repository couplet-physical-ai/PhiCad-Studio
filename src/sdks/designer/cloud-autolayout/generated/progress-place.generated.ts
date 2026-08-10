// GENERATED FILE — DO NOT EDIT.
//
// Source: src/sdks/designer/contracts/ProgressFramePlace.schema.json (vendored from cloud-auto-layout's
// `contracts/ProgressFramePlace.schema.json` — see that dir's README.md for provenance + sync instructions).
//
// Regenerate with `npm run gen:contracts` after re-vendoring the schema.
// `npm run gen:contracts -- --check` fails CI on drift.

export interface ProgressFramePlace {
  type: "place.started" | "place.seed.ready" | "place.restart.started" | "place.progress" | "place.restart.completed" | "place.ils" | "place.ils.improved" | "place.legalized" | "place.completed" | "place.failed" | "place.cancelled";
  jobId: string;
  seq: number;
  data: Record<string, unknown>;
}
