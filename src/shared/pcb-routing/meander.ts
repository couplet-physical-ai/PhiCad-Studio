import { validatePath } from "../pcb-geometry/pcb-trace-geometry";
import { segmentIntersectsRectNm } from "./collision";
import type { ObstacleRectNm, PointNm, RouteMode } from "./types";

/**
 * Serpentine (meander) generator for length tuning — KiCad pns_meander model
 * with turtle-built U shapes, no arcs.
 *
 * Geometry model: each baseline segment defines a LATTICE FRAME (u, n) of
 * integer step vectors — u along the segment, n perpendicular. Vertices are
 * `a + u·k + n·m` with integer k, m, so coordinates stay exact integer nm on
 * BOTH axis segments (|u| = 1 nm) and 45° diagonal segments (|u| = √2 nm;
 * pitch/amplitude are quantized to step units). On a diagonal frame the U
 * legs land on the two diagonal families and the chamfers become axis
 * segments — every emitted segment is manhattan-45-valid per construction.
 * 90-mode traces contain no diagonal segments, so their path is unchanged.
 *
 * Deterministic: fixed shrink ladder, integer-nm geometry, no randomness.
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
  status:
    | "ok"
    /** Placed everything possible but the span can't reach the target. */
    | "too-short"
    /** No U fits between span start and end (span shorter than one pitch). */
    | "span-too-small"
    /** Net already at/over target — nothing to add. */
    | "target-met"
    /** U positions existed but every one was obstacle-blocked. */
    | "blocked";
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
 * One U between lattice offsets [0, pitch] of the frame anchored at `origin`.
 * `u`/`n` are the frame's integer step vectors (axis or diagonal), pitch and
 * amplitude are in STEP UNITS. 45-mode chamfers the four corners with cut
 * c = min(A/2, pitch/4) (floored) — on an axis frame the chamfers are
 * diagonal segments, on a diagonal frame they are axis segments; both valid.
 * 90-mode (axis frames only) emits the plain square U.
 */
function buildU(
  origin: PointNm,
  u: PointNm,
  n: PointNm,
  pitch: number,
  amplitude: number,
  mode: RouteMode,
): PointNm[] {
  const at = (k: number, m: number): PointNm => ({
    x: origin.x + u.x * k + n.x * m,
    y: origin.y + u.y * k + n.y * m,
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
 * segment with a lattice frame (axis always; diagonal in 45-mode) overlapping
 * the span is packed with alternating-side U's until `targetExtraNm` is met.
 * The final U's amplitude is trimmed by integer binary search so the achieved
 * extra lands on target. U's that cannot clear the obstacle field even at
 * `minAmplitudeNm` are skipped (straight run) and the shortfall is reported
 * via `status`/`achievedExtraNm`.
 */
export function generateMeander(input: MeanderInput): MeanderResult {
  const base = input.baselinePointsNm;
  const baseLen = pathLen(base);
  if (input.targetExtraNm <= 0) {
    return {
      pointsNm: [...base],
      achievedExtraNm: 0,
      status: "target-met",
    };
  }
  const spanStart = Math.max(0, Math.min(input.spanStartNm, input.spanEndNm));
  const spanEnd = Math.min(baseLen, Math.max(input.spanStartNm, input.spanEndNm));
  const pitchNm = Math.max(2, Math.round(input.spacingNm));

  const out: PointNm[] = [base[0]!];
  let walked = 0;
  let remaining = input.targetExtraNm;
  let side = 1;
  let placedAny = false;
  let hadWindow = false;

  for (let i = 1; i < base.length; i += 1) {
    const a = base[i - 1]!;
    const b = base[i]!;
    const len = segLen(a, b);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const axis = dx === 0 || dy === 0;
    const diagonal = !axis && Math.abs(dx) === Math.abs(dy);
    const frameOk = axis || (diagonal && input.mode === "manhattan-45");
    const overlapStart = Math.max(spanStart, walked);
    const overlapEnd = Math.min(spanEnd, walked + len);
    if (!frameOk || remaining <= 0 || overlapEnd - overlapStart < pitchNm) {
      out.push(b);
      walked += len;
      continue;
    }
    // Lattice frame: unit step 1 nm on axis segments, √2 nm on diagonals.
    const u: PointNm = { x: Math.sign(dx), y: Math.sign(dy) };
    const nBase: PointNm = { x: -u.y, y: u.x };
    const stepLen = axis ? 1 : Math.SQRT2;
    const latticeLen = axis ? len : Math.abs(dx);
    const pitch = Math.max(2, Math.round(pitchNm / stepLen));
    const maxAmp = Math.max(2, Math.round(input.amplitudeNm / stepLen));
    const minAmp = Math.max(
      2,
      Math.min(Math.round(input.minAmplitudeNm / stepLen), maxAmp),
    );
    const extraOf = (pts: readonly PointNm[]): number =>
      pathLen(pts) - pitch * stepLen;

    let t = Math.round((overlapStart - walked) / stepLen);
    const tMax = Math.min(
      latticeLen,
      Math.round((overlapEnd - walked) / stepLen),
    );
    if (t + pitch <= tMax) hadWindow = true;
    while (t + pitch <= tMax && remaining > 0) {
      const origin: PointNm = {
        x: a.x + u.x * t,
        y: a.y + u.y * t,
      };
      const n: PointNm = { x: nBase.x * side, y: nBase.y * side };
      // Amplitude for this U: full, unless the remaining target needs less —
      // then binary-search the amplitude whose extra hits the remainder.
      let amp = maxAmp;
      if (extraOf(buildU(origin, u, n, pitch, amp, input.mode)) > remaining) {
        let lo = minAmp;
        let hi = maxAmp;
        while (lo < hi) {
          const mid = Math.floor((lo + hi) / 2);
          const extra = extraOf(buildU(origin, u, n, pitch, mid, input.mode));
          if (extra < remaining) lo = mid + 1;
          else hi = mid;
        }
        amp = lo;
      }
      // Obstacle shrink ladder; skip the U entirely when even the floor hits.
      let uPts: PointNm[] | null = null;
      for (const factor of SHRINK_STEPS) {
        const tryAmp = Math.max(minAmp, Math.floor(amp * factor));
        const candidate = buildU(origin, u, n, pitch, tryAmp, input.mode);
        if (!polylineBlocked(candidate, input.obstacles)) {
          uPts = candidate;
          break;
        }
        if (tryAmp === minAmp) break;
      }
      if (uPts) {
        // Drop the U's entry vertex when it coincides with our current end.
        const last = out[out.length - 1]!;
        const first = uPts[0]!;
        if (last.x === first.x && last.y === first.y) {
          out.push(...uPts.slice(1));
        } else {
          out.push(...uPts);
        }
        remaining -= extraOf(uPts);
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
      status: hadWindow ? "blocked" : "span-too-small",
    };
  }
  // Quantization slack: one pitch-worth of extra is the placement quantum.
  const quantum = Math.max(4, pitchNm);
  return {
    pointsNm: deduped,
    achievedExtraNm: achieved,
    status:
      input.targetExtraNm - achieved > quantum ? "too-short" : "ok",
  };
}
