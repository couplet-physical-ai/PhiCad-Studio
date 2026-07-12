/**
 * DRC determinism contract (DRC_AUDIT_REPORT.md §3.3, Appendix A — permanent
 * port of the audit probe):
 *
 *  1. Identical input (independent clones) → byte-identical full report,
 *     including violation ids, anchors, locations, messages, summary and
 *     countsByCode key order.
 *  2. Reordered input arrays → identical sorted violation-id multiset and
 *     value-equal countsByCode/summary. Array ORDER of violations may differ
 *     (presentation follows input order); ids may not.
 *
 * If (1) breaks, something non-deterministic (Date, randomness, unordered
 * iteration) entered the engine. If (2) breaks, violation ids stopped being
 * order-independent — persisted waivers would silently detach.
 */
import { describe, expect, test } from "bun:test";
import { runDrc } from "../../../modules/designer/backend/drc/drc-engine";
import type { DesignerPcbProjection } from "../../../sdks/designer";
import {
  boardWithRules,
  pad,
  placement,
  projection,
  ratsSeg,
  sortedIds,
  trace,
  via,
} from "./helpers/drc-fixtures";

/**
 * Non-trivial fixture: 3 nets, both outer layers, a clearance breach, two
 * different-net crossings (shorts), an under-width trace, trace-to-pad
 * breaches, a via-to-via breach and an unconnected net. The suite requires
 * >= 5 violations across >= 3 distinct codes so a silent fixture regression
 * cannot hollow the byte-identity assertion out.
 */
function buildFixture(): DesignerPcbProjection {
  return projection({
    board: boardWithRules({
      clearance: { traceToTraceMm: 0.25, viaToViaMm: 0.3, traceToPadMm: 0.25 },
      minimums: { traceWidthMm: 0.2 },
    }),
    netNames: { n1: "VCC", n2: "SIG_A", n3: "SIG_B" },
    traces: [
      // n1/n2 parallel pair on F.Cu with 0.2 mm edge gap (< 0.25 rule).
      trace("tA", "n1", [
        [0, 0],
        [10, 0],
      ]),
      trace("tB", "n2", [
        [0, 0.4],
        [10, 0.4],
      ]),
      // n3 crosses both -> two different-net shorts.
      trace("tC", "n3", [
        [5, -2],
        [5, 2],
      ]),
      // Under-width trace on B.Cu (0.1 < 0.2 min).
      trace("tD", "n2", [[0, 5], [10, 5]], { widthMm: 0.1, layer: "B.Cu" }),
      // Trace running close under both U1 pads.
      trace("tE", "n2", [
        [19, 10.15],
        [23, 10.15],
      ]),
    ],
    vias: [
      via("v1", { netId: "n1", center: { x: 30, y: 0 } }),
      // 0.1 mm edge gap to v1 (< 0.3 viaToVia rule).
      via("v2", { netId: "n2", center: { x: 30, y: 0.9 } }),
    ],
    placements: [
      placement("U1", {
        positionMm: { x: 20, y: 10 },
        pads: [pad("1", { x: 0, y: 0 }, 1, 1), pad("2", { x: 2, y: 0 }, 1, 1)],
      }),
    ],
    padNets: { "U1|1": "n1", "U1|2": "n3" },
    ratsnest: [ratsSeg("n3", { x: 22, y: 10 }, { x: 5, y: 0 })],
  });
}

function reversedFixture(): DesignerPcbProjection {
  const p = buildFixture();
  p.traces = [...p.traces].reverse();
  p.vias = [...p.vias].reverse();
  p.placements = [...p.placements].reverse();
  return p;
}

describe("DRC determinism", () => {
  test("fixture is non-trivial (>=5 violations, >=3 codes)", () => {
    const report = runDrc(buildFixture());
    expect(report.violations.length).toBeGreaterThanOrEqual(5);
    const codes = new Set(report.violations.map((v) => v.code));
    expect(codes.size).toBeGreaterThanOrEqual(3);
  });

  test("identical input -> byte-identical full report", () => {
    const fixture = buildFixture();
    const r1 = runDrc(structuredClone(fixture));
    const r2 = runDrc(structuredClone(fixture));
    const s1 = JSON.stringify(r1);
    const s2 = JSON.stringify(r2);
    // Buffer compare = byte identity incl. key order, not deep equality.
    expect(Buffer.compare(Buffer.from(s1), Buffer.from(s2))).toBe(0);
  });

  test("re-serialized fixture (JSON round-trip) -> byte-identical report", () => {
    const fixture = buildFixture();
    const viaJson = JSON.parse(
      JSON.stringify(fixture),
    ) as DesignerPcbProjection;
    expect(JSON.stringify(runDrc(viaJson))).toBe(
      JSON.stringify(runDrc(fixture)),
    );
  });

  test("reversed input arrays -> identical id multiset and counts", () => {
    const r1 = runDrc(buildFixture());
    const r2 = runDrc(reversedFixture());
    expect(sortedIds(r2)).toEqual(sortedIds(r1));
    expect(r2.summary).toEqual(r1.summary);
    // Value equality (key order may legitimately differ across input orders).
    expect(r2.countsByCode).toEqual(r1.countsByCode);
  });

  test("reversed input preserves per-id content (message, location, severity)", () => {
    const byId = (vs: ReturnType<typeof runDrc>["violations"]) =>
      new Map(vs.map((v) => [v.id, v]));
    const m1 = byId(runDrc(buildFixture()).violations);
    const m2 = byId(runDrc(reversedFixture()).violations);
    expect(m2.size).toBe(m1.size);
    for (const [id, v1] of m1) {
      const v2 = m2.get(id);
      expect(v2).toBeDefined();
      expect(v2!.code).toBe(v1.code);
      expect(v2!.severity).toBe(v1.severity);
      expect(v2!.message).toBe(v1.message);
      // Marker locations are ULP-stable, not bit-stable, under input
      // reordering: polylineToPolylineClosestPoints(a,b) vs (b,a) can differ
      // in the last float bit (observed: 0.39999999999999997 vs …99).
      const l1 = v1.locationMm;
      const l2 = v2!.locationMm;
      expect(l1).toBeDefined();
      expect(l2).toBeDefined();
      expect(Math.abs(l2!.x - l1!.x)).toBeLessThan(1e-9);
      expect(Math.abs(l2!.y - l1!.y)).toBeLessThan(1e-9);
      expect(v2!.measuredMm ?? null).toBe(v1.measuredMm ?? null);
      expect(v2!.requiredMm ?? null).toBe(v1.requiredMm ?? null);
    }
  });
});
