/**
 * Golden-board suite: every fixture under fixtures/drc/golden/ runs through
 * the REAL runDrc and must reproduce its checked-in expected report exactly
 * (summary + countsByCode + sorted violation-id multiset).
 *
 * A failure here means engine behavior changed. If the change is intended,
 * re-baseline CONSCIOUSLY via `bun run scripts/update-drc-goldens.ts` and
 * commit fixture + expected together with the behavior change.
 */
import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import * as path from "node:path";
import { runDrc } from "../../../modules/designer/backend/drc/drc-engine";
import {
  fixturePrimitiveCount,
  fixtureToProjection,
} from "./helpers/drc-golden";

const GOLDEN_DIR = path.resolve(import.meta.dir, "fixtures/drc/golden");

const goldens = readdirSync(GOLDEN_DIR)
  .filter((f) => f.endsWith(".json") && !f.endsWith(".expected.json"))
  .sort();

describe("DRC golden boards", () => {
  test("corpus is non-empty", () => {
    expect(goldens.length).toBeGreaterThanOrEqual(1);
  });

  for (const file of goldens) {
    const name = file.replace(/\.json$/, "");
    test(`${name} matches its expected report`, async () => {
      const fixture = JSON.parse(
        await Bun.file(path.join(GOLDEN_DIR, file)).text(),
      );
      const expected = JSON.parse(
        await Bun.file(
          path.join(GOLDEN_DIR, `${name}.expected.json`),
        ).text(),
      );
      const projection = fixtureToProjection(fixture);
      // Non-triviality gates: a hollowed-out fixture must fail loudly.
      expect(fixturePrimitiveCount(projection)).toBeGreaterThanOrEqual(80);
      const report = runDrc(projection);
      expect(report.violations.length).toBeGreaterThanOrEqual(10);

      expect(report.summary).toEqual(expected.summary);
      expect(report.countsByCode).toEqual(expected.countsByCode);
      expect(report.violations.map((v) => v.id).sort()).toEqual(
        expected.violationIds,
      );
    });
  }
});
