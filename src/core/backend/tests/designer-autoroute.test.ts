import { describe, expect, test } from "bun:test";
import {
  inflateRect,
  routeSchematicWire,
  routeSchematicWireDetailed,
  type Rect,
} from "../../../modules/designer/backend/routing/schematic-autoroute";
import {
  autoRouteWirePoints,
  collectWireObstacles,
} from "../../../modules/designer/backend/routing/wire-obstacles";
import type {
  DesignerPin,
  DesignerSchematicProjection,
} from "../../../sdks/designer/types";

type Point = { x: number; y: number };

/** Strict-interior crossing test mirroring the router's own predicate. */
function segmentHitsRect(a: Point, b: Point, r: Rect): boolean {
  if (a.y === b.y) {
    const y = a.y;
    if (!(r.minY < y && y < r.maxY)) return false;
    return (
      Math.max(Math.min(a.x, b.x), r.minX) <
      Math.min(Math.max(a.x, b.x), r.maxX)
    );
  }
  if (a.x === b.x) {
    const x = a.x;
    if (!(r.minX < x && x < r.maxX)) return false;
    return (
      Math.max(Math.min(a.y, b.y), r.minY) <
      Math.min(Math.max(a.y, b.y), r.maxY)
    );
  }
  return false;
}

function isOrthogonal(path: Point[]): boolean {
  for (let i = 1; i < path.length; i += 1) {
    const a = path[i - 1]!;
    const b = path[i]!;
    if (a.x !== b.x && a.y !== b.y) return false;
  }
  return true;
}

function crossesAny(path: Point[], rects: Rect[]): boolean {
  for (let i = 1; i < path.length; i += 1) {
    for (const r of rects) {
      if (segmentHitsRect(path[i - 1]!, path[i]!, r)) return true;
    }
  }
  return false;
}

describe("schematic auto-router", () => {
  test("collinear clear → straight two-point path", () => {
    const path = routeSchematicWire({
      source: { x: 17, y: 23 },
      target: { x: 1_000_017, y: 23 },
      obstacles: [],
    });
    expect(path).toEqual([
      { x: 17, y: 23 },
      { x: 1_000_017, y: 23 },
    ]);
  });

  test("clear diagonal → single L (HV)", () => {
    const path = routeSchematicWire({
      source: { x: 0, y: 0 },
      target: { x: 60_000_000, y: 40_000_000 },
      obstacles: [],
    });
    expect(path).toEqual([
      { x: 0, y: 0 },
      { x: 60_000_000, y: 0 },
      { x: 60_000_000, y: 40_000_000 },
    ]);
  });

  test("obstacle on the straight line → orthogonal detour that avoids it", () => {
    const obstacle: Rect = {
      minX: 20_000_000,
      minY: -10_000_000,
      maxX: 40_000_000,
      maxY: 10_000_000,
    };
    const path = routeSchematicWire({
      source: { x: 0, y: 0 },
      target: { x: 60_000_000, y: 0 },
      obstacles: [obstacle],
    });
    expect(path[0]).toEqual({ x: 0, y: 0 });
    expect(path[path.length - 1]).toEqual({ x: 60_000_000, y: 0 });
    expect(isOrthogonal(path)).toBe(true);
    expect(path.length).toBeGreaterThan(2); // had to detour
    expect(crossesAny(path, [obstacle])).toBe(false);
  });

  test("deterministic under shuffled obstacle order", () => {
    const a: Rect = {
      minX: 20_000_000,
      minY: -10_000_000,
      maxX: 40_000_000,
      maxY: 10_000_000,
    };
    const b: Rect = {
      minX: 20_000_000,
      minY: 20_000_000,
      maxX: 40_000_000,
      maxY: 40_000_000,
    };
    const p1 = routeSchematicWire({
      source: { x: 0, y: 0 },
      target: { x: 60_000_000, y: 0 },
      obstacles: [a, b],
    });
    const p2 = routeSchematicWire({
      source: { x: 0, y: 0 },
      target: { x: 60_000_000, y: 0 },
      obstacles: [b, a],
    });
    expect(p2).toEqual(p1);
  });

  test("coincident endpoints → degenerate two-point path", () => {
    const path = routeSchematicWire({
      source: { x: 5, y: 5 },
      target: { x: 5, y: 5 },
      obstacles: [],
    });
    expect(path).toEqual([
      { x: 5, y: 5 },
      { x: 5, y: 5 },
    ]);
  });

  test("inflateRect expands symmetrically", () => {
    expect(inflateRect({ minX: 0, minY: 0, maxX: 10, maxY: 10 }, 5)).toEqual({
      minX: -5,
      minY: -5,
      maxX: 15,
      maxY: 15,
    });
  });
});

