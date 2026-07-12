import { describe, expect, test } from "bun:test";
import {
  generateMeander,
  type MeanderInput,
} from "../../../shared/pcb-routing/meander";
import { pathIntersectsAny } from "../../../shared/pcb-routing/collision";
import {
  polylineLength,
  validatePath,
} from "../../../shared/pcb-geometry/pcb-trace-geometry";
import type {
  ObstacleRectNm,
  PointNm,
} from "../../../shared/pcb-routing/types";

const MM = 1_000_000;
const p = (x: number, y: number): PointNm => ({ x: x * MM, y: y * MM });

const STRAIGHT_20MM = [p(0, 0), p(20, 0)];

function input(overrides: Partial<MeanderInput> = {}): MeanderInput {
  return {
    baselinePointsNm: STRAIGHT_20MM,
    spanStartNm: 0,
    spanEndNm: 20 * MM,
    amplitudeNm: 2 * MM,
    spacingNm: 1 * MM,
    mode: "manhattan-90",
    targetExtraNm: 8 * MM,
    obstacles: [],
    minAmplitudeNm: 200_000,
    ...overrides,
  };
}

function extraOf(result: ReturnType<typeof generateMeander>): number {
  return (
    polylineLength(result.pointsNm) - polylineLength(STRAIGHT_20MM)
  );
}

