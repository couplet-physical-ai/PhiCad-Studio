/**
 * Visual crossing gaps for schematic wires (audit §4.8).
 *
 * Two independent wires whose segments CROSS without any connection must be
 * visually distinguishable from connected wires. Where perpendicular segments
 * of DIFFERENT wires intersect at a point strictly interior to BOTH, the
 * VERTICAL segment yields (classic drafting convention): its display geometry
 * is split into runs with a small gap around the crossing. Connected meetings
 * never gap: a T-touch endpoint is not strictly interior to its own segment,
 * a shared vertex is not strictly interior to either, and derived junction
 * coordinates are skipped outright as a safety net.
 *
 * Pure + integer-nm — display-only; stored geometry and hit-testing are
 * untouched.
 */
import type { Point } from "./manhattan";

export interface CrossingGapWire {
  id: string;
  pointsNm: Point[];
}

/** Half-width of the visual gap on each side of the crossing (nm). */
export const CROSSING_GAP_HALF_NM = 350_000;

interface HorizontalSegment {
  wireId: string;
  y: number;
  minX: number;
  maxX: number;
}

/**
 * Compute per-wire display polylines with crossing gaps applied. Every input
 * wire gets an entry; wires without crossings map to a single unchanged run.
 */
export function computeWireCrossingGaps(
  wires: readonly CrossingGapWire[],
  junctions: readonly { xNm: number; yNm: number }[],
  gapHalfNm: number = CROSSING_GAP_HALF_NM,
): Map<string, Point[][]> {
  const junctionKeys = new Set(junctions.map((j) => `${j.xNm}:${j.yNm}`));

  const horizontals: HorizontalSegment[] = [];
  for (const wire of wires) {
    const pts = wire.pointsNm;
    for (let i = 1; i < pts.length; i += 1) {
      const a = pts[i - 1];
      const b = pts[i];
      if (!a || !b) continue;
      if (a.y === b.y && a.x !== b.x) {
        horizontals.push({
          wireId: wire.id,
          y: a.y,
          minX: Math.min(a.x, b.x),
          maxX: Math.max(a.x, b.x),
        });
      }
    }
  }

  const result = new Map<string, Point[][]>();
  for (const wire of wires) {
    const pts = wire.pointsNm;
    const runs: Point[][] = [];
    let run: Point[] = pts.length > 0 ? [{ ...pts[0]! }] : [];

    for (let i = 1; i < pts.length; i += 1) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      const isVertical = a.x === b.x && a.y !== b.y;
      if (!isVertical) {
        run.push({ ...b });
        continue;
      }
      const x = a.x;
      const lo = Math.min(a.y, b.y);
      const hi = Math.max(a.y, b.y);
      // Crossings strictly interior to BOTH segments, from OTHER wires only.
      const crossYs: number[] = [];
      for (const h of horizontals) {
        if (h.wireId === wire.id) continue;
        if (!(lo < h.y && h.y < hi)) continue;
        if (!(h.minX < x && x < h.maxX)) continue;
        if (junctionKeys.has(`${x}:${h.y}`)) continue;
        crossYs.push(h.y);
      }
      if (crossYs.length === 0) {
        run.push({ ...b });
        continue;
      }
      // Cut in the segment's direction of travel.
      const ascending = b.y > a.y;
      crossYs.sort((p, q) => (ascending ? p - q : q - p));
      let cursorY = a.y;
      for (const crossY of crossYs) {
        const before = ascending ? crossY - gapHalfNm : crossY + gapHalfNm;
        const after = ascending ? crossY + gapHalfNm : crossY - gapHalfNm;
        // Close the current run at the near gap edge (if it extends past the
        // run's current position — crossings near a segment end just truncate).
        if (ascending ? before > cursorY : before < cursorY) {
          run.push({ x, y: before });
        }
        if (run.length >= 2) runs.push(run);
        // Reopen after the gap, clamped to the segment end.
        const clampedAfter = ascending
          ? Math.min(after, b.y)
          : Math.max(after, b.y);
        cursorY = clampedAfter;
        run = [{ x, y: clampedAfter }];
      }
      if (ascending ? b.y > cursorY : b.y < cursorY) {
        run.push({ ...b });
      }
    }
    if (run.length >= 2) runs.push(run);
    if (runs.length === 0 && pts.length >= 2) {
      runs.push(pts.map((p) => ({ ...p })));
    }
    result.set(wire.id, runs);
  }
  return result;
}
