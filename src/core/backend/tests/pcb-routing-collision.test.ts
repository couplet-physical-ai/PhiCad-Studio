import { describe, expect, test } from "bun:test";
import {
  canonicalizeObstacles,
  clusterObstacles,
  inflateRectNm,
  pathIntersectsAny,
  segmentIntersectsRectNm,
} from "../../../shared/pcb-routing/collision";
import type { ObstacleRectNm, PointNm } from "../../../shared/pcb-routing/types";

const rect = (
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  id = "r",
): ObstacleRectNm => ({ minX, minY, maxX, maxY, id });

const p = (x: number, y: number): PointNm => ({ x, y });

const R = rect(1_000_000, 1_000_000, 3_000_000, 3_000_000);

describe("segmentIntersectsRectNm", () => {
  test("axis-aligned segment crossing the interior hits", () => {
    expect(segmentIntersectsRectNm(p(0, 2_000_000), p(4_000_000, 2_000_000), R)).toBe(true);
  });

  test("segment fully outside misses", () => {
    expect(segmentIntersectsRectNm(p(0, 0), p(4_000_000, 0), R)).toBe(false);
    expect(segmentIntersectsRectNm(p(0, 4_000_000), p(500_000, 5_000_000), R)).toBe(false);
  });

  test("45° diagonal crossing the interior hits", () => {
    expect(segmentIntersectsRectNm(p(0, 0), p(4_000_000, 4_000_000), R)).toBe(true);
  });

  test("diagonal passing beside the rect misses", () => {
    expect(segmentIntersectsRectNm(p(3_500_000, 0), p(7_500_000, 4_000_000), R)).toBe(false);
  });

  test("running along an edge is boundary contact — allowed", () => {
    expect(
      segmentIntersectsRectNm(p(0, 1_000_000), p(4_000_000, 1_000_000), R),
    ).toBe(false);
    expect(
      segmentIntersectsRectNm(p(3_000_000, 0), p(3_000_000, 4_000_000), R),
    ).toBe(false);
  });

  test("corner touch is allowed", () => {
    // Diagonal through the exact corner (1e6, 1e6).
    expect(segmentIntersectsRectNm(p(0, 2_000_000), p(2_000_000, 0), R)).toBe(false);
  });

  test("endpoint strictly inside hits", () => {
    expect(segmentIntersectsRectNm(p(2_000_000, 2_000_000), p(9_000_000, 2_000_000), R)).toBe(true);
  });

  test("segment fully inside hits", () => {
    expect(
      segmentIntersectsRectNm(p(1_500_000, 1_500_000), p(2_500_000, 2_500_000), R),
    ).toBe(true);
  });

  test("zero-length segment: inside hits, on boundary and outside miss", () => {
    expect(segmentIntersectsRectNm(p(2_000_000, 2_000_000), p(2_000_000, 2_000_000), R)).toBe(true);
    expect(segmentIntersectsRectNm(p(1_000_000, 2_000_000), p(1_000_000, 2_000_000), R)).toBe(false);
    expect(segmentIntersectsRectNm(p(0, 0), p(0, 0), R)).toBe(false);
  });

  test("chord entering and exiting through adjacent edges hits", () => {
    expect(
      segmentIntersectsRectNm(p(500_000, 2_000_000), p(2_000_000, 3_500_000), R),
    ).toBe(true);
  });
});

describe("pathIntersectsAny", () => {
  test("multi-segment path with one offending segment hits", () => {
    const path = [p(0, 0), p(0, 2_000_000), p(4_000_000, 2_000_000)];
    expect(pathIntersectsAny(path, [R])).toBe(true);
  });

  test("clean detour path misses", () => {
    const path = [p(0, 0), p(0, 500_000), p(4_000_000, 500_000)];
    expect(pathIntersectsAny(path, [R])).toBe(false);
  });

  test("empty obstacle list never hits", () => {
    expect(pathIntersectsAny([p(0, 0), p(9, 9)], [])).toBe(false);
  });
});

describe("inflateRectNm", () => {
  test("inflates symmetrically and keeps id", () => {
    expect(inflateRectNm(rect(10, 20, 30, 40, "x"), 5)).toEqual(
      rect(5, 15, 35, 45, "x"),
    );
  });
});

describe("canonicalizeObstacles", () => {
  test("output order is independent of input permutation", () => {
    const a = rect(0, 0, 10, 10, "a");
    const b = rect(0, 0, 10, 10, "b");
    const c = rect(-5, 0, 10, 10, "c");
    const one = canonicalizeObstacles([a, b, c]);
    const two = canonicalizeObstacles([b, c, a]);
    expect(one).toEqual(two);
    expect(one.map((r) => r.id)).toEqual(["c", "a", "b"]);
  });
});

describe("clusterObstacles", () => {
  test("overlapping and touching rects merge; separate rects stay apart", () => {
    const clusters = clusterObstacles([
      rect(0, 0, 10, 10, "a"),
      rect(10, 0, 20, 10, "b"), // touching a
      rect(5, 5, 15, 15, "c"), // overlapping both
      rect(100, 100, 110, 110, "z"),
    ]);
    expect(clusters).toHaveLength(2);
    expect(clusters[0]!.memberIds).toEqual(["a", "b", "c"]);
    expect(clusters[0]!.bounds).toMatchObject({ minX: 0, minY: 0, maxX: 20, maxY: 15 });
    expect(clusters[1]!.memberIds).toEqual(["z"]);
  });

  test("deterministic under input permutation", () => {
    const rects = [
      rect(0, 0, 10, 10, "a"),
      rect(8, 0, 20, 10, "b"),
      rect(50, 50, 60, 60, "z"),
    ];
    const one = clusterObstacles(rects);
    const two = clusterObstacles([rects[2]!, rects[0]!, rects[1]!]);
    expect(one).toEqual(two);
  });

  test("empty input yields no clusters", () => {
    expect(clusterObstacles([])).toEqual([]);
  });
});
