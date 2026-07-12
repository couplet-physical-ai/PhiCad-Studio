import { validatePath } from "../pcb-geometry/pcb-trace-geometry";
import { segmentIntersectsRectNm } from "./collision";
import type { ObstacleRectNm, PointNm, RouteMode } from "./types";

/**
 * Serpentine (meander) generator for length tuning — KiCad pns_meander model
 * with turtle-built U shapes, no arcs.
 *
 * v1 scope:
 * - U's are placed only on AXIS-ALIGNED baseline segments (the dominant case;
 *   diagonal 45° segments pass through untouched).
 * - Mode validity is per-segment (validate45/90Path check segments, not
 *   corners): square U's are valid in both modes; 45-mode additionally gets
 *   chamfered corners (diagonal cuts).
 * - Deterministic: fixed shrink ladder, integer-nm geometry, no randomness.
 */
export interface MeanderInput {
  /** Trace geometry at tune start (integer nm). */
  baselinePointsNm: readonly PointNm[];
  /** Tuned span as distances along the baseline polyline (nm). */
  spanStartNm: number;
  spanEndNm: number;
  /** Max perpendicular reach of a U (nm). */
  amplitudeNm: number;
  /** U pitch along the baseline (nm). Caller floors at trackWidth+clearance. */
  spacingNm: number;
  mode: RouteMode;
  /** Extra routed length to add vs the baseline (nm). */
  targetExtraNm: number;
  /** Clearance-inflated keep-outs (same-net copper already transparent). */
  obstacles: readonly ObstacleRectNm[];
  /** Amplitude floor for the obstacle shrink ladder (nm). */
  minAmplitudeNm: number;
}

export interface MeanderResult {
  /** Full replacement polyline for the trace (baseline outside the span). */
  pointsNm: PointNm[];
  /** Numerically-exact extra length of pointsNm vs the baseline (nm). */
  achievedExtraNm: number;
  status: "ok" | "too-short" | "span-too-small";
}

/** Shrink ladder tried per U until it clears the obstacle field. */
const SHRINK_STEPS = [1, 0.75, 0.5, 0.25] as const;

function segLen(a: PointNm, b: PointNm): number {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
}

function pathLen(points: readonly PointNm[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += segLen(points[i - 1]!, points[i]!);
  }
  return total;
}

