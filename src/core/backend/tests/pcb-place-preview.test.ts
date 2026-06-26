import { describe, expect, test } from "bun:test";
import type { PcbPlacedPart } from "../../../sdks";
import {
  applyTransformsToPlacements,
  buildFromMarkers,
  buildProposedTransforms,
  diffToOperations,
} from "../../../modules/designer/frontend/pcb/usePcbPlacePreview";
import type { PlaceOperation } from "../../../sdks";

function part(over: Partial<PcbPlacedPart> & { id: string }): PcbPlacedPart {
  return {
    partId: "part",
    componentId: "comp",
    reference: over.id.toUpperCase(),
    positionMm: { x: 0, y: 0 },
    rotationDeg: 0,
    mirrored: false,
    layer: "F.Cu",
    footprint: {} as PcbPlacedPart["footprint"],
    ...over,
  };
}

function op(
  kind: PlaceOperation["kind"],
  payload: PlaceOperation["payload"],
): PlaceOperation {
  return {
    id: `op-${payload.placementId}-${kind}`,
    kind,
    title: "",
    summary: "",
    riskLevel: "low",
    payload,
    sources: [],
    warnings: [],
  };
}

describe("buildProposedTransforms", () => {
  test("applies move, rotate, flip onto current pose", () => {
    const placements = [
      part({ id: "u1" }),
      part({ id: "r2", rotationDeg: 90 }),
    ];
    const ops = [
      op("pcb_move_placement", {
        type: "pcb_move_placement",
        placementId: "u1",
        positionMm: { x: 5, y: 7 },
      }),
      op("pcb_rotate_placement", {
        type: "pcb_rotate_placement",
        placementId: "u1",
        rotationDeg: 180,
      }),
      op("pcb_flip_placement", {
        type: "pcb_flip_placement",
        placementId: "r2",
      }),
    ];
    const t = buildProposedTransforms(placements, ops);
    expect(t.get("u1")?.positionMm).toEqual({ x: 5, y: 7 });
    expect(t.get("u1")?.rotationDeg).toBe(180);
    expect(t.get("r2")?.layer).toBe("B.Cu");
    expect(t.get("r2")?.mirrored).toBe(true);
  });

  test("double-flip returns to original side", () => {
    const placements = [part({ id: "u1" })];
    const flip = op("pcb_flip_placement", {
      type: "pcb_flip_placement",
      placementId: "u1",
    });
    const t = buildProposedTransforms(placements, [flip, flip]);
    expect(t.get("u1")?.layer).toBe("F.Cu");
    expect(t.get("u1")?.mirrored).toBe(false);
  });
});

describe("diffToOperations", () => {
  test("emits a move op only for a moved component", () => {
    const placements = [part({ id: "u1" })];
    const transforms = buildProposedTransforms(placements, [
      op("pcb_move_placement", {
        type: "pcb_move_placement",
        placementId: "u1",
        positionMm: { x: 3, y: 4 },
      }),
    ]);
    const originals = new Map(placements.map((p) => [p.id, p]));
    const ops = diffToOperations(transforms, originals);
    expect(ops).toHaveLength(1);
    expect(ops[0]!.payload).toMatchObject({
      type: "pcb_move_placement",
      placementId: "u1",
      positionMm: { x: 3, y: 4 },
    });
  });

  test("emits a single flip op when side parity differs", () => {
    const placements = [part({ id: "u1" })];
    const transforms = buildProposedTransforms(placements, [
      op("pcb_flip_placement", {
        type: "pcb_flip_placement",
        placementId: "u1",
      }),
    ]);
    const originals = new Map(placements.map((p) => [p.id, p]));
    const ops = diffToOperations(transforms, originals);
    expect(ops).toHaveLength(1);
    expect(ops[0]!.payload.type).toBe("pcb_flip_placement");
  });

  test("double-flip yields no op (parity unchanged)", () => {
    const placements = [part({ id: "u1" })];
    const flip = op("pcb_flip_placement", {
      type: "pcb_flip_placement",
      placementId: "u1",
    });
    const transforms = buildProposedTransforms(placements, [flip, flip]);
    const originals = new Map(placements.map((p) => [p.id, p]));
    expect(diffToOperations(transforms, originals)).toHaveLength(0);
  });

  test("rotate-to-original yields no op", () => {
    const placements = [part({ id: "u1", rotationDeg: 90 })];
    const transforms = buildProposedTransforms(placements, [
      op("pcb_rotate_placement", {
        type: "pcb_rotate_placement",
        placementId: "u1",
        rotationDeg: 90,
      }),
    ]);
    const originals = new Map(placements.map((p) => [p.id, p]));
    expect(diffToOperations(transforms, originals)).toHaveLength(0);
  });
});

describe("derived render helpers", () => {
  test("applyTransformsToPlacements overlays only affected ids", () => {
    const placements = [part({ id: "u1" }), part({ id: "r2" })];
    const transforms = buildProposedTransforms(placements, [
      op("pcb_move_placement", {
        type: "pcb_move_placement",
        placementId: "u1",
        positionMm: { x: 9, y: 9 },
      }),
    ]);
    const out = applyTransformsToPlacements(placements, transforms);
    expect(out.find((p) => p.id === "u1")?.positionMm).toEqual({ x: 9, y: 9 });
    expect(out.find((p) => p.id === "r2")?.positionMm).toEqual({ x: 0, y: 0 });
  });

  test("buildFromMarkers returns originals only for changed ids", () => {
    const placements = [part({ id: "u1" })];
    const flip = op("pcb_flip_placement", {
      type: "pcb_flip_placement",
      placementId: "u1",
    });
    const originals = new Map(placements.map((p) => [p.id, p]));
    // changed once → marker present
    const changed = buildProposedTransforms(placements, [flip]);
    expect(buildFromMarkers(changed, originals)).toHaveLength(1);
    // changed back → no marker
    const reverted = buildProposedTransforms(placements, [flip, flip]);
    expect(buildFromMarkers(reverted, originals)).toHaveLength(0);
  });
});
