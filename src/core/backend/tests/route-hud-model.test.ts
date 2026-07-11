import { describe, expect, test } from "bun:test";
import {
  buildRouteHudModel,
  routeLengthMm,
} from "../../../modules/designer/frontend/pcb/tools/route-hud-model";
import { routeKeyHints } from "../../../modules/designer/frontend/pcb/tools/route-keymap";
import type { RouteSession } from "../../../modules/designer/frontend/pcb/tools/route-tool-state";
import type { PcbNetClass } from "../../../sdks/designer";

const NET_CLASS: PcbNetClass = {
  id: "nc-power",
  name: "Power",
  traceWidthMm: 0.5,
  clearanceMm: 0.2,
  viaDiameterMm: 0.8,
  viaDrillMm: 0.4,
  color: "#fff",
  defaultViaProtection: "tented",
};

function session(overrides: Partial<RouteSession> = {}): RouteSession {
  return {
    anchorNm: { x: 0, y: 0 },
    waypointsNm: [],
    layer: "F.Cu",
    segmentMode: "manhattan-45",
    netId: "net-1",
    netClassId: "nc-power",
    widthMm: 0.5,
    widthSource: "netclass",
    posture: "auto",
    ...overrides,
  };
}

describe("routeLengthMm", () => {
  test("sums polyline segments in mm", () => {
    expect(
      routeLengthMm([
        { x: 0, y: 0 },
        { x: 3_000_000, y: 0 },
        { x: 3_000_000, y: 4_000_000 },
      ]),
    ).toBeCloseTo(7, 9);
  });

  test("degenerate paths have zero length", () => {
    expect(routeLengthMm([])).toBe(0);
    expect(routeLengthMm([{ x: 5, y: 5 }])).toBe(0);
  });
});

describe("buildRouteHudModel", () => {
  test("attributes width and via sizes to the net class", () => {
    const model = buildRouteHudModel({
      session: session(),
      previewPathNm: [
        { x: 0, y: 0 },
        { x: 10_000_000, y: 0 },
      ],
      netName: "VCC",
      netClass: NET_CLASS,
      drcConflictCount: 0,
    });
    expect(model.netName).toBe("VCC");
    expect(model.widthSource).toBe("netclass");
    expect(model.netClassName).toBe("Power");
    expect(model.viaDiameterMm).toBe(0.8);
    expect(model.viaDrillMm).toBe(0.4);
    expect(model.viaOverridden).toBe(false);
    expect(model.lengthMm).toBeCloseTo(10, 9);
    expect(model.drcConflictCount).toBe(0);
    expect(model.hints.length).toBeGreaterThan(0);
  });

  test("via overrides win over class defaults and are flagged", () => {
    const model = buildRouteHudModel({
      session: session({ viaDiameterMmOverride: 1.0 }),
      previewPathNm: [],
      netName: null,
      netClass: NET_CLASS,
      drcConflictCount: 2,
    });
    expect(model.viaDiameterMm).toBe(1.0);
    expect(model.viaDrillMm).toBe(0.4);
    expect(model.viaOverridden).toBe(true);
    expect(model.drcConflictCount).toBe(2);
  });

  test("missing net class degrades gracefully", () => {
    const model = buildRouteHudModel({
      session: session({ widthSource: "manual" }),
      previewPathNm: [],
      netName: null,
      netClass: null,
      drcConflictCount: 0,
    });
    expect(model.netClassName).toBeNull();
    expect(model.viaDiameterMm).toBeNull();
    expect(model.widthSource).toBe("manual");
  });
});

describe("routeKeyHints", () => {
  test("primary set is compact and session-gated", () => {
    const primary = routeKeyHints({ routing: true, primaryOnly: true });
    expect(primary.length).toBeGreaterThanOrEqual(4);
    expect(primary.length).toBeLessThanOrEqual(6);
    expect(primary.map((h) => h.keys)).toContain("Enter");
  });

  test("idle hides session-only keys", () => {
    const idle = routeKeyHints({ routing: false, primaryOnly: false });
    expect(idle.every((h) => h.requiresSession !== true)).toBe(true);
  });
});
