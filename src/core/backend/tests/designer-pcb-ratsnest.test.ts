import { describe, expect, test } from "bun:test";
import {
  computeRatsnest,
  type RatsnestFillContext,
} from "../../../modules/designer/backend/pcb/ratsnest";
import type { NetPadCorrelation } from "../../../modules/designer/backend/pcb/net-pad-correlation";
import { createDefaultPcbBoardSettings } from "../../../modules/designer/backend/pcb/pcb-defaults";
import { findGroundNetId } from "../../../modules/designer/backend/pcb/net-class-resolver";
import type {
  PcbBoardOutline,
  PcbNetClass,
  PcbPlacedPart,
} from "../../../sdks/designer";
import type { FootprintRenderSourcePad } from "../../../shared/rendering";

const NET_CLASSES: PcbNetClass[] = [
  {
    id: "default",
    name: "Default",
    traceWidthMm: 0.25,
    clearanceMm: 0.2,
    viaDiameterMm: 0.8,
    viaDrillMm: 0.4,
    color: "#e5e7eb",
    defaultViaProtection: "tented",
  },
];

const ctx = { netNames: new Map<string, string>(), netClasses: NET_CLASSES };

describe("computeRatsnest", () => {
  test("returns empty for net with <2 pads", () => {
    const correlation: NetPadCorrelation = {
      netPads: new Map([
        [
          "net1",
          [{ placementId: "p1", padNumber: "1", worldMm: { x: 0, y: 0 } }],
        ],
      ]),
      warnings: [],
    };
    expect(computeRatsnest(correlation, ctx)).toEqual([]);
  });

  test("MST of triangle picks 2 shortest edges", () => {
    // Triangle: A(0,0) — B(3,0) — C(0,4)
    // Edges: A-B=3, A-C=4, B-C=5  → MST should pick A-B and A-C
    const correlation: NetPadCorrelation = {
      netPads: new Map([
        [
          "n1",
          [
            { placementId: "A", padNumber: "1", worldMm: { x: 0, y: 0 } },
            { placementId: "B", padNumber: "1", worldMm: { x: 3, y: 0 } },
            { placementId: "C", padNumber: "1", worldMm: { x: 0, y: 4 } },
          ],
        ],
      ]),
      warnings: [],
    };
    const segments = computeRatsnest(correlation, ctx);
    expect(segments).toHaveLength(2);
    const placements = segments
      .map((s) => `${s.fromMm.x},${s.fromMm.y}->${s.toMm.x},${s.toMm.y}`)
      .sort();
    // First MST edge: A->B (closest to seed A)
    // Second MST edge: A->C (next closest to {A,B})
    expect(placements).toContain("0,0->3,0");
    expect(placements).toContain("0,0->0,4");
  });

  test("ground nets are suppressed (handled by the copper pour)", () => {
    const correlation: NetPadCorrelation = {
      netPads: new Map([
        [
          "n-gnd",
          [
            { placementId: "A", padNumber: "2", worldMm: { x: 0, y: 0 } },
            { placementId: "B", padNumber: "2", worldMm: { x: 1, y: 0 } },
            { placementId: "C", padNumber: "2", worldMm: { x: 2, y: 0 } },
          ],
        ],
        [
          "n-sig",
          [
            { placementId: "A", padNumber: "1", worldMm: { x: 0, y: 5 } },
            { placementId: "B", padNumber: "1", worldMm: { x: 1, y: 5 } },
          ],
        ],
      ]),
      warnings: [],
    };
    const segments = computeRatsnest(correlation, {
      ...ctx,
      netNames: new Map([
        ["n-gnd", "GND"],
        ["n-sig", "SIG"],
      ]),
    });
    // GND airwires hidden (plane handles them); SIG still routed normally.
    expect(segments.filter((s) => s.netId === "n-gnd")).toHaveLength(0);
    expect(segments.filter((s) => s.netId === "n-sig")).toHaveLength(1);
  });

  test("two separate nets produce independent MSTs", () => {
    const correlation: NetPadCorrelation = {
      netPads: new Map([
        [
          "vcc",
          [
            { placementId: "A", padNumber: "1", worldMm: { x: 0, y: 0 } },
            { placementId: "B", padNumber: "1", worldMm: { x: 1, y: 0 } },
          ],
        ],
        [
          "gnd",
          [
            { placementId: "A", padNumber: "2", worldMm: { x: 0, y: 5 } },
            { placementId: "B", padNumber: "2", worldMm: { x: 1, y: 5 } },
            { placementId: "C", padNumber: "2", worldMm: { x: 2, y: 5 } },
          ],
        ],
      ]),
      warnings: [],
    };
    const segments = computeRatsnest(correlation, ctx);
    // 1 segment for vcc + 2 segments for gnd = 3
    expect(segments).toHaveLength(3);
    expect(segments.filter((s) => s.netId === "vcc")).toHaveLength(1);
    expect(segments.filter((s) => s.netId === "gnd")).toHaveLength(2);
  });
});

