/**
 * Fixture-v2 → DesignerPcbProjection loader — the single implementation behind
 * scripts/drc-parity-harness.ts, scripts/update-drc-goldens.ts and the golden
 * suite (drc-golden.test.ts). Schema doc: scripts/drc-parity-harness.ts header.
 * Coordinates are integer nanometers unless the key says Mm.
 */
import { createDefaultPcbBoardSettings } from "../../../../modules/designer/backend/pcb/pcb-defaults";
import { computeRatsnest } from "../../../../modules/designer/backend/pcb/ratsnest";
import type { NetPadCorrelation } from "../../../../modules/designer/backend/pcb/net-pad-correlation";
import {
  padWorldPositionMm,
  placementPads,
} from "../../../../modules/designer/backend/pcb/pad-geometry";
import type {
  DesignerPcbProjection,
  PcbBoardSettings,
  PcbPlacedPart,
  PcbTrace,
  PcbVia,
  RatsnestSegment,
} from "../../../../sdks/designer";

const TS = "2026-01-01T00:00:00.000Z";
const NM = 1_000_000;

/* eslint-disable @typescript-eslint/no-explicit-any -- untyped JSON fixture */
export function fixtureToProjection(fixture: any): DesignerPcbProjection {
  const board: PcbBoardSettings = createDefaultPcbBoardSettings(TS);
  board.fabricator = fixture.fabricator ?? "custom";
  if (fixture.clearance)
    Object.assign(board.designRules.clearance, fixture.clearance);
  if (fixture.minimums)
    Object.assign(board.designRules.minimums, fixture.minimums);
  if (fixture.layerCount) board.layerCount = fixture.layerCount;
  if (fixture.boardThicknessMm)
    board.boardThicknessMm = fixture.boardThicknessMm;
  if (fixture.netClasses) board.netClasses = fixture.netClasses;
  if (fixture.perNetClassAssignments)
    board.perNetClassAssignments = fixture.perNetClassAssignments;
  if (fixture.cutouts) board.cutouts = fixture.cutouts;
  if (fixture.viewState)
    board.viewState = { ...board.viewState, ...fixture.viewState };
  // Wide default outline so v1 fixtures are never accidentally off-board /
  // near the edge; v2 fixtures may supply a real outline.
  board.outline = fixture.outline ?? {
    kind: "rect",
    widthMm: 200,
    heightMm: 200,
    centerMm: { x: 0, y: 0 },
  };

  const traces: PcbTrace[] = (fixture.traces ?? []).map((t: any) => ({
    id: t.id,
    netId: t.netId ?? null,
    netClassId: t.netClassId ?? "default",
    layer: t.layer ?? "F.Cu",
    widthMm: t.widthMm,
    segmentMode: t.segmentMode ?? "manhattan-90",
    pointsNm: t.pointsNm.map(
      (p: [number, number] | { x: number; y: number }) =>
        Array.isArray(p) ? { x: p[0], y: p[1] } : { x: p.x, y: p.y },
    ),
  }));

  const vias: PcbVia[] = (fixture.vias ?? []).map((v: any) => ({
    id: v.id,
    netId: v.netId ?? null,
    netClassId: v.netClassId ?? "default",
    centerMm: { x: v.centerMm[0] / NM, y: v.centerMm[1] / NM },
    diameterMm: v.diameterMm,
    drillMm: v.drillMm,
    fromLayer: v.fromLayer ?? "F.Cu",
    toLayer: v.toLayer ?? "B.Cu",
    viaType: v.viaType ?? "through",
    protection: v.protection ?? "tented",
    provenance: "route",
  }));

  const placements: PcbPlacedPart[] = (fixture.placements ?? []).map(
    (p: any) => ({
      id: p.id,
      partId: p.partId ?? p.id,
      componentId: p.componentId ?? "c",
      reference: p.reference ?? p.id,
      positionMm: p.positionMm ?? { x: 0, y: 0 },
      rotationDeg: p.rotationDeg ?? 0,
      mirrored: p.mirrored ?? false,
      layer: p.layer ?? "F.Cu",
      footprint: {
        footprintId: p.footprintId ?? "fp",
        name: p.footprintName ?? "FP",
        mountType: null,
        sourceHash: null,
        preview: {
          kind: "footprint",
          units: "mm",
          name: p.footprintName ?? "FP",
          pads: p.pads ?? [],
          graphics: p.graphics ?? [],
          labels: [],
          bounds: null,
          warnings: [],
        },
      },
    }),
  );

  const padNets: Record<string, string> = fixture.padNets ?? {};

  // Derive the ratsnest through the real computeRatsnest so UNCONNECTED_NET
  // is fixture-testable. Pour-aware fill context is not wired here.
  function deriveRatsnest(): RatsnestSegment[] {
    const netPads: NetPadCorrelation["netPads"] = new Map();
    for (const placement of placements) {
      for (const pad of placementPads(placement)) {
        const netId = padNets[`${placement.id}|${pad.number}`];
        if (!netId) continue;
        const worldMm = padWorldPositionMm(placement, pad);
        const list = netPads.get(netId) ?? [];
        list.push({ placementId: placement.id, padNumber: pad.number, worldMm });
        netPads.set(netId, list);
      }
    }
    return computeRatsnest(
      { netPads, warnings: [] },
      {
        netNames: new Map(Object.entries(fixture.netNames ?? {})),
        netClasses: board.netClasses,
        traces,
        vias,
      },
    );
  }

  return {
    designId: "parity",
    revision: 1,
    board,
    placements,
    traces,
    vias,
    freeHoles: fixture.freeHoles ?? [],
    freePads: fixture.freePads ?? [],
    overlayTexts: fixture.overlayTexts ?? [],
    overlayShapes: fixture.overlayShapes ?? [],
    zones: fixture.zones ?? [],
    ratsnest: fixture.computeRatsnest ? deriveRatsnest() : [],
    netNames: fixture.netNames ?? {},
    ...(Object.keys(padNets).length > 0 ? { padNets } : {}),
    warnings: [],
  };
}

/** Count of copper/drill primitives a fixture contributes (fixture-v2). */
export function fixturePrimitiveCount(p: DesignerPcbProjection): number {
  const padCount = p.placements.reduce(
    (sum, pl) => sum + placementPads(pl).length,
    0,
  );
  return (
    p.traces.length +
    p.vias.length +
    padCount +
    p.freePads.length +
    p.freeHoles.length
  );
}
