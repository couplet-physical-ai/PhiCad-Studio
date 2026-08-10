#!/usr/bin/env bun
// Contract-type codegen — turns the vendored cloud-auto-layout JSON Schemas
// (src/sdks/designer/contracts/*.schema.json) into TypeScript mirrors, so every
// transport shape the desktop parses off that service is GENERATED rather than
// hand-retyped. See CONTRACTS below for the manifest.
//
// Bespoke generator, not a `json-schema-to-typescript` dependency: that package
// isn't installed anywhere in this repo, and the input is one narrow,
// well-understood Pydantic-emitted shape (draft 2020-12: `$defs` + `$ref` +
// `anyOf`-nullable + `enum`/`const` + discriminated `oneOf`). Anything this
// generator does not understand THROWS — it never falls through to `unknown` —
// so an unsupported construct is a loud failure, not a silent mis-generation.
//
//   bun scripts/gen-contract-types.ts            # regenerate in place
//   bun scripts/gen-contract-types.ts --check     # diff-only, exit 1 on drift
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), "..");
const SCHEMA_DIR = path.join(ROOT, "src/sdks/designer/contracts");
const GENERATED_DIR = path.join(ROOT, "src/sdks/designer/cloud-autolayout/generated");

type ContractRole = "request" | "response";

interface ContractSpec {
  /** file name under src/sdks/designer/contracts/ */
  schema: string;
  /** output path, repo-relative */
  output: string;
  /** exported name for the schema root (defaults to the schema's `title`) */
  rootName?: string;
  /**
   * Which side of the wire this schema describes. Load-bearing for optionality:
   *
   *   "response" (default) — the SERVICE produces it with `model_dump()`, so a field with
   *     a non-null default is always on the wire and is rendered REQUIRED.
   *   "request" — the DESKTOP produces it, and omitting a defaulted field is meaningful:
   *     absent means "use the service's current default", which is how routing/placement
   *     improvements reach shipped desktops. Defaults stay OPTIONAL.
   */
  role?: "request" | "response";
  /** extra note rendered into the generated file's header */
  note?: string;
}

// Every schema cloud-auto-layout emits (`uv run python -m scripts.emit_contracts`).
// Re-vendor with the sync command in src/sdks/designer/contracts/README.md.
const CONTRACTS: ContractSpec[] = [
  {
    schema: "BoardSnapshot.schema.json",
    // Kept at its original path: board-snapshot.assert.ts imports it under a
    // namespace to drift-check the hand-written BoardSnapshot in autoroute.ts.
    output: "src/sdks/designer/board-snapshot.generated.ts",
    role: "request",
    note:
      "Names intentionally collide with the hand-written wire types in ./autoroute.ts\n" +
      "(e.g. `Placement`, `Stackup`) since both describe the same service contract, so\n" +
      "this module is NOT re-exported from ./index.ts. Compare via ./board-snapshot.assert.ts.",
  },
  { schema: "RouteResultEnvelope.schema.json", output: gen("route-result") },
  { schema: "PlacementResultEnvelope.schema.json", output: gen("place-result") },
  { schema: "LayoutResultEnvelope.schema.json", output: gen("layout-result") },
  { schema: "ProgressFrameRoute.schema.json", output: gen("progress-route"), rootName: "ProgressFrameRoute" },
  { schema: "ProgressFramePlace.schema.json", output: gen("progress-place"), rootName: "ProgressFramePlace" },
  { schema: "ProgressFrameLayout.schema.json", output: gen("progress-layout"), rootName: "ProgressFrameLayout" },
  { schema: "Diagnostic.schema.json", output: gen("diagnostic") },
  { schema: "SubmitJobResponse.schema.json", output: gen("submit-job-response") },
  { schema: "JobStatusResponse.schema.json", output: gen("job-status-response") },
  { schema: "CancelJobResponse.schema.json", output: gen("cancel-job-response") },
  { schema: "SelectionResponse.schema.json", output: gen("selection-response") },
  { schema: "VersionResponse.schema.json", output: gen("version-response") },
];

function gen(stem: string): string {
  return `src/sdks/designer/cloud-autolayout/generated/${stem}.generated.ts`;
}

