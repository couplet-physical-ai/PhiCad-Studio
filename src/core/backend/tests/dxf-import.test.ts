import { describe, expect, test } from "bun:test";
import { inspectDxf } from "../../../modules/designer/backend/import/dxf/to-outline";
import { validateContour } from "../../../shared/rendering/pcb/contour-validation";
import {
  chainEdgesToLoops,
  type EdgeSeg,
} from "../../../shared/rendering/pcb/chain-edges";

/** Build a DXF from group-code/value pairs. */
function dxf(...pairs: Array<[number, string | number]>): string {
  return pairs.map(([code, value]) => `${code}\n${value}`).join("\n") + "\n";
}

function line(x0: number, y0: number, x1: number, y1: number): Array<[number, string | number]> {
  return [
    [0, "LINE"],
    [8, "Edge.Cuts"],
    [10, x0],
    [20, y0],
    [11, x1],
    [21, y1],
  ];
}

function wrapEntities(
  entities: Array<[number, string | number]>,
  header: Array<[number, string | number]> = [],
): string {
  return dxf(
    ...(header.length
      ? ([[0, "SECTION"], [2, "HEADER"], ...header, [0, "ENDSEC"]] as Array<
          [number, string | number]
        >)
      : []),
    [0, "SECTION"],
    [2, "ENTITIES"],
    ...entities,
    [0, "ENDSEC"],
    [0, "EOF"],
  );
}

const RECT = wrapEntities([
  ...line(0, 0, 20, 0),
  ...line(20, 0, 20, 10),
  ...line(20, 10, 0, 10),
  ...line(0, 10, 0, 0),
]);

describe("chainEdgesToLoops", () => {
  test("closes a square from four unordered, mixed-direction edges", () => {
    const edges: EdgeSeg[] = [
      { from: { x: 0, y: 10 }, to: { x: 0, y: 0 } },
      { from: { x: 20, y: 0 }, to: { x: 20, y: 10 } }, // reversed relative to walk
      { from: { x: 0, y: 0 }, to: { x: 20, y: 0 } },
      { from: { x: 20, y: 10 }, to: { x: 0, y: 10 } },
    ];
    const result = chainEdgesToLoops(edges, 0.01);
    expect(result.loops).toHaveLength(1);
    expect(result.loops[0]!.edges).toHaveLength(4);
    expect(result.openChainCount).toBe(0);
  });

  test("reports an open chain when an edge is missing", () => {
    const edges: EdgeSeg[] = [
      { from: { x: 0, y: 0 }, to: { x: 20, y: 0 } },
      { from: { x: 20, y: 0 }, to: { x: 20, y: 10 } },
    ];
    const result = chainEdgesToLoops(edges, 0.01);
    expect(result.loops).toHaveLength(0);
    expect(result.openChainCount).toBeGreaterThan(0);
  });
});

describe("inspectDxf", () => {
  test("turns a LINE rectangle into one valid outer loop", () => {
    const result = inspectDxf(RECT);
    expect(result.loops).toHaveLength(1);
    const outer = result.loops[0]!;
    expect(outer.role).toBe("outer");
    expect(outer.valid).toBe(true);
    expect(outer.widthMm).toBeCloseTo(20, 3);
    expect(outer.heightMm).toBeCloseTo(10, 3);
    expect(validateContour(outer.outline)).toEqual({ ok: true });
  });

  test("applies $INSUNITS = inch scaling", () => {
    const result = inspectDxf(
      wrapEntities(
        [
          ...line(0, 0, 20, 0),
          ...line(20, 0, 20, 10),
          ...line(20, 10, 0, 10),
          ...line(0, 10, 0, 0),
        ],
        [
          [9, "$INSUNITS"],
          [70, 1],
        ],
      ),
    );
    expect(result.detectedUnits).toBe("inch");
    expect(result.loops[0]!.widthMm).toBeCloseTo(20 * 25.4, 2);
  });

  test("a user unit override wins over the header", () => {
    const result = inspectDxf(RECT, { unitScaleMm: 2 });
    expect(result.loops[0]!.widthMm).toBeCloseTo(40, 3);
  });

  test("imports a CIRCLE as a closed two-arc loop", () => {
    const result = inspectDxf(
      wrapEntities([
        [0, "CIRCLE"],
        [8, "Edge.Cuts"],
        [10, 0],
        [20, 0],
        [40, 5],
      ]),
    );
    expect(result.loops).toHaveLength(1);
    const loop = result.loops[0]!;
    expect(loop.valid).toBe(true);
    expect(loop.outline.segments.some((seg) => seg.type === "arc")).toBe(true);
    expect(loop.widthMm).toBeCloseTo(10, 2);
    expect(loop.heightMm).toBeCloseTo(10, 2);
  });

  test("enforces the byte cap", () => {
    expect(() => inspectDxf(RECT, { maxBytes: 10 })).toThrow();
  });

  test("chains an ARC + lines into one loop (ARC angles are radians)", () => {
    // Quarter-arc rounded bottom-left corner (center 5,5 r5, 180°→270°) + 4
    // lines. A double degree→radian bug would misplace the arc and break chaining.
    const arcEnt = (
      cx: number,
      cy: number,
      r: number,
      startDeg: number,
      endDeg: number,
    ): Array<[number, string | number]> => [
      [0, "ARC"],
      [8, "Edge.Cuts"],
      [10, cx],
      [20, cy],
      [40, r],
      [50, startDeg],
      [51, endDeg],
    ];
    const result = inspectDxf(
      wrapEntities([
        ...arcEnt(5, 5, 5, 180, 270),
        ...line(5, 0, 10, 0),
        ...line(10, 0, 10, 10),
        ...line(10, 10, 0, 10),
        ...line(0, 10, 0, 5),
      ]),
    );
    expect(result.loops).toHaveLength(1);
    const loop = result.loops[0]!;
    expect(loop.valid).toBe(true);
    expect(loop.outline.segments.some((s) => s.type === "arc")).toBe(true);
    expect(loop.widthMm).toBeCloseTo(10, 2);
    expect(loop.heightMm).toBeCloseTo(10, 2);
  });
});
