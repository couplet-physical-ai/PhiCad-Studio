/**
 * rbush-backed broad-phase index over committed PCB copper. Rebuilt once per
 * projection change; queried per pointer move to prefilter the inputs of the
 * brute-force snap / guide / live-DRC predicates (which stay authoritative —
 * this only shrinks their candidate sets).
 *
 * Granularity is deliberately coarse (files-<500-lines rule): one bbox per
 * trace polyline, one per placement's pad cloud, one per via. Segment-level
 * entries can come later if long traces prove to be a hot spot.
 */
import RBush from "rbush";
import type {
  PcbPlacedPart,
  PcbPointMm,
  PcbTrace,
  PcbVia,
} from "../../../../sdks";
import { placementMirrorX } from "../../../../sdks/designer/pcb-helpers";

const NM_TO_MM = 1 / 1_000_000;

interface IndexEntry<T> {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  item: T;
}

export interface PcbSpatialIndex {
  queryTraces(bbox: BboxMm): PcbTrace[];
  queryVias(bbox: BboxMm): PcbVia[];
  queryPlacements(bbox: BboxMm): PcbPlacedPart[];
}

export interface BboxMm {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Square query box around a point (cursor ± tolerance). */
export function pointQueryBox(pointMm: PcbPointMm, radiusMm: number): BboxMm {
  return {
    minX: pointMm.x - radiusMm,
    minY: pointMm.y - radiusMm,
    maxX: pointMm.x + radiusMm,
    maxY: pointMm.y + radiusMm,
  };
}

/** Bbox of a polyline in nm, inflated by half width, converted to mm. */
function traceBboxMm(trace: PcbTrace): BboxMm {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of trace.pointsNm) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const half = trace.widthMm / 2;
  return {
    minX: minX * NM_TO_MM - half,
    minY: minY * NM_TO_MM - half,
    maxX: maxX * NM_TO_MM + half,
    maxY: maxY * NM_TO_MM + half,
  };
}

/** World-space bbox of a placement's pad cloud (rotation 90°-snapped). */
function placementBboxMm(placement: PcbPlacedPart): BboxMm | null {
  const pads = placement.footprint.preview?.pads ?? [];
  if (pads.length === 0) return null;
  const r =
    (((Math.round(placement.rotationDeg / 90) * 90) % 360) + 360) % 360;
  const mirror = placementMirrorX(placement);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const pad of pads) {
    const mx = mirror ? -pad.centerMm.x : pad.centerMm.x;
    const my = pad.centerMm.y;
    let cx: number;
    let cy: number;
    switch (r) {
      case 90:
        cx = -my;
        cy = mx;
        break;
      case 180:
        cx = -mx;
        cy = -my;
        break;
      case 270:
        cx = my;
        cy = -mx;
        break;
      default:
        cx = mx;
        cy = my;
    }
    const swap = r === 90 || r === 270;
    const hw = (swap ? pad.heightMm : pad.widthMm) / 2;
    const hh = (swap ? pad.widthMm : pad.heightMm) / 2;
    const wx = placement.positionMm.x + cx;
    const wy = placement.positionMm.y + cy;
    if (wx - hw < minX) minX = wx - hw;
    if (wy - hh < minY) minY = wy - hh;
    if (wx + hw > maxX) maxX = wx + hw;
    if (wy + hh > maxY) maxY = wy + hh;
  }
  return { minX, minY, maxX, maxY };
}

export function buildPcbSpatialIndex(input: {
  placements: readonly PcbPlacedPart[];
  traces: readonly PcbTrace[];
  vias: readonly PcbVia[];
}): PcbSpatialIndex {
  const traceTree = new RBush<IndexEntry<PcbTrace>>();
  traceTree.load(
    input.traces
      .filter((t) => t.pointsNm.length > 0)
      .map((t) => ({ ...traceBboxMm(t), item: t })),
  );
  const viaTree = new RBush<IndexEntry<PcbVia>>();
  viaTree.load(
    input.vias.map((v) => {
      const half = v.diameterMm / 2;
      return {
        minX: v.centerMm.x - half,
        minY: v.centerMm.y - half,
        maxX: v.centerMm.x + half,
        maxY: v.centerMm.y + half,
        item: v,
      };
    }),
  );
  const placementTree = new RBush<IndexEntry<PcbPlacedPart>>();
  placementTree.load(
    input.placements
      .map((p) => {
        const bbox = placementBboxMm(p);
        return bbox ? { ...bbox, item: p } : null;
      })
      .filter((e): e is IndexEntry<PcbPlacedPart> => e !== null),
  );
  return {
    queryTraces: (bbox) => traceTree.search(bbox).map((e) => e.item),
    queryVias: (bbox) => viaTree.search(bbox).map((e) => e.item),
    queryPlacements: (bbox) => placementTree.search(bbox).map((e) => e.item),
  };
}