// ── minimal JSON Schema (2020-12, Pydantic-flavored) type model ──────────

interface Discriminator {
  propertyName: string;
  mapping?: Record<string, string>;
}

interface JsonSchema {
  $ref?: string;
  type?: string | string[];
  enum?: (string | number | boolean)[];
  const?: string | number | boolean;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  discriminator?: Discriminator;
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
  additionalProperties?: JsonSchema | boolean;
  required?: string[];
  default?: unknown;
  description?: string;
  title?: string;
}

interface RootSchema extends JsonSchema {
  $defs?: Record<string, JsonSchema>;
}

function refName(ref: string): string {
  const m = /^#\/\$defs\/(.+)$/.exec(ref);
  if (!m) throw new Error(`unsupported $ref: ${ref}`);
  return m[1]!;
}

/** Renders a schema node as a TypeScript type expression. */
function tsType(schema: JsonSchema, role: ContractRole): string {
  if (schema.$ref) return refName(schema.$ref);

  if (schema.const !== undefined) return JSON.stringify(schema.const);

  if (schema.enum) {
    return schema.enum.map((v) => JSON.stringify(v)).join(" | ");
  }

  if (schema.anyOf) {
    return schema.anyOf.map((s) => tsType(s, role)).join(" | ");
  }

  // Discriminated union (Pydantic `Field(discriminator=...)`). Each variant carries a
  // `const` on the discriminator property, so a plain union narrows correctly in TS via
  // `switch (op.payload.type)`. The `discriminator` keyword is validation metadata only —
  // it adds nothing to the emitted type, but its ABSENCE would mean an undiscriminated
  // oneOf (mutually-exclusive, not expressible as a plain union), which we refuse.
  if (schema.oneOf) {
    if (!schema.discriminator) {
      throw new Error(
        `undiscriminated oneOf is not supported (a plain TS union would widen it): ` +
          JSON.stringify(schema).slice(0, 200),
      );
    }
    return schema.oneOf.map((s) => tsType(s, role)).join(" | ");
  }

  if (schema.type === "array") {
    if (!schema.items) throw new Error("array schema missing items");
    const inner = tsType(schema.items, role);
    // parenthesize unions so `A | B[]` reads as `(A | B)[]`
    const needsParens = inner.includes("|");
    return `${needsParens ? `(${inner})` : inner}[]`;
  }

  if (schema.type === "object") {
    if (schema.properties) return renderInlineObject(schema, role);
    if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
      return `Record<string, ${tsType(schema.additionalProperties, role)}>`;
    }
    return "Record<string, unknown>";
  }

  switch (schema.type) {
    case "string":
      return "string";
    case "integer":
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "null":
      return "null";
    default:
      throw new Error(`unsupported schema node: ${JSON.stringify(schema)}`);
  }
}

function renderInlineObject(schema: JsonSchema, role: ContractRole): string {
  const props = schema.properties ?? {};
  const required = new Set(schema.required ?? []);
  const lines = Object.entries(props).map(
    ([name, prop]) =>
      `${quoteKey(name)}${required.has(name) || isAlwaysPresent(prop, role) ? "" : "?"}: ${tsType(
        prop,
        role,
      )}`,
  );
  return `{ ${lines.join("; ")} }`;
}

/** `async` and friends are valid TS property names, but a hyphen/keyword-shaped wire key
 *  is not — quote anything that is not a plain identifier. */
function quoteKey(name: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name);
}

function jsdoc(description: string, indent = ""): string {
  const lines = description.split("\n").map((l) => l.trimEnd());
  return [`${indent}/**`, ...lines.map((l) => `${indent} * ${l}`), `${indent} */`].join("\n") + "\n";
}

