import { pointInPolygon } from "../../pcb/pcb-clearance-geometry";
import { segmentsIntersect, type Point } from "../../pcb/pcb-trace-geometry";
import type { DrcContext } from "../drc-context";
import type { DrcViolationDraft } from "../types";

/** Signed area of a closed ring (shoelace); |area| ≈ 0 ⇒ degenerate. */
function ringArea(ring: readonly Point[]): number {
  let a = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const p = ring[i]!;
    const q = ring[(i + 1) % ring.length]!;
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

/**
 * True when any two NON-adjacent edges of the closed ring cross — a
 * self-intersecting (invalid) outline. O(n²); outline rings are small.
 */
function ringSelfIntersects(ring: readonly Point[]): boolean {
  const n = ring.length;
  if (n < 4) return false;
  for (let i = 0; i < n; i += 1) {
    const a = ring[i]!;
    const b = ring[(i + 1) % n]!;
    for (let j = i + 1; j < n; j += 1) {
      // Skip shared-vertex neighbors (adjacent edges + the wrap pair).
      if (j === i || (j + 1) % n === i || (i + 1) % n === j) continue;
      const c = ring[j]!;
      const d = ring[(j + 1) % n]!;
      if (segmentsIntersect(a, b, c, d)) return true;
    }
  }
  return false;
}

/**
 * Board-outline validity (resurrects the dead BOARD_OUTLINE_INVALID code —
 * audit B4-5). Runs FIRST so a malformed outline contextualizes the noise the
 * edge/off-board checks would otherwise emit. Checks: the outline has area and
 * no self-intersection; each cutout has area, no self-intersection, lies
 * inside the outline, and doesn't overlap another cutout.
 */
export function checkOutline(ctx: DrcContext): DrcViolationDraft[] {
  const out: DrcViolationDraft[] = [];
  const outline = ctx.outlineRing;

  const emit = (message: string, locationMm: Point) => {
    out.push({
      code: "BOARD_OUTLINE_INVALID",
      ruleClass: "constraint",
      severity: "error",
      message,
      anchors: [{ kind: "boardEdge" }],
      locationMm,
      waivable: false,
    });
  };

  if (outline.length < 3 || Math.abs(ringArea(outline)) < 1e-6) {
    emit("Board outline is empty or has zero area", outline[0] ?? { x: 0, y: 0 });
    return out; // nothing else is meaningful without a valid outer ring
  }
  if (ringSelfIntersects(outline)) {
    emit("Board outline self-intersects", outline[0]!);
  }

  ctx.cutoutRings.forEach((cut, i) => {
    const where = cut[0] ?? outline[0]!;
    if (cut.length < 3 || Math.abs(ringArea(cut)) < 1e-6) {
      emit(`Cutout ${i + 1} is empty or has zero area`, where);
      return;
    }
    if (ringSelfIntersects(cut)) {
      emit(`Cutout ${i + 1} self-intersects`, where);
    }
    // Every cutout vertex must lie inside the outer outline.
    if (!cut.every((p) => pointInPolygon(p, outline))) {
      emit(`Cutout ${i + 1} extends outside the board outline`, where);
    }
    // Cutouts must not overlap each other (any vertex of one inside another).
    for (let j = i + 1; j < ctx.cutoutRings.length; j += 1) {
      const other = ctx.cutoutRings[j]!;
      const overlaps =
        cut.some((p) => pointInPolygon(p, other)) ||
        other.some((p) => pointInPolygon(p, cut));
      if (overlaps) {
        emit(`Cutouts ${i + 1} and ${j + 1} overlap`, where);
        break;
      }
    }
  });

  return out;
}