describe("wire + primitive obstacles", () => {
  const MM = 1_000_000;

  function pin(id: string, x: number, y: number): DesignerPin {
    return {
      id,
      originPinKey: id,
      number: null,
      name: "",
      electricalType: "passive",
      unit: 1,
      localPositionNm: { x: 0, y: 0 },
      worldPositionNm: { x, y },
    };
  }

  function proj(p: {
    parts?: DesignerSchematicProjection["parts"];
    wires?: DesignerSchematicProjection["wires"];
    primitives?: DesignerSchematicProjection["primitives"];
  }): DesignerSchematicProjection {
    return {
      designId: "d",
      revision: 1,
      parts: p.parts ?? [],
      wires: p.wires ?? [],
      labels: [],
      primitives: p.primitives ?? [],
      junctions: [],
      nets: [],
    };
  }

  const s = pin("U1:1", 0, 0);
  const t = pin("U2:1", 20 * MM, 0);
  // Vertical wire crossing the straight source→target path at x=10mm.
  const blocker: DesignerSchematicProjection["wires"][number] = {
    id: "w1",
    sourcePinId: "U3:1",
    targetPinId: "U4:1",
    pointsNm: [
      { x: 10 * MM, y: -10 * MM },
      { x: 10 * MM, y: 10 * MM },
    ],
  };

  test("wire detours around an existing wire", () => {
    const path = autoRouteWirePoints(proj({ wires: [blocker] }), s, t);
    expect(isOrthogonal(path)).toBe(true);
    expect(path.length).toBeGreaterThan(2); // straight blocked → detour
  });

  test("wire sharing BOTH endpoint pins (self during re-route) is fully transparent", () => {
    const self = { ...blocker, sourcePinId: "U1:1", targetPinId: "U2:1" };
    const path = autoRouteWirePoints(proj({ wires: [self] }), s, t);
    expect(path).toEqual([
      { x: 0, y: 0 },
      { x: 20 * MM, y: 0 },
    ]);
  });

  test("same-net wire: segment at the shared end transparent, body still a wall", () => {
    // Existing same-net wire leaves the shared source pin (0,0) east along
    // y=0, then heads north — exactly the geometry a naive router would ride.
    const sameNet: DesignerSchematicProjection["wires"][number] = {
      id: "w-same",
      sourcePinId: "U1:1",
      targetPinId: "U5:1",
      pointsNm: [
        { x: 0, y: 0 },
        { x: 10 * MM, y: 0 },
        { x: 10 * MM, y: 10 * MM },
      ],
    };
    const path = autoRouteWirePoints(proj({ wires: [sameNet] }), s, t);
    // Route must not run along the same-net wire's vertical body: no segment
    // may lie on x=10mm between y=0 and y=10mm interior.
    for (let i = 1; i < path.length; i += 1) {
      const a = path[i - 1]!;
      const b = path[i]!;
      const onBody =
        a.x === 10 * MM &&
        b.x === 10 * MM &&
        Math.min(a.y, b.y) < 10 * MM &&
        Math.max(a.y, b.y) > 0;
      expect(onBody).toBe(false);
    }
    expect(isOrthogonal(path)).toBe(true);
    expect(path[0]).toEqual({ x: 0, y: 0 });
    expect(path[path.length - 1]).toEqual({ x: 20 * MM, y: 0 });
  });

  test("wire detours around a primitive body", () => {
    const gnd: DesignerSchematicProjection["primitives"][number] = {
      id: "g1",
      kind: "gnd",
      positionNm: { x: 10 * MM, y: 0 },
      rotationDeg: 0,
    };
    const path = autoRouteWirePoints(proj({ primitives: [gnd] }), s, t);
    expect(isOrthogonal(path)).toBe(true);
    expect(path.length).toBeGreaterThan(2);
  });

  test("collectWireObstacles excludes same-net wires, keeps others", () => {
    const base = {
      source: { x: 0, y: 0 },
      target: { x: 20 * MM, y: 0 },
      sourcePinId: "U1:1",
      targetPinId: "U2:1",
    };
    expect(collectWireObstacles(proj({ wires: [blocker] }), base).length).toBe(
      1,
    );
    expect(
      collectWireObstacles(
        proj({ wires: [{ ...blocker, sourcePinId: "U1:1" }] }),
        base,
      ).length,
    ).toBe(0);
  });

  test("deterministic under shuffled mixed obstacles", () => {
    const parts: DesignerSchematicProjection["parts"] = [];
    const primitives: DesignerSchematicProjection["primitives"] = [
      {
        id: "g1",
        kind: "gnd",
        positionNm: { x: 6 * MM, y: 0 },
        rotationDeg: 0,
      },
      {
        id: "p1",
        kind: "pwr",
        positionNm: { x: 14 * MM, y: 0 },
        rotationDeg: 0,
        railText: "+5V",
      },
    ];
    const wires: DesignerSchematicProjection["wires"] = [
      {
        id: "wa",
        sourcePinId: "Ua:1",
        targetPinId: "Ub:1",
        pointsNm: [
          { x: 10 * MM, y: -8 * MM },
          { x: 10 * MM, y: 8 * MM },
        ],
      },
      {
        id: "wb",
        sourcePinId: "Uc:1",
        targetPinId: "Ud:1",
        pointsNm: [
          { x: 4 * MM, y: -8 * MM },
          { x: 4 * MM, y: 8 * MM },
        ],
      },
    ];
    const a = autoRouteWirePoints(proj({ parts, primitives, wires }), s, t);
    const b = autoRouteWirePoints(
      proj({
        parts,
        primitives: [...primitives].reverse(),
        wires: [...wires].reverse(),
      }),
      s,
      t,
    );
    expect(a).toEqual(b);
  });

  test("fully enclosed target → known-colliding HV fallback flagged clean:false", () => {
    const source = { x: 0, y: 0 };
    const target = { x: 20, y: 20 };
    // Closed ring of obstacle rects around the target — no clean escape.
    const ring: Rect[] = [
      { minX: 10, minY: 10, maxX: 30, maxY: 12 }, // bottom wall
      { minX: 10, minY: 28, maxX: 30, maxY: 30 }, // top wall
      { minX: 10, minY: 10, maxX: 12, maxY: 30 }, // left wall
      { minX: 28, minY: 10, maxX: 30, maxY: 30 }, // right wall
    ];
    const detailed = routeSchematicWireDetailed({
      source,
      target,
      obstacles: ring,
    });
    expect(detailed.clean).toBe(false);
    // Fallback is the HV L-bend — never worse than the naive router.
    expect(detailed.points).toEqual([
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 20 },
    ]);
    // The points-only wrapper returns the same geometry.
    expect(routeSchematicWire({ source, target, obstacles: ring })).toEqual(
      detailed.points,
    );
  });

  test("clean route reports clean:true", () => {
    const detailed = routeSchematicWireDetailed({
      source: { x: 0, y: 0 },
      target: { x: 20, y: 20 },
      obstacles: [],
    });
    expect(detailed.clean).toBe(true);
  });
});
