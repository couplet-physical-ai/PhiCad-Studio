import { describe, expect, test } from "bun:test";
import {
  buildPcbSpatialIndex,
  pointQueryBox,
} from "../../../modules/designer/frontend/pcb/spatial-index";
import type { PcbTrace, PcbVia } from "../../../sdks/designer";

function trace(
  id: string,
  pointsNm: Array<{ x: number; y: number }>,
  widthMm = 0.25,
): PcbTrace {
  return {
    id,
    netId: null,
    netClassId: "default",
    layer: "F.Cu",
    widthMm,
    pointsNm,
    segmentMode: "manhattan-90",
  };
}

function via(id: string, x: number, y: number): PcbVia {
  return {
    id,
    netId: null,
    netClassId: "default",
    centerMm: { x, y },
    diameterMm: 0.8,
    drillMm: 0.4,
    fromLayer: "F.Cu",
    toLayer: "B.Cu",
    viaType: "through",
    protection: "tented",
    provenance: "route",
  };
}

describe("buildPcbSpatialIndex", () => {
  const index = buildPcbSpatialIndex({
    placements: [],
    traces: [
      trace("near", [
        { x: 0, y: 0 },
        { x: 5_000_000, y: 0 },
      ]),
      trace("far", [
        { x: 50_000_000, y: 50_000_000 },
        { x: 60_000_000, y: 50_000_000 },
      ]),
    ],
    vias: [via("v-near", 2, 0), via("v-far", 55, 50)],
  });

  test("query near the first trace returns only nearby copper", () => {
    const box = pointQueryBox({ x: 2, y: 0 }, 1);
    expect(index.queryTraces(box).map((t) => t.id)).toEqual(["near"]);
    expect(index.queryVias(box).map((v) => v.id)).toEqual(["v-near"]);
  });

  test("trace bbox is inflated by half width (edge hit just outside centerline)", () => {
    // Cursor 0.1mm above the centerline of a 0.25mm-wide trace: inside the
    // inflated bbox even with a tiny query radius.
    const box = pointQueryBox({ x: 2, y: 0.1 }, 0.05);
    expect(index.queryTraces(box).map((t) => t.id)).toEqual(["near"]);
  });

  test("empty region returns nothing", () => {
    const box = pointQueryBox({ x: -20, y: -20 }, 1);
    expect(index.queryTraces(box)).toEqual([]);
    expect(index.queryVias(box)).toEqual([]);
    expect(index.queryPlacements(box)).toEqual([]);
  });
});
