// Serialize a PCB projection into a self-contained `BoardSnapshot` for the cloud
// auto-router (cloud-auto-router, port 3002). Pure — derives everything from a
// single `DesignerPcbProjection` plus caller-supplied route options.
//
// UNITS (the #1 bug surface): `traces[].pointsNm` is integer NANOMETERS and is
// passed through verbatim (the store already holds nm); EVERYTHING else
// (outline, pads, vias, free holes, ratsnest) is MILLIMETERS. Do not convert
// here.
//
// Reuse: the pad → world-ring + layer + net derivation mirrors the DRC context
// (`drc-context.ts`) exactly, via the same `placementPads` / `padOutlineWorldMm`
// / `padNets` helpers, so the router sees the same copper the DRC does.

import type {
  BoardSnapshot,
  DesignerPcbProjection,
  ExistingTrace,
  FreeHole,
  PadOutline,
  PcbCopperLayerId,
  RouteOptions,
  SnapshotPlacement,
  ViaObstacle,
} from "../../../../sdks/designer";
import { resolveNetClassId } from "./net-class-resolver";
import { flattenCutout, flattenOutline } from "./outline-geometry";
import { placementPads } from "./pad-geometry";
import { freePadOutlineWorldMm, padOutlineWorldMm } from "./pad-outline";

const STACKUP_ORDER: PcbCopperLayerId[] = ["F.Cu", "In1.Cu", "In2.Cu", "B.Cu"];
const DEFAULT_BOARD_THICKNESS_MM = 1.6;
// [M7] Recommended production default: route 4 net-ordering variants and keep the
// best (the service runs them sequentially, picking the best by its objective —
// never worse than the single-pass baseline). A caller may override via routeOptions.
const DEFAULT_PORTFOLIO = 4;

function copperLayersForCount(count: 2 | 4): PcbCopperLayerId[] {
  return count === 4 ? [...STACKUP_ORDER] : ["F.Cu", "B.Cu"];
}

function copperLayerOf(layer: string): PcbCopperLayerId | null {
  return (STACKUP_ORDER as string[]).includes(layer)
    ? (layer as PcbCopperLayerId)
    : null;
}

export interface BuildSnapshotOptions {
  routeOptions?: RouteOptions;
  /** Net-class ids to route. Defaults to every class on the board. */
  routableNetClassIds?: string[];
  excludedNetIds?: string[];
}

export interface BuildSnapshotResult {
  snapshot: BoardSnapshot;
  warnings: string[];
}

/**
 * Build a `BoardSnapshot` from a PCB projection. `warnings` carries
 * user-facing advisories (e.g. copper zones present — see below) the caller
 * surfaces in the autoroute dialog.
 */
