// Precomputed, mm-domain view of a PCB projection for the DRC engine.
//
// Resolves the data-model gotchas once, up front, so the individual checks stay
// simple: trace points are converted nm→mm; footprint/free pads become world
// polygons grouped by the copper layer(s) they occupy (through-hole spans both
// sides — fixes live-drc's "all pads on the active layer" approximation); vias
// become circles spanning their barrel layers; every primitive carries an AABB
// for the O(n²) broad-phase prefilter.

import type {
  DesignerPcbProjection,
  DrcAnchor,
  PcbCopperLayerId,
  PcbDesignRules,
  DrcPairKind,
  PcbFabricatorId,
  PcbLayerCount,
  PcbNetClass,
  PcbPointMm,
  PcbVia,
  RatsnestSegment,
} from "../../../../sdks/designer";
import {
  copperLayersForCount,
  isCopperLayerId,
  isValidViaSpan,
  viaSpanLayers,
} from "../../../../sdks/designer";
import {
  areaMaskForPoint,
  compileRuleSet,
  resolveClearance,
  type CompiledRuleSet,
} from "../../../../shared/drc/rule-resolver";
import { resolvePadCopperLayers } from "../../../../shared/rendering/pad-copper-layers";
import { resolveNetClassId } from "../pcb/net-class-resolver";
import { flattenCutout, flattenOutline } from "../pcb/outline-geometry";
import {
  freePadOutlineWorldMm,
  padOutlineWorldMm,
  ringBounds,
  type RingBounds,
} from "../pcb/pad-outline";
import { padWorldPositionMm, placementPads } from "../pcb/pad-geometry";
import type { Point } from "../pcb/pcb-trace-geometry";

/** Default minimums when a (pre-DRC) board lacks the optional rule field. */
export const DEFAULT_HOLE_TO_HOLE_MM = 0.25;
export const DEFAULT_HOLE_TO_BOARD_EDGE_MM = 0.3;
export const DEFAULT_BOARD_THICKNESS_MM = 1.6;

const NM_TO_MM = 1 / 1_000_000;

// The tolerance policy moved to pcb/tolerance.ts (P1 epsilon unification) so
// fab validators and creation gates share it; re-exported here because every
// check imports it from the context module.
export { below, DRC_EPS_MM } from "../pcb/tolerance";

export interface DrcTrace {
  id: string;
  netId: string | null;
  layer: PcbCopperLayerId;
  widthMm: number;
  halfWidthMm: number;
  pointsMm: Point[];
  bounds: RingBounds;
  mid: PcbPointMm;
}

export interface DrcPad {
  anchor: DrcAnchor;
  netId: string | null;
  layers: PcbCopperLayerId[];
  ring: PcbPointMm[];
  bounds: RingBounds;
  center: PcbPointMm;
  /**
   * True when the pad declared an explicit copper layer not valid for this
   * stackup (e.g. In1.Cu on a 2-layer board). Flagged as PAD_LAYER_MISMATCH;
   * such pads are still collision-checked on every valid layer (fallback) so
   * they cannot mask a short (audit B5-PAD-LAYER, B5-VIA-MASK).
   */
  declaredLayerInvalid: boolean;
}

export interface DrcViaGeom {
  via: PcbVia;
  netId: string | null;
  center: PcbPointMm;
  radiusMm: number;
  layers: PcbCopperLayerId[];
  bounds: RingBounds;
  /**
   * True when the via's declared span resolves to no valid copper layers on
   * this stackup. Flagged as VIA_LAYER_SPAN; the via is still checked on ALL
   * valid layers (clamp-with-fallback) so its copper can't escape short
   * detection (audit B5-VIA-MASK).
   */
  layerSpanInvalid: boolean;
  /**
   * True when the via's declared TYPE topology is invalid for the stackup
   * (e.g. a "blind" via spanning both outer layers, a reversed span, or a
   * non-adjacent microvia). Also surfaces as VIA_LAYER_SPAN.
   */
  viaTypeInvalid: boolean;
}

/** Any drilled hole (via barrel / TH pad / std-or-NPTH free pad / free hole). */
export interface DrcHole {
  anchor: DrcAnchor;
  /** Hole class: via barrel / plated component hole / non-plated hole. */
  kind: "via" | "pth" | "npth";
  /** Net the hole's copper belongs to (null for mechanical / NPTH holes). */
  netId: string | null;
  center: PcbPointMm;
  drillMm: number;
  /**
   * Copper pad outer diameter (mm) for the annular-ring check. Set for plated
   * pads with a defined copper extent (TH footprint pads, free `std` pads);
   * undefined for vias (checked via `DrcViaGeom`) and bare mechanical holes.
   */
  padOdMm?: number;
  /**
   * Slot centerline (mm) for oblong drills, so edge/spacing checks use the true
   * slot geometry instead of a round-hole model (audit B2-5 template). Absent
   * for round holes.
   */
  slot?: { a: PcbPointMm; b: PcbPointMm; widthMm: number };
}

