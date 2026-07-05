import { describe, expect, test } from "bun:test";
import {
  netEndpointCount,
  netIsConnected,
} from "../../../modules/designer/backend/erc/erc-engine";
import { deriveNetsAndJunctions } from "../../../modules/designer/backend/projection-world";
import type {
  DesignerLabel,
  DesignerPin,
  DesignerPlacedPart,
  DesignerPrimitive,
  DesignerWire,
} from "../../../sdks/designer";

function pin(
  id: string,
  worldX: number,
  worldY: number,
  electricalType = "passive",
): DesignerPin {
  return {
    id,
    originPinKey: id,
    number: "1",
    name: "P",
    electricalType,
    unit: 1,
    localPositionNm: { x: 0, y: 0 },
    worldPositionNm: { x: worldX, y: worldY },
  };
}

function part(
  id: string,
  reference: string,
  pins: DesignerPin[],
): DesignerPlacedPart {
  return {
    id,
    componentId: "comp-1",
    reference,
    value: "X",
    positionNm: { x: 0, y: 0 },
    rotationDeg: 0,
    mirrored: false,
    propertiesJson: {},
    symbol: {
      symbolId: "sym",
      name: "sym",
      referencePrefix: null,
      sourceHash: null,
      pins: [],
      preview: {
        kind: "symbol",
        units: "mm",
        name: "sym",
        unitCount: 1,
        graphics: [],
        pins: [],
        labels: [],
        bounds: null,
        warnings: [],
      },
    },
    footprint: {
      footprintId: "fp",
      name: "fp",
      mountType: null,
      sourceHash: null,
      preview: null,
    },
    pins,
  };
}

describe("net derivation — connected semantics", () => {
  test("an isolated pin still produces a standalone single-endpoint net", () => {
    const parts = [part("u1", "U1", [pin("u1-1", 1000, 0)])];
    const { nets } = deriveNetsAndJunctions(parts, [], [], []);
    expect(nets).toHaveLength(1);
    const net = nets[0]!;
    expect(net.pinIds).toEqual(["u1-1"]);
    // Single endpoint → not a real connection.
    expect(netEndpointCount(net)).toBe(1);
    expect(netIsConnected(net)).toBe(false);
  });

  test("two pins at the same point form one connected net", () => {
    const parts = [
      part("u1", "U1", [pin("u1-1", 5000, 5000)]),
      part("u2", "U2", [pin("u2-1", 5000, 5000)]),
    ];
    const { nets } = deriveNetsAndJunctions(parts, [], [], []);
    const merged = nets.find((n) => n.pinIds.length === 2);
    expect(merged).toBeDefined();
    expect(netIsConnected(merged!)).toBe(true);
    expect(netEndpointCount(merged!)).toBe(2);
  });

  test("a pin joined to a wire is a connected net even when alone", () => {
    const pinA = pin("u1-1", 0, 0);
    const parts = [part("u1", "U1", [pinA])];
    const wire: DesignerWire = {
      id: "w1",
      sourcePinId: "u1-1",
      targetPinId: "open",
      pointsNm: [
        { x: 0, y: 0 },
        { x: 10000, y: 0 },
      ],
    };
    const { nets } = deriveNetsAndJunctions(parts, [wire], [], []);
    const net = nets.find((n) => n.pinIds.includes("u1-1"))!;
    expect(net.wireIds).toContain("w1");
    expect(netIsConnected(net)).toBe(true);
  });

  test("a pin under a label is a connected net even when alone", () => {
    const parts = [part("u1", "U1", [pin("u1-1", 0, 0)])];
    const label: DesignerLabel = {
      id: "lbl-1",
      text: "SIG",
      positionNm: { x: 0, y: 0 },
    };
    const { nets } = deriveNetsAndJunctions(parts, [], [label], []);
    const net = nets.find((n) => n.pinIds.includes("u1-1"))!;
    expect(net.labelIds).toContain("lbl-1");
    expect(netIsConnected(net)).toBe(true);
  });

  test("a pin under a power primitive is a connected net even when alone", () => {
    const parts = [part("u1", "U1", [pin("u1-1", 0, 0, "power_in")])];
    const pwr: DesignerPrimitive = {
      id: "prim-vcc",
      kind: "pwr",
      positionNm: { x: 0, y: 0 },
      rotationDeg: 0,
      railText: "VCC",
    };
    const { nets } = deriveNetsAndJunctions(parts, [], [], [pwr]);
    const net = nets.find((n) => n.pinIds.includes("u1-1"))!;
    expect(net.primitiveIds).toContain("prim-vcc");
    expect(netIsConnected(net)).toBe(true);
    expect(net.name).toBe("VCC");
  });
});

