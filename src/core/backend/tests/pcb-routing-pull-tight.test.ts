import { describe, expect, test } from "bun:test";
import { pullTight } from "../../../shared/pcb-routing/pull-tight";
import { pathIntersectsAny } from "../../../shared/pcb-routing/collision";
import { buildTracePathThroughAnchors } from "../../../shared/pcb-geometry/pcb-trace-geometry";
import type { ObstacleRectNm, PointNm } from "../../../shared/pcb-routing/types";

const MM = 1_000_000;
const p = (x: number, y: number): PointNm => ({ x: x * MM, y: y * MM });

const rect = (
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  id = "r",
): ObstacleRectNm => ({
  minX: minX * MM,
  minY: minY * MM,
  maxX: maxX * MM,
  maxY: maxY * MM,
  id,
});

describe("pullTight", () => {
  test("collapses an obstacle-free staircase to the two endpoints", () => {
    const staircase = [
      p(0, 0),
      p(1, 0),
      p(1, 1),
      p(2, 1),
      p(2, 2),
      p(3, 2),
      p(3, 3),
      p(4, 3),
      p(4, 4),
    ];
    const out = pullTight({
      pathNm: staircase,
      obstacles: [],
      mode: "manhattan-45",
      posture: "auto",
    });
    expect(out).toEqual([p(0, 0), p(4, 4)]);
  });

  test("keeps a necessary detour anchor and never introduces a collision", () => {
    const wall = rect(1.5, -10, 2.5, 0.5, "wall");
    const detour = [p(0, 0), p(0, 1), p(1.5, 1), p(3, 1), p(4, 1), p(4, 0)];
    const out = pullTight({
      pathNm: detour,
      obstacles: [wall],
      mode: "manhattan-45",
      posture: "axis",
    });
    expect(out.length).toBeLessThan(detour.length);
    expect(out[0]).toEqual(p(0, 0));
    expect(out[out.length - 1]).toEqual(p(4, 0));
    const rendered = buildTracePathThroughAnchors(out, "manhattan-45", "axis");
    expect(pathIntersectsAny(rendered, [wall])).toBe(false);
  });

  test("idempotent: tightening a tight path changes nothing", () => {
    const once = pullTight({
      pathNm: [p(0, 0), p(2, 0), p(2, 2)],
      obstacles: [rect(0.5, 0.5, 1.5, 3, "block")],
      mode: "manhattan-90",
      posture: "axis",
    });
    const twice = pullTight({
      pathNm: once,
      obstacles: [rect(0.5, 0.5, 1.5, 3, "block")],
      mode: "manhattan-90",
      posture: "axis",
    });
    expect(twice).toEqual(once);
  });

  test("short paths pass through untouched", () => {
    expect(
      pullTight({
        pathNm: [p(0, 0), p(1, 1)],
        obstacles: [],
        mode: "manhattan-45",
        posture: "auto",
      }),
    ).toEqual([p(0, 0), p(1, 1)]);
  });
});
