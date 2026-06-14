// buildBoardSnapshot: projection → cloud auto-router BoardSnapshot.
// Verifies the unit contract (traces nm, everything else mm), pad-outline
// expansion (through-hole spans both layers), the empty-pours / zones-warning
// rule, net-class filtering, and determinism.
import { describe, expect, test } from "bun:test";
import { buildBoardSnapshot } from "../../../modules/designer/backend/pcb/board-snapshot";
import { createDefaultPcbBoardSettings } from "../../../modules/designer/backend/pcb/pcb-defaults";
import type { FootprintRenderSourcePad } from "../../../shared/rendering/types";
import type {
  DesignerPcbProjection,
  PcbBoardSettings,
  PcbPlacedPart,
  PcbTrace,
  PcbZone,
  RatsnestSegment,
} from "../../../sdks/designer";

const TS = "2026-01-01T00:00:00.000Z";

function board(overrides: Partial<PcbBoardSettings> = {}): PcbBoardSettings {
  return { ...createDefaultPcbBoardSettings(TS), ...overrides };
}

function projection(
  parts: Partial<DesignerPcbProjection> = {},
): DesignerPcbProjection {
  return {
    designId: "d1",
    revision: 7,
    board: parts.board ?? board(),
    placements: parts.placements ?? [],
    traces: parts.traces ?? [],
    vias: parts.vias ?? [],
    freeHoles: parts.freeHoles ?? [],
    freePads: parts.freePads ?? [],
    overlayTexts: parts.overlayTexts ?? [],
    overlayShapes: parts.overlayShapes ?? [],
    zones: parts.zones ?? [],
    ratsnest: parts.ratsnest ?? [],
    netNames: parts.netNames ?? {},
    padNets: parts.padNets,
    warnings: [],
  };
}

function smdPad(
  number: string,
  center: { x: number; y: number },
): FootprintRenderSourcePad {
  return {
    id: `pad-${number}`,
    number,
    shape: "rect",
    centerMm: center,
    widthMm: 1,
    heightMm: 1,
    rotationDeg: 0,
  };
}

function thPad(
  number: string,
  center: { x: number; y: number },
): FootprintRenderSourcePad {
  return { ...smdPad(number, center), shape: "circle", drillDiameterMm: 0.4 };
}

function placement(
  id: string,
  pads: FootprintRenderSourcePad[],
  positionMm = { x: 0, y: 0 },
): PcbPlacedPart {
  return {
    id,
    partId: id,
    componentId: "c",
    reference: id,
    positionMm,
    rotationDeg: 0,
    mirrored: false,
    layer: "F.Cu",
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
        bounds: null,
        warnings: [],
      },
    },
  };
}

function rats(netId: string, netClassId = "default"): RatsnestSegment {
  return {
    netId,
    netClassId,
    fromMm: { x: 1, y: 1 },
    toMm: { x: 9, y: 1 },
    fromPlacementId: "U1",
    fromPadNumber: "1",
    toPlacementId: "U2",
    toPadNumber: "1",
  };
}