function wire(
  id: string,
  sourcePinId: string,
  targetPinId: string,
  pointsNm: Array<{ x: number; y: number }>,
): DesignerWire {
  return { id, sourcePinId, targetPinId, pointsNm };
}

describe("net derivation — connect-by-touch vs pass-through (audit §4.1/§4.9)", () => {
  test("T-touch: a wire terminus on another wire's segment interior connects + dots", () => {
    // w1 runs horizontally; w2 ends mid-segment on it (no shared vertex).
    const parts = [
      part("u1", "U1", [pin("u1-1", 0, 0)]),
      part("u2", "U2", [pin("u2-1", 20000, 0)]),
      part("u3", "U3", [pin("u3-1", 10000, 8000)]),
    ];
    const wires = [
      wire("w1", "u1-1", "u2-1", [
        { x: 0, y: 0 },
        { x: 20000, y: 0 },
      ]),
      wire("w2", "u3-1", "open", [
        { x: 10000, y: 8000 },
        { x: 10000, y: 0 },
      ]),
    ];
    const { nets, junctions } = deriveNetsAndJunctions(parts, wires, [], []);
    const merged = nets.find((n) => n.wireIds.length === 2);
    expect(merged).toBeDefined();
    expect(merged?.pinIds.sort()).toEqual(["u1-1", "u2-1", "u3-1"]);
    // Mandatory visible signal: junction dot at the touch point.
    expect(junctions).toContainEqual({ xNm: 10000, yNm: 0 });
  });

  test("T-touch: a pin landing on a wire's segment interior connects + dots", () => {
    const parts = [
      part("u1", "U1", [pin("u1-1", 0, 0)]),
      part("u2", "U2", [pin("u2-1", 20000, 0)]),
      part("u3", "U3", [pin("u3-1", 12000, 0)]), // sits mid-wire
    ];
    const wires = [
      wire("w1", "u1-1", "u2-1", [
        { x: 0, y: 0 },
        { x: 20000, y: 0 },
      ]),
    ];
    const { nets, junctions } = deriveNetsAndJunctions(parts, wires, [], []);
    const merged = nets.find((n) => n.pinIds.length === 3);
    expect(merged).toBeDefined();
    expect(junctions).toContainEqual({ xNm: 12000, yNm: 0 });
  });

  test("pass-through: two wires sharing an interior vertex do NOT connect and get no dot", () => {
    // Both wires have a corner at (10000, 10000); neither terminates there.
    const parts = [
      part("u1", "U1", [pin("u1-1", 0, 10000)]),
      part("u2", "U2", [pin("u2-1", 10000, 20000)]),
      part("u3", "U3", [pin("u3-1", 10000, 0)]),
      part("u4", "U4", [pin("u4-1", 20000, 10000)]),
    ];
    const wires = [
      wire("w1", "u1-1", "u2-1", [
        { x: 0, y: 10000 },
        { x: 10000, y: 10000 },
        { x: 10000, y: 20000 },
      ]),
      wire("w2", "u3-1", "u4-1", [
        { x: 10000, y: 0 },
        { x: 10000, y: 10000 },
        { x: 20000, y: 10000 },
      ]),
    ];
    const { nets, junctions } = deriveNetsAndJunctions(parts, wires, [], []);
    // Two separate nets — the shared corner vertex does not merge them.
    const netOfW1 = nets.find((n) => n.wireIds.includes("w1"));
    const netOfW2 = nets.find((n) => n.wireIds.includes("w2"));
    expect(netOfW1?.id).not.toBe(netOfW2?.id);
    expect(netOfW1?.wireIds).toEqual(["w1"]);
    expect(netOfW2?.wireIds).toEqual(["w2"]);
    // No dot at a non-connection.
    expect(junctions).not.toContainEqual({ xNm: 10000, yNm: 10000 });
  });

  test("genuine crossing without shared vertex stays unconnected (unchanged)", () => {
    const parts = [
      part("u1", "U1", [pin("u1-1", 0, 0)]),
      part("u2", "U2", [pin("u2-1", 20000, 0)]),
      part("u3", "U3", [pin("u3-1", 10000, -8000)]),
      part("u4", "U4", [pin("u4-1", 10000, 8000)]),
    ];
    const wires = [
      wire("w1", "u1-1", "u2-1", [
        { x: 0, y: 0 },
        { x: 20000, y: 0 },
      ]),
      wire("w2", "u3-1", "u4-1", [
        { x: 10000, y: -8000 },
        { x: 10000, y: 8000 },
      ]),
    ];
    const { nets, junctions } = deriveNetsAndJunctions(parts, wires, [], []);
    const netOfW1 = nets.find((n) => n.wireIds.includes("w1"));
    expect(netOfW1?.wireIds).toEqual(["w1"]);
    expect(junctions).toHaveLength(0);
  });

  test("three wire termini meeting at one point still connect and dot", () => {
    const parts = [
      part("u1", "U1", [pin("u1-1", 0, 0)]),
      part("u2", "U2", [pin("u2-1", 20000, 0)]),
      part("u3", "U3", [pin("u3-1", 10000, 8000)]),
    ];
    const wires = [
      wire("w1", "u1-1", "open-a", [
        { x: 0, y: 0 },
        { x: 10000, y: 0 },
      ]),
      wire("w2", "open-b", "u2-1", [
        { x: 10000, y: 0 },
        { x: 20000, y: 0 },
      ]),
      wire("w3", "u3-1", "open-c", [
        { x: 10000, y: 8000 },
        { x: 10000, y: 0 },
      ]),
    ];
    const { nets, junctions } = deriveNetsAndJunctions(parts, wires, [], []);
    const merged = nets.find((n) => n.wireIds.length === 3);
    expect(merged).toBeDefined();
    expect(junctions).toContainEqual({ xNm: 10000, yNm: 0 });
  });

  test("two wire ends meeting at a bare point connect without a dot", () => {
    const parts = [
      part("u1", "U1", [pin("u1-1", 0, 0)]),
      part("u2", "U2", [pin("u2-1", 20000, 0)]),
    ];
    const wires = [
      wire("w1", "u1-1", "open-a", [
        { x: 0, y: 0 },
        { x: 10000, y: 0 },
      ]),
      wire("w2", "open-b", "u2-1", [
        { x: 10000, y: 0 },
        { x: 20000, y: 0 },
      ]),
    ];
    const { nets, junctions } = deriveNetsAndJunctions(parts, wires, [], []);
    const merged = nets.find((n) => n.wireIds.length === 2);
    expect(merged).toBeDefined();
    expect(junctions).toHaveLength(0);
  });

  test("a wire corner alone never dots; a pin tapping the corner connects + dots", () => {
    const parts = [
      part("u1", "U1", [pin("u1-1", 0, 0)]),
      part("u2", "U2", [pin("u2-1", 10000, 10000)]),
    ];
    const cornerOnly = deriveNetsAndJunctions(
      parts,
      [
        wire("w1", "u1-1", "u2-1", [
          { x: 0, y: 0 },
          { x: 10000, y: 0 },
          { x: 10000, y: 10000 },
        ]),
      ],
      [],
      [],
    );
    expect(cornerOnly.junctions).toHaveLength(0);

    const withTapPin = deriveNetsAndJunctions(
      [...parts, part("u3", "U3", [pin("u3-1", 10000, 0)])],
      [
        wire("w1", "u1-1", "u2-1", [
          { x: 0, y: 0 },
          { x: 10000, y: 0 },
          { x: 10000, y: 10000 },
        ]),
      ],
      [],
      [],
    );
    const merged = withTapPin.nets.find((n) => n.pinIds.length === 3);
    expect(merged).toBeDefined();
    expect(withTapPin.junctions).toContainEqual({ xNm: 10000, yNm: 0 });
  });

  test("pin at a wire terminus connects without a dot", () => {
    const parts = [
      part("u1", "U1", [pin("u1-1", 0, 0)]),
      part("u2", "U2", [pin("u2-1", 10000, 0)]),
    ];
    const wires = [
      wire("w1", "u1-1", "u2-1", [
        { x: 0, y: 0 },
        { x: 10000, y: 0 },
      ]),
    ];
    const { junctions } = deriveNetsAndJunctions(parts, wires, [], []);
    expect(junctions).toHaveLength(0);
  });
});