function polylineBlocked(
  points: readonly PointNm[],
  obstacles: readonly ObstacleRectNm[],
): boolean {
  for (let i = 1; i < points.length; i += 1) {
    for (const rect of obstacles) {
      if (segmentIntersectsRectNm(points[i - 1]!, points[i]!, rect)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * One U between baseline offsets [t0, t0+pitch] on an axis segment.
 * `dir` is the unit axis direction, `normal` the (alternating) unit normal.
 * 45-mode chamfers the four corners with cut c = min(A/2, pitch/4) (floored);
 * 90-mode emits the plain square U. Returns interior vertices only (the
 * baseline entry/exit points are added by the caller).
 */
function buildU(
  origin: PointNm,
  dir: PointNm,
  normal: PointNm,
  pitch: number,
  amplitude: number,
  mode: RouteMode,
): PointNm[] {
  const at = (t: number, s: number): PointNm => ({
    x: origin.x + dir.x * t + normal.x * s,
    y: origin.y + dir.y * t + normal.y * s,
  });
  if (mode === "manhattan-45") {
    const c = Math.min(Math.floor(amplitude / 2), Math.floor(pitch / 4));
    if (c >= 2) {
      return [
        at(0, 0),
        at(0, amplitude - c),
        at(c, amplitude),
        at(pitch - c, amplitude),
        at(pitch, amplitude - c),
        at(pitch, 0),
      ];
    }
  }
  return [
    at(0, 0),
    at(0, amplitude),
    at(pitch, amplitude),
    at(pitch, 0),
  ];
}

/**
 * Generate a serpentine over the requested span. Walks the baseline; each
 * axis-aligned segment overlapping the span is packed with alternating-side
 * U's until `targetExtraNm` is met. The final U's amplitude is trimmed by
 * integer binary search so the achieved extra lands on target. U's that
 * cannot clear the obstacle field even at `minAmplitudeNm` are skipped
 * (straight run) and the shortfall is reported via `status`/`achievedExtraNm`.
 */
export function generateMeander(input: MeanderInput): MeanderResult {
  const base = input.baselinePointsNm;
  const baseLen = pathLen(base);
  const spanStart = Math.max(0, Math.min(input.spanStartNm, input.spanEndNm));
  const spanEnd = Math.min(baseLen, Math.max(input.spanStartNm, input.spanEndNm));
  const pitch = Math.max(2, Math.round(input.spacingNm));
  const maxAmp = Math.max(2, Math.round(input.amplitudeNm));
  const minAmp = Math.max(2, Math.min(Math.round(input.minAmplitudeNm), maxAmp));

  const out: PointNm[] = [base[0]!];
  let walked = 0;
  let remaining = Math.max(0, input.targetExtraNm);
  let side = 1;
  let placedAny = false;

  const extraOf = (u: readonly PointNm[]): number => pathLen(u) - pitch;

  for (let i = 1; i < base.length; i += 1) {
    const a = base[i - 1]!;
    const b = base[i]!;
    const len = segLen(a, b);
    const axis = a.x === b.x || a.y === b.y;
    const overlapStart = Math.max(spanStart, walked);
    const overlapEnd = Math.min(spanEnd, walked + len);
    if (!axis || remaining <= 0 || overlapEnd - overlapStart < pitch) {
      out.push(b);
      walked += len;
      continue;
    }
    const dir: PointNm = {
      x: Math.sign(b.x - a.x),
      y: Math.sign(b.y - a.y),
    };
    const normalBase: PointNm = { x: -dir.y, y: dir.x };
    let t = Math.round(overlapStart - walked);
    const tMax = Math.round(overlapEnd - walked);
    while (t + pitch <= tMax && remaining > 0) {
      const origin: PointNm = {
        x: a.x + dir.x * t,
        y: a.y + dir.y * t,
      };
      const normal: PointNm = {
        x: normalBase.x * side,
        y: normalBase.y * side,
      };
      // Amplitude for this U: full, unless the remaining target needs less —
      // then binary-search the amplitude whose extra hits the remainder.
      let amp = maxAmp;
      if (extraOf(buildU(origin, dir, normal, pitch, amp, input.mode)) >
          remaining) {
        let lo = minAmp;
        let hi = maxAmp;
        while (lo < hi) {
          const mid = Math.floor((lo + hi) / 2);
          const extra = extraOf(
            buildU(origin, dir, normal, pitch, mid, input.mode),
          );
          if (extra < remaining) lo = mid + 1;
          else hi = mid;
        }
        amp = lo;
      }
      // Obstacle shrink ladder; skip the U entirely when even the floor hits.
      let u: PointNm[] | null = null;
      for (const factor of SHRINK_STEPS) {
        const tryAmp = Math.max(minAmp, Math.floor(amp * factor));
        const candidate = buildU(origin, dir, normal, pitch, tryAmp, input.mode);
        if (!polylineBlocked(candidate, input.obstacles)) {
          u = candidate;
          break;
        }
        if (tryAmp === minAmp) break;
      }
      if (u) {
        // Drop the U's entry vertex when it coincides with our current end.
        const last = out[out.length - 1]!;
        const first = u[0]!;
        if (last.x === first.x && last.y === first.y) {
          out.push(...u.slice(1));
        } else {
          out.push(...u);
        }
        remaining -= extraOf(u);
        placedAny = true;
        side = -side;
      }
      t += pitch;
    }
    out.push(b);
    walked += len;
  }

  const deduped: PointNm[] = [];
  for (const p of out) {
    const prev = deduped[deduped.length - 1];
    if (!prev || prev.x !== p.x || prev.y !== p.y) deduped.push(p);
  }
  const achieved = pathLen(deduped) - baseLen;
  if (validatePath(deduped, input.mode) !== null) {
    // Should be unreachable (all constructions are mode-valid); fail safe.
    return {
      pointsNm: [...base],
      achievedExtraNm: 0,
      status: "span-too-small",
    };
  }
  if (!placedAny) {
    return {
      pointsNm: [...base],
      achievedExtraNm: 0,
      status: "span-too-small",
    };
  }
  // Quantization slack: one pitch-worth of extra is the placement quantum.
  const quantum = Math.max(4, pitch);
  return {
    pointsNm: deduped,
    achievedExtraNm: achieved,
    status:
      input.targetExtraNm - achieved > quantum ? "too-short" : "ok",
  };
}
