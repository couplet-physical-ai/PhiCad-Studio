import {
  simplifyCollinearPath,
  validatePath,
} from "../pcb-geometry/pcb-trace-geometry";
import type { PointNm, RouteMode } from "./types";

/**
 * Bundle-routing lane geometry: integer-exact parallel offsets of a mixed
 * axis/45° centerline. Each segment lives on one of four line families
 * (x=c, y=c, y=x+k, y=−x+k); offsetting shifts the constant, corners are
 * line-line intersections (miter join). Diagonal constants get a ±1 nm
 * parity nudge where an intersection would land on a half-integer — a
 * <1 nm pitch error, invisible against µm-scale clearances.
 */

type LineKind = "v" | "h" | "d+" | "d-";

interface SegLine {
  kind: LineKind;
  c: number;
  /** Direction signs of the source segment (for validity checks). */
  sx: number;
  sy: number;
}

function segLineOf(a: PointNm, b: PointNm): SegLine | null {
  const sx = Math.sign(b.x - a.x);
  const sy = Math.sign(b.y - a.y);
  if (sx === 0 && sy === 0) return null;
  if (sx === 0) return { kind: "v", c: a.x, sx, sy };
  if (sy === 0) return { kind: "h", c: a.y, sx, sy };
  if (sx === sy) return { kind: "d+", c: a.y - a.x, sx, sy };
  if (Math.abs(b.x - a.x) === Math.abs(b.y - a.y)) {
    return { kind: "d-", c: a.y + a.x, sx, sy };
  }
  return null; // not 45°-routable — caller passed invalid geometry
}

/** Shift a segment's line constant by `offset` along its LEFT normal. */
function shiftConstant(line: SegLine, offset: number): number {
  switch (line.kind) {
    case "v":
      return line.c + offset * -line.sy;
    case "h":
      return line.c + offset * line.sx;
    default:
      // Both diagonal families: Δk = offset · sx · √2.
      return line.c + Math.round(offset * line.sx * Math.SQRT2);
  }
}

function intersect(
  k1: LineKind,
  c1: number,
  k2: LineKind,
  c2: number,
): PointNm | null {
  if (k1 === k2) return null;
  // Normalize order so each pair is handled once.
  if (
    (k1 === "h" && k2 === "v") ||
    (k1 === "d+" && k2 !== "d-") ||
    (k1 === "d-" && (k2 === "v" || k2 === "h"))
  ) {
    return intersect(k2, c2, k1, c1);
  }
  if (k1 === "v" && k2 === "h") return { x: c1, y: c2 };
  if (k1 === "v" && k2 === "d+") return { x: c1, y: c1 + c2 };
  if (k1 === "v" && k2 === "d-") return { x: c1, y: c2 - c1 };
  if (k1 === "h" && k2 === "d+") return { x: c1 - c2, y: c1 };
  if (k1 === "h" && k2 === "d-") return { x: c2 - c1, y: c1 };
  // d+ ∩ d- : x = (c2 − c1)/2, y = (c1 + c2)/2 — caller ensures even parity.
  return { x: (c2 - c1) / 2, y: (c1 + c2) / 2 };
}

/** Perpendicular line family through `p` — end caps of the offset lane. */
function capLine(kind: LineKind, p: PointNm): { kind: LineKind; c: number } {
  switch (kind) {
    case "v":
      return { kind: "h", c: p.y };
    case "h":
      return { kind: "v", c: p.x };
    case "d+":
      return { kind: "d-", c: p.y + p.x };
    default:
      return { kind: "d+", c: p.y - p.x };
  }
}

export interface OffsetLaneResult {
  pointsNm: PointNm[];
  /** False when the offset degenerates (U-turn, miter blow-up, reversal). */
  ok: boolean;
}

/**
 * Offset a 45/90 centerline by a signed perpendicular distance (positive =
 * LEFT of travel). Output segments stay exactly on axis/diagonal families;
 * lanes whose corners collapse or reverse (offset larger than a leg allows)
 * come back `ok: false` so callers can block the commit.
 */
