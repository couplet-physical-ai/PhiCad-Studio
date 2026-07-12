import { pointInOutline } from "../../pcb/outline-geometry";
import {
  pointInPolygon,
  pointToRingEdgeDistance,
  polylineToRingEdgeDistance,
  ringToRingEdgeDistance,
} from "../../pcb/pcb-clearance-geometry";
import { distance } from "../../pcb/pcb-trace-geometry";
import { FAB_PRESETS } from "../../pcb/fab-presets";
import { below, type DrcContext } from "../drc-context";
import type { DrcViolationDraft } from "../types";
import { segmentToSegmentDistance } from "../../pcb/pcb-trace-geometry";
import type { DrcHole } from "../drc-context";

/** Edge-to-edge gap between two holes, slot-aware when either carries a slot. */
function holeEdgeGap(a: DrcHole, b: DrcHole, centerGap: number): number {
  if (!a.slot && !b.slot) return centerGap - (a.drillMm / 2 + b.drillMm / 2);
  const segA = a.slot ? [a.slot.a, a.slot.b] : [a.center, a.center];
  const segB = b.slot ? [b.slot.a, b.slot.b] : [b.center, b.center];
  const radA = a.slot ? a.slot.widthMm / 2 : a.drillMm / 2;
  const radB = b.slot ? b.slot.widthMm / 2 : b.drillMm / 2;
  return (
    segmentToSegmentDistance(segA[0]!, segA[1]!, segB[0]!, segB[1]!) -
    (radA + radB)
  );
}

/**
 * Vertices plus each segment's midpoint — a denser sample so a trace that
 * crosses a cutout (or the outline) between two on-board vertices is still
 * caught by the point-in-outline test.
 */
function sampledTracePoints(
  points: readonly { x: number; y: number }[],
): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i]!;
    out.push(p);
    if (i > 0) {
      const prev = points[i - 1]!;
      out.push({ x: (prev.x + p.x) / 2, y: (prev.y + p.y) / 2 });
    }
  }
  return out;
}

/**
 * Board-relative checks: copper-to-board-edge clearance, copper outside the
 * outline, and hole-to-hole spacing. All distances are to the board outline +
 * cutout perimeters (NOT filled containment), so copper inside the board still
 * has a positive edge clearance.
 */
