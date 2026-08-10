// GENERATED FILE — DO NOT EDIT.
//
// Source: src/sdks/designer/contracts/Diagnostic.schema.json (vendored from cloud-auto-layout's
// `contracts/Diagnostic.schema.json` — see that dir's README.md for provenance + sync instructions).
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
