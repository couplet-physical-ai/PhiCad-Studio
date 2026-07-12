import { describe, expect, test } from "bun:test";
import {
  buildRouteObstacles,
  resolveRouteClearancesMm,
} from "../../../shared/pcb-routing/route-obstacles";
import type {
  PcbDesignRules,
  PcbPlacedPart,
  PcbTrace,
  PcbVia,
} from "../../../sdks/designer";

const NM = 1_000_000;

function trace(
  id: string,
  pointsNm: Array<{ x: number; y: number }>,
  opts: Partial<Pick<PcbTrace, "netId" | "layer" | "widthMm">> = {},
): PcbTrace {
  return {
    id,
    netId: opts.netId ?? null,
    netClassId: "default",
    layer: opts.layer ?? "F.Cu",
    widthMm: opts.widthMm ?? 0.2,
    pointsNm,
    segmentMode: "manhattan-45",
  };
}

function via(
  id: string,
  xMm: number,
  yMm: number,
  netId: string | null = null,
): PcbVia {
  return {
    id,
    netId,
    netClassId: "default",
    centerMm: { x: xMm, y: yMm },
    diameterMm: 0.8,
    drillMm: 0.4,
    fromLayer: "F.Cu",
    toLayer: "B.Cu",
    viaType: "through",
    protection: "tented",
    provenance: "route",
  };
}

function pad(number: string, xMm: number, yMm: number, wMm = 1, hMm = 2) {
  return {
    id: `pad-${number}`,
    number,
    shape: "rect" as const,
    centerMm: { x: xMm, y: yMm },
    widthMm: wMm,
    heightMm: hMm,
    rotationDeg: 0,
  };
}

function placement(
  id: string,
  positionMm: { x: number; y: number },
  pads: ReturnType<typeof pad>[],
  opts: Partial<Pick<PcbPlacedPart, "rotationDeg" | "layer" | "mirrored">> = {},
): PcbPlacedPart {
  return {
    id,
    partId: `part-${id}`,
    componentId: `comp-${id}`,
    reference: id.toUpperCase(),
    positionMm,
    rotationDeg: opts.rotationDeg ?? 0,
    mirrored: opts.mirrored ?? false,
    layer: opts.layer ?? "F.Cu",
    footprint: {
      footprintId: "fp",
      name: "FP",
      mountType: null,
      sourceHash: null,
      preview: {
        kind: "footprint",
        units: "mm",
        name: "FP",
        pads,
        graphics: [],
        labels: [],
        bounds: { minX: -5, minY: -5, maxX: 5, maxY: 5 },
        warnings: [],
      },
    },
  };
}

const DESIGN_RULES = {
  clearance: { traceToTraceMm: 0.2, traceToPadMm: 0.25 },
} as Pick<PcbDesignRules, "clearance"> as PcbDesignRules;

const BASE = {
  traces: [] as PcbTrace[],
  placements: [] as PcbPlacedPart[],
  vias: [] as PcbVia[],
  layer: "F.Cu" as const,
  netId: "net-a" as string | null,
  padNetMap: new Map<string, string>(),
  traceClearanceMm: 0.2,
  padClearanceMm: 0.25,
  routeWidthMm: 0.3,
};

describe("resolveRouteClearancesMm", () => {
  test("net class can only tighten the board floor", () => {
    expect(
      resolveRouteClearancesMm({
        netClass: { clearanceMm: 0.5 },
        designRules: DESIGN_RULES,
      }),
    ).toEqual({ traceClearanceMm: 0.5, padClearanceMm: 0.5 });
    expect(
      resolveRouteClearancesMm({
        netClass: { clearanceMm: 0.1 },
        designRules: DESIGN_RULES,
      }),
    ).toEqual({ traceClearanceMm: 0.2, padClearanceMm: 0.25 });
    expect(
      resolveRouteClearancesMm({ netClass: null, designRules: DESIGN_RULES }),
    ).toEqual({ traceClearanceMm: 0.2, padClearanceMm: 0.25 });
  });
});

