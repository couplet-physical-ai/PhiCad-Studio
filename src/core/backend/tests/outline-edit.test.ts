import { describe, expect, test } from "bun:test";
import type { PcbBoardContour, PcbBoardOutlinePolygon } from "../../../sdks";
import { validateContour } from "../../../shared/rendering/pcb/contour-validation";
import { verticesToContour } from "../../../modules/designer/frontend/pcb/sketch-geometry";
import {
  chamferCorner,
  contourVertices,
  filletCorner,
  rotateContourStart,
} from "../../../modules/designer/frontend/pcb/outline-corners";
import {
  deleteVertex,
  hitEdge,
  hitVertex,
  insertVertexAtEdge,
  moveVertex,
  outlineHasArcs,
  outlineVertices,
} from "../../../modules/designer/frontend/pcb/pcb-outline-edit";

const square = (): PcbBoardContour =>
  verticesToContour([
    { x: 0, y: 0 },
    { x: 20, y: 0 },
    { x: 20, y: 20 },
    { x: 0, y: 20 },
  ]);

const polySquare = (): PcbBoardOutlinePolygon => ({
  kind: "polygon",
  widthMm: 20,
  heightMm: 20,
  centerMm: { x: 10, y: 10 },
  pointsMm: [
    { x: 0, y: 0 },
    { x: 20, y: 0 },
    { x: 20, y: 20 },
    { x: 0, y: 20 },
  ],
});

describe("rotateContourStart", () => {
  test("re-labels the ring without changing the vertex set", () => {
    const c = square();
    const r = rotateContourStart(c, 2);
    expect(r.start).toEqual({ x: 20, y: 20 });
    const before = new Set(contourVertices(c).map((v) => `${v.x},${v.y}`));
    const after = new Set(contourVertices(r).map((v) => `${v.x},${v.y}`));
    expect(after).toEqual(before);
    expect(validateContour(r)).toEqual({ ok: true });
  });
});

describe("filletCorner", () => {
  test("rounds a 90° corner into a tangent arc", () => {
    const c = filletCorner(square(), 1, 3);
    expect(c).not.toBeNull();
    expect(c!.segments.some((s) => s.type === "arc")).toBe(true);
    expect(validateContour(c!)).toEqual({ ok: true });
    // Bbox unchanged; the filleted corner is no longer a hard vertex.
    expect(c!.widthMm).toBeCloseTo(20, 3);
    const verts = contourVertices(c!);
    expect(verts.some((v) => v.x === 20 && v.y === 0)).toBe(false);
  });

  test("rejects a radius that overruns the adjacent edges", () => {
    expect(filletCorner(square(), 1, 25)).toBeNull();
  });

  test("refuses an arc-adjacent corner (v1 line-line only)", () => {
    const filleted = filletCorner(square(), 1, 3)!;
    // Vertex 1 of the filleted contour is a tangent point flanked by the arc.
    const arcIdx = filleted.segments.findIndex((s) => s.type === "arc");
    // The vertex ending the arc has the arc as an incoming edge → not filletable.
    expect(filletCorner(filleted, (arcIdx + 1) % filleted.segments.length, 1)).toBeNull();
  });
});

describe("chamferCorner", () => {
  test("bevels a corner into two line edges", () => {
    const c = chamferCorner(square(), 1, 4);
    expect(c).not.toBeNull();
    expect(c!.segments.every((s) => s.type === "line")).toBe(true);
    expect(contourVertices(c!)).toHaveLength(5); // one corner → two vertices
    expect(validateContour(c!)).toEqual({ ok: true });
  });

  test("rejects an over-long setback", () => {
    expect(chamferCorner(square(), 1, 25)).toBeNull();
  });
});

describe("vertex editing (contour)", () => {
  test("moveVertex relocates a vertex and stays valid", () => {
    const c = moveVertex(square(), 1, { x: 25, y: -5 }) as PcbBoardContour;
    expect(outlineVertices(c)).toContainEqual({ x: 25, y: -5 });
    expect(validateContour(c)).toEqual({ ok: true });
  });

  test("moveVertex is a no-op next to an arc", () => {
    const filleted = filletCorner(square(), 1, 3)!;
    const arcIdx = filleted.segments.findIndex((s) => s.type === "arc");
    const before = JSON.stringify(filleted);
    const after = moveVertex(filleted, arcIdx, { x: 99, y: 99 });
    expect(JSON.stringify(after)).toBe(before);
  });

  test("insertVertexAtEdge adds a vertex on a line edge", () => {
    const c = insertVertexAtEdge(square(), 0, { x: 10, y: 0 }) as PcbBoardContour;
    expect(outlineVertices(c)).toHaveLength(5);
    expect(validateContour(c)).toEqual({ ok: true });
  });

  test("deleteVertex merges edges; triangle refuses", () => {
    const c = deleteVertex(square(), 1) as PcbBoardContour;
    expect(outlineVertices(c)).toHaveLength(3);
    expect(validateContour(c)).toEqual({ ok: true });
    expect(deleteVertex(c, 0)).toBeNull(); // already a triangle
  });
});

describe("vertex editing (polygon)", () => {
  test("moveVertex updates a point + bbox", () => {
    const p = moveVertex(polySquare(), 2, { x: 30, y: 30 }) as PcbBoardOutlinePolygon;
    expect(p.pointsMm[2]).toEqual({ x: 30, y: 30 });
    expect(p.widthMm).toBeCloseTo(30, 6);
  });

  test("deleteVertex on a polygon square yields a triangle", () => {
    const p = deleteVertex(polySquare(), 0) as PcbBoardOutlinePolygon;
    expect(p.pointsMm).toHaveLength(3);
  });
});

describe("hit-testing + arc detection", () => {
  test("hitVertex finds the nearest grip", () => {
    expect(hitVertex(square(), { x: 20.3, y: 0.2 }, 1)).toBe(1);
    expect(hitVertex(square(), { x: 10, y: 10 }, 1)).toBeNull();
  });

  test("hitEdge finds a mid-edge insert point, not the endpoints", () => {
    const hit = hitEdge(square(), { x: 10, y: 0.2 }, 1);
    expect(hit?.edgeIndex).toBe(0);
    expect(hitEdge(square(), { x: 0.1, y: 0.1 }, 1)).toBeNull(); // near a vertex
  });

  test("outlineHasArcs reflects fillet state", () => {
    expect(outlineHasArcs(square())).toBe(false);
    expect(outlineHasArcs(filletCorner(square(), 1, 3)!)).toBe(true);
  });
});
