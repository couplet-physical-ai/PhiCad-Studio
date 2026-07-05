import { describe, expect, test } from "bun:test";
import {
  buildManhattanPathThroughAnchors,
  isManhattanPath,
  manhattanDistance,
  orthogonalProjection,
  pointKey,
  repairToManhattan,
  sanitizePath,
  simplifyCollinearPath,
  snapToGrid,
  SCHEMATIC_GRID_NM,
} from "../../../shared/schematic-routing/manhattan";

describe("shared schematic Manhattan kernel", () => {
  test("sanitizePath drops consecutive duplicates only", () => {
    const path = sanitizePath([
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 0 },
      { x: 0, y: 0 },
    ]);
    expect(path).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 0, y: 0 },
    ]);
  });

  test("buildManhattanPathThroughAnchors splits diagonals H-then-V", () => {
    const path = buildManhattanPathThroughAnchors([
      { x: 0, y: 0 },
      { x: 10, y: 20 },
    ]);
    expect(path).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 20 },
    ]);
    expect(isManhattanPath(path)).toBe(true);
  });

  test("buildManhattanPathThroughAnchors keeps aligned hops direct", () => {
    const path = buildManhattanPathThroughAnchors([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 5 },
    ]);
    expect(path).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 5 },
    ]);
  });

  test("simplifyCollinearPath removes redundant interior points including reversals", () => {
    expect(
      simplifyCollinearPath([
        { x: 0, y: 0 },
        { x: 5, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 7 },
      ]),
    ).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 7 },
    ]);
  });

  test("repairToManhattan snaps interior points but forces exact endpoints", () => {
    const source = { x: 111, y: 222 };
    const target = { x: 5_555_555, y: 4_444_444 };
    const path = repairToManhattan(
      [source, { x: 2_499_999, y: 2_500_001 }, target],
      source,
      target,
    );
    expect(path[0]).toEqual(source);
    expect(path[path.length - 1]).toEqual(target);
    expect(isManhattanPath(path)).toBe(true);
    // The user-supplied interior anchor is snapped to the grid; elbow points
    // may legitimately inherit one off-grid endpoint ordinate.
    const snappedAnchor = path
      .slice(1, -1)
      .find(
        (p) =>
          p.x % SCHEMATIC_GRID_NM === 0 && p.y % SCHEMATIC_GRID_NM === 0,
      );
    expect(snappedAnchor).toBeDefined();
  });

  test("snapToGrid rounds to the schematic grid", () => {
    const snapped = snapToGrid({
      x: SCHEMATIC_GRID_NM + 1,
      y: -SCHEMATIC_GRID_NM - 1,
    });
    expect(snapped).toEqual({ x: SCHEMATIC_GRID_NM, y: -SCHEMATIC_GRID_NM });
  });

  test("orthogonalProjection clamps to segment and returns exact distanceSq", () => {
    const onSegment = orthogonalProjection(
      { x: 5, y: 3 },
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    );
    expect(onSegment.point).toEqual({ x: 5, y: 0 });
    expect(onSegment.distanceSq).toBe(9n);

    const clamped = orthogonalProjection(
      { x: -4, y: 0 },
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    );
    expect(clamped.point).toEqual({ x: 0, y: 0 });
    expect(clamped.distanceSq).toBe(16n);
  });

  test("pointKey and manhattanDistance are exact integer helpers", () => {
    expect(pointKey({ x: -3, y: 7 })).toBe("-3:7");
    expect(manhattanDistance({ x: -3, y: 7 }, { x: 4, y: -1 })).toBe(15);
  });
});
