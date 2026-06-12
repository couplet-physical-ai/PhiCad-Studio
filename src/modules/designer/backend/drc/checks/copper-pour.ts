import type { PcbCopperLayerId } from "../../../../../sdks/designer";
import {
  buildCopperFillIslandReport,
  resolveCopperFillClearanceMm,
} from "../../../../../shared/rendering/copper-fill/copper-fill-geometry";
import type { DrcContext } from "../drc-context";
import type { DrcViolationDraft } from "../types";

/**
 * Copper-pour DRC: flag floating (isolated) pour copper. A pour island kept
 * only by its area — touching no same-net pad/trace/via — is electrically dead
 * copper (an EMI antenna / acid-trap on real boards), so it warrants a warning.
 * The connectivity self-correction for ground planes lives in the ratsnest
 * (a same-net pour satisfies the net), so `UNCONNECTED_NET` already clears
 * without a check here.
 */
export function checkCopperPour(ctx: DrcContext): DrcViolationDraft[] {
  const view = ctx.projection.board.viewState;
  if (!view || view.copperFillLayers.length === 0) return [];
  const proj = ctx.projection;
  const dr = ctx.designRules;
  const padNetIds = new Map(Object.entries(proj.padNets ?? {}));
  const out: DrcViolationDraft[] = [];

  for (const layer of view.copperFillLayers) {
    const pourNetId = view.copperFillPourNetIds[layer];
    if (!pourNetId) continue;
    const islands = buildCopperFillIslandReport({
      layer: layer as PcbCopperLayerId,
      outline: proj.board.outline,
      placements: proj.placements,
      traces: proj.traces,
      vias: proj.vias,
      pourNetId,
      padNetIds,
      clearanceMm: resolveCopperFillClearanceMm(dr.clearance),
      copperToBoardEdgeMm: dr.clearance.copperToBoardEdgeMm,
      cutouts: proj.board.cutouts,
      freeHoles: proj.freeHoles,
      freePads: proj.freePads,
      minThicknessMm: dr.minimums.traceWidthMm,
      padConnection: view.copperFillPadConnection ?? "solid",
    });
    const isolated = islands.filter((i) => !i.anchored);
    if (isolated.length === 0) continue;
    // Aggregate per (layer, net): the violation id hashes code + anchors, so
    // distinct islands sharing the net anchor would collide. Report one warning
    // located at the largest isolated island.
    const largest = isolated.reduce((a, b) => (b.areaMm2 > a.areaMm2 ? b : a));
    const totalMm2 = isolated.reduce((sum, i) => sum + i.areaMm2, 0);
    const netName = ctx.netNames[pourNetId] ?? pourNetId;
    out.push({
      code: "ISOLATED_COPPER_ISLAND",
      ruleClass: "structural",
      severity: "warning",
      message: `${isolated.length} isolated ${netName} copper island${isolated.length > 1 ? "s" : ""} on ${layer} (${totalMm2.toFixed(1)} mm² total) connect to no same-net pad — floating/dead copper`,
      anchors: [{ kind: "net", netId: pourNetId }],
      locationMm: largest.centerMm,
      layer: layer as PcbCopperLayerId,
      measuredMm: largest.areaMm2,
    });
  }
  return out;
}
