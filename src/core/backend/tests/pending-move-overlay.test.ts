import { describe, expect, test } from "bun:test";
import {
  applyPendingMoveToProjection,
  mergePendingMoves,
  type PendingMoveState,
} from "../../../modules/designer/frontend/lib/pending-move-overlay";
import type {
  DesignerPlacedPart,
  DesignerPrimitive,
  DesignerSchematicProjection,
  DesignerWire,
} from "../../../sdks/designer/types";

function makePart(
  id: string,
  positionNm: { x: number; y: number },
  pinWorlds: Array<{ x: number; y: number }>,
): DesignerPlacedPart {
  return {
    id,
    componentId: `component-${id}`,
    reference: id.toUpperCase(),
    value: "",
    rotationDeg: 0,
    mirrored: false,
    positionNm,
    pins: pinWorlds.map((world, index) => ({
      id: `${id}:pin-${index}`,
      originPinKey: `pin-${index}`,
      number: `${index + 1}`,
      name: `P${index + 1}`,
      electricalType: "passive",
      unit: 1,
      localPositionNm: { x: 0, y: 0 },
      worldPositionNm: world,
    })),
  } as DesignerPlacedPart;
}

function makeProjection(overrides: {
  parts?: DesignerPlacedPart[];
  primitives?: DesignerPrimitive[];
  wires?: DesignerWire[];
}): DesignerSchematicProjection {
  return {
    designId: "design-1",
    revision: 1,
    parts: overrides.parts ?? [],
    wires: overrides.wires ?? [],
    labels: [],
    primitives: overrides.primitives ?? [],
    junctions: [],
    nets: [],
  };
}

function emptyPending(): PendingMoveState {
  return {
    partPositionsNm: new Map(),
    primitivePositionsNm: new Map(),
    wirePointsNm: new Map(),
  };
}

describe("applyPendingMoveToProjection", () => {
  test("returns the projection unchanged (same reference) without a pending move", () => {
    const projection = makeProjection({
      parts: [makePart("a", { x: 0, y: 0 }, [{ x: 2, y: 0 }])],
    });
    expect(applyPendingMoveToProjection(projection, null)).toBe(projection);
    expect(applyPendingMoveToProjection(projection, emptyPending())).toBe(
      projection,
    );
  });

  test("shifts moved part position AND its pin world positions by the delta", () => {
    const projection = makeProjection({
      parts: [
        makePart("a", { x: 1_000, y: 2_000 }, [
          { x: 3_000, y: 2_000 },
          { x: -1_000, y: 2_000 },
        ]),
        makePart("b", { x: 50_000, y: 0 }, [{ x: 52_000, y: 0 }]),
      ],
    });
    const pending = emptyPending();
    pending.partPositionsNm.set("a", { x: 11_000, y: 2_500 });

    const result = applyPendingMoveToProjection(projection, pending);
    const movedPart = result.parts[0]!;
    expect(movedPart.positionNm).toEqual({ x: 11_000, y: 2_500 });
    expect(movedPart.pins[0]!.worldPositionNm).toEqual({
      x: 13_000,
      y: 2_500,
    });
    expect(movedPart.pins[1]!.worldPositionNm).toEqual({
      x: 9_000,
      y: 2_500,
    });
    // Untouched part reused by reference.
    expect(result.parts[1]).toBe(projection.parts[1]!);
  });

  test("overrides primitive positions and wire geometry; untouched wires reused", () => {
    const primitive = {
      id: "prim-1",
      kind: "gnd",
      positionNm: { x: 0, y: 0 },
      rotationDeg: 0,
    } as DesignerPrimitive;
    const wireMoved: DesignerWire = {
      id: "wire-1",
      sourcePinId: "a:pin-0",
      targetPinId: "b:pin-0",
      pointsNm: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
    };
    const wireStatic: DesignerWire = {
      id: "wire-2",
      sourcePinId: "b:pin-0",
      targetPinId: "c:pin-0",
      pointsNm: [
        { x: 10, y: 0 },
        { x: 20, y: 0 },
      ],
    };
    const projection = makeProjection({
      primitives: [primitive],
      wires: [wireMoved, wireStatic],
    });
    const pending = emptyPending();
    pending.primitivePositionsNm.set("prim-1", { x: 7, y: 9 });
    pending.wirePointsNm.set("wire-1", [
      { x: 0, y: 5 },
      { x: 10, y: 5 },
    ]);

    const result = applyPendingMoveToProjection(projection, pending);
    expect(result.primitives[0]!.positionNm).toEqual({ x: 7, y: 9 });
    expect(result.wires[0]!.pointsNm).toEqual([
      { x: 0, y: 5 },
      { x: 10, y: 5 },
    ]);
    expect(result.wires[1]).toBe(wireStatic);
    // Inputs untouched.
    expect(primitive.positionNm).toEqual({ x: 0, y: 0 });
    expect(wireMoved.pointsNm[0]).toEqual({ x: 0, y: 0 });
  });
});

describe("mergePendingMoves", () => {
  test("copies next when base is null", () => {
    const next = emptyPending();
    next.partPositionsNm.set("a", { x: 1, y: 2 });
    const merged = mergePendingMoves(null, next);
    expect(merged.partPositionsNm.get("a")).toEqual({ x: 1, y: 2 });
    expect(merged.partPositionsNm).not.toBe(next.partPositionsNm);
  });

  test("later drop wins per entity, earlier entries survive", () => {
    const base = emptyPending();
    base.partPositionsNm.set("a", { x: 1, y: 1 });
    base.partPositionsNm.set("b", { x: 2, y: 2 });
    base.wirePointsNm.set("w1", [{ x: 0, y: 0 }]);

    const next = emptyPending();
    next.partPositionsNm.set("b", { x: 99, y: 99 });
    next.wirePointsNm.set("w2", [{ x: 5, y: 5 }]);

    const merged = mergePendingMoves(base, next);
    expect(merged.partPositionsNm.get("a")).toEqual({ x: 1, y: 1 });
    expect(merged.partPositionsNm.get("b")).toEqual({ x: 99, y: 99 });
    expect(merged.wirePointsNm.get("w1")).toEqual([{ x: 0, y: 0 }]);
    expect(merged.wirePointsNm.get("w2")).toEqual([{ x: 5, y: 5 }]);
    // Base not mutated.
    expect(base.partPositionsNm.get("b")).toEqual({ x: 2, y: 2 });
  });
});
