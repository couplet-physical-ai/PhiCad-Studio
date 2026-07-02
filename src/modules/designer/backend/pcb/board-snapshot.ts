// Serialize a PCB projection into a self-contained `BoardSnapshot` for the cloud
// auto-layout service (cloud-auto-layout, port 3002 — both /v1/route and /v1/place
// consume this one superset shape). Pure — derives everything from a single
// `DesignerPcbProjection` plus caller-supplied route/place options.
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
  PcbDrillSlot,
  PlaceOptions,
  RouteOptions,
  SnapshotPlacement,
  ViaObstacle,
} from "../../../../sdks/designer";
import { resolveNetClassId } from "./net-class-resolver";
import { flattenCutout, flattenOutline } from "./outline-geometry";
import { placementPads } from "./pad-geometry";
import { freePadOutlineWorldMm, padOutlineWorldMm } from "./pad-outline";
import { buildSnapshotPourIslands } from "./board-snapshot-pours";

const STACKUP_ORDER: PcbCopperLayerId[] = ["F.Cu", "In1.Cu", "In2.Cu", "B.Cu"];
const DEFAULT_BOARD_THICKNESS_MM = 1.6;
// Mirrors the service's `SCHEMA_VERSION` (cloud-auto-layout app/contracts/snapshot.py).
// Bump the minor version when a new optional field ships; the service treats
// schemaVersion as hash-neutral, so producer/consumer can drift on minors freely.
const SNAPSHOT_SCHEMA_VERSION = "1.0";
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

/**
 * Round free holes / NPTH free pads that carry an oblong `drillSlot` degrade to a
 * round keepout sized to the slot's long axis, never the plain round `drillMm` —
 * a keepout at the round diameter would under-cover the slot's extended ends and
 * let the router cut into them. Conservative (over-keepout on the long axis);
 * flagged via `warnings` so the caller can surface it.
 */
function resolveHoleDrillMm(
  drillMm: number,
  drillSlot: PcbDrillSlot | null | undefined,
  sourceId: string,
  warnings: string[],
): number {
  if (!drillSlot || drillSlot.lengthMm <= drillMm) return drillMm;
  warnings.push(
    `Hole "${sourceId}" has an oblong drill (${drillSlot.lengthMm}mm slot, ${drillMm}mm round) — ` +
      `modeled as a ${drillSlot.lengthMm}mm round keepout (conservative; a round keepout at the ` +
      `nominal drill size could under-cover the slot ends).`,
  );
  return drillSlot.lengthMm;
}

/**
 * Project the library footprint's free-text `mountType` (KiCad importer / IPC-7351B
 * generator emit "smd" | "through_hole" | "virtual" | "unknown", case as authored) onto
 * the service's closed `"smd" | "tht"` vocabulary. Anything unrecognized (including
 * "virtual"/"unknown"/null) omits the field — the service falls back to its own
 * refdes-prefix heuristic.
 */
function normalizeMountType(raw: string | null | undefined): "smd" | "tht" | undefined {
  if (!raw) return undefined;
  switch (raw.trim().toLowerCase()) {
    case "smd":
      return "smd";
    case "tht":
    case "through_hole":
    case "through-hole":
      return "tht";
    default:
      return undefined;
  }
}

