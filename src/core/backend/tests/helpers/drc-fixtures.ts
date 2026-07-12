/**
 * Shared DRC test fixture builders — the drc-engine.test.ts builder style,
 * exported so the P0 QA suites (determinism, epsilon matrix, audit
 * regressions, goldens) construct projections one way. Coordinates are mm
 * unless the name says Nm; trace points are given in mm and converted.
 */
import { createDefaultPcbBoardSettings } from "../../../../modules/designer/backend/pcb/pcb-defaults";
import type { FootprintRenderSourcePad } from "../../../../shared/rendering/types";
import type {
  DesignerPcbProjection,
  DrcReport,
  DrcRuleCode,
  PcbBoardSettings,
  PcbDesignRules,
  PcbFreeHole,
  PcbFreePad,
  PcbNetClass,
  PcbPlacedPart,
  PcbTrace,
  PcbVia,
  RatsnestSegment,
} from "../../../../sdks/designer";

export const FIXTURE_TS = "2026-01-01T00:00:00.000Z";
export const MM = 1_000_000;

export function board(
  overrides: Partial<PcbBoardSettings> = {},
): PcbBoardSettings {
  return { ...createDefaultPcbBoardSettings(FIXTURE_TS), ...overrides };
}

/** Board with deep-merged design-rule overrides. */
export function boardWithRules(rules: {
  clearance?: Partial<PcbDesignRules["clearance"]>;
  minimums?: Partial<PcbDesignRules["minimums"]>;
  netClasses?: PcbNetClass[];
  perNetClassAssignments?: Record<string, string>;
  fabricator?: PcbBoardSettings["fabricator"];
  layerCount?: PcbBoardSettings["layerCount"];
  boardThicknessMm?: number;
}): PcbBoardSettings {
  const base = createDefaultPcbBoardSettings(FIXTURE_TS);
  return {
    ...base,
    ...(rules.fabricator !== undefined ? { fabricator: rules.fabricator } : {}),
    ...(rules.layerCount !== undefined ? { layerCount: rules.layerCount } : {}),
    ...(rules.boardThicknessMm !== undefined
      ? { boardThicknessMm: rules.boardThicknessMm }
      : {}),
    ...(rules.netClasses !== undefined ? { netClasses: rules.netClasses } : {}),
    ...(rules.perNetClassAssignments !== undefined
      ? { perNetClassAssignments: rules.perNetClassAssignments }
      : {}),
    designRules: {
      ...base.designRules,
      clearance: { ...base.designRules.clearance, ...rules.clearance },
      minimums: { ...base.designRules.minimums, ...rules.minimums },
    },
  };
}

export function projection(
  parts: Partial<DesignerPcbProjection> = {},
): DesignerPcbProjection {
  return {
    designId: "d1",
    revision: 1,
    board: parts.board ?? board(),
    placements: parts.placements ?? [],
    traces: parts.traces ?? [],
    vias: parts.vias ?? [],
    freeHoles: parts.freeHoles ?? [],
    freePads: parts.freePads ?? [],
    overlayTexts: parts.overlayTexts ?? [],
    overlayShapes: parts.overlayShapes ?? [],
    zones: parts.zones ?? [],
    ratsnest: parts.ratsnest ?? [],
    netNames: parts.netNames ?? {},
    padNets: parts.padNets,
    warnings: [],
  };
}

export function trace(
  id: string,
  netId: string | null,
  pts: Array<[number, number]>,
  opts: {
    widthMm?: number;
    layer?: PcbTrace["layer"];
    netClassId?: string;
  } = {},
): PcbTrace {
  return {
    id,
    netId,
    netClassId: opts.netClassId ?? "default",
    layer: opts.layer ?? "F.Cu",
    widthMm: opts.widthMm ?? 0.2,
    pointsNm: pts.map(([x, y]) => ({
      x: Math.round(x * MM),
      y: Math.round(y * MM),
    })),
    segmentMode: "manhattan-90",
  };
}

export function via(
  id: string,
  opts: {
    netId?: string | null;
    netClassId?: string;
    center?: { x: number; y: number };
    diameterMm?: number;
    drillMm?: number;
    fromLayer?: PcbVia["fromLayer"];
    toLayer?: PcbVia["toLayer"];
  } = {},
): PcbVia {
  return {
    id,
    netId: opts.netId ?? null,
    netClassId: opts.netClassId ?? "default",
    centerMm: opts.center ?? { x: 0, y: 0 },
    diameterMm: opts.diameterMm ?? 0.8,
    drillMm: opts.drillMm ?? 0.4,
    fromLayer: opts.fromLayer ?? "F.Cu",
    toLayer: opts.toLayer ?? "B.Cu",
    viaType: "through",
    protection: "tented",
    provenance: "route",
  };
}