describe("generateMeander", () => {
  test("square U's hit an exactly-representable target (90-mode)", () => {
    // Square U extra = 2A → 8 mm target = 2 U's at A = 2 mm.
    const result = generateMeander(input());
    expect(result.status).toBe("ok");
    expect(validatePath(result.pointsNm, "manhattan-90")).toBeNull();
    // achievedExtraNm is the numerically-exact geometry delta.
    expect(result.achievedExtraNm).toBeCloseTo(extraOf(result), 6);
    expect(result.achievedExtraNm).toBeCloseTo(8 * MM, -3);
    // Endpoints untouched.
    expect(result.pointsNm[0]).toEqual(p(0, 0));
    expect(result.pointsNm[result.pointsNm.length - 1]).toEqual(p(20, 0));
  });

  test("chamfered U's in 45-mode are mode-valid and land near target", () => {
    const result = generateMeander(
      input({ mode: "manhattan-45", targetExtraNm: 7 * MM }),
    );
    expect(result.status).toBe("ok");
    expect(validatePath(result.pointsNm, "manhattan-45")).toBeNull();
    // Contains actual diagonal chamfer segments.
    const hasDiagonal = result.pointsNm.some((pt, i) => {
      if (i === 0) return false;
      const prev = result.pointsNm[i - 1]!;
      const dx = Math.abs(pt.x - prev.x);
      const dy = Math.abs(pt.y - prev.y);
      return dx > 0 && dx === dy;
    });
    expect(hasDiagonal).toBe(true);
    expect(result.achievedExtraNm).toBeCloseTo(extraOf(result), 6);
    // Within one pitch-quantum of the target.
    expect(Math.abs(result.achievedExtraNm - 7 * MM)).toBeLessThanOrEqual(
      1 * MM,
    );
  });

  test("obstacles shrink or skip U's; output never collides", () => {
    // Keep-out hovering over the middle of the span, low enough to block
    // full-amplitude U's on the +y side.
    const obstacles: ObstacleRectNm[] = [
      {
        minX: 6 * MM,
        minY: 500_000,
        maxX: 14 * MM,
        maxY: 5 * MM,
        id: "block",
      },
    ];
    const blocked = generateMeander(input({ obstacles }));
    expect(pathIntersectsAny(blocked.pointsNm, obstacles)).toBe(false);
    expect(validatePath(blocked.pointsNm, "manhattan-90")).toBeNull();
    // It still adds length (U's outside/under the block, shrunk inside).
    expect(blocked.achievedExtraNm).toBeGreaterThan(0);
  });

  test("insufficient span reports honestly", () => {
    const tiny = generateMeander(
      input({ spanStartNm: 0, spanEndNm: 500_000 }),
    );
    expect(tiny.status).toBe("span-too-small");
    expect(tiny.pointsNm).toEqual(STRAIGHT_20MM);
    expect(tiny.achievedExtraNm).toBe(0);

    const short = generateMeander(
      input({ spanEndNm: 3 * MM, targetExtraNm: 50 * MM }),
    );
    expect(short.status).toBe("too-short");
    expect(short.achievedExtraNm).toBeLessThan(50 * MM);
  });

  test("multi-segment baseline meanders across axis and diagonal legs", () => {
    const baseline = [p(0, 0), p(10, 0), p(14, 4), p(14, 14)];
    const result = generateMeander(
      input({
        baselinePointsNm: baseline,
        spanStartNm: 0,
        spanEndNm: polylineLength(baseline),
        mode: "manhattan-45",
        targetExtraNm: 10 * MM,
      }),
    );
    expect(validatePath(result.pointsNm, "manhattan-45")).toBeNull();
    expect(result.achievedExtraNm).toBeCloseTo(
      polylineLength(result.pointsNm) - polylineLength(baseline),
      6,
    );
    // Segment boundary vertices survive untouched (U's never cross them).
    expect(result.pointsNm).toContainEqual(p(10, 0));
    expect(result.pointsNm).toContainEqual(p(14, 4));
  });

  test("diagonal-only baseline gets integer-exact 45-valid U's", () => {
    const baseline = [p(0, 0), p(14, 14)];
    const result = generateMeander(
      input({
        baselinePointsNm: baseline,
        spanStartNm: 0,
        spanEndNm: polylineLength(baseline),
        mode: "manhattan-45",
        targetExtraNm: 6 * MM,
      }),
    );
    expect(result.status).toBe("ok");
    expect(validatePath(result.pointsNm, "manhattan-45")).toBeNull();
    // Every vertex stays exact integer nm (lattice-frame construction).
    for (const pt of result.pointsNm) {
      expect(Number.isInteger(pt.x)).toBe(true);
      expect(Number.isInteger(pt.y)).toBe(true);
    }
    expect(result.achievedExtraNm).toBeCloseTo(
      polylineLength(result.pointsNm) - polylineLength(baseline),
      6,
    );
    // Within one pitch-quantum of the target.
    expect(Math.abs(result.achievedExtraNm - 6 * MM)).toBeLessThanOrEqual(
      1 * MM + 4,
    );
    expect(result.pointsNm[0]).toEqual(p(0, 0));
    expect(result.pointsNm[result.pointsNm.length - 1]).toEqual(p(14, 14));
  });

  test("fully fenced span reports blocked, not span-too-small", () => {
    // Keep-outs hug the baseline on BOTH sides — every U position exists but
    // none can clear even at the amplitude floor.
    const obstacles: ObstacleRectNm[] = [
      { minX: -1 * MM, minY: 100_000, maxX: 21 * MM, maxY: 5 * MM, id: "up" },
      {
        minX: -1 * MM,
        minY: -5 * MM,
        maxX: 21 * MM,
        maxY: -100_000,
        id: "down",
      },
    ];
    const result = generateMeander(input({ obstacles }));
    expect(result.status).toBe("blocked");
    expect(result.pointsNm).toEqual(STRAIGHT_20MM);
    expect(result.achievedExtraNm).toBe(0);
  });

  test("deterministic across repeated runs", () => {
    const one = generateMeander(input({ mode: "manhattan-45" }));
    const two = generateMeander(input({ mode: "manhattan-45" }));
    expect(two).toEqual(one);
  });

  test("zero/negative target reports target-met with the baseline", () => {
    for (const targetExtraNm of [0, -3 * MM]) {
      const result = generateMeander(input({ targetExtraNm }));
      expect(result.achievedExtraNm).toBe(0);
      expect(result.status).toBe("target-met");
      expect(result.pointsNm).toEqual(STRAIGHT_20MM);
    }
  });
});