// --- pour-aware connectivity -----------------------------------------------

const OUTLINE: PcbBoardOutline = {
  kind: "rect",
  widthMm: 40,
  heightMm: 20,
  centerMm: { x: 0, y: 0 },
};

/** Single placement carrying GND pads "1"/"2" plus a far VCC pad "3". */
function gndPlacement(): PcbPlacedPart {
  const padPad = (
    number: string,
    x: number,
    y: number,
  ): FootprintRenderSourcePad => ({
    id: number,
    number,
    shape: "rect",
    centerMm: { x, y },
    widthMm: 2,
    heightMm: 2,
    rotationDeg: 0,
    layer: "F.Cu",
  });
  return {
    id: "U1",
    partId: "U1",
    componentId: "c1",
    reference: "U1",
    positionMm: { x: 0, y: 0 },
    rotationDeg: 0,
    mirrored: false,
    layer: "F.Cu",
    footprint: {
      footprintId: "fp1",
      name: "FP",
      mountType: "smd",
      sourceHash: null,
      preview: {
        kind: "footprint",
        units: "mm",
        name: "FP",
        pads: [padPad("1", -12, 0), padPad("2", 12, 0), padPad("3", 0, 8)],
        graphics: [],
        labels: [],
        bounds: { minX: -14, minY: -2, maxX: 14, maxY: 10 },
        warnings: [],
      },
    },
  };
}

function fillCtx(pours: RatsnestFillContext["pours"]): RatsnestFillContext {
  const board = createDefaultPcbBoardSettings(new Date().toISOString());
  return {
    outline: OUTLINE,
    designRules: board.designRules,
    placements: [gndPlacement()],
    padNetIds: new Map([
      ["U1|1", "gnd"],
      ["U1|2", "gnd"],
      ["U1|3", "vcc"],
    ]),
    pours,
  };
}

describe("computeRatsnest pour-aware connectivity", () => {
  const correlation: NetPadCorrelation = {
    netPads: new Map([
      [
        "gnd",
        [
          { placementId: "U1", padNumber: "1", worldMm: { x: -12, y: 0 } },
          { placementId: "U1", padNumber: "2", worldMm: { x: 12, y: 0 } },
        ],
      ],
    ]),
    warnings: [],
  };

  test("GND pads under a same-net F.Cu pour need no airwire", () => {
    const segments = computeRatsnest(correlation, {
      ...ctx,
      fill: fillCtx([{ layer: "F.Cu", netId: "gnd" }]),
    });
    expect(segments.filter((s) => s.netId === "gnd")).toHaveLength(0);
  });

  test("without the pour the same GND pads keep their airwire", () => {
    const segments = computeRatsnest(correlation, {
      ...ctx,
      fill: fillCtx([]),
    });
    expect(segments.filter((s) => s.netId === "gnd")).toHaveLength(1);
  });

  test("a pour on a different net does not connect GND", () => {
    const segments = computeRatsnest(correlation, {
      ...ctx,
      fill: fillCtx([{ layer: "F.Cu", netId: "vcc" }]),
    });
    expect(segments.filter((s) => s.netId === "gnd")).toHaveLength(1);
  });
});

describe("findGroundNetId (default pour net)", () => {
  test("matches common ground net names, case-insensitive", () => {
    for (const name of ["GND", "gnd", "GROUND", "AGND", "VSS", "earth"]) {
      expect(findGroundNetId(new Map([["n1", name]]))).toBe("n1");
    }
  });

  test("returns null when no ground net exists", () => {
    expect(
      findGroundNetId(
        new Map([
          ["n1", "VCC"],
          ["n2", "SIG"],
        ]),
      ),
    ).toBeNull();
  });

  test("picks the ground net among several", () => {
    expect(
      findGroundNetId(
        new Map([
          ["n1", "VCC"],
          ["n2", "GND"],
          ["n3", "SIG"],
        ]),
      ),
    ).toBe("n2");
  });
});