export function freeHole(
  id: string,
  center: { x: number; y: number },
  drillMm: number,
): PcbFreeHole {
  return { id, centerMm: center, drillMm, lockedAt: null };
}

export function freePad(
  id: string,
  opts: {
    padType?: PcbFreePad["padType"];
    shape?: PcbFreePad["shape"];
    center?: { x: number; y: number };
    widthMm?: number;
    heightMm?: number;
    drillMm?: number | null;
    drillSlot?: PcbFreePad["drillSlot"];
    layer?: PcbFreePad["layer"];
    netId?: string | null;
    rotationDeg?: number;
    solderMaskExpansionMm?: number | null;
  } = {},
): PcbFreePad {
  return {
    id,
    centerMm: opts.center ?? { x: 0, y: 0 },
    rotationDeg: opts.rotationDeg ?? 0,
    padType: opts.padType ?? "smd",
    shape: opts.shape ?? "rect",
    widthMm: opts.widthMm ?? 1,
    heightMm: opts.heightMm ?? 1,
    drillMm: opts.drillMm ?? null,
    ...(opts.drillSlot !== undefined ? { drillSlot: opts.drillSlot } : {}),
    layer: opts.layer ?? "F.Cu",
    netId: opts.netId ?? null,
    solderMaskExpansionMm: opts.solderMaskExpansionMm ?? null,
    solderPasteExpansionMm: null,
    lockedAt: null,
  };
}

export function pad(
  number: string,
  center: { x: number; y: number },
  w: number,
  h: number,
  opts: {
    shape?: FootprintRenderSourcePad["shape"];
    rotationDeg?: number;
    drillDiameterMm?: number;
    layer?: string;
  } = {},
): FootprintRenderSourcePad {
  return {
    id: `pad-${number}`,
    number,
    shape: opts.shape ?? "rect",
    centerMm: center,
    widthMm: w,
    heightMm: h,
    rotationDeg: opts.rotationDeg ?? 0,
    ...(opts.drillDiameterMm !== undefined
      ? { drillDiameterMm: opts.drillDiameterMm }
      : {}),
    ...(opts.layer !== undefined ? { layer: opts.layer } : {}),
  };
}

export function placement(
  id: string,
  opts: {
    positionMm?: { x: number; y: number };
    rotationDeg?: number;
    layer?: PcbPlacedPart["layer"];
    mirrored?: boolean;
    pads?: FootprintRenderSourcePad[];
    reference?: string;
  } = {},
): PcbPlacedPart {
  return {
    id,
    partId: id,
    componentId: "c",
    reference: opts.reference ?? id,
    positionMm: opts.positionMm ?? { x: 0, y: 0 },
    rotationDeg: opts.rotationDeg ?? 0,
    mirrored: opts.mirrored ?? false,
    layer: opts.layer ?? "F.Cu",
    footprint: {
      footprintId: "fp",
      name: "FP",
      mountType: null,
      sourceHash: null,
      preview: {
        kind: "footprint",
        units: "mm",
        name: "FP",
        pads: opts.pads ?? [],
        graphics: [],
        labels: [],
        bounds: null,
        warnings: [],
      },
    },
  };
}

export function ratsSeg(
  netId: string,
  fromMm: { x: number; y: number },
  toMm: { x: number; y: number },
  opts: {
    fromPlacementId?: string;
    fromPadNumber?: string;
    toPlacementId?: string;
    toPadNumber?: string;
  } = {},
): RatsnestSegment {
  return {
    netId,
    netClassId: "default",
    fromMm,
    toMm,
    fromPlacementId: opts.fromPlacementId ?? "U1",
    fromPadNumber: opts.fromPadNumber ?? "1",
    toPlacementId: opts.toPlacementId ?? "U2",
    toPadNumber: opts.toPadNumber ?? "1",
  };
}

export function codes(report: DrcReport): DrcRuleCode[] {
  return report.violations.map((v) => v.code);
}

export function sortedIds(report: DrcReport): string[] {
  return report.violations.map((v) => v.id).sort();
}
