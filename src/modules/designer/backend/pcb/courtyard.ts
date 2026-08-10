// Footprint courtyard → world-space polygon for the cloud snapshot.
//
// The placer's legality oracle prefers a real courtyard over its pad-hull proxy; without
// one it inflates the pad bounding hull, which is wrong in both directions (too small for
// a connector with a mating keepout, too large for a fine-pitch IC).
//
// COURTYARD AVAILABILITY IS BIFURCATED BY PROVENANCE, and that is the whole difficulty:
//
//   * IPC-7351B-generated and drawn-editor footprints keep every layer in the placement's
//     embedded render model, so `F.CrtYd`/`B.CrtYd` graphics are right there.
//   * The KiCad importer whitelists SilkS + Fab and DROPS CrtYd before persistence, so an
//     imported placement's render model has no courtyard at all. The full parsed footprint
//     does survive in `library_footprints.data_json.raw`, which is why this module accepts
//     an optional raw-footprint lookup: same board, two different retrieval paths.
//
// CONVEX HULL, deliberately. Courtyard geometry arrives as loose graphics (lines, rects,
// arcs, polylines) that would have to be stitched into a ring — fragile, and pointless
// here: the place engine convexifies the polygon for its integer-SAT overlap test anyway
// (`app/place` convex-SAT courtyards). Hulling the courtyard POINTS is therefore lossless
// with respect to what the consumer computes, and it cannot produce a self-intersecting or
// unclosed ring. A concave courtyard is over-approximated by exactly the amount the engine
// would have over-approximated it itself.
//
// Never synthesize a courtyard. No courtyard data ⇒ emit nothing ⇒ the service falls back
// to its pad-derived proxy, which is an honest answer.

import type { PcbPlacedPart, PcbPointMm } from "../../../../sdks/designer";
import { placementMirrorX, transformPadCenterMm } from "../../../../shared/pcb-geometry/pad-geometry";

/** Minimum vertices for a polygon the service will accept. */
const MIN_RING_POINTS = 3;
/** Arc/circle flattening resolution — enough that the hull is not visibly polygonal. */
const CIRCLE_SEGMENTS = 16;

type PreviewGraphicLike = {
  kind: string;
  layer?: string;
  [key: string]: unknown;
};

export interface RawFootprintLookup {
  /** `library_footprints.data_json` for a footprint id, or null when unavailable. */
  (footprintId: string): Record<string, unknown> | null | undefined;
}

function isCourtyardLayer(layer: unknown): boolean {
  return layer === "F.CrtYd" || layer === "B.CrtYd";
}

function pushPoint(out: PcbPointMm[], x: unknown, y: unknown): void {
  if (typeof x === "number" && typeof y === "number" && Number.isFinite(x) && Number.isFinite(y)) {
    out.push({ x, y });
  }
}

function pushCircle(out: PcbPointMm[], cx: number, cy: number, r: number): void {
  if (!Number.isFinite(r) || r <= 0) return;
  for (let i = 0; i < CIRCLE_SEGMENTS; i += 1) {
    const t = (2 * Math.PI * i) / CIRCLE_SEGMENTS;
    out.push({ x: cx + r * Math.cos(t), y: cy + r * Math.sin(t) });
  }
}

/** Footprint-local points contributed by one render-model graphic. */
function previewGraphicPoints(graphic: PreviewGraphicLike, out: PcbPointMm[]): void {
  const g = graphic as Record<string, any>;
  switch (graphic.kind) {
    case "line":
      pushPoint(out, g.a?.x, g.a?.y);
      pushPoint(out, g.b?.x, g.b?.y);
      return;
    case "rect": {
      const { x, y, width, height } = g;
      if ([x, y, width, height].every((v) => typeof v === "number")) {
        pushPoint(out, x, y);
        pushPoint(out, x + width, y);
        pushPoint(out, x + width, y + height);
        pushPoint(out, x, y + height);
      }
      return;
    }
    case "circle":
      if (typeof g.center?.x === "number" && typeof g.center?.y === "number") {
        pushCircle(out, g.center.x, g.center.y, g.radiusMm);
      }
      return;
    case "arc3":
      // Hull of the three defining points: the bulge beyond them is bounded by the
      // chord/mid triangle, and the consumer convexifies regardless.
      for (const key of ["start", "mid", "end"]) {
        pushPoint(out, g[key]?.x, g[key]?.y);
      }
      return;
    case "polyline":
    case "bezier":
      if (Array.isArray(g.points)) {
        for (const p of g.points) pushPoint(out, p?.x, p?.y);
      }
      return;
    default:
      return;
  }
}

