import { describe, expect, test } from "bun:test";
import {
  inferSketchPoint,
  resolveSketchTarget,
} from "../../../modules/designer/frontend/pcb/sketch-inference";

const p = (x: number, y: number) => ({ x, y });
const TOL = 1.0;

describe("inferSketchPoint", () => {
  test("snaps to a near existing vertex (coincidence) over an axis", () => {
    const r = inferSketchPoint(p(0, 0), p(10.3, 5.2), [p(10, 5)], TOL);
    expect(r.kind).toBe("vertex");
    expect(r.point).toEqual(p(10, 5));
    expect(r.guide).toBeNull();
  });

  test("locks a near-horizontal edge to y = prev.y with an axis guide", () => {
    const r = inferSketchPoint(p(0, 0), p(10, 0.4), [], TOL);
    expect(r.kind).toBe("horizontal");
    expect(r.point).toEqual(p(10, 0));
    expect(r.guide).not.toBeNull();
    expect(r.guide!.fromMm.y).toBe(0);
    expect(r.guide!.toMm.y).toBe(0);
  });

  test("locks a near-vertical edge to x = prev.x", () => {
    const r = inferSketchPoint(p(0, 0), p(-0.3, 12), [], TOL);
    expect(r.kind).toBe("vertical");
    expect(r.point).toEqual(p(0, 12));
  });

  test("returns none for a clearly diagonal edge", () => {
    const r = inferSketchPoint(p(0, 0), p(10, 10), [], TOL);
    expect(r.kind).toBe("none");
    expect(r.point).toEqual(p(10, 10));
    expect(r.guide).toBeNull();
  });

  test("does not snap to the anchor itself (degenerate short edge)", () => {
    const r = inferSketchPoint(p(5, 5), p(5.2, 5.1), [], TOL);
    expect(r.kind).toBe("none");
  });
});

describe("resolveSketchTarget precedence", () => {
  const prev = p(0, 0);

  test("typed dims win over inference", () => {
    const { point, infer } = resolveSketchTarget(prev, p(10, 0.2), {
      shiftLock: false,
      lengthMm: 7,
      angleDeg: 90,
      others: [p(10, 0)],
      tolMm: TOL,
    });
    expect(infer).toBeNull();
    expect(point.x).toBeCloseTo(0, 6);
    expect(point.y).toBeCloseTo(7, 6);
  });

  test("shift lock wins over inference (suppresses soft snap)", () => {
    const { point, infer } = resolveSketchTarget(prev, p(10, 0.4), {
      shiftLock: true,
      others: [],
      tolMm: TOL,
    });
    expect(infer).toBeNull();
    // 45° lock rounds the near-horizontal cursor to exact horizontal, keeping
    // the cursor's DISTANCE (≈10.008), so x is ~10, y is 0.
    expect(point.y).toBeCloseTo(0, 6);
    expect(point.x).toBeCloseTo(10, 1);
  });

  test("inference applies when neither typed nor shift", () => {
    const { point, infer } = resolveSketchTarget(prev, p(10, 0.4), {
      shiftLock: false,
      others: [],
      tolMm: TOL,
    });
    expect(infer?.kind).toBe("horizontal");
    expect(point).toEqual(p(10, 0));
  });

  test("no snap → raw cursor, null infer", () => {
    const { point, infer } = resolveSketchTarget(prev, p(9, 9), {
      shiftLock: false,
      others: [],
      tolMm: TOL,
    });
    expect(infer).toBeNull();
    expect(point).toEqual(p(9, 9));
  });
});