/**
 * Is this property always present on the wire?
 *
 * Pydantic omits a defaulted field from `required`, but the service serializes with
 * `model_dump()` — so a field with a NON-NULL default (`[]`, `0`, `"sse"`, a `const`
 * discriminator) is emitted every time. Rendering those optional was pure friction: it
 * forced `?? []` / non-null assertions at ~20 call sites for values that cannot be absent,
 * and it broke discriminated-union narrowing at every `switch (op.payload.type)`.
 *
 * A `null` default is the opposite case and stays optional: those are the fields the
 * service actively drops (`/v1/version` dumps with `exclude_none`, so e.g.
 * `layoutEngineVersion` and `capabilities.layout` really are absent when layout is off —
 * which is exactly what the desktop's capability gate keys on).
 */
function isAlwaysPresent(prop: JsonSchema, role: ContractRole): boolean {
  if (prop.const !== undefined) return true; // a literal discriminator is never omitted
  if (role === "request") return false;
  return "default" in prop && prop.default !== null;
}

function renderInterface(name: string, schema: JsonSchema, role: ContractRole): string {
  const props = schema.properties ?? {};
  const required = new Set(schema.required ?? []);
  const doc = schema.description ? jsdoc(schema.description) : "";
  const fields = Object.entries(props)
    .map(([fieldName, prop]) => {
      const fieldDoc = prop.description ? jsdoc(prop.description, "  ") : "";
      const optional = required.has(fieldName) || isAlwaysPresent(prop, role) ? "" : "?";
      return `${fieldDoc}  ${quoteKey(fieldName)}${optional}: ${tsType(prop, role)};`;
    })
    .join("\n");
  return `${doc}export interface ${name} {\n${fields}\n}\n`;
}

function rootExportName(spec: ContractSpec, root: RootSchema): string {
  const name = spec.rootName ?? root.title;
  if (!name) throw new Error(`${spec.schema}: no rootName and no schema title`);
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) {
    throw new Error(`${spec.schema}: unusable root type name ${JSON.stringify(name)}`);
  }
  return name;
}

function generate(spec: ContractSpec, root: RootSchema): string {
  const rootName = rootExportName(spec, root);
  const role: ContractRole = spec.role ?? "response";
  const header = `// GENERATED FILE — DO NOT EDIT.
//
// Source: src/sdks/designer/contracts/${spec.schema} (vendored from cloud-auto-layout's
// \`contracts/${spec.schema}\` — see that dir's README.md for provenance + sync instructions).
//
// Regenerate with \`npm run gen:contracts\` after re-vendoring the schema.
// \`npm run gen:contracts -- --check\` fails CI on drift.
${spec.note ? `//\n${spec.note.split("\n").map((l) => `// ${l}`).join("\n")}\n` : ""}
`;
  const defs = Object.entries(root.$defs ?? {})
    .map(([name, def]) => renderInterface(name, def, role))
    .join("\n");
  const rootIface = renderInterface(rootName, root, role);
  return header + (defs ? defs + "\n" : "") + rootIface;
}

async function renderContract(spec: ContractSpec): Promise<string> {
  const raw = await fs.readFile(path.join(SCHEMA_DIR, spec.schema), "utf8");
  const root = JSON.parse(raw) as RootSchema;
  try {
    return generate(spec, root);
  } catch (err) {
    throw new Error(`${spec.schema}: ${(err as Error).message}`);
  }
}

async function main() {
  const checkOnly = process.argv.includes("--check");
  if (!checkOnly) await fs.mkdir(GENERATED_DIR, { recursive: true });

  let drifted = 0;
  for (const spec of CONTRACTS) {
    const generated = await renderContract(spec);
    const outPath = path.join(ROOT, spec.output);

    if (!checkOnly) {
      await fs.writeFile(outPath, generated, "utf8");
      console.log(`wrote ${spec.output}`);
      continue;
    }

    let existing = "";
    try {
      existing = await fs.readFile(outPath, "utf8");
    } catch {
      // missing file — treated as drift below
    }
    if (existing !== generated) {
      console.error(`Contract codegen drift: ${spec.output} is stale.`);
      drifted += 1;
    }
  }

  if (checkOnly) {
    if (drifted > 0) {
      console.error(
        `${drifted} generated contract file(s) stale. ` +
          `Run \`npm run gen:contracts\` and commit the result.`,
      );
      process.exitCode = 1;
      return;
    }
    console.log(`${CONTRACTS.length} generated contract files are up to date`);
  }
}

await main();
