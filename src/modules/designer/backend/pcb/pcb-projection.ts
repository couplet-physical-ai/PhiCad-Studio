import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type {
  DesignerPcbProjection,
  PcbCopperLayerId,
} from "../../../../sdks/designer";
import { loadSchematicProjection } from "../projection-read";
import { correlateNetPads } from "./net-pad-correlation";
import {
  ensurePcbBoardSettings,
  loadPcbFreeHoles,
  loadPcbFreePads,
  loadPcbOverlayShapes,
  loadPcbOverlayTexts,
  loadPcbTraces,
  loadPcbVias,
  loadPcbZones,
  syncPcbPlacementsFromSchematic,
} from "./pcb-store";
import { computeRatsnest } from "./ratsnest";
import { findGroundNetId } from "./net-class-resolver";
import { isFeatureEnabled } from "../../../../core/contracts/feature-flags/backend";

type DbClient = BetterSQLite3Database<Record<string, unknown>>;

export function loadPcbProjection(params: {
  db: DbClient;
  designId: string;
  revision: number;
  timestamp: string;
}): DesignerPcbProjection {
  const board = ensurePcbBoardSettings(
    params.db,
    params.designId,
    params.timestamp,
  );
  const schematic = loadSchematicProjection(params.db, params.designId);

  // Schematic primitives (GND/PWR/NET_PORTAL) are deliberately excluded from
  // PCB placements — they are not parts, have no footprint, and exist only on
  // the schematic. The mapper below iterates `schematic.parts` only, so this
  // is a structural guarantee rather than an explicit filter.
  const placements = schematic
    ? syncPcbPlacementsFromSchematic({
        db: params.db,
        designId: params.designId,
        schematicParts: schematic.parts.map((part) => ({
          id: part.id,
          componentId: part.componentId,
          reference: part.reference,
          footprint: part.footprint,
        })),
        boardCenter: board.outline.centerMm,
        defaultLayer: "F.Cu",
        timestamp: params.timestamp,
      })
    : [];

  const correlation = schematic
    ? correlateNetPads(schematic, placements)
    : { netPads: new Map(), warnings: [] };
  const netNames = new Map<string, string>();
  if (schematic) {
    for (const net of schematic.nets) {
      netNames.set(net.id, net.name);
    }
  }
  const rawTraces = loadPcbTraces(params.db, params.designId);
  const rawVias = loadPcbVias(params.db, params.designId);

  // Bind importer-supplied netName hints (KiCad project import) to schematic
  // net ids. Built once per projection; native traces / vias with no netName
  // hint are unaffected. When a hint exists but no schematic net matches,
  // leave netId null — pad-alignment heuristics elsewhere remain the fallback.
  // Case-insensitive, matching the schematic's case-insensitive named-net union
  // (so a "VCC" trace hint binds to a "vcc"-named net). First writer wins on a
  // case collision (rare; the union already collapses same-name nets).
  const netIdByName = new Map<string, string>();
  if (schematic) {
    for (const net of schematic.nets) {
      if (!net.name) continue;
      const key = net.name.trim().toUpperCase();
      if (!netIdByName.has(key)) netIdByName.set(key, net.id);
    }
  }
  const bindNetName = <
    T extends { netId: string | null; netName?: string | null },
  >(
    entity: T,
  ): T => {
    if (entity.netId || !entity.netName) return entity;
    const resolved = netIdByName.get(entity.netName.trim().toUpperCase());
    if (!resolved) return entity;
    return { ...entity, netId: resolved };
  };
  const traces = rawTraces.map(bindNetName);
  const vias = rawVias.map(bindNetName);
  const freeHoles = loadPcbFreeHoles(params.db, params.designId);
  const freePads = loadPcbFreePads(params.db, params.designId);
  const overlayTexts = loadPcbOverlayTexts(params.db, params.designId);
  const overlayShapes = loadPcbOverlayShapes(params.db, params.designId);
  // Bind zone netName → netId so imported/drawn copper zones participate in the
  // pour fill, connectivity and export (zones carry `netName` like traces but
  // were previously inert). `netId` starts unset, so `bindNetName` resolves it.
  const zones = loadPcbZones(params.db, params.designId).map((zone) =>
    bindNetName({ ...zone, netId: zone.netId ?? null }),
  );

  // Flatten the schematic↔PCB pad correlation into a `${placementId}|${padNumber}`
  // → netId map so a pure consumer (DRC, copper pour) can resolve a footprint
  // pad's net without re-running correlation or touching the schematic.
  const padNets: Record<string, string> = {};
  for (const [netId, pads] of correlation.netPads) {
    for (const pad of pads) {
      padNets[`${pad.placementId}|${pad.padNumber}`] = netId;
    }
  }

  // Pour-aware connectivity: gather the enabled copper-pour layers and the net
  // each floods, so a same-net plane satisfies the ratsnest the way a routed
  // trace would (no spurious airwires / `UNCONNECTED_NET` for GND).
  const fillLayers = new Set(board.viewState?.copperFillLayers ?? []);
  // Copper fill is fixed policy: every enabled fill layer pours the GND net with
  // a SOLID pad connection (no per-layer net picker / thermal option in the UI).
  // Forced here on `board.viewState` so render, ratsnest and Gerber all agree.
  // If the board has no GND net, the layer pours nothing (null → no merge).
  if (board.viewState) {
    const gndNetId = findGroundNetId(netNames);
    const map = board.viewState.copperFillPourNetIds;
    for (const layer of fillLayers) {
      map[layer] = gndNetId;
    }
    board.viewState.copperFillPadConnection = "solid";
  }
  const pourNetIds = board.viewState?.copperFillPourNetIds ?? {};
  const pours: Array<{
    layer: PcbCopperLayerId;
    netId: string;
    clipPolygonMm?: Array<{ x: number; y: number }>;
  }> = [];
  for (const layer of fillLayers) {
    const netId = pourNetIds[layer];
    if (netId) pours.push({ layer, netId });
  }
  // Explicit copper zones connect their pads too (clipped to the zone polygon).
  for (const zone of zones) {
    if (zone.netId && zone.polygonPointsMm.length >= 3) {
      pours.push({
        layer: zone.layer,
        netId: zone.netId,
        clipPolygonMm: zone.polygonPointsMm,
      });
    }
  }

  const ratsnest = computeRatsnest(correlation, {
    netNames,
    netClasses: board.netClasses,
    perNetClassAssignments: board.perNetClassAssignments,
    traces,
    vias,
    padShapeTouch: isFeatureEnabled("pcb.padShapeConnectivity"),
    fill: {
      outline: board.outline,
      designRules: board.designRules,
      placements,
      padNetIds: new Map(Object.entries(padNets)),
      cutouts: board.cutouts ?? [],
      freeHoles,
      freePads,
      pours,
    },
  });

  return {
    designId: params.designId,
    revision: params.revision,
    board,
    placements,
    traces,
    vias,
    freeHoles,
    freePads,
    overlayTexts,
    overlayShapes,
    zones,
    ratsnest,
    netNames: Object.fromEntries(netNames),
    padNets,
    warnings: correlation.warnings,
  };
}
