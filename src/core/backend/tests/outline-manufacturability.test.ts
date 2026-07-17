import { describe, expect, test } from "bun:test";
import { flattenOutline } from "../../../shared/rendering/pcb/outline-geometry";
import {
  boardSlotRing,
  findNarrowestSlot,
  findSmallInternalRadii,
} from "../../../shared/rendering/pcb/outline-manufacturability";
import { verticesToContour } from "../../../modules/designer/frontend/pcb/sketch-geometry";
import { filletCorner } from "../../../modules/designer/frontend/pcb/outline-corners";

// L-shape (CCW) with a concave inner corner at index 3 = (10,10).
const lShape = () =>
  verticesToContour([
    { x: 0, y: 0 },
    { x: 20, y: 0 },
    { x: 20, y: 10 },
    { x: 10, y: 10 },
    { x: 10, y: 20 },
    { x: 0, y: 20 },
  ]);

const square = () =>
  verticesToContour([
    { x: 0, y: 0 },
    { x: 20, y: 0 },
    { x: 20, y: 20 },
    { x: 0, y: 20 },
  ]);

describe("findSmallInternalRadii", () => {
  test("flags a tight concave (internal) fillet", () => {
    const filleted = filletCorner(lShape(), 3, 0.3)!;
    expect(findSmallInternalRadii(filleted, 0.8)).toHaveLength(1);
  });

  test("passes a concave fillet at or above the minimum", () => {
    const filleted = filletCorner(lShape(), 3, 2)!;
    expect(findSmallInternalRadii(filleted, 0.8)).toHaveLength(0);
  });

  test("never flags a convex (outer) fillet", () => {
    const convex = filletCorner(square(), 1, 0.3)!;
    expect(findSmallInternalRadii(convex, 0.8)).toHaveLength(0);
  });

  test("passes a convex line-only outline", () => {
    expect(findSmallInternalRadii(square(), 0.8)).toHaveLength(0);
  });

  test("flags a sharp (unfilleted) concave line corner as radius 0", () => {
    const hits = findSmallInternalRadii(lShape(), 0.8);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.radiusMm).toBe(0);
    expect(hits[0]!.locationMm).toEqual({ x: 10, y: 10 });
  });
});

describe("boardSlotRing", () => {
  test("returns null for convex parametric shapes (no false slot)", () => {
    expect(
      boardSlotRing({
        kind: "roundrect",
        widthMm: 80,
        heightMm: 60,
        centerMm: { x: 0, y: 0 },
        cornerRadiusMm: 3,
      }),
    ).toBeNull();
    // A large roundrect must NOT be flagged for a false narrow slot.
  });

  test("returns the coarse vertex ring for a contour", () => {
    const ring = boardSlotRing(square());
    expect(ring).not.toBeNull();
    expect(ring!.length).toBe(4);
  });
});

describe("findNarrowestSlot", () => {
  test("flags a thin neck below the minimum", () => {
    const thin = verticesToContour([
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 0.5 },
      { x: 0, y: 0.5 },
    ]);
    const slot = findNarrowestSlot(flattenOutline(thin), 1.0);
    expect(slot).not.toBeNull();
    expect(slot!.gapMm).toBeCloseTo(0.5, 3);
  });

  test("passes a board wider than the minimum everywhere", () => {
    expect(findNarrowestSlot(flattenOutline(square()), 1.0)).toBeNull();
  });
});
