import { describe, expect, test } from "bun:test";
import { validateContour } from "../../../shared/rendering/pcb/contour-validation";
import {
  constrainAngle,
  verticesToContour,
} from "../../../modules/designer/frontend/pcb/sketch-geometry";
import {
  canCloseSketch,
  initialSketchToolState,
  sketchToolReducer,
  type SketchToolState,
} from "../../../modules/designer/frontend/pcb/tools/sketch-tool-state";

function drive(events: Parameters<typeof sketchToolReducer>[1][]): SketchToolState {
  return events.reduce(sketchToolReducer, initialSketchToolState);
}

describe("sketchToolReducer", () => {
  test("start begins a session with one vertex", () => {
    const s = drive([{ kind: "start", pointMm: { x: 0, y: 0 } }]);
    expect(s.kind).toBe("drawing");
    if (s.kind === "drawing") expect(s.session.verticesMm).toHaveLength(1);
  });

  test("commit-vertex appends and ignores exact duplicates", () => {
    const s = drive([
      { kind: "start", pointMm: { x: 0, y: 0 } },
      { kind: "commit-vertex", pointMm: { x: 10, y: 0 } },
      { kind: "commit-vertex", pointMm: { x: 10, y: 0 } },
      { kind: "commit-vertex", pointMm: { x: 10, y: 10 } },
    ]);
    if (s.kind === "drawing") expect(s.session.verticesMm).toHaveLength(3);
    else throw new Error("expected drawing");
  });

  test("undo-vertex pops, and empties back to idle", () => {
    const two = drive([
      { kind: "start", pointMm: { x: 0, y: 0 } },
      { kind: "commit-vertex", pointMm: { x: 10, y: 0 } },
      { kind: "undo-vertex" },
    ]);
    if (two.kind === "drawing") expect(two.session.verticesMm).toHaveLength(1);
    const empty = sketchToolReducer(two, { kind: "undo-vertex" });
    expect(empty.kind).toBe("idle");
  });

  test("cancel returns to idle", () => {
    const s = drive([
      { kind: "start", pointMm: { x: 0, y: 0 } },
      { kind: "commit-vertex", pointMm: { x: 10, y: 0 } },
      { kind: "cancel" },
    ]);
    expect(s.kind).toBe("idle");
  });

  test("canCloseSketch requires >= 3 vertices", () => {
    const two = drive([
      { kind: "start", pointMm: { x: 0, y: 0 } },
      { kind: "commit-vertex", pointMm: { x: 10, y: 0 } },
    ]);
    expect(canCloseSketch(two)).toBe(false);
    const three = sketchToolReducer(two, { kind: "commit-vertex", pointMm: { x: 0, y: 10 } });
    expect(canCloseSketch(three)).toBe(true);
  });
});

describe("constrainAngle", () => {
  test("passes the cursor through when disabled", () => {
    const p = constrainAngle({ x: 0, y: 0 }, { x: 3, y: 1 }, false);
    expect(p).toEqual({ x: 3, y: 1 });
  });

  test("snaps a near-45° drag onto the exact diagonal", () => {
    const p = constrainAngle({ x: 0, y: 0 }, { x: 10, y: 9 }, true);
    // 10,9 is ~42° → snaps to 45°; equal components, distance preserved.
    expect(p.x).toBeCloseTo(p.y, 6);
  });

  test("snaps a near-horizontal drag onto the axis", () => {
    const p = constrainAngle({ x: 0, y: 0 }, { x: 10, y: 1 }, true);
    expect(p.y).toBeCloseTo(0, 6);
    expect(p.x).toBeGreaterThan(9);
  });
});

describe("verticesToContour", () => {
  test("produces a canonical, valid, explicit-closure contour", () => {
    const c = verticesToContour([
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 0, y: 10 },
    ]);
    expect(c.kind).toBe("contour");
    expect(c.segments).toHaveLength(3);
    expect(c.segments[c.segments.length - 1]!.to).toEqual({ x: 0, y: 0 });
    expect(c.widthMm).toBeCloseTo(20, 6);
    expect(validateContour(c)).toEqual({ ok: true });
  });
});
