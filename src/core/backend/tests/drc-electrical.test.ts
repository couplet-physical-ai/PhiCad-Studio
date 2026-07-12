/**
 * P10 — electrical checks: IPC-2221 creepage/clearance-by-voltage and the
 * IPC-2221 current-vs-trace-width check.
 */
import { describe, expect, test } from "bun:test";
import { runDrc } from "../../../modules/designer/backend/drc/drc-engine";
import {
  ipc2221SpacingMm,
  requiredTraceWidthMm,
} from "../../../modules/designer/backend/drc/ipc2221-spacing";
import type { PcbBoardSettings, PcbNetClass } from "../../../sdks/designer";
import { board, codes, projection, trace } from "./helpers/drc-fixtures";

const hv: PcbNetClass = {
  id: "hv",
  name: "HV",
  traceWidthMm: 0.25,
  clearanceMm: 0.2,
  viaDiameterMm: 0.8,
  viaDrillMm: 0.4,
  color: "#f00",
  defaultViaProtection: "tented",
  voltageV: 400,
};

const power: PcbNetClass = {
  id: "pwr",
  name: "PWR",
  traceWidthMm: 0.25,
  clearanceMm: 0.2,
  viaDiameterMm: 0.8,
  viaDrillMm: 0.4,
  color: "#fa0",
  defaultViaProtection: "tented",
  currentA: 3,
};

function boardWith(classes: PcbNetClass[], assign: Record<string, string>): PcbBoardSettings {
  const base = board();
  return {
    ...base,
    netClasses: [...base.netClasses, ...classes],
    perNetClassAssignments: assign,
  };
}

describe("IPC-2221 tables", () => {
  test("Table 6-1 external spacing grows with voltage", () => {
    expect(ipc2221SpacingMm(10, "B2")).toBe(0.1);
    expect(ipc2221SpacingMm(400, "B2")).toBe(2.5);
    expect(ipc2221SpacingMm(10, "B1")).toBe(0.05); // internal tighter
  });

  test("above 500 V uses the per-volt formula", () => {
    expect(ipc2221SpacingMm(1000, "B2")).toBeCloseTo(2.5 + 0.005 * 500, 6);
  });

  test("current-width: 1 A external ~ 0.3 mm at 10 °C, 1 oz", () => {
    const w = requiredTraceWidthMm(1, 10, 1, false);
    expect(w).toBeGreaterThan(0.2);
    expect(w).toBeLessThan(0.5);
  });

  test("internal traces need wider copper than external", () => {
    expect(requiredTraceWidthMm(2, 10, 1, true)).toBeGreaterThan(
      requiredTraceWidthMm(2, 10, 1, false),
    );
  });
});

describe("DRC — creepage (IPC-2221)", () => {
  test("400 V net 1 mm from a 0 V trace on F.Cu → CREEPAGE_DISTANCE", () => {
    const report = runDrc(
      projection({
        board: boardWith([hv], { hvnet: "hv" }),
        netNames: { hvnet: "HV_RAIL", sig: "SIG" },
        traces: [
          trace("hv", "hvnet", [[0, 0], [10, 0]]),
          // edge gap ~1 mm < 2.5 mm required for 400 V
          trace("sig", "sig", [[0, 1.25], [10, 1.25]]),
        ],
      }),
    );
    expect(codes(report)).toContain("CREEPAGE_DISTANCE");
  });

  test("low-voltage pair within base clearance → no CREEPAGE (covered by clearance)", () => {
    const lv: PcbNetClass = { ...hv, id: "lv", name: "LV", voltageV: 5 };
    const report = runDrc(
      projection({
        board: boardWith([lv], { a: "lv" }),
        netNames: { a: "A", b: "B" },
        traces: [
          trace("ta", "a", [[0, 0], [10, 0]]),
          trace("tb", "b", [[0, 1], [10, 1]]),
        ],
      }),
    );
    expect(codes(report)).not.toContain("CREEPAGE_DISTANCE");
  });

  test("creepage clears at adequate spacing (3 mm ≥ 2.5 mm)", () => {
    const report = runDrc(
      projection({
        board: boardWith([hv], { hvnet: "hv" }),
        netNames: { hvnet: "HV_RAIL", sig: "SIG" },
        traces: [
          trace("hv", "hvnet", [[0, 0], [10, 0]]),
          trace("sig", "sig", [[0, 3.2], [10, 3.2]]),
        ],
      }),
    );
    expect(codes(report)).not.toContain("CREEPAGE_DISTANCE");
  });
});

describe("DRC — current vs width (IPC-2221)", () => {
  test("3 A net routed at 0.3 mm → TRACE_CURRENT_WIDTH", () => {
    const report = runDrc(
      projection({
        board: boardWith([power], { p: "pwr" }),
        netNames: { p: "PWR" },
        traces: [trace("t", "p", [[0, 0], [10, 0]], { widthMm: 0.3 })],
      }),
    );
    expect(codes(report)).toContain("TRACE_CURRENT_WIDTH");
  });

  test("adequately wide power trace → no violation", () => {
    const report = runDrc(
      projection({
        board: boardWith([power], { p: "pwr" }),
        netNames: { p: "PWR" },
        traces: [trace("t", "p", [[0, 0], [10, 0]], { widthMm: 2.0 })],
      }),
    );
    expect(codes(report)).not.toContain("TRACE_CURRENT_WIDTH");
  });

  test("nets without a current rating are not width-checked", () => {
    const report = runDrc(
      projection({
        netNames: { n: "SIG" },
        traces: [trace("t", "n", [[0, 0], [10, 0]], { widthMm: 0.1 })],
      }),
    );
    expect(codes(report)).not.toContain("TRACE_CURRENT_WIDTH");
  });
});

describe("DRC — electrical determinism", () => {
  test("run twice → byte-identical", () => {
    const p = projection({
      board: boardWith([hv, power], { hvnet: "hv", p: "pwr" }),
      netNames: { hvnet: "HV_RAIL", sig: "SIG", p: "PWR" },
      traces: [
        trace("hv", "hvnet", [[0, 0], [10, 0]]),
        trace("sig", "sig", [[0, 1.25], [10, 1.25]]),
        trace("t", "p", [[0, 5], [10, 5]], { widthMm: 0.3 }),
      ],
    });
    expect(JSON.stringify(runDrc(structuredClone(p)))).toBe(
      JSON.stringify(runDrc(structuredClone(p))),
    );
  });
});