describe("buildRouteObstacles — traces", () => {
  test("emits one rect per segment with live-DRC required inflation", () => {
    const t = trace("t1", [
      { x: 0, y: 0 },
      { x: 10 * NM, y: 0 },
      { x: 10 * NM, y: 5 * NM },
    ]);
    const rects = buildRouteObstacles({ ...BASE, traces: [t] });
    expect(rects).toHaveLength(2);
    // required = clearance 0.2 + otherHalf 0.1 + routeHalf 0.15 = 0.45 mm
    const seg0 = rects.find((r) => r.id === "trace:t1:0")!;
    expect(seg0.minX).toBe(-450_000);
    expect(seg0.minY).toBe(-450_000);
    expect(seg0.maxX).toBe(10 * NM + 450_000);
    expect(seg0.maxY).toBe(450_000);
  });

  test("skips other-layer and same-net traces (live-DRC parity)", () => {
    const rects = buildRouteObstacles({
      ...BASE,
      traces: [
        trace("back", [{ x: 0, y: 0 }, { x: NM, y: 0 }], { layer: "B.Cu" }),
        trace("mine", [{ x: 0, y: 0 }, { x: NM, y: 0 }], { netId: "net-a" }),
        trace("nullnet", [{ x: 0, y: 0 }, { x: NM, y: 0 }]),
      ],
    });
    // null-net trace is NOT skipped (unknown net must stay an obstacle).
    expect(rects.map((r) => r.id)).toEqual(["trace:nullnet:0"]);
  });

  test("null session net treats even same-named nets as obstacles", () => {
    const rects = buildRouteObstacles({
      ...BASE,
      netId: null,
      traces: [trace("t", [{ x: 0, y: 0 }, { x: NM, y: 0 }], { netId: "net-a" })],
    });
    expect(rects).toHaveLength(1);
  });
});

describe("buildRouteObstacles — pads", () => {
  test("pad rect is the union of swapped and un-swapped models at 90°", () => {
    // 1×2 mm pad rotated 90°: swapped extents (1, 0.5), un-swapped (0.5, 1)
    // → union (1, 1). Inflate by padClearance 0.25 + routeHalf 0.15 = 0.4.
    const rects = buildRouteObstacles({
      ...BASE,
      placements: [
        placement("u1", { x: 10, y: 10 }, [pad("1", 0, 0)], { rotationDeg: 90 }),
      ],
    });
    expect(rects).toHaveLength(1);
    const r = rects[0]!;
    expect(r.id).toBe("pad:u1|1");
    expect(r.minX).toBe(10 * NM - (1_000_000 + 400_000));
    expect(r.maxX).toBe(10 * NM + 1_000_000 + 400_000);
    expect(r.minY).toBe(10 * NM - (1_000_000 + 400_000));
    expect(r.maxY).toBe(10 * NM + 1_000_000 + 400_000);
  });

  test("same-net pads and excluded pads stay routable; B.Cu placements skip on F.Cu", () => {
    const padNetMap = new Map([["u1|1", "net-a"]]);
    const rects = buildRouteObstacles({
      ...BASE,
      padNetMap,
      placements: [
        placement("u1", { x: 0, y: 0 }, [pad("1", 0, 0), pad("2", 3, 0)]),
        placement("u2", { x: 20, y: 0 }, [pad("1", 0, 0)], { layer: "B.Cu" }),
        placement("u3", { x: 40, y: 0 }, [pad("1", 0, 0)]),
      ],
      excludePadIds: new Set(["u3|1"]),
    });
    // u1|1 same-net skipped, u2 on B.Cu skipped, u3|1 excluded → only u1|2.
    expect(rects.map((r) => r.id)).toEqual(["pad:u1|2"]);
  });

  test("mirrored placement flips pad x before rotation", () => {
    const rects = buildRouteObstacles({
      ...BASE,
      placements: [
        placement("u1", { x: 0, y: 0 }, [pad("1", 2, 0, 1, 1)], {
          layer: "B.Cu",
          mirrored: true,
        }),
      ],
      layer: "B.Cu",
    });
    const r = rects[0]!;
    // Pad center mirrors to x = -2 mm; half 0.5 + inflate 0.4.
    expect(r.minX).toBe(-2 * NM - 900_000);
    expect(r.maxX).toBe(-2 * NM + 900_000);
  });
});

describe("buildRouteObstacles — vias", () => {
  test("vias block every layer; same-net vias are transparent", () => {
    const rects = buildRouteObstacles({
      ...BASE,
      layer: "In1.Cu",
      vias: [via("v1", 5, 5), via("v2", 9, 9, "net-a")],
    });
    expect(rects.map((r) => r.id)).toEqual(["via:v1"]);
    const r = rects[0]!;
    // half = d/2 0.4 + clearance 0.2 + routeHalf 0.15 = 0.75 mm
    expect(r.minX).toBe(5 * NM - 750_000);
    expect(r.maxX).toBe(5 * NM + 750_000);
  });
});

describe("buildRouteObstacles — determinism", () => {
  test("output is identical under permuted inputs", () => {
    const traces = [
      trace("a", [{ x: 0, y: 0 }, { x: NM, y: 0 }]),
      trace("b", [{ x: 0, y: NM }, { x: NM, y: NM }]),
    ];
    const vias = [via("v1", 3, 3), via("v2", 4, 4)];
    const one = buildRouteObstacles({ ...BASE, traces, vias });
    const two = buildRouteObstacles({
      ...BASE,
      traces: [traces[1]!, traces[0]!],
      vias: [vias[1]!, vias[0]!],
    });
    expect(one).toEqual(two);
  });
});
