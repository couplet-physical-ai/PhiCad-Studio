#!/usr/bin/env bun
// Re-baseline the DRC golden-board expectations. A failing golden test must be
// a CONSCIOUS decision — run this only after verifying the report diff is the
// intended behavior change, then commit fixture + expected together.
//
//   bun run scripts/update-drc-goldens.ts
import { readdirSync } from "node:fs";
import * as path from "node:path";
import { runDrc } from "../src/modules/designer/backend/drc/drc-engine";
import { fixtureToProjection } from "../src/core/backend/tests/helpers/drc-golden";

const GOLDEN_DIR = path.resolve(
  import.meta.dir,
  "../src/core/backend/tests/fixtures/drc/golden",
);

for (const file of readdirSync(GOLDEN_DIR).sort()) {
  if (!file.endsWith(".json") || file.endsWith(".expected.json")) continue;
  const fixturePath = path.join(GOLDEN_DIR, file);
  const fixture = JSON.parse(await Bun.file(fixturePath).text());
  const report = runDrc(fixtureToProjection(fixture));
  const expected = {
    summary: report.summary,
    countsByCode: report.countsByCode,
    violationIds: report.violations.map((v) => v.id).sort(),
  };
  const outPath = fixturePath.replace(/\.json$/, ".expected.json");
  await Bun.write(outPath, `${JSON.stringify(expected, null, 1)}\n`);
  console.log(
    `${path.basename(outPath)}: ${report.summary.errors} errors / ${report.summary.warnings} warnings / ${expected.violationIds.length} violations`,
  );
}
