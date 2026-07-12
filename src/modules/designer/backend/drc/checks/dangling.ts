import type { PcbCopperLayerId } from "../../../../../sdks/designer";
import { pointInPolygon } from "../../pcb/pcb-clearance-geometry";
import {
  distance,
  pointToPolylineDistance,
  type Point,
} from "../../pcb/pcb-trace-geometry";
import type { DrcContext, DrcPad, DrcTrace, DrcViaGeom } from "../drc-context";
import type { DrcViolationDraft } from "../types";

/** Touch tolerance (mm); mirrors the ratsnest T-junction epsilon. */
const TOUCH_EPS_MM = 1e-3;

/**
 * Dangling copper (KiCad `track_dangling` / `via_dangling`, Altium Net
 * Antennae). Uses its OWN layer-aware connectivity test — deliberately NOT
 * the ratsnest union, which is layer-blind in several places (audit
 * B3-3/4/5). A trace endpoint or via must land on real same-layer copper
 * (pad ring, via center, another trace's endpoint/interior, or a same-net
 * pour on that layer); otherwise it is a stub antenna.
 */
export function checkDangling(ctx: DrcContext): DrcViolationDraft[] {
  const out: DrcViolationDraft[] = [];
  const pourLayersByNet = pourLayerMap(ctx);

  const padsOn = (layer: PcbCopperLayerId): DrcPad[] =>
    ctx.pads.filter((p) => p.layers.includes(layer));
  const viasOn = (layer: PcbCopperLayerId): DrcViaGeom[] =>
    ctx.vias.filter((v) => v.layers.includes(layer));

  const pointConnected = (
    p: Point,
    layer: PcbCopperLayerId,
    netId: string | null,
    selfTraceId: string | null,
  ): boolean => {
    // Only SAME-NET copper connects. A null-net (scratch) endpoint connects to
    // anything it physically touches (the touch would define its net). A
    // different-net touch is a short, not a connection.
    const sameNet = (other: string | null): boolean =>
      netId === null || other === netId;
    // Same-net pour on this layer.
    if (netId && pourLayersByNet.get(netId)?.has(layer)) return true;
    for (const pad of padsOn(layer)) {
      if (sameNet(pad.netId) && pointInPolygon(p, pad.ring)) return true;
    }
    for (const v of viasOn(layer)) {
      if (sameNet(v.netId) && distance(p, v.center) <= v.radiusMm + TOUCH_EPS_MM)
        return true;
    }
    for (const t of ctx.traces) {
      if (t.id === selfTraceId) continue;
      if (t.layer !== layer || t.pointsMm.length < 2) continue;
      if (!sameNet(t.netId)) continue;
      if (pointToPolylineDistance(p, t.pointsMm).distance <= TOUCH_EPS_MM) {
        return true;
      }
    }
    return false;
  };

  // Traces: any unconnected endpoint ⇒ dangling.
  for (const t of ctx.traces) {
    if (t.pointsMm.length < 2) continue;
    const ends = [t.pointsMm[0]!, t.pointsMm[t.pointsMm.length - 1]!];
    for (const end of ends) {
      if (!pointConnected(end, t.layer, t.netId, t.id)) {
        out.push({
          code: "TRACK_DANGLING",
          ruleClass: "dfm",
          severity: "warning",
          message: "Trace has a dangling (unconnected) end",
          anchors: [{ kind: "trace", traceId: t.id }],
          locationMm: end,
          layer: t.layer,
        });
        break; // one report per trace
      }
    }
  }

  // Vias: a via must electrically connect on ≥ 2 of its spanned layers.
  for (const vg of ctx.vias) {
    let connectedLayers = 0;
    for (const layer of vg.layers) {
      if (viaLayerConnected(ctx, vg, layer, pourLayersByNet)) {
        connectedLayers += 1;
      }
    }
    if (connectedLayers < 2) {
      out.push({
        code: "VIA_DANGLING",
        ruleClass: "dfm",
        severity: "warning",
        message: `Via connects on only ${connectedLayers} layer${connectedLayers === 1 ? "" : "s"} (needs 2)`,
        anchors: [{ kind: "via", viaId: vg.via.id }],
        locationMm: vg.center,
      });
    }
  }

  return out;
}

function viaLayerConnected(
  ctx: DrcContext,
  vg: DrcViaGeom,
  layer: PcbCopperLayerId,
  pourLayersByNet: Map<string, Set<PcbCopperLayerId>>,
): boolean {
  const sameNet = (other: string | null): boolean =>
    vg.netId === null || other === vg.netId;
  if (vg.netId && pourLayersByNet.get(vg.netId)?.has(layer)) return true;
  for (const pad of ctx.pads) {
    if (
      pad.layers.includes(layer) &&
      sameNet(pad.netId) &&
      pointInPolygon(vg.center, pad.ring)
    ) {
      return true;
    }
  }
  for (const t of ctx.traces) {
    if (t.layer !== layer || t.pointsMm.length < 2) continue;
    if (!sameNet(t.netId)) continue;
    if (
      pointToPolylineDistance(vg.center, t.pointsMm).distance <=
      vg.radiusMm + TOUCH_EPS_MM
    ) {
      return true;
    }
  }
  return false;
}

/** Layers each net pours (board-wide fills + explicit zones). */
function pourLayerMap(ctx: DrcContext): Map<string, Set<PcbCopperLayerId>> {
  const map = new Map<string, Set<PcbCopperLayerId>>();
  const add = (netId: string | null | undefined, layer: PcbCopperLayerId) => {
    if (!netId) return;
    const set = map.get(netId) ?? new Set<PcbCopperLayerId>();
    set.add(layer);
    map.set(netId, set);
  };
  const view = ctx.projection.board.viewState;
  if (view) {
    for (const layer of view.copperFillLayers) {
      add(view.copperFillPourNetIds[layer] ?? null, layer);
    }
  }
  for (const zone of ctx.projection.zones) {
    add(zone.netId ?? null, zone.layer);
  }
  return map;
}
