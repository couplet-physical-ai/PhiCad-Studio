#!/usr/bin/env bun
// Contract-type codegen — turns the vendored service JSON Schema
// (src/sdks/designer/contracts/BoardSnapshot.schema.json) into a TypeScript
// mirror (src/sdks/designer/board-snapshot.generated.ts), so the hand-written
// `BoardSnapshot` in autoroute.ts can be checked against it for structural
// drift (see board-snapshot.assert.ts).
//
// Bespoke generator, not a `json-schema-to-typescript` dependency: that
// package isn't installed anywhere in this repo (checked node_modules +
// every package.json before writing this), and pulling in a new dependency
// for one narrow, well-understood Pydantic-emitted schema shape (draft
// 2020-12, `$defs` + `$ref` + `anyOf`-nullable + `enum`/`const`, no
// `oneOf`/`patternProperties`/`$dynamicRef`) is more machinery than the
// problem needs. If the vendored schema ever grows features this generator
// doesn't understand, `--check` fails loudly (a schema type falls through to
// `unknown`) rather than silently mis-generating — that's the signal to
// either extend this file or reconsider the dependency.
//
//   bun scripts/gen-contract-types.ts            # regenerate in place
//   bun scripts/gen-contract-types.ts --check     # diff-only, exit 1 on drift
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), "..");
const SCHEMA_PATH = path.join(
  ROOT,
  "src/sdks/designer/contracts/BoardSnapshot.schema.json",
);
const OUTPUT_PATH = path.join(
  ROOT,
  "src/sdks/designer/board-snapshot.generated.ts",
);

// ── minimal JSON Schema (2020-12, Pydantic-flavored) type model ──────────

interface JsonSchema {
  $ref?: string;
  type?: string | string[];
  enum?: (string | number | boolean)[];
  const?: string | number | boolean;
  anyOf?: JsonSchema[];
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
  additionalProperties?: JsonSchema | boolean;
  required?: string[];
  description?: string;
  title?: string;
}

interface RootSchema extends JsonSchema {
  $defs: Record<string, JsonSchema>;
}

function refName(ref: string): string {
  const m = /^#\/\$defs\/(.+)$/.exec(ref);
  if (!m) throw new Error(`unsupported $ref: ${ref}`);
  return m[1]!;
}

/** Renders a schema node as a TypeScript type expression. */
function tsType(schema: JsonSchema): string {
  if (schema.$ref) return refName(schema.$ref);

  if (schema.const !== undefined) return JSON.stringify(schema.const);

  if (schema.enum) {
    return schema.enum.map((v) => JSON.stringify(v)).join(" | ");
  }

  if (schema.anyOf) {
    return schema.anyOf.map(tsType).join(" | ");
  }

  if (schema.type === "array") {
    if (!schema.items) throw new Error("array schema missing items");
    const inner = tsType(schema.items);
    // parenthesize unions so `A | B[]` reads as `(A | B)[]`
    const needsParens = inner.includes("|");
    return `${needsParens ? `(${inner})` : inner}[]`;
  }

  if (schema.type === "object") {
    if (schema.properties) return renderInlineObject(schema);
    if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
      return `Record<string, ${tsType(schema.additionalProperties)}>`;
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

function renderInlineObject(schema: JsonSchema): string {
  const props = schema.properties ?? {};
  const required = new Set(schema.required ?? []);
  const lines = Object.entries(props).map(
    ([name, prop]) => `${name}${required.has(name) ? "" : "?"}: ${tsType(prop)}`,
  );
  return `{ ${lines.join("; ")} }`;
}

function jsdoc(description: string, indent = ""): string {
  const lines = description.split("\n").map((l) => l.trimEnd());
  return [`${indent}/**`, ...lines.map((l) => `${indent} * ${l}`), `${indent} */`].join("\n") + "\n";
}

function renderInterface(name: string, schema: JsonSchema): string {
  const props = schema.properties ?? {};
  const required = new Set(schema.required ?? []);
  const doc = schema.description ? jsdoc(schema.description) : "";
  const fields = Object.entries(props)
    .map(([fieldName, prop]) => {
      const fieldDoc = prop.description ? jsdoc(prop.description, "  ") : "";
      const optional = required.has(fieldName) ? "" : "?";
      return `${fieldDoc}  ${fieldName}${optional}: ${tsType(prop)};`;
    })
    .join("\n");
  return `${doc}export interface ${name} {\n${fields}\n}\n`;
}

function generate(root: RootSchema): string {
  const header = `// GENERATED FILE — DO NOT EDIT.
//
// Source: src/sdks/designer/contracts/BoardSnapshot.schema.json (vendored from
// cloud-auto-layout's \`contracts/BoardSnapshot.schema.json\` — see that dir's
// README.md for provenance + sync instructions).
//
// Regenerate with \`bun scripts/gen-contract-types.ts\` (or \`npm run gen:contracts\`)
// after re-vendoring the schema. \`npm run gen:contracts -- --check\` fails CI on drift.
//
// These interfaces are the schema-literal mirror, generated independently of
// the hand-written wire types in ./autoroute.ts — names intentionally collide
// with those (e.g. \`Placement\`, \`Stackup\`) since both describe the same
// service contract, so this module is NOT re-exported from ./index.ts. Compare
// the two via ./board-snapshot.assert.ts, importing this file under a namespace.

`;
  const defNames = Object.keys(root.$defs);
  const defs = defNames.map((name) => renderInterface(name, root.$defs[name]!)).join("\n");
  const rootIface = renderInterface("BoardSnapshot", root);
  return header + defs + "\n" + rootIface;
}

async function main() {
  const checkOnly = process.argv.includes("--check");
  const raw = await fs.readFile(SCHEMA_PATH, "utf8");
  const root = JSON.parse(raw) as RootSchema;
  const generated = generate(root);

  if (!checkOnly) {
    await fs.writeFile(OUTPUT_PATH, generated, "utf8");
    console.log(`wrote ${path.relative(ROOT, OUTPUT_PATH)}`);
    return;
  }

  let existing = "";
  try {
    existing = await fs.readFile(OUTPUT_PATH, "utf8");
  } catch {
    // missing file — treated as drift below
  }
  if (existing !== generated) {
    console.error(
      `Contract codegen drift: ${path.relative(ROOT, OUTPUT_PATH)} is stale.\n` +
        `Run \`bun scripts/gen-contract-types.ts\` and commit the result.`,
    );
    process.exitCode = 1;
    return;
  }
  console.log(`${path.relative(ROOT, OUTPUT_PATH)} is up to date`);
}

await main();
