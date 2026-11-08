import { describe, expect, test } from "bun:test";
import { createRequire } from "node:module";
import {
  TSCIRCUIT_LIMITS,
  TSCIRCUIT_PROTOCOL_VERSION,
  TSCIRCUIT_RUNTIME_VERSIONS,
} from "./protocol";
import { mmToNmChecked, validateCircuitJsonPreview } from "./preview";

describe("Circuit Engine protocol", () => {
  test("keeps root Zod 4 isolated from runtime Zod 3", () => {
    const runtimeRequire = createRequire(import.meta.url);
    const rootRequire = createRequire(
      new URL("../../../package.json", import.meta.url),
    );
    expect(rootRequire("zod/package.json").version.startsWith("4.")).toBe(true);
    expect(runtimeRequire("zod/package.json").version).toBe("3.25.76");
  });

  test("pins a versioned, finite, offline preview contract", () => {
    expect(TSCIRCUIT_PROTOCOL_VERSION).toBe("1.0.0");
    expect(TSCIRCUIT_RUNTIME_VERSIONS).toEqual({
      circuitJson: "0.0.489",
      zod: "3.25.76",
    });
    expect(TSCIRCUIT_LIMITS.maxPayloadBytes).toBeGreaterThan(0);
    expect(TSCIRCUIT_LIMITS.requestTimeoutMs).toBeLessThanOrEqual(8_000);
  });

  test("converts millimetres to checked integer nanometres", () => {
    expect(mmToNmChecked(1.234567)).toBe(1_234_567);
    expect(mmToNmChecked(-0.000001)).toBe(-1);
    expect(() =>
      mmToNmChecked(TSCIRCUIT_LIMITS.maxCoordinateAbsMm + 1),
    ).toThrow("exceeds");
  });

  test("validates without applying and reports unsupported geometry", async () => {
    const report = await validateCircuitJsonPreview(
      JSON.stringify([
        {
          type: "pcb_component",
          pcb_component_id: "pc1",
          center: { x: 1.25, y: -2.5 },
          width: 10,
          height: 5,
        },
        {
          type: "pcb_trace",
          pcb_trace_id: "pt1",
          route: [
            { route_type: "wire", x: 0, y: 0, width: 0.2, layer: "top" },
            { route_type: "wire", x: 1, y: 2, width: 0.2, layer: "top" },
          ],
        },
        {
          type: "pcb_keepout",
          pcb_keepout_id: "ko1",
          center: { x: 3, y: 4 },
          width: 1,
          height: 1,
        },
        {
          type: "source_trace",
          source_trace_id: "st1",
          connected_source_port_ids: [],
          connected_source_net_ids: [],
        },
      ]),
    );

    expect(report.valid).toBe(true);
    expect(report.authorityMode).toBe("native");
    expect(report.nativeMaterialization.canApply).toBe(false);
    expect(report.convertedMmValueCount).toBeGreaterThan(0);
    expect(report.boundsNm).toEqual({
      minX: 0,
      minY: -2_500_000,
      maxX: 3_000_000,
      maxY: 4_000_000,
    });
    expect(report.unsupportedGeometry.map((issue) => issue.category)).toEqual([
      "connectivity",
      "copper",
      "keepout",
    ]);
  });

  test("rejects malformed Circuit JSON and supports cancellation", async () => {
    const malformed = await validateCircuitJsonPreview("{not json");
    expect(malformed.valid).toBe(false);
    expect(malformed.errors[0]).toStartWith("Invalid JSON:");

    await expect(
      validateCircuitJsonPreview("[]", { isCancelled: () => true }),
    ).rejects.toMatchObject({ code: "cancelled" });
  });
});