export function buildBoardSnapshot(
  projection: DesignerPcbProjection,
  opts: BuildSnapshotOptions = {},
): BuildSnapshotResult {
  const { board } = projection;
  const warnings: string[] = [];

  const validCopperLayers = copperLayersForCount(board.layerCount);
  const padNets = projection.padNets ?? {};

  const routableNetClassIds =
    opts.routableNetClassIds ?? board.netClasses.map((c) => c.id);
  const routableSet = new Set(routableNetClassIds);
  const excludedSet = new Set(opts.excludedNetIds ?? []);

  // ── padOutlines (footprint + free pads) ────────────────────────────────
  // One entry per copper layer the pad occupies (through-hole spans all layers),
  // matching the DRC's pad model.
  const padOutlines: PadOutline[] = [];
  for (const placement of projection.placements) {
    const placementCopper = copperLayerOf(placement.layer) ?? "F.Cu";
    for (const pad of placementPads(placement)) {
      const isThroughHole = (pad.drillDiameterMm ?? 0) > 0;
      const layers: PcbCopperLayerId[] = isThroughHole
        ? validCopperLayers
        : [copperLayerOf(pad.layer ?? placement.layer) ?? placementCopper];
      const ring = padOutlineWorldMm(placement, pad);
      const netId = padNets[`${placement.id}|${pad.number}`] ?? null;
      const isConnectable = Boolean(pad.number);
      for (const layer of layers) {
        padOutlines.push({
          placementId: placement.id,
          padNumber: pad.number,
          netId,
          layer,
          ring,
          isConnectable,
        });
      }
    }
  }
  for (const freePad of projection.freePads) {
    if (freePad.padType === "hole") continue; // NPTH: no copper (handled as a hole)
    const layers: PcbCopperLayerId[] =
      freePad.padType === "std"
        ? validCopperLayers
        : [copperLayerOf(freePad.layer) ?? "F.Cu"];
    const ring = freePadOutlineWorldMm(freePad);
    for (const layer of layers) {
      padOutlines.push({
        placementId: `free:${freePad.id}`,
        padNumber: freePad.id,
        netId: freePad.netId,
        layer,
        ring,
        isConnectable: freePad.netId !== null,
      });
    }
  }

  // ── vias / traces / free holes (obstacles) ─────────────────────────────
  const vias: ViaObstacle[] = projection.vias.map((v) => ({
    id: v.id,
    netId: v.netId,
    centerMm: v.centerMm,
    diameterMm: v.diameterMm,
    drillMm: v.drillMm,
    fromLayer: v.fromLayer,
    toLayer: v.toLayer,
    isHoleOnly: false,
  }));

  const traces: ExistingTrace[] = projection.traces.map((t) => ({
    id: t.id,
    netId: t.netId,
    netClassId: t.netClassId,
    layer: t.layer,
    widthMm: t.widthMm,
    pointsNm: t.pointsNm.map((p) => ({ x: p.x, y: p.y })), // already nm
    segmentMode: t.segmentMode,
  }));

  const freeHoles: FreeHole[] = projection.freeHoles.map((h) => ({
    id: h.id,
    centerMm: h.centerMm,
    drillMm: h.drillMm,
  }));

  // ── ratsnest targets (filtered to routable, minus excluded) ────────────
  const ratsnest = projection.ratsnest.filter(
    (seg) => routableSet.has(seg.netClassId) && !excludedSet.has(seg.netId),
  );

  // ── net-class assignments (pre-resolve every known net) ────────────────
  const netAssignments: Record<string, string> = {};
  for (const [netId, name] of Object.entries(projection.netNames)) {
    netAssignments[netId] = resolveNetClassId(
      name,
      board.netClasses,
      board.perNetClassAssignments,
      netId,
    );
  }

  const placements: SnapshotPlacement[] = projection.placements.map((p) => ({
    id: p.id,
    reference: p.reference,
    layer: copperLayerOf(p.layer) ?? "F.Cu",
  }));

  // ── pours: never sent in v1 (service rejects non-empty pours) ───────────
  if (projection.zones.length > 0) {
    warnings.push(
      `Design has ${projection.zones.length} copper ${
        projection.zones.length === 1 ? "zone" : "zones"
      } — pours are not sent to the autorouter (v1). Routing ignores them; you may need to re-pour after applying.`,
    );
  }
  if (ratsnest.length === 0) {
    warnings.push("No unrouted nets match the selected net classes.");
  }

  const snapshot: BoardSnapshot = {
    designId: projection.designId,
    baseRevision: projection.revision,
    board: {
      outline: [flattenOutline(board.outline)],
      cutouts: (board.cutouts ?? []).map((c) => flattenCutout(c.shape)),
      copperToEdgeMm: board.designRules.clearance.copperToBoardEdgeMm,
    },
    stackup: {
      layerCount: board.layerCount,
      copperLayers: validCopperLayers,
      boardThicknessMm: board.boardThicknessMm ?? DEFAULT_BOARD_THICKNESS_MM,
    },
    designRules: {
      clearance: board.designRules.clearance,
      minimums: board.designRules.minimums,
      fabPresetId: board.fabricator,
    },
    netClasses: board.netClasses,
    netAssignments,
    routableNetClassIds,
    excludedNetIds: opts.excludedNetIds ?? [],
    placements,
    padOutlines,
    vias,
    traces,
    pours: [],
    freeHoles,
    ratsnest,
    netNames: projection.netNames,
    // Default to the portfolio production default; any caller-supplied option wins.
    options: { portfolio: DEFAULT_PORTFOLIO, ...(opts.routeOptions ?? {}) },
  };

  return { snapshot, warnings };
}
