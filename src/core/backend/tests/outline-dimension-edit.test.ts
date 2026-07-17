import { describe, expect, test } from "bun:test";
import {
  setEdgeLength,
  setVertexPosition,
} from "../../../modules/designer/frontend/pcb/outline-dimension-edit";
import { outlineVertices } from "../../../modules/designer/frontend/pcb/pcb-outline-edit";
import { verticesToContour } from "../../../modules/designer/frontend/pcb/sketch-geometry";
import { filletCorner } from "../../../modules/designer/frontend/pcb/outline-corners";

const square = () =>
  verticesToContour([
    { x: 0, y: 0 },
    { x: 20, y: 0 },
    { x: 20, y: 20 },
    { x: 0, y: 20 },
  ]);

describe("setEdgeLength", () => {
  test("slides the far endpoint to make the edge the exact length", () => {
    const next = setEdgeLength(square(), 0, 10)!;
    expect(next).not.toBeNull();
    const v = outlineVertices(next);
    // Edge 0 = v0(0,0) → v1; near end fixed, far end slides to (10,0).
    expect(v[0]).toEqual({ x: 0, y: 0 });
    expect(v[1]!.x).toBeCloseTo(10, 6);
    expect(v[1]!.y).toBeCloseTo(0, 6);
    expect(Math.hypot(v[1]!.x - v[0]!.x, v[1]!.y - v[0]!.y)).toBeCloseTo(10, 6);
  });

  test("rejects a non-positive length", () => {
    expect(setEdgeLength(square(), 0, 0)).toBeNull();
    expect(setEdgeLength(square(), 0, -5)).toBeNull();
  });

  test("rejects an out-of-range edge index", () => {
    expect(setEdgeLength(square(), 9, 10)).toBeNull();
  });

  test("rejects an edge whose far vertex is arc-adjacent", () => {
    const fil = filletCorner(square(), 1, 3)!;
    const n = fil.segments.length;
    const arcSeg = fil.segments.findIndex((s) => s.type === "arc");
    expect(arcSeg).toBeGreaterThanOrEqual(0);
    // Edge just before the arc: its far vertex (arc start) is arc-adjacent.
    const lineEdge = (arcSeg - 1 + n) % n;
    expect(setEdgeLength(fil, lineEdge, 5)).toBeNull();
  });
});

describe("setVertexPosition", () => {
  test("moves a vertex to an exact position", () => {
    const next = setVertexPosition(square(), 2, { x: 25, y: 18 })!;
    expect(next).not.toBeNull();
    expect(outlineVertices(next)[2]).toEqual({ x: 25, y: 18 });
  });

  test("rejects an arc-adjacent vertex", () => {
    const fil = filletCorner(square(), 1, 3)!;
    const arcSeg = fil.segments.findIndex((s) => s.type === "arc");
    const arcEndVertex = (arcSeg + 1) % fil.segments.length;
    expect(setVertexPosition(fil, arcEndVertex, { x: 99, y: 99 })).toBeNull();
  });

  test("rejects an out-of-range vertex", () => {
    expect(setVertexPosition(square(), 12, { x: 0, y: 0 })).toBeNull();
  });
});