/** Footprint-local points contributed by one RAW (KiCad-parsed) graphic. */
function rawGraphicPoints(graphic: Record<string, any>, out: PcbPointMm[]): void {
  const data = (graphic.data ?? {}) as Record<string, any>;
  switch (graphic.type) {
    case "line":
      pushPoint(out, data.start?.x, data.start?.y);
      pushPoint(out, data.end?.x, data.end?.y);
      return;
    case "rect":
      if (data.start && data.end) {
        pushPoint(out, data.start.x, data.start.y);
        pushPoint(out, data.end.x, data.start.y);
        pushPoint(out, data.end.x, data.end.y);
        pushPoint(out, data.start.x, data.end.y);
      }
      return;
    case "circle":
      if (data.center && data.end) {
        const r = Math.hypot(data.end.x - data.center.x, data.end.y - data.center.y);
        pushCircle(out, data.center.x, data.center.y, r);
      }
      return;
    case "arc":
      for (const key of ["start", "mid", "end"]) {
        pushPoint(out, data[key]?.x, data[key]?.y);
      }
      return;
    case "poly":
      if (Array.isArray(data.points)) {
        for (const p of data.points) pushPoint(out, p?.x, p?.y);
      }
      return;
    default:
      return;
  }
}

/** Andrew's monotone chain. Returns CCW hull, or [] when fewer than 3 distinct points. */
export function convexHull(points: readonly PcbPointMm[]): PcbPointMm[] {
  const pts = [...points].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  const deduped: PcbPointMm[] = [];
  for (const p of pts) {
    const last = deduped[deduped.length - 1];
    if (!last || last.x !== p.x || last.y !== p.y) deduped.push(p);
  }
  if (deduped.length < MIN_RING_POINTS) return [];

  const cross = (o: PcbPointMm, a: PcbPointMm, b: PcbPointMm): number =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  const build = (source: PcbPointMm[]): PcbPointMm[] => {
    const chain: PcbPointMm[] = [];
    for (const p of source) {
      while (chain.length >= 2 && cross(chain[chain.length - 2]!, chain[chain.length - 1]!, p) <= 0) {
        chain.pop();
      }
      chain.push(p);
    }
    chain.pop(); // shared endpoint with the other chain
    return chain;
  };

  const hull = [...build(deduped), ...build([...deduped].reverse())];
  return hull.length >= MIN_RING_POINTS ? hull : [];
}

/** Footprint-local courtyard points from the placement's embedded render model. */
function localPointsFromPreview(placement: PcbPlacedPart): PcbPointMm[] {
  const graphics = placement.footprint?.preview?.graphics as
    | readonly PreviewGraphicLike[]
    | undefined;
  if (!graphics) return [];
  const out: PcbPointMm[] = [];
  for (const g of graphics) {
    if (isCourtyardLayer(g.layer)) previewGraphicPoints(g, out);
  }
  return out;
}

/** Footprint-local courtyard points from the stored raw KiCad footprint. */
function localPointsFromRaw(data: Record<string, unknown> | null | undefined): PcbPointMm[] {
  const raw = (data as any)?.raw;
  const graphics = raw?.graphics;
  if (!Array.isArray(graphics)) return [];
  const out: PcbPointMm[] = [];
  for (const g of graphics) {
    if (g && isCourtyardLayer(g.layer)) rawGraphicPoints(g, out);
  }
  return out;
}

/**
 * World-space courtyard polygon for a placement, or `null` when the footprint carries no
 * courtyard geometry on either path.
 *
 * `lookupRaw` is optional: pass it to recover courtyards for KiCad-imported footprints
 * (whose render model has none), omit it for a pure projection-only build.
 */
export function placementCourtyardWorldMm(
  placement: PcbPlacedPart,
  lookupRaw?: RawFootprintLookup,
): PcbPointMm[] | null {
  let local = localPointsFromPreview(placement);
  if (local.length === 0 && lookupRaw) {
    const footprintId = placement.footprint?.footprintId;
    if (footprintId) local = localPointsFromRaw(lookupRaw(footprintId));
  }
  if (local.length < MIN_RING_POINTS) return null;

  // Same transform the pads use — and the same one the service pins in app/place/model.py:
  // world = pos + R_ccw(rotationDeg)·(s·local.x, local.y), s = -1 iff mirrored || B.Cu.
  const mirrored = placementMirrorX(placement);
  const world = local.map((p) => {
    const t = transformPadCenterMm(p, placement.rotationDeg, mirrored);
    return { x: placement.positionMm.x + t.x, y: placement.positionMm.y + t.y };
  });

  // Hull AFTER transforming: mirroring reverses winding, so hulling first would emit a
  // clockwise ring for back-side parts.
  const hull = convexHull(world);
  return hull.length >= MIN_RING_POINTS ? hull : null;
}