export interface DrcContext {
  projection: DesignerPcbProjection;
  designRules: PcbDesignRules;
  netClasses: PcbNetClass[];
  fabricator: PcbFabricatorId;
  validCopperLayers: Set<PcbCopperLayerId>;
  traces: DrcTrace[];
  pads: DrcPad[];
  vias: DrcViaGeom[];
  /** Every drilled hole on the board, for hole-to-hole spacing. */
  holes: DrcHole[];
  /** Finished board thickness (mm); for via aspect-ratio. */
  boardThicknessMm: number;
  /** Minimum edge-to-edge hole spacing (mm). */
  holeToHoleMm: number;
  /** Minimum drill-edge-to-board-edge spacing (mm). */
  holeToBoardEdgeMm: number;
  /** Flattened board outline ring (mm) + internal cutout rings. */
  outlineRing: Point[];
  cutoutRings: Point[][];
  ratsnest: RatsnestSegment[];
  netNames: Record<string, string>;
  /**
   * Clearance contribution of a net's class (mm), or 0 when the net / class is
   * unknown. Resolved LIVE from the net id every time (audit B3-2/B1-2): the
   * stored `netClassId` on traces/vias is a creation-time hint that can go
   * stale after a reassignment, so DRC never consults it. Net class can only
   * *tighten* clearance; the board design rule is the floor.
   */
  netClassClearanceMm(netId: string | null): number;
  /** Resolved net-class id for a net (live; never the stored id). */
  netClassIdOf(netId: string | null): string;
  /**
   * Effective clearance (mm) for a pair — implicit tier + scoped rules + floor
   * (P6). `pointA`/`pointB` are representative locations for area-scope tests.
   */
  clearanceFor(
    pairKind: DrcPairKind,
    layer: PcbCopperLayerId,
    aNetId: string | null,
    pointA: PcbPointMm,
    bNetId: string | null,
    pointB: PcbPointMm,
  ): number;
}

function copperLayerOf(layer: string): PcbCopperLayerId | null {
  return isCopperLayerId(layer) ? layer : null;
}

function boundsOfPoints(points: readonly Point[], pad = 0): RingBounds {
  const b = ringBounds(points);
  return {
    minX: b.minX - pad,
    minY: b.minY - pad,
    maxX: b.maxX + pad,
    maxY: b.maxY + pad,
  };
}

function viaLayers(
  via: PcbVia,
  layerCount: PcbLayerCount,
): PcbCopperLayerId[] {
  return viaSpanLayers(via.fromLayer, via.toLayer, layerCount);
}

/**
 * Slot centerline for an oblong drill, or undefined for a round hole. The slot
 * runs `lengthMm` along `angleDeg` through `center`; endpoints are inset by
 * `widthMm/2` so a & b are the centers of the rounded caps.
 */
function slotCenterline(
  center: PcbPointMm,
  drillSlot: { lengthMm: number; widthMm: number; angleDeg: number } | null | undefined,
): { a: PcbPointMm; b: PcbPointMm; widthMm: number } | undefined {
  if (!drillSlot || drillSlot.lengthMm <= drillSlot.widthMm) return undefined;
  const half = (drillSlot.lengthMm - drillSlot.widthMm) / 2;
  const rad = (drillSlot.angleDeg * Math.PI) / 180;
  const dx = Math.cos(rad) * half;
  const dy = Math.sin(rad) * half;
  return {
    a: { x: center.x - dx, y: center.y - dy },
    b: { x: center.x + dx, y: center.y + dy },
    widthMm: drillSlot.widthMm,
  };
}