export function offsetPolylineNm(
  centerlineNm: readonly PointNm[],
  offsetNm: number,
): OffsetLaneResult {
  const center = simplifyCollinearPath([...centerlineNm]);
  if (center.length < 2) return { pointsNm: [...center], ok: false };
  if (offsetNm === 0) return { pointsNm: center, ok: true };

  const lines: SegLine[] = [];
  for (let i = 1; i < center.length; i += 1) {
    const line = segLineOf(center[i - 1]!, center[i]!);
    if (!line) return { pointsNm: [], ok: false };
    lines.push(line);
  }
  const shifted = lines.map((line) => ({
    ...line,
    c: shiftConstant(line, offsetNm),
  }));
  // Parity pre-pass: a d+∩d- corner needs (c1 + c2) even for an integer
  // intersection; nudge the LATER segment by 1 nm when odd.
  for (let i = 1; i < shifted.length; i += 1) {
    const prev = shifted[i - 1]!;
    const cur = shifted[i]!;
    const diagPair =
      (prev.kind === "d+" && cur.kind === "d-") ||
      (prev.kind === "d-" && cur.kind === "d+");
    if (diagPair && ((prev.c + cur.c) & 1) !== 0) cur.c += 1;
  }

  const out: PointNm[] = [];
  const first = shifted[0]!;
  const startCap = capLine(first.kind, center[0]!);
  const startCapC =
    (first.kind === "d+" || first.kind === "d-") &&
    ((first.c + startCap.c) & 1) !== 0
      ? startCap.c + 1
      : startCap.c;
  const start = intersect(first.kind, first.c, startCap.kind, startCapC);
  if (!start) return { pointsNm: [], ok: false };
  out.push(start);
  for (let i = 1; i < shifted.length; i += 1) {
    const corner = intersect(
      shifted[i - 1]!.kind,
      shifted[i - 1]!.c,
      shifted[i]!.kind,
      shifted[i]!.c,
    );
    if (!corner) return { pointsNm: [], ok: false }; // parallel/U-turn
    out.push(corner);
  }
  const last = shifted[shifted.length - 1]!;
  const endCap = capLine(last.kind, center[center.length - 1]!);
  const endCapC =
    (last.kind === "d+" || last.kind === "d-") &&
    ((last.c + endCap.c) & 1) !== 0
      ? endCap.c + 1
      : endCap.c;
  const end = intersect(last.kind, last.c, endCap.kind, endCapC);
  if (!end) return { pointsNm: [], ok: false };
  out.push(end);

  // Miter blow-up check: every output segment must keep its source segment's
  // direction (a reversed or collapsed segment means the offset ate a leg).
  for (let i = 0; i < shifted.length; i += 1) {
    const a = out[i]!;
    const b = out[i + 1]!;
    if (
      Math.sign(b.x - a.x) !== shifted[i]!.sx ||
      Math.sign(b.y - a.y) !== shifted[i]!.sy
    ) {
      return { pointsNm: out, ok: false };
    }
  }
  return { pointsNm: out, ok: true };
}

/**
 * Monotone lane assignment: pads sorted by their projection onto the LEFT
 * normal of the fan-out direction get symmetric offsets (…−p, 0, +p… for odd
 * N; half-pitch straddle for even N) in the same order — lanes never cross
 * at the fan-out. Returns one signed offset per input pad index.
 */
export function assignLaneOffsets(input: {
  padPointsNm: readonly PointNm[];
  /** Fan-out direction — the centerline's first segment. */
  dirNm: PointNm;
  pitchNm: number;
}): number[] {
  const n = input.padPointsNm.length;
  const nx = -input.dirNm.y;
  const ny = input.dirNm.x;
  const ranked = input.padPointsNm
    .map((p, i) => ({ i, t: p.x * nx + p.y * ny }))
    .sort((a, b) => a.t - b.t || a.i - b.i);
  const offsets = new Array<number>(n);
  ranked.forEach((entry, rank) => {
    offsets[entry.i] = Math.round((rank - (n - 1) / 2) * input.pitchNm);
  });
  return offsets;
}

export interface BundleLane {
  pointsNm: PointNm[];
  ok: boolean;
}

/** Offset the centerline once per lane; mode-validity double-checked. */
export function buildBundleLanes(input: {
  centerlineNm: readonly PointNm[];
  laneOffsetsNm: readonly number[];
  mode: RouteMode;
}): BundleLane[] {
  return input.laneOffsetsNm.map((offset) => {
    const lane = offsetPolylineNm(input.centerlineNm, offset);
    if (!lane.ok) return lane;
    return {
      pointsNm: lane.pointsNm,
      ok: validatePath(lane.pointsNm, input.mode) === null,
    };
  });
}