export function checkBoard(ctx: DrcContext): DrcViolationDraft[] {
  const out: DrcViolationDraft[] = [];
  const board = ctx.projection.board;
  const cutouts = board.cutouts ?? [];
  const edgeReq = ctx.designRules.clearance.copperToBoardEdgeMm;
  const rings = [ctx.outlineRing, ...ctx.cutoutRings];

  const edgeDistToBoundary = (
    compute: (ring: readonly { x: number; y: number }[]) => number,
  ): number => {
    let best = Infinity;
    for (const ring of rings) {
      const d = compute(ring);
      if (d < best) best = d;
    }
    return best;
  };

  for (const t of ctx.traces) {
    if (t.pointsMm.length < 2) continue;
    const gap =
      edgeDistToBoundary((ring) =>
        polylineToRingEdgeDistance(t.pointsMm, ring),
      ) - t.halfWidthMm;
    if (below(gap, edgeReq)) {
      out.push({
        code: "COPPER_TO_BOARD_EDGE",
        ruleClass: "clearance",
        severity: "error",
        message: `Trace is ${gap.toFixed(3)} mm from the board edge (min ${edgeReq.toFixed(3)} mm)`,
        anchors: [{ kind: "trace", traceId: t.id }],
        locationMm: t.mid,
        layer: t.layer,
        measuredMm: gap,
        requiredMm: edgeReq,
      });
    }
    if (
      sampledTracePoints(t.pointsMm).some(
        (p) => !pointInOutline(board.outline, cutouts, p),
      )
    ) {
      out.push({
        code: "COPPER_OFF_BOARD",
        ruleClass: "constraint",
        severity: "error",
        message: "Trace extends outside the board outline",
        anchors: [{ kind: "trace", traceId: t.id }],
        locationMm: t.mid,
        layer: t.layer,
      });
    }
  }

  for (const vg of ctx.vias) {
    const gap =
      edgeDistToBoundary((ring) => pointToRingEdgeDistance(vg.center, ring)) -
      vg.radiusMm;
    if (below(gap, edgeReq)) {
      out.push({
        code: "COPPER_TO_BOARD_EDGE",
        ruleClass: "clearance",
        severity: "error",
        message: `Via is ${gap.toFixed(3)} mm from the board edge (min ${edgeReq.toFixed(3)} mm)`,
        anchors: [{ kind: "via", viaId: vg.via.id }],
        locationMm: vg.center,
        measuredMm: gap,
        requiredMm: edgeReq,
      });
    }
    // Off-board if the center is outside, or the via circle pokes through the
    // outline / a cutout edge (gap = edge distance − radius < 0).
    if (!pointInOutline(board.outline, cutouts, vg.center) || gap < 0) {
      out.push({
        code: "COPPER_OFF_BOARD",
        ruleClass: "constraint",
        severity: "error",
        message: "Via is outside the board outline",
        anchors: [{ kind: "via", viaId: vg.via.id }],
        locationMm: vg.center,
      });
    }
  }

  for (const pad of ctx.pads) {
    const gap = edgeDistToBoundary((ring) =>
      ringToRingEdgeDistance(pad.ring, ring),
    );
    if (below(gap, edgeReq)) {
      out.push({
        code: "COPPER_TO_BOARD_EDGE",
        ruleClass: "clearance",
        severity: "error",
        message: `Pad is ${gap.toFixed(3)} mm from the board edge (min ${edgeReq.toFixed(3)} mm)`,
        anchors: [pad.anchor],
        locationMm: pad.center,
        measuredMm: gap,
        requiredMm: edgeReq,
      });
    }
    // Off-board if any pad-ring vertex falls outside the outline / inside a
    // cutout, OR the pad fully covers a cutout (a cutout vertex sits inside the
    // pad ring) — the center-only test missed both cases.
    if (
      pad.ring.some((v) => !pointInOutline(board.outline, cutouts, v)) ||
      ctx.cutoutRings.some((ring) =>
        ring.some((cv) => pointInPolygon(cv, pad.ring)),
      )
    ) {
      out.push({
        code: "COPPER_OFF_BOARD",
        ruleClass: "constraint",
        severity: "error",
        message: "Pad is outside the board outline",
        anchors: [pad.anchor],
        locationMm: pad.center,
      });
    }
  }

  // hole-to-hole spacing (mechanical; skip holes of the same footprint).
  // Coincident drills (centers within ~1 µm) on the SAME net are a via dropped
  // onto a through-hole pad — a legitimate stack, not a spacing breach.
  const COINCIDENT_EPS_MM = 1e-3;
  const fabPreset =
    ctx.fabricator === "custom" ? null : (FAB_PRESETS[ctx.fabricator] ?? null);
  const holes = ctx.holes;

  // Hole-to-board-edge (audit B4-4): a drilled hole whose edge encroaches on
  // (or crosses) the board outline is a fab reject. Slot-aware — the slot
  // centerline is used when present so the rounded ends are measured, not a
  // round-hole model. Rings = outline + cutouts (a hole must clear cutouts too).
  const holeEdgeReq = ctx.holeToBoardEdgeMm;
  for (const hole of holes) {
    const radius = hole.slot ? hole.slot.widthMm / 2 : hole.drillMm / 2;
    const edgeDist = edgeDistToBoundary((ring) =>
      hole.slot
        ? polylineToRingEdgeDistance([hole.slot.a, hole.slot.b], ring)
        : pointToRingEdgeDistance(hole.center, ring),
    );
    const gap = edgeDist - radius;
    const outside = !pointInOutline(
      ctx.projection.board.outline,
      ctx.projection.board.cutouts ?? [],
      hole.center,
    );
    if (outside || gap < 0) {
      out.push({
        code: "HOLE_TO_BOARD_EDGE",
        ruleClass: "dfm",
        severity: "error",
        message: `Hole breaches the board edge (${gap.toFixed(3)} mm)`,
        anchors: [hole.anchor],
        locationMm: hole.center,
        measuredMm: gap,
        requiredMm: holeEdgeReq,
      });
    } else if (below(gap, holeEdgeReq)) {
      out.push({
        code: "HOLE_TO_BOARD_EDGE",
        ruleClass: "dfm",
        severity: "warning",
        message: `Hole is ${gap.toFixed(3)} mm from the board edge (min ${holeEdgeReq.toFixed(3)} mm)`,
        anchors: [hole.anchor],
        locationMm: hole.center,
        measuredMm: gap,
        requiredMm: holeEdgeReq,
      });
    }
  }
  for (let i = 0; i < holes.length; i += 1) {
    const a = holes[i]!;
    for (let j = i + 1; j < holes.length; j += 1) {
      const b = holes[j]!;
      const centerGap = distance(a.center, b.center);
      const drillsOverlap = centerGap < a.drillMm / 2 + b.drillMm / 2;
      // Intra-footprint pad SPACING is the footprint's responsibility — but
      // only when the drills don't physically overlap. Overlapping drills in
      // one footprint are still a broken drill file (audit B4-3).
      if (
        a.anchor.kind === "pad" &&
        b.anchor.kind === "pad" &&
        a.anchor.placementId === b.anchor.placementId &&
        !drillsOverlap
      ) {
        continue;
      }
      if (
        centerGap <= COINCIDENT_EPS_MM &&
        a.netId !== null &&
        a.netId === b.netId
      ) {
        continue;
      }
      // Slot-aware edge gap: a slotted drill uses its centerline (segment)
      // instead of the round center, so overlapping slot ends between distant
      // centers are still caught (Codex review; audit B2-5 follow-through).
      const gap = holeEdgeGap(a, b, centerGap);
      if (below(gap, ctx.holeToHoleMm)) {
        out.push({
          code: "HOLE_TO_HOLE",
          ruleClass: "clearance",
          severity: "warning",
          message: `Holes are ${gap.toFixed(3)} mm apart (min ${ctx.holeToHoleMm.toFixed(3)} mm)`,
          anchors: [a.anchor, b.anchor],
          locationMm: {
            x: (a.center.x + b.center.x) / 2,
            y: (a.center.y + b.center.y) / 2,
          },
          measuredMm: gap,
          requiredMm: ctx.holeToHoleMm,
        });
      } else if (fabPreset) {
        // Fab capability tier (P8): JLCPCB publishes distinct hole-to-hole
        // floors for via-via vs anything involving a component (PTH/NPTH)
        // drill. Only surfaces when the board rule above did not already fire.
        const fabReq =
          a.kind === "via" && b.kind === "via"
            ? fabPreset.holeToHoleViaMm
            : fabPreset.holeToHolePthMm;
        if (below(gap, fabReq)) {
          out.push({
            code: "FAB_HOLE_TO_HOLE",
            ruleClass: "manufacturability",
            severity: "warning",
            message: `Holes are ${gap.toFixed(3)} mm apart (${fabPreset.name} min ${fabReq.toFixed(3)} mm)`,
            anchors: [a.anchor, b.anchor],
            locationMm: {
              x: (a.center.x + b.center.x) / 2,
              y: (a.center.y + b.center.y) / 2,
            },
            measuredMm: gap,
            requiredMm: fabReq,
          });
        }
      }
    }
  }

  return out;
}
