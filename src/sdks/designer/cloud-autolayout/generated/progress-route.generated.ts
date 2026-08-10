// GENERATED FILE — DO NOT EDIT.
//
// Source: src/sdks/designer/contracts/ProgressFrameRoute.schema.json (vendored from cloud-auto-layout's
// `contracts/ProgressFrameRoute.schema.json` — see that dir's README.md for provenance + sync instructions).
//
// Regenerate with `npm run gen:contracts` after re-vendoring the schema.
// `npm run gen:contracts -- --check` fails CI on drift.

export interface ProgressFrameRoute {
  type: "route.started" | "route.progress" | "route.net.routed" | "route.net.failed" | "route.warning" | "route.completed" | "route.failed" | "route.cancelled";
  jobId: string;
  seq: number;
  data: Record<string, unknown>;
}