describe("buildBoardSnapshot", () => {
  test("maps a simple 2-net board, pours always empty", () => {
    const proj = projection({
      placements: [
        placement("U1", [
          smdPad("1", { x: 0, y: 0 }),
          smdPad("2", { x: 2, y: 0 }),
        ]),
      ],
      padNets: { "U1|1": "net_a", "U1|2": "net_b" },
      netNames: { net_a: "NET_A", net_b: "NET_B" },
      ratsnest: [rats("net_a")],
    });

    const { snapshot, warnings } = buildBoardSnapshot(proj);

    expect(snapshot.designId).toBe("d1");
    expect(snapshot.baseRevision).toBe(7);
    expect(snapshot.pours).toEqual([]);
    expect(snapshot.stackup.copperLayers).toEqual(["F.Cu", "B.Cu"]);
    expect(snapshot.designRules.fabPresetId).toBe(proj.board.fabricator);
    expect(snapshot.netClasses).toBe(proj.board.netClasses);
    expect(snapshot.ratsnest).toHaveLength(1);
    // outline is one ring of >=3 mm points (small magnitude)
    expect(snapshot.board.outline).toHaveLength(1);
    expect(snapshot.board.outline[0]!.length).toBeGreaterThanOrEqual(3);
    // two SMD pads → two single-layer pad outlines, nets resolved from padNets
    expect(snapshot.padOutlines).toHaveLength(2);
    expect(snapshot.padOutlines!.every((p) => p.layer === "F.Cu")).toBe(true);
    expect(snapshot.padOutlines!.map((p) => p.netId).sort()).toEqual([
      "net_a",
      "net_b",
    ]);
    expect(warnings).toEqual([]);
  });

  test("trace pointsNm pass through as integer nanometers (no conversion)", () => {
    const trace: PcbTrace = {
      id: "t1",
      netId: "net_a",
      netClassId: "default",
      layer: "F.Cu",
      widthMm: 0.2,
      pointsNm: [
        { x: 5_000_000, y: 5_000_000 },
        { x: 45_000_000, y: 5_000_000 },
      ],
      segmentMode: "manhattan-45",
    };
    const { snapshot } = buildBoardSnapshot(
      projection({ traces: [trace], ratsnest: [rats("net_a")] }),
    );
    expect(snapshot.traces).toHaveLength(1);
    expect(snapshot.traces![0]!.pointsNm).toEqual([
      { x: 5_000_000, y: 5_000_000 },
      { x: 45_000_000, y: 5_000_000 },
    ]);
  });

  test("through-hole pad spans both copper layers", () => {
    const { snapshot } = buildBoardSnapshot(
      projection({
        placements: [placement("U1", [thPad("1", { x: 0, y: 0 })])],
        padNets: { "U1|1": "net_a" },
      }),
    );
    expect(snapshot.padOutlines).toHaveLength(2);
    expect(snapshot.padOutlines!.map((p) => p.layer).sort()).toEqual([
      "B.Cu",
      "F.Cu",
    ]);
  });

  test("copper zones produce a warning but pours stay empty", () => {
    const zone: PcbZone = {
      id: "z1",
      netName: "GND",
      layer: "F.Cu",
      polygonPointsMm: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ],
      hatchEdgeMm: 0.5,
      fillType: "solid",
    };
    const { snapshot, warnings } = buildBoardSnapshot(
      projection({ zones: [zone], ratsnest: [rats("net_a")] }),
    );
    expect(snapshot.pours).toEqual([]);
    expect(warnings.some((w) => w.includes("zone"))).toBe(true);
  });

  test("net-class filtering drops non-routable ratsnest targets", () => {
    const proj = projection({
      ratsnest: [rats("net_a", "default"), rats("net_p", "power")],
    });
    const { snapshot } = buildBoardSnapshot(proj, {
      routableNetClassIds: ["default"],
    });
    expect(snapshot.ratsnest).toHaveLength(1);
    expect(snapshot.ratsnest[0]!.netClassId).toBe("default");
  });

  test("defaults options.portfolio to the production default (4)", () => {
    const { snapshot } = buildBoardSnapshot(
      projection({ ratsnest: [rats("net_a")] }),
    );
    expect(snapshot.options?.portfolio).toBe(4);
  });

  test("a caller-supplied routeOption overrides the portfolio default", () => {
    const { snapshot } = buildBoardSnapshot(
      projection({ ratsnest: [rats("net_a")] }),
      { routeOptions: { portfolio: 1, allowVias: false } },
    );
    expect(snapshot.options?.portfolio).toBe(1);
    expect(snapshot.options?.allowVias).toBe(false);
  });

  test("is a deterministic pure function (equal output on repeat)", () => {
    const make = () =>
      buildBoardSnapshot(
        projection({
          placements: [placement("U1", [smdPad("1", { x: 0, y: 0 })])],
          padNets: { "U1|1": "net_a" },
          netNames: { net_a: "NET_A" },
          ratsnest: [rats("net_a")],
        }),
      ).snapshot;
    expect(JSON.stringify(make())).toBe(JSON.stringify(make()));
  });
});