export interface BuildSnapshotOptions {
  routeOptions?: RouteOptions;
  /** Net-class ids to route. Defaults to every class on the board. */
  routableNetClassIds?: string[];
  excludedNetIds?: string[];
  /**
   * Engine options for cloud-auto-place. When present, emitted into the snapshot as
   * `placeOptions` (the autorouter ignores it). Omitted otherwise, so autoroute snapshots
   * keep their exact byte-shape.
   */
  placeOptions?: PlaceOptions;
  /** Serialize copper-pour islands into the snapshot. Default-off until service deploy flips. */
  serializePours?: boolean;
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
  const freeHolesFromPads: FreeHole[] = [];
  for (const freePad of projection.freePads) {
    if (freePad.padType === "hole") {
      // NPTH: no copper, but the drilled opening is still a real obstacle — emit it
      // as a free hole so the router doesn't route straight through it (previously
      // silently dropped here, a data-loss bug).
      freeHolesFromPads.push({
        id: `free:${freePad.id}`,
        centerMm: freePad.centerMm,
        drillMm: resolveHoleDrillMm(
          freePad.drillMm ?? 0,
          freePad.drillSlot,
          `free:${freePad.id}`,
          warnings,
        ),
      });
      continue;
    }
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
  const vias: ViaObstacle[] = projection.vias.map((v) => {
    if (v.viaType !== "through") {
      // The engine's ViaObstacle only models a through-span keepout — serialize it as
      // one anyway (unchanged shape) but flag the loss of blind/buried/micro topology
      // so the desktop can surface it before the user applies the route.
      warnings.push(
        `Via "${v.id}" is a ${v.viaType} via — the autorouter models it as a ` +
          `through-span obstacle (${v.fromLayer}→${v.toLayer}); it will not route ` +
          `through the via's actual span.`,
      );
    }
    return {
      id: v.id,
      netId: v.netId,
      centerMm: v.centerMm,
      diameterMm: v.diameterMm,
      drillMm: v.drillMm,
      fromLayer: v.fromLayer,
      toLayer: v.toLayer,
      isHoleOnly: false,
    };
  });

  const traces: ExistingTrace[] = projection.traces.map((t) => ({
    id: t.id,
    netId: t.netId,
    netClassId: t.netClassId,
    layer: t.layer,
    widthMm: t.widthMm,
    pointsNm: t.pointsNm.map((p) => ({ x: p.x, y: p.y })), // already nm
    segmentMode: t.segmentMode,
  }));

  const freeHoles: FreeHole[] = [
    ...projection.freeHoles.map((h) => ({
      id: h.id,
      centerMm: h.centerMm,
      drillMm: resolveHoleDrillMm(h.drillMm, h.drillSlot, h.id, warnings),
    })),
    ...freeHolesFromPads,
  ];

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

  const placements: SnapshotPlacement[] = projection.placements.map((p) => {
    const mountType = normalizeMountType(p.footprint.mountType);
    return {
      id: p.id,
      reference: p.reference,
      layer: copperLayerOf(p.layer) ?? "F.Cu",
      // Pass through the current transform for cloud-auto-place (the autorouter ignores
      // these). positionMm is the footprint origin; rotationDeg may be non-cardinal.
      positionMm: p.positionMm,
      rotationDeg: p.rotationDeg,
      mirrored: p.mirrored,
      // AUTHORITATIVE mount-type hint for cloud-auto-place's flip-eligibility/THT logic
      // (falls back to its own refdes heuristic when omitted — see snapshot.py Placement).
      ...(mountType ? { mountType } : {}),
    };
  });

  const pours = opts.serializePours ? buildSnapshotPourIslands(projection) : [];
  // Not "the router can't use pours" (Phase 5 pour-aware routing ships) — this call
  // simply didn't send them, e.g. `serializePours` was off by explicit request, or the
  // routes.ts caller's capability negotiation resolved to `false` (see that file's
  // autoroute handler). Callers deciding the default should check the service's
  // GET /v1/version `capabilities.pours.accepted` rather than assuming this is permanent.
  if (!opts.serializePours && projection.zones.length > 0) {
    warnings.push(
      `Design has ${projection.zones.length} copper ${
        projection.zones.length === 1 ? "zone" : "zones"
      } — pours were not sent to the autorouter for this request. Routing ignores them; you may need to re-pour after applying.`,
    );
  }
  if (ratsnest.length === 0) {
    warnings.push("No unrouted nets match the selected net classes.");
  }

  const snapshot: BoardSnapshot = {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
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
    pours,
    freeHoles,
    ratsnest,
    netNames: projection.netNames,
    // Default to the portfolio production default; any caller-supplied option wins.
    options: { portfolio: DEFAULT_PORTFOLIO, ...(opts.routeOptions ?? {}) },
    // Only emitted for auto-place requests; the autorouter ignores it and an absent
    // field keeps the autoroute snapshot byte-shape unchanged.
    ...(opts.placeOptions ? { placeOptions: opts.placeOptions } : {}),
  };

  return { snapshot, warnings };
}
