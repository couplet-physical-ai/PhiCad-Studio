/**
 * P3 — severity model + violation-id v2.
 */
import { describe, expect, test } from "bun:test";
import { runDrc } from "../../../modules/designer/backend/drc/drc-engine";
import { computeViolationId } from "../../../modules/designer/backend/drc/violation-id";
import { boardWithRules, codes, projection, trace, via } from "./helpers/drc-fixtures";

// Two different-net traces below the clearance rule → one clearance error.
function clearancePair() {
  return projection({
    netNames: { n1: "A", n2: "B" },
    traces: [
      trace("a", "n1", [[0, 0], [10, 0]]),
      trace("b", "n2", [[0, 0.4], [10, 0.4]]),
    ],
  });
}

describe("DRC severity — defaults", () => {
  test("COPPER_TO_BOARD_EDGE defaults to error (KiCad-aligned)", () => {
    // Trace hugging the default 50×30 board edge.
    const report = runDrc(
      projection({ traces: [trace("t", "n1", [[-24.7, 0], [24.7, 0]])] }),
    );
    const v = report.violations.find((x) => x.code === "COPPER_TO_BOARD_EDGE");
    expect(v?.severity).toBe("error");
  });

  test("UNCONNECTED_NET defaults to error", () => {
    const report = runDrc(
      projection({
        netNames: { n1: "SIG" },
        ratsnest: [
          {
            netId: "n1",
            netClassId: "default",
            fromMm: { x: 0, y: 0 },
            toMm: { x: 5, y: 0 },
            fromPlacementId: "A",
            fromPadNumber: "1",
            toPlacementId: "B",
            toPadNumber: "1",
          },
        ],
      }),
    );
    const v = report.violations.find((x) => x.code === "UNCONNECTED_NET");
    expect(v?.severity).toBe("error");
  });
});

describe("DRC severity — overrides", () => {
  test("override downgrades a code's severity", () => {
    const report = runDrc(clearancePair(), {
      severityOverrides: { TRACE_TO_TRACE_CLEARANCE: "warning" },
    });
    const v = report.violations.find(
      (x) => x.code === "TRACE_TO_TRACE_CLEARANCE",
    );
    expect(v?.severity).toBe("warning");
    expect(report.summary.errors).toBe(0);
    expect(report.summary.warnings).toBeGreaterThan(0);
  });

  test('"ignore" drops the code entirely', () => {
    const report = runDrc(clearancePair(), {
      severityOverrides: { TRACE_TO_TRACE_CLEARANCE: "ignore" },
    });
    expect(codes(report)).not.toContain("TRACE_TO_TRACE_CLEARANCE");
  });

  test("NET_SHORT_CIRCUIT override is ignored (non-overridable)", () => {
    const shortReport = runDrc(
      projection({
        netNames: { n1: "A", n2: "B" },
        traces: [
          trace("a", "n1", [[0, 0], [10, 0]]),
          trace("b", "n2", [[5, -2], [5, 2]]),
        ],
      }),
      { severityOverrides: { NET_SHORT_CIRCUIT: "ignore" } },
    );
    const v = shortReport.violations.find((x) => x.code === "NET_SHORT_CIRCUIT");
    expect(v).toBeDefined();
    expect(v!.severity).toBe("error");
  });
});

describe("violation-id v2", () => {
  test("id format is <CODE>-v2-<16hex>", () => {
    const id = computeViolationId({
      code: "TRACE_TO_TRACE_CLEARANCE",
      anchors: [{ kind: "trace", traceId: "a" }, { kind: "trace", traceId: "b" }],
      layer: "F.Cu",
      locationMm: { x: 1, y: 1 },
    });
    expect(id).toMatch(/^TRACE_TO_TRACE_CLEARANCE-v2-[0-9a-f]{16}$/);
  });

  test("anchor order does not change the id", () => {
    const a = computeViolationId({
      code: "NET_SHORT_CIRCUIT",
      anchors: [{ kind: "trace", traceId: "a" }, { kind: "trace", traceId: "b" }],
      layer: "F.Cu",
      locationMm: { x: 1, y: 1 },
    });
    const b = computeViolationId({
      code: "NET_SHORT_CIRCUIT",
      anchors: [{ kind: "trace", traceId: "b" }, { kind: "trace", traceId: "a" }],
      layer: "F.Cu",
      locationMm: { x: 1, y: 1 },
    });
    expect(a).toBe(b);
  });

  test("same pair on different layers gets distinct ids (B3-7)", () => {
    const anchors = [{ kind: "net" as const, netId: "gnd" }];
    const fCu = computeViolationId({ code: "ISOLATED_COPPER_ISLAND", anchors, layer: "F.Cu" });
    const bCu = computeViolationId({ code: "ISOLATED_COPPER_ISLAND", anchors, layer: "B.Cu" });
    expect(fCu).not.toBe(bCu);
  });

  test("hot-spot codes: same 0.1mm bucket keeps id, a real move changes it", () => {
    const at = (x: number) =>
      computeViolationId({
        code: "TRACE_TO_TRACE_CLEARANCE",
        anchors: [{ kind: "trace", traceId: "a" }, { kind: "trace", traceId: "b" }],
        layer: "F.Cu",
        locationMm: { x, y: 0 },
      });
    expect(at(1.0)).toBe(at(1.04)); // same 0.1mm bucket
    expect(at(1.0)).not.toBe(at(9.0)); // moved to a different hot-spot
  });

  test("location is NOT hashed for non-hot-spot codes", () => {
    const at = (x: number) =>
      computeViolationId({
        code: "UNCONNECTED_NET",
        anchors: [{ kind: "net", netId: "n1" }],
        locationMm: { x, y: 0 },
      });
    expect(at(1)).toBe(at(50)); // airwire midpoint volatility must not expire waivers
  });
});
