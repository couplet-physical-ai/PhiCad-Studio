/**
 * Assemble parsed DXF edges into closed loops and describe each as a board-shape
 * candidate. Returns every loop (outer + inner) with validity + geometry so the
 * caller (the inspect endpoint → import modal) can require an explicit choice
 * rather than silently picking the largest. Confirmation goes through the normal
 * `pcb_set_board_outline` command — this module never writes.
 */
import type { PcbBoardContour, PcbOutlineSegment } from "../../../../../sdks";
import {
  chainEdgesToLoops,
  loopSignedArea,
  type AssembledLoop,
} from "../../pcb/chain-edges";
import {
  normalizeContour,
  validateContour,
} from "../../pcb/contour-validation";
import { computeOutlineBboxMm } from "../../pcb/outline-geometry";
import { parseDxfToEdges, type DxfParseOptions } from "./parse-dxf";

/** Endpoint-merge tolerance (mm) when chaining DXF edges into loops. */
export const DXF_CHAIN_EPSILON_MM = 0.01;

export interface DxfLoopCandidate {
  index: number;
  role: "outer" | "inner";
  /** Edge/segment count of the closed loop. */
  segmentCount: number;
  areaMm2: number;
  widthMm: number;
  heightMm: number;
  valid: boolean;
  /** Validation messages when `valid` is false. */
  errors: string[];
  /** The normalized contour for this loop (the payload a confirm would send). */
  outline: PcbBoardContour;
}

export interface DxfInspectResult {
  loops: DxfLoopCandidate[];
  layers: string[];
  unitScaleMm: number;
  detectedUnits: string;
  openChainCount: number;
  diagnostics: string[];
}

function loopToContour(loop: AssembledLoop): PcbBoardContour {
  const start = { x: loop.edges[0]!.from.x, y: loop.edges[0]!.from.y };
  const segments: PcbOutlineSegment[] = loop.edges.map((e) =>
    e.arc
      ? {
          type: "arc",
          to: { x: e.to.x, y: e.to.y },
          centerMm: { x: e.arc.centerMm.x, y: e.arc.centerMm.y },
          cw: e.arc.cw,
        }
      : { type: "line", to: { x: e.to.x, y: e.to.y } },
  );
  return normalizeContour({
    kind: "contour",
    widthMm: 0,
    heightMm: 0,
    centerMm: { x: 0, y: 0 },
    start,
    segments,
  });
}

/** Full pipeline: DXF text → loop candidates. Pure; performs no writes. */
export function inspectDxf(
  dxfText: string,
  opts?: DxfParseOptions,
): DxfInspectResult {
  const parsed = parseDxfToEdges(dxfText, opts);
  const chain = chainEdgesToLoops(parsed.edges, DXF_CHAIN_EPSILON_MM);

  const areas = chain.loops.map((l) => Math.abs(loopSignedArea(l)));
  const maxArea = areas.length > 0 ? Math.max(...areas) : 0;

  const loops: DxfLoopCandidate[] = chain.loops.map((loop, i) => {
    const outline = loopToContour(loop);
    const bbox = computeOutlineBboxMm(outline);
    const result = validateContour(outline);
    return {
      index: i,
      role: areas[i] === maxArea ? "outer" : "inner",
      segmentCount: outline.segments.length,
      areaMm2: areas[i]!,
      widthMm: bbox.widthMm,
      heightMm: bbox.heightMm,
      valid: result.ok,
      errors: result.ok ? [] : result.errors.map((e) => e.message),
      outline,
    };
  });

  return {
    loops,
    layers: parsed.layers,
    unitScaleMm: parsed.unitScaleMm,
    detectedUnits: parsed.detectedUnits,
    openChainCount: chain.openChainCount,
    diagnostics: [...parsed.diagnostics, ...chain.diagnostics],
  };
}
