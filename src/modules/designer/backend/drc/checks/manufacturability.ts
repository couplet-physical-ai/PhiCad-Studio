import {
  FAB_PRESETS,
  validateHoleAgainstFab,
  validateTraceAgainstFab,
  validateViaAgainstFab,
} from "../../pcb/fab-presets";
import {
  boardSlotRing,
  findNarrowestSlot,
  findSmallInternalRadii,
} from "../../pcb/outline-manufacturability";
import { below, type DrcContext } from "../drc-context";
import { exceeds } from "../../pcb/tolerance";
import type { DrcViolationDraft } from "../types";

/**
 * Minimum-geometry rules (design-rule errors) + fabricator-capability warnings.
 * Annular ring = (diameter − drill) / 2. Fab warnings reuse the existing
 * `validateTraceAgainstFab` / `validateViaAgainstFab` validators.
 */
export function checkManufacturability(ctx: DrcContext): DrcViolationDraft[] {
  const out: DrcViolationDraft[] = [];
  const min = ctx.designRules.minimums;

  for (const t of ctx.traces) {
    if (below(t.widthMm, min.traceWidthMm)) {
      out.push({
        code: "TRACE_WIDTH_MIN",
        ruleClass: "manufacturability",
        severity: "error",
        message: `Trace width ${t.widthMm.toFixed(3)} mm is below the minimum ${min.traceWidthMm.toFixed(3)} mm`,
        anchors: [{ kind: "trace", traceId: t.id }],
        locationMm: t.mid,
        layer: t.layer,
        measuredMm: t.widthMm,
        requiredMm: min.traceWidthMm,
      });
    }
    for (const v of validateTraceAgainstFab(
      { widthMm: t.widthMm },
      ctx.fabricator,
    )) {
      out.push({
        code: "FAB_TRACE_WIDTH",
        ruleClass: "manufacturability",
        severity: "warning",
        message: v.message,
        anchors: [{ kind: "trace", traceId: t.id }],
        locationMm: t.mid,
        layer: t.layer,
        measuredMm: v.actualValue,
        requiredMm: v.fabValue,
      });
    }
  }

  for (const vg of ctx.vias) {
    const via = vg.via;
    if (below(via.diameterMm, min.viaDiameterMm)) {
      out.push({
        code: "VIA_DIAMETER_MIN",
        ruleClass: "manufacturability",
        severity: "error",
        message: `Via pad diameter ${via.diameterMm.toFixed(3)} mm is below the minimum ${min.viaDiameterMm.toFixed(3)} mm`,
        anchors: [{ kind: "via", viaId: via.id }],
        locationMm: via.centerMm,
        measuredMm: via.diameterMm,
        requiredMm: min.viaDiameterMm,
      });
    }
    if (below(via.drillMm, min.viaDrillMm)) {
      out.push({
        code: "VIA_DRILL_MIN",
        ruleClass: "manufacturability",
        severity: "error",
        message: `Via drill ${via.drillMm.toFixed(3)} mm is below the minimum ${min.viaDrillMm.toFixed(3)} mm`,
        anchors: [{ kind: "via", viaId: via.id }],
        locationMm: via.centerMm,
        measuredMm: via.drillMm,
        requiredMm: min.viaDrillMm,
      });
    }
    const annular = (via.diameterMm - via.drillMm) / 2;
    if (below(annular, min.annularRingMm)) {
      out.push({
        code: "ANNULAR_RING_MIN",
        ruleClass: "manufacturability",
        severity: "error",
        message: `Via annular ring ${annular.toFixed(3)} mm is below the minimum ${min.annularRingMm.toFixed(3)} mm`,
        anchors: [{ kind: "via", viaId: via.id }],
        locationMm: via.centerMm,
        measuredMm: annular,
        requiredMm: min.annularRingMm,
      });
    }
    for (const fv of validateViaAgainstFab(
      { diameterMm: via.diameterMm, drillMm: via.drillMm },
      ctx.fabricator,
    )) {
      const code =
        fv.rule === "minDrillMm"
          ? "FAB_DRILL"
          : fv.rule === "minPadMm"
            ? "FAB_PAD"
            : "FAB_ANNULAR_RING";
      out.push({
        code,
        ruleClass: "manufacturability",
        severity: "warning",
        message: fv.message,
        anchors: [{ kind: "via", viaId: via.id }],
        locationMm: via.centerMm,
        measuredMm: fv.actualValue,
        requiredMm: fv.fabValue,
      });
    }

    // Via aspect ratio = effective span depth / drill (drilling limit,
    // fab-specific). A through via drills the full board; a blind/buried via
    // only drills the layers it spans, so scale board thickness by the fraction
    // of the stackup it crosses (no per-layer thickness model yet — linear).
    if (ctx.fabricator !== "custom" && via.drillMm > 0) {
      const preset = FAB_PRESETS[ctx.fabricator];
      const layerCount = ctx.validCopperLayers.size;
      const spanFraction =
        layerCount > 1 ? (vg.layers.length - 1) / (layerCount - 1) : 1;
      const effectiveThicknessMm = ctx.boardThicknessMm * spanFraction;
      const ratio = effectiveThicknessMm / via.drillMm;
      if (preset && exceeds(ratio, preset.maxAspectRatio)) {
        out.push({
          code: "VIA_ASPECT_RATIO",
          ruleClass: "manufacturability",
          severity: "warning",
          message: `Via aspect ratio ${ratio.toFixed(1)}:1 exceeds ${preset.name} maximum ${preset.maxAspectRatio}:1 (span ${effectiveThicknessMm.toFixed(2)} mm / drill ${via.drillMm.toFixed(3)} mm)`,
          anchors: [{ kind: "via", viaId: via.id }],
          locationMm: via.centerMm,
        });
      }
    }
  }

  // Per-hole minimum drill size (every drilled hole) + annular ring (plated
  // pads that carry a known copper OD: TH footprint pads & free `std` pads).
  // Vias are also in `ctx.holes`; their via-specific drill/annular minimums are
  // handled above, but the global `drillSizeMm` floor still applies here.
  for (const hole of ctx.holes) {
    if (below(hole.drillMm, min.drillSizeMm)) {
      out.push({
        code: "DRILL_SIZE_MIN",
        ruleClass: "manufacturability",
        severity: "error",
        message: `Drill size ${hole.drillMm.toFixed(3)} mm is below the minimum ${min.drillSizeMm.toFixed(3)} mm`,
        anchors: [hole.anchor],
        locationMm: hole.center,
        measuredMm: hole.drillMm,
        requiredMm: min.drillSizeMm,
      });
    }
    if (hole.padOdMm !== undefined) {
      const annular = (hole.padOdMm - hole.drillMm) / 2;
      if (below(annular, min.annularRingMm)) {
        out.push({
          code: "ANNULAR_RING_MIN",
          ruleClass: "manufacturability",
          severity: "error",
          message: `Pad annular ring ${annular.toFixed(3)} mm is below the minimum ${min.annularRingMm.toFixed(3)} mm`,
          anchors: [hole.anchor],
          locationMm: hole.center,
          measuredMm: annular,
          requiredMm: min.annularRingMm,
        });
      }
    }
    // Fab capability floors for PTH/NPTH drills + PTH annular rings (vias are
    // validated with via-specific thresholds in the via loop above; P8 —
    // audit B2-8: TH/free-hole drills previously got no fab check at all).
    if (hole.kind !== "via") {
      for (const fv of validateHoleAgainstFab(
        { drillMm: hole.drillMm, padOdMm: hole.padOdMm },
        ctx.fabricator,
      )) {
        out.push({
          code: fv.rule === "minDrillMm" ? "FAB_DRILL" : "FAB_ANNULAR_RING",
          ruleClass: "manufacturability",
          severity: "warning",
          message: fv.message,
          anchors: [hole.anchor],
          locationMm: hole.center,
          measuredMm: fv.actualValue,
          requiredMm: fv.fabValue,
        });
      }
    }
  }

  // Board-outline milling limits (fab-sourced, advisory): internal corner radius
  // + slot/neck width. Custom fab has no capability floor, so it's skipped.
  if (ctx.fabricator !== "custom") {
    const preset = FAB_PRESETS[ctx.fabricator];
    if (preset) {
      for (const hit of findSmallInternalRadii(
        ctx.projection.board.outline,
        preset.minInternalRadiusMm,
      )) {
        out.push({
          code: "OUTLINE_INTERNAL_RADIUS",
          ruleClass: "manufacturability",
          severity: "warning",
          message: `Internal corner radius ${hit.radiusMm.toFixed(2)} mm < ${preset.name} min ${preset.minInternalRadiusMm.toFixed(2)} mm`,
          anchors: [{ kind: "boardEdge" }],
          locationMm: hit.locationMm,
          measuredMm: hit.radiusMm,
          requiredMm: preset.minInternalRadiusMm,
        });
      }
      // Slot check on the coarse vertex ring (arcs as single edges) so a smooth
      // curve's tessellation chords never read as a false narrow gap.
      const slotRing = boardSlotRing(ctx.projection.board.outline);
      const slot = slotRing
        ? findNarrowestSlot(slotRing, preset.minSlotWidthMm)
        : null;
      if (slot) {
        out.push({
          code: "OUTLINE_SLOT_WIDTH",
          ruleClass: "manufacturability",
          severity: "warning",
          message: `Board slot / neck ${slot.gapMm.toFixed(2)} mm < ${preset.name} min ${preset.minSlotWidthMm.toFixed(2)} mm`,
          anchors: [{ kind: "boardEdge" }],
          locationMm: slot.locationMm,
          measuredMm: slot.gapMm,
          requiredMm: preset.minSlotWidthMm,
        });
      }
    }
  }

  return out;
}
