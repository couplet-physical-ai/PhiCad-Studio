// buildBoardSnapshot: projection → cloud auto-router BoardSnapshot.
// Verifies the unit contract (traces nm, everything else mm), pad-outline
// expansion (through-hole spans both layers), the empty-pours / zones-warning
// rule, net-class filtering, and determinism.
import { describe, expect, test } from "bun:test";
import { buildBoardSnapshot } from "../../../modules/designer/backend/pcb/board-snapshot";
import {
  createDefaultPcbBoardSettings,
  createDefaultPcbViewState,
} from "../../../modules/designer/backend/pcb/pcb-defaults";
import type { FootprintRenderSourcePad } from "../../../shared/rendering/types";
import type {
  DesignerPcbProjection,
  PcbBoardSettings,
  PcbFreeHole,
  PcbPointMm,
  PcbPlacedPart,
  PcbTrace,
  PcbZone,
  PourIsland,
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

function zone(overrides: Partial<PcbZone> = {}): PcbZone {
  return {
    id: "z1",
    netName: "GND",
    netId: "net_gnd",
    layer: "F.Cu",
    polygonPointsMm: [
      { x: -10, y: -5 },
      { x: 10, y: -5 },
      { x: 10, y: 5 },
      { x: -10, y: 5 },
    ],
    hatchEdgeMm: 0.5,
    fillType: "solid",
    ...overrides,
  };
}

function filledBoard(overrides: Partial<PcbBoardSettings> = {}): PcbBoardSettings {
  const base = board(overrides);
  const viewState = base.viewState ?? createDefaultPcbViewState();
  return {
    ...base,
    viewState: {
      ...viewState,
      copperFillLayers: ["F.Cu"],
      copperFillPourNetIds: { "F.Cu": "net_gnd" },
      copperFillPadConnection: "solid",
    },
  };
}

function freeHole(overrides: Partial<PcbFreeHole> = {}): PcbFreeHole {
  return {
    id: "h1",
    centerMm: { x: 0, y: 0 },
    drillMm: 1,
    lockedAt: null,
    ...overrides,
  };
}

function ringArea(ring: readonly PcbPointMm[]): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    if (!a || !b) continue;
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

function maxDecimalPlaces(value: number): number {
  const text = value.toString();
  const dot = text.indexOf(".");
  return dot === -1 ? 0 : text.length - dot - 1;
}

function definedPours(pours: PourIsland[] | undefined): PourIsland[] {
  expect(pours).toBeDefined();
  return pours ?? [];
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
    const { snapshot, warnings } = buildBoardSnapshot(
      projection({ zones: [zone()], ratsnest: [rats("net_a")] }),
    );
    expect(snapshot.pours).toEqual([]);
    expect(warnings.some((w) => w.includes("zone"))).toBe(true);
  });

  test("explicit zone emits pour island when serializePours is true", () => {
    const { snapshot, warnings } = buildBoardSnapshot(
      projection({
        zones: [zone()],
        netNames: { net_gnd: "GND" },
        ratsnest: [rats("net_gnd")],
      }),
      { serializePours: true },
    );
    expect(warnings.some((w) => w.includes("zone"))).toBe(false);
    const pours = definedPours(snapshot.pours);
    expect(pours).toHaveLength(1);
    const pour = pours.at(0);
    expect(pour?.layer).toBe("F.Cu");
    expect(pour?.pourNetId).toBe("net_gnd");
    expect(pour?.islandId.startsWith("pour-")).toBe(true);
    expect(pour?.rings.length).toBeGreaterThan(0);
  });

  test("board-wide fill emits pour island when serializePours is true", () => {
    const { snapshot } = buildBoardSnapshot(
      projection({
        board: filledBoard(),
        netNames: { net_gnd: "GND" },
        ratsnest: [rats("net_gnd")],
      }),
      { serializePours: true },
    );
    const pours = definedPours(snapshot.pours);
    expect(pours).toHaveLength(1);
    expect(pours.at(0)?.layer).toBe("F.Cu");
    expect(pours.at(0)?.pourNetId).toBe("net_gnd");
  });

  test("serialized pour islands are deterministic", () => {
    const make = () =>
      JSON.stringify(
        buildBoardSnapshot(
          projection({
            board: filledBoard(),
            freeHoles: [freeHole()],
            netNames: { net_gnd: "GND" },
            ratsnest: [rats("net_gnd")],
          }),
          { serializePours: true },
        ).snapshot.pours,
      );
    expect(make()).toBe(make());
  });

  test("serialized pour rings are quantized and normalized", () => {
    const { snapshot } = buildBoardSnapshot(
      projection({
        board: filledBoard(),
        freeHoles: [freeHole()],
        netNames: { net_gnd: "GND" },
        ratsnest: [rats("net_gnd")],
      }),
      { serializePours: true },
    );
    const pour = definedPours(snapshot.pours).at(0);
    expect(pour).toBeDefined();
    const rings = pour?.rings ?? [];
    const outer = rings.at(0) ?? [];
    expect(ringArea(outer)).toBeGreaterThan(0);
    for (const ring of rings) {
      for (const point of ring) {
        expect(maxDecimalPlaces(point.x)).toBeLessThanOrEqual(4);
        expect(maxDecimalPlaces(point.y)).toBeLessThanOrEqual(4);
      }
    }
    const holes = rings.slice(1);
    expect(holes.length).toBeGreaterThan(0);
    expect(holes.every((ring) => ringArea(ring) < 0)).toBe(true);
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