export function buildDrcContext(projection: DesignerPcbProjection): DrcContext {
  const { board } = projection;
  const validCopperLayers = new Set<PcbCopperLayerId>(
    copperLayersForCount(board.layerCount),
  );

  const classById = new Map(board.netClasses.map((c) => [c.id, c]));
  const compiledRules: CompiledRuleSet = compileRuleSet(board);
  const classIdByNet = new Map<string, string>();
  const netClassIdOf = (netId: string | null): string => {
    if (!netId) return "";
    const cached = classIdByNet.get(netId);
    if (cached !== undefined) return cached;
    const id = resolveNetClassId(
      netNames[netId] ?? "",
      board.netClasses,
      board.perNetClassAssignments,
      netId,
    );
    classIdByNet.set(netId, id);
    return id;
  };
  // Memoize net → clearance resolution: the O(n²) clearance loops query the
  // same net's class repeatedly, and resolveNetClassId re-scans every net class
  // per call. Cache the resolved clearance once per net id.
  const clearanceByNetId = new Map<string, number>();

  const traces: DrcTrace[] = projection.traces.map((t) => {
    const pointsMm = t.pointsNm.map((p) => ({
      x: p.x * NM_TO_MM,
      y: p.y * NM_TO_MM,
    }));
    const half = t.widthMm / 2;
    const raw = ringBounds(pointsMm);
    return {
      id: t.id,
      netId: t.netId,
      layer: t.layer,
      widthMm: t.widthMm,
      halfWidthMm: half,
      pointsMm,
      bounds: boundsOfPoints(pointsMm, half),
      mid: { x: (raw.minX + raw.maxX) / 2, y: (raw.minY + raw.maxY) / 2 },
    };
  });

  const pads: DrcPad[] = [];
  const holes: DrcHole[] = [];
  const padNets = projection.padNets ?? {};
  for (const placement of projection.placements) {
    for (const pad of placementPads(placement)) {
      const drill = pad.drillDiameterMm ?? 0;
      const isThroughHole = drill > 0;
      // Shared resolver applies the B.Cu side-flip (audit B1-1) and *.Cu →
      // all-layers (B1-6). A pad that named an explicit copper layer outside
      // this stackup resolves to the placement side (fallback) but is flagged.
      const resolved = resolvePadCopperLayers(pad, placement, validCopperLayers);
      const declaredLayerInvalid =
        !isThroughHole &&
        pad.layer !== undefined &&
        pad.layer !== "*.Cu" &&
        isCopperLayerId(pad.layer) &&
        !validCopperLayers.has(pad.layer);
      // Clamp-with-fallback (audit B5-VIA-MASK, symmetric with vias): an
      // invalid-layer pad is checked on ALL valid copper layers so its copper
      // still collides with everything until repaired — never masks a short.
      const layers: PcbCopperLayerId[] = declaredLayerInvalid
        ? [...validCopperLayers]
        : [...resolved];
      const ring = padOutlineWorldMm(placement, pad);
      const center = padWorldPositionMm(placement, pad);
      const anchor: DrcAnchor = {
        kind: "pad",
        placementId: placement.id,
        padNumber: pad.number,
      };
      const padNetId = padNets[`${placement.id}|${pad.number}`] ?? null;
      pads.push({
        anchor,
        netId: padNetId,
        layers,
        ring,
        bounds: ringBounds(ring),
        center,
        declaredLayerInvalid,
      });
      if (isThroughHole) {
        holes.push({
          anchor,
          kind: "pth",
          netId: padNetId,
          center,
          drillMm: drill,
          padOdMm: Math.min(pad.widthMm, pad.heightMm),
        });
      }
    }
  }
  for (const freePad of projection.freePads) {
    const drill = freePad.drillMm ?? 0;
    if (
      drill > 0 &&
      (freePad.padType === "std" || freePad.padType === "hole")
    ) {
      const isStd = freePad.padType === "std";
      const padSlot = slotCenterline(freePad.centerMm, freePad.drillSlot);
      holes.push({
        anchor: { kind: "freePad", freePadId: freePad.id },
        kind: isStd ? "pth" : "npth",
        netId: isStd ? freePad.netId : null,
        center: freePad.centerMm,
        drillMm: drill,
        ...(isStd
          ? { padOdMm: Math.min(freePad.widthMm, freePad.heightMm) }
          : {}),
        ...(padSlot ? { slot: padSlot } : {}),
      });
    }
    if (freePad.padType === "hole") continue; // NPTH: counted above, no copper
    const isStd = freePad.padType === "std";
    const declaredLayerInvalid =
      !isStd &&
      isCopperLayerId(freePad.layer) &&
      !validCopperLayers.has(freePad.layer);
    const layers: PcbCopperLayerId[] =
      isStd || declaredLayerInvalid
        ? [...validCopperLayers]
        : [copperLayerOf(freePad.layer) ?? "F.Cu"];
    const ring = freePadOutlineWorldMm(freePad);
    pads.push({
      anchor: { kind: "freePad", freePadId: freePad.id },
      netId: freePad.netId,
      layers,
      ring,
      bounds: ringBounds(ring),
      center: freePad.centerMm,
      declaredLayerInvalid,
    });
  }
  for (const hole of projection.freeHoles) {
    const holeSlot = slotCenterline(hole.centerMm, hole.drillSlot);
    holes.push({
      anchor: { kind: "freeHole", freeHoleId: hole.id },
      kind: "npth",
      netId: null,
      center: hole.centerMm,
      drillMm: hole.drillMm,
      ...(holeSlot ? { slot: holeSlot } : {}),
    });
  }

  const vias: DrcViaGeom[] = projection.vias.map((via) => {
    const radius = via.diameterMm / 2;
    const span = viaLayers(via, board.layerCount);
    const layerSpanInvalid = span.length < 2;
    const viaTypeInvalid =
      !layerSpanInvalid &&
      !isValidViaSpan(via.fromLayer, via.toLayer, via.viaType, board.layerCount)
        .ok;
    // Clamp-with-fallback (audit B5-VIA-MASK): a layer-invalid via is checked
    // on every valid copper layer so its physical barrel copper still collides
    // with everything until repaired — it must not vanish from clearance/short.
    const layers = layerSpanInvalid ? [...validCopperLayers] : span;
    return {
      via,
      netId: via.netId,
      center: via.centerMm,
      radiusMm: radius,
      layers,
      layerSpanInvalid,
      viaTypeInvalid,
      bounds: {
        minX: via.centerMm.x - radius,
        minY: via.centerMm.y - radius,
        maxX: via.centerMm.x + radius,
        maxY: via.centerMm.y + radius,
      },
    };
  });

  for (const vg of vias) {
    holes.push({
      anchor: { kind: "via", viaId: vg.via.id },
      kind: "via",
      netId: vg.netId,
      center: vg.center,
      drillMm: vg.via.drillMm,
    });
  }

  const netNames = projection.netNames ?? {};
  const cutouts = board.cutouts ?? [];

  return {
    projection,
    designRules: board.designRules,
    netClasses: board.netClasses,
    fabricator: board.fabricator,
    validCopperLayers,
    traces,
    pads,
    vias,
    holes,
    boardThicknessMm: board.boardThicknessMm ?? DEFAULT_BOARD_THICKNESS_MM,
    holeToHoleMm:
      board.designRules.minimums.holeToHoleMm ?? DEFAULT_HOLE_TO_HOLE_MM,
    holeToBoardEdgeMm:
      board.designRules.clearance.holeToBoardEdgeMm ??
      DEFAULT_HOLE_TO_BOARD_EDGE_MM,
    outlineRing: flattenOutline(board.outline),
    cutoutRings: cutouts.map((c) => flattenCutout(c.shape)),
    ratsnest: projection.ratsnest,
    netNames,
    netClassClearanceMm(netId) {
      if (!netId) return 0;
      const cached = clearanceByNetId.get(netId);
      if (cached !== undefined) return cached;
      const name = netNames[netId] ?? "";
      const id = resolveNetClassId(
        name,
        board.netClasses,
        board.perNetClassAssignments,
        netId,
      );
      const c = classById.get(id);
      const value = c ? c.clearanceMm : 0;
      clearanceByNetId.set(netId, value);
      return value;
    },
    netClassIdOf,
    clearanceFor(pairKind, layer, aNetId, pointA, bNetId, pointB) {
      // Implicit tier: pre-P6 max(boardRule, classA, classB) — reuses the
      // memoized net-class clearance lookups above.
      const implicitMax = Math.max(
        compiledRules.boardClearanceByPairKind[pairKind] ?? 0,
        this.netClassClearanceMm(aNetId),
        this.netClassClearanceMm(bNetId),
      );
      // Fast path: no scoped rules ⇒ implicit tier only (floor is 0 pre-P6),
      // byte-identical to the old max(...).
      if (compiledRules.clearanceRules.length === 0) {
        return Math.max(implicitMax, compiledRules.floorMm);
      }
      const a = {
        netId: aNetId,
        netClassId: netClassIdOf(aNetId),
        areaMask: areaMaskForPoint(compiledRules, pointA),
      };
      const b = {
        netId: bNetId,
        netClassId: netClassIdOf(bNetId),
        areaMask: areaMaskForPoint(compiledRules, pointB),
      };
      return resolveClearance(compiledRules, pairKind, layer, a, b, implicitMax)
        .mm;
    },
  };
}

/** AABB-to-AABB minimum gap (0 if overlapping). Broad-phase prefilter. */
export function aabbGap(a: RingBounds, b: RingBounds): number {
  const dx = Math.max(a.minX - b.maxX, b.minX - a.maxX, 0);
  const dy = Math.max(a.minY - b.maxY, b.minY - a.maxY, 0);
  return Math.sqrt(dx * dx + dy * dy);
}

export function layersOverlap(
  a: readonly PcbCopperLayerId[],
  b: readonly PcbCopperLayerId[],
): boolean {
  for (const layer of a) if (b.includes(layer)) return true;
  return false;
}
