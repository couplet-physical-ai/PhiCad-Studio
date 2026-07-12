import { describe, expect, test } from "bun:test";
import {
  assignLaneOffsets,
  buildBundleLanes,
  offsetPolylineNm,
} from "../../../shared/pcb-routing/bundle-geometry";
import {
  polylineLength,
  pointToPolylineDistance,
  validatePath,
} from "../../../shared/pcb-geometry/pcb-trace-geometry";
import type { PointNm } from "../../../shared/pcb-routing/types";

const MM = 1_000_000;
const p = (x: number, y: number): PointNm => ({ x: x * MM, y: y * MM });

describe("offsetPolylineNm", () => {
  test("90° L-path offsets exactly with an integer miter corner", () => {
    const center = [p(0, 0), p(10, 0), p(10, 10)];
    const left = offsetPolylineNm(center, 1 * MM);
    expect(left.ok).toBe(true);
    // Travel +x then +y: left normal is +y then −x.
    expect(left.pointsNm).toEqual([
      { x: 0, y: 1 * MM },
      { x: 9 * MM, y: 1 * MM },
      { x: 9 * MM, y: 10 * MM },
    ]);
    const right = offsetPolylineNm(center, -1 * MM);
    expect(right.ok).toBe(true);
    expect(right.pointsNm).toEqual([
      { x: 0, y: -1 * MM },
      { x: 11 * MM, y: -1 * MM },
      { x: 11 * MM, y: 10 * MM },
    ]);
  });

  test("mixed axis/diagonal path stays exactly 45°-valid at ~pitch distance", () => {
    const center = [p(0, 0), p(5, 0), p(9, 4), p(15, 4)];
    for (const offset of [800_000, -800_000, 1_337_000]) {
      const lane = offsetPolylineNm(center, offset);
      expect(lane.ok).toBe(true);
      expect(validatePath(lane.pointsNm, "manhattan-45")).toBeNull();
      // Sample midpoints of every lane segment: distance to the centerline
      // must equal |offset| within the ≤1 nm diagonal parity slack.
      for (let i = 1; i < lane.pointsNm.length; i += 1) {
        const mid = {
          x: (lane.pointsNm[i - 1]!.x + lane.pointsNm[i]!.x) / 2,
          y: (lane.pointsNm[i - 1]!.y + lane.pointsNm[i]!.y) / 2,
        };
        const d = pointToPolylineDistance(mid, [...center]).distance;
        expect(Math.abs(d - Math.abs(offset))).toBeLessThanOrEqual(2);
      }
    }
  });

  test("inside offset of a U-shape reverses the middle leg — degenerates", () => {
    // U opening 2 mm; a 2 mm inside offset drives the middle leg backwards.
    const center = [p(0, 0), p(5, 0), p(5, 2), p(0, 2)];
    const inside = offsetPolylineNm(center, 2 * MM);
    expect(inside.ok).toBe(false);
    // The outside lane at the same distance is fine.
    expect(offsetPolylineNm(center, -2 * MM).ok).toBe(true);
  });

  test("exact back-track folds to the net span before offsetting", () => {
    // Collinear reversal is removed by simplifyCollinearPath — the offset
    // applies to the net 0→2 segment (buildPreviewPath never emits these).
    const lane = offsetPolylineNm([p(0, 0), p(5, 0), p(2, 0)], 1 * MM);
    expect(lane.ok).toBe(true);
    expect(lane.pointsNm).toEqual([
      { x: 0, y: 1 * MM },
      { x: 2 * MM, y: 1 * MM },
    ]);
  });

  test("zero offset returns the simplified centerline", () => {
    const lane = offsetPolylineNm([p(0, 0), p(5, 0), p(10, 0)], 0);
    expect(lane.ok).toBe(true);
    expect(lane.pointsNm).toEqual([p(0, 0), p(10, 0)]);
  });

  test("deterministic", () => {
    const center = [p(0, 0), p(5, 0), p(9, 4)];
    expect(offsetPolylineNm(center, 700_001)).toEqual(
      offsetPolylineNm(center, 700_001),
    );
  });
});

describe("assignLaneOffsets", () => {
  test("odd N: symmetric integer multiples, monotone along the row", () => {
    // Pads stacked in +y; fan-out towards +x → left normal is +y.
    const offsets = assignLaneOffsets({
      padPointsNm: [p(0, 2), p(0, 0), p(0, 1)],
      dirNm: { x: 1, y: 0 },
      pitchNm: 1 * MM,
    });
    // Sorted by y: index1 (y=0) → −1mm, index2 (y=1) → 0, index0 (y=2) → +1mm.
    expect(offsets).toEqual([1 * MM, -1 * MM, 0]);
  });

  test("even N: half-pitch straddle around the centerline", () => {
    const offsets = assignLaneOffsets({
      padPointsNm: [p(0, 0), p(0, 1)],
      dirNm: { x: 1, y: 0 },
      pitchNm: 1 * MM,
    });
    expect(offsets).toEqual([-500_000, 500_000]);
  });
});

describe("buildBundleLanes", () => {
  test("N lanes: valid, parallel, ~pitch apart, roughly equal length", () => {
    const center = [p(0, 0), p(8, 0), p(12, 4), p(20, 4)];
    const lanes = buildBundleLanes({
      centerlineNm: center,
      laneOffsetsNm: [-1 * MM, 0, 1 * MM],
      mode: "manhattan-45",
    });
    expect(lanes.every((l) => l.ok)).toBe(true);
    const lengths = lanes.map((l) => polylineLength(l.pointsNm));
    // Corner asymmetry shifts lane lengths a bit; all stay within 2·offset·√2.
    expect(Math.abs(lengths[0]! - lengths[2]!)).toBeLessThanOrEqual(
      2 * Math.SQRT2 * MM + 4,
    );
  });
});
