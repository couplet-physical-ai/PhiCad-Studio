import * as THREE from "three";
import type { PathsD } from "clipper2-ts";
import type {
  PcbBoardCutout,
  PcbBoardOutline,
  PcbCopperLayerId,
  PcbDesignRules,
  PcbFreeHole,
  PcbFreePad,
  PcbPlacedPart,
  PcbPointMm,
  PcbTrace,
  PcbVia,
} from "../../../sdks";
import { placementMirrorX } from "../../../sdks/designer/pcb-helpers";
import { flattenCutout, flattenOutline } from "../pcb/outline-geometry";
import { flipLayerSide } from "@openpcb/r3f-eda-canvas/scene/layer-side";
import { padAperturePath } from "@openpcb/r3f-eda-canvas/scene/pad-aperture-geometry";
import type { FootprintRenderSourcePad } from "../index";
import { collectDrills } from "../pcb/pcb-drills";
import {
  buildDiscRing,
  buildThermalSpokes,
  buildTraceMaskPolygons,
  isSameNetAsPour,
  viaCrossesLayer,
  type ClipperPolygon,
  type ClipperRing,
} from "./copper-fill-trace-geometry";
import {
  ARC_TOLERANCE_MM,
  area,
  type CopperIsland,
  difference,
  intersection,
  multiPolyToPathsD,
  offsetChamfer,
  offsetRound,
  polyToPathsD,
  removeOnlyFillet,
  splitIslands,
  union,
} from "./copper-geometry-kernel";

const ALL_COPPER_LAYERS: ReadonlySet<PcbCopperLayerId> = new Set([
  "F.Cu",
  "In1.Cu",
  "In2.Cu",
  "B.Cu",
]);

/**
 * Copper layer(s) a pad's metal actually occupies, given the placement side.
 * - `*.Cu` or drilled pad → all copper layers (through-hole).
 * - Explicit `F.Cu`/`B.Cu`/`In*.Cu` SMD pad → that layer, flipped if the
 *   placement is on B.Cu (mirrors `FootprintRenderLayer`'s render-side remap).
 * - Missing/unknown `pad.layer` → trust `placement.layer` (SMD assumption).
 */
function resolvePadCopperLayers(
  pad: FootprintRenderSourcePad,
  placement: PcbPlacedPart,
): ReadonlySet<PcbCopperLayerId> {
  if (pad.layer === "*.Cu") return ALL_COPPER_LAYERS;
  if (pad.drillDiameterMm && pad.drillDiameterMm > 0) return ALL_COPPER_LAYERS;

  if (
    pad.layer === "F.Cu" ||
    pad.layer === "B.Cu" ||
    pad.layer === "In1.Cu" ||
    pad.layer === "In2.Cu"
  ) {
    const effective: PcbCopperLayerId =
      placement.layer === "B.Cu"
        ? (flipLayerSide(pad.layer) as PcbCopperLayerId)
        : pad.layer;
    return new Set([effective]);
  }

  const fallback: PcbCopperLayerId =
    placement.layer === "B.Cu" ? "B.Cu" : "F.Cu";
  return new Set([fallback]);
}

const DEFAULT_COPPER_FILL_CLEARANCE_MM = 0.5;
const ARC_SEGMENTS = 16;
// Minimum disconnected pour-island area below which the island is pruned
// (KiCad `min_island_area`). Connected islands are always kept.
const DEFAULT_MIN_POUR_ISLAND_AREA_MM2 = 1.0;
// Minimum copper width — necks thinner than this are removed by the min-width
// open. Sourced from `designRules.minimums.traceWidthMm` at the call site.
const DEFAULT_MIN_COPPER_THICKNESS_MM = 0.2;
// Aesthetic convex-corner fillet on the pour boundary (Flux look). Clearance
// stays safe because the fillet is a remove-only (anti-extensive) open.
const DEFAULT_POUR_CORNER_RADIUS_MM = 0.4;
// Thermal-relief defaults (IPC-2221: 2–4 spokes, 0.2–0.5 mm). Applied only when
// `padConnection: "thermal"`; the default `"solid"` floods same-net pads.
const DEFAULT_THERMAL_SPOKE_WIDTH_MM = 0.4;
const DEFAULT_THERMAL_RELIEF_GAP_MM = 0.4;
const DEFAULT_THERMAL_SPOKE_COUNT = 4;
const DEFAULT_THERMAL_SPOKE_ANGLE_DEG = 45;
// Slight under-erosion so the chamfer-deflate/round-inflate min-width pass never
// quite reaches the clearance boundary before the re-clip.
const MIN_THICKNESS_EPS_MM = 0.001;
// Polygonal-offset compensation for the different-net clearance halo. The round
// offset's arc chords lie inside the ideal Minkowski offset (≤ARC_TOLERANCE_MM)
// and the obstacle discs are inscribed (≤ARC_TOLERANCE_MM), so a bare `clearance`
// offset can under-cut the true clearance by ~2× the arc error at edge midpoints.
// Over-clear by that margin so the pour never sits closer than `clearance` to
// different-net copper. Costs ~10 µm of pour at each gap edge.
const CLEARANCE_SAFETY_EPS_MM = 2 * ARC_TOLERANCE_MM;

export function resolveCopperFillClearanceMm(
  clearance: PcbDesignRules["clearance"],
): number {
  return Math.max(
    DEFAULT_COPPER_FILL_CLEARANCE_MM,
    clearance.traceToTraceMm,
    clearance.traceToPadMm,
    clearance.padToPadMm,
    clearance.traceToViaMm,
  );
}

// --- Bare copper polygon construction (mm, world coords) --------------------

function rotatePoint(point: PcbPointMm, rotationDeg: number): PcbPointMm {
  const radians = (rotationDeg * Math.PI) / 180;
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  return { x: point.x * c - point.y * s, y: point.x * s + point.y * c };
}

function addArc(
  path: THREE.Path,
  cx: number,
  cy: number,
  radiusMm: number,
  startAngle: number,
  endAngle: number,
): void {
  for (let i = 1; i <= ARC_SEGMENTS; i += 1) {
    const angle = startAngle + ((endAngle - startAngle) * i) / ARC_SEGMENTS;
    path.lineTo(
      cx + Math.cos(angle) * radiusMm,
      cy + Math.sin(angle) * radiusMm,
    );
  }
}

function roundedRectPath(
  widthMm: number,
  heightMm: number,
  radiusMm: number,
): THREE.Path {
  const path = new THREE.Path();
  if (widthMm <= 0 || heightMm <= 0) return path;
  const hw = widthMm / 2;
  const hh = heightMm / 2;
  const r = Math.max(0, Math.min(radiusMm, hw, hh));
  if (r <= 0) {
    path.moveTo(-hw, -hh);
    path.lineTo(hw, -hh);
    path.lineTo(hw, hh);
    path.lineTo(-hw, hh);
    path.closePath();
    return path;
  }
  path.moveTo(hw, hh - r);
  addArc(path, hw - r, hh - r, r, 0, Math.PI / 2);
  path.lineTo(-hw + r, hh);
  addArc(path, -hw + r, hh - r, r, Math.PI / 2, Math.PI);
  path.lineTo(-hw, -hh + r);
  addArc(path, -hw + r, -hh + r, r, Math.PI, Math.PI * 1.5);
  path.lineTo(hw - r, -hh);
  addArc(path, hw - r, -hh + r, r, Math.PI * 1.5, Math.PI * 2);
  path.closePath();
  return path;
}

/** Bare copper outline of a pad (no clearance), centred at the origin. */
function padPath(pad: FootprintRenderSourcePad): THREE.Path {
  if (
    pad.shape === "rect" ||
    pad.shape === "trapezoid" ||
    pad.shape === "custom"
  ) {
    return roundedRectPath(pad.widthMm, pad.heightMm, 0);
  }
  if (pad.shape === "roundrect") {
    const baseRadius =
      Math.min(pad.widthMm, pad.heightMm) * (pad.roundrectRatio ?? 0.25);
    return roundedRectPath(pad.widthMm, pad.heightMm, baseRadius);
  }
  return padAperturePath(pad, 0);
}

/** Bare pad copper ring in footprint-local coords (rotation + offset applied). */
function padLocalRing(pad: FootprintRenderSourcePad): ClipperPolygon | null {
  const ring = padPath(pad)
    .getPoints(0)
    .map((point): [number, number] => {
      const rotated = rotatePoint(point, pad.rotationDeg);
      return [rotated.x + pad.centerMm.x, rotated.y + pad.centerMm.y];
    });
  return ring.length >= 3 ? [ring] : null;
}

/**
 * Copper layer membership for a free-standing pad — mirrors `FreePadLayer`'s
 * render predicate so the pour's clearance obstacles match what is drawn:
 * `std` pads span F.Cu + B.Cu, everything else is single-sided on `pad.layer`.
 */
function freePadOnLayer(pad: PcbFreePad, layer: PcbCopperLayerId): boolean {
  return (
    pad.layer === layer ||
    (pad.padType === "std" && (layer === "F.Cu" || layer === "B.Cu"))
  );
}

/**
 * Bare copper ring of a free-standing pad in world (board) coords. Free pads
 * carry no placement transform — `centerMm`/`rotationDeg` are already absolute —
 * so we reuse `padLocalRing` against a synthetic source pad.
 */
function freePadCopperRing(pad: PcbFreePad): ClipperPolygon | null {
  const synthetic: FootprintRenderSourcePad = {
    id: pad.id,
    number: pad.id,
    shape: pad.shape,
    centerMm: pad.centerMm,
    widthMm: pad.widthMm,
    heightMm: pad.heightMm,
    rotationDeg: pad.rotationDeg,
    layer: pad.layer,
    ...(pad.roundrectRatio !== undefined
      ? { roundrectRatio: pad.roundrectRatio }
      : {}),
  };
  return padLocalRing(synthetic);
}

/**
 * Bake the placement transform into vertex coords: mirror X (mirrored OR B.Cu
 * side — `placementMirrorX`), rotate by the placement angle, translate. Matches
 * `FootprintRenderLayer`/`pcb-drills`, so pad copper lines up with the rendered
 * footprint and drills on the bottom side.
 */
function applyPlacementTransform(
  ring: ClipperRing,
  placement: PcbPlacedPart,
): ClipperRing {
  const radians = (placement.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const sx = placementMirrorX(placement) ? -1 : 1;
  const tx = placement.positionMm.x;
  const ty = placement.positionMm.y;
  return ring.map(([x, y]) => {
    const mx = sx * x;
    return [cos * mx - sin * y + tx, sin * mx + cos * y + ty] as [
      number,
      number,
    ];
  });
}

/** Resolved thermal-relief geometry (mm). Null ⇒ solid same-net flood. */
interface ThermalConfig {
  spokeWidthMm: number;
  gapMm: number;
  spokeCount: number;
  angleDeg: number;
}

interface BareCopper {
  /** Different-net / unknown-net bare copper on this layer (→ clearance gap). */
  diffNet: ClipperPolygon[];
  /** Same-net bare copper on this layer (pour anchors; merge into pour). */
  sameNet: ClipperPolygon[];
  /**
   * Same-net *footprint* pads, tagged with their `${placementId}|${padNumber}`
   * key, for pour-aware ratsnest connectivity (`buildCopperFillPadGroups`).
   * Pad rings only — traces/vias are already chained by the ratsnest itself.
   */
  sameNetPads: Array<{ key: string; poly: ClipperPolygon }>;
  /**
   * Thermal-relief knockouts (exact `PathsD`, no clearance halo): the relief gap
   * ring around each same-net footprint pad with the spoke bridges carved out.
   * Subtracted from the pour so it reconnects to the pad only through the spokes.
   */
  thermalKnockouts: PathsD[];
}

/** World centre of a footprint pad under its placement transform (mm). */
function padWorldCenter(
  pad: FootprintRenderSourcePad,
  placement: PcbPlacedPart,
): PcbPointMm {
  const [p] = applyPlacementTransform(
    [[pad.centerMm.x, pad.centerMm.y]],
    placement,
  );
  return { x: p![0], y: p![1] };
}

/** Max distance from `center` to any vertex of `ring` (mm). */
function ringRadius(ring: ClipperRing, center: PcbPointMm): number {
  let r = 0;
  for (const [x, y] of ring)
    r = Math.max(r, Math.hypot(x - center.x, y - center.y));
  return r;
}

/** Signed area of a ring (>0 ⇒ counter-clockwise). */
function ringSignedArea(ring: ClipperRing): number {
  let a = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const p = ring[i]!;
    const q = ring[(i + 1) % ring.length]!;
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

/** Normalize a ring to counter-clockwise (positive) winding. */
function toCcw(ring: ClipperRing): ClipperRing {
  return ringSignedArea(ring) < 0 ? [...ring].reverse() : ring;
}

/**
 * Thermal-relief knockout for one same-net pad: the relief gap (pad inflated by
 * `gap`) minus the pad copper and the spoke bridges, so subtracting it leaves a
 * gap ring crossed by `spokeCount` necks. Returns [] on any boolean failure
 * (graceful degrade → the pad floods solid, electrically safe).
 *
 * Winding MUST be normalized to CCW: `buildTraceSegmentStadium` (spokes) yields
 * clockwise rings and a mirrored (B.Cu) pad ring flips sign — mixing windings
 * under the kernel's NonZero union cancels the overlap into spurious holes, so
 * the spokes would get subtracted instead of bridging the gap.
 *
 * NOTE: thermal relief is currently DISABLED in the UI (copper fill is always
 * solid) — this path is unused. Before re-enabling, fix the spoke orientation:
 * spokes are placed at a fixed world angle, so on rotated / non-square (rect,
 * roundrect, oval) pads they point at corners and leave edge midpoints
 * unbridged. They must be aligned to the pad's own axes (perpendicular to its
 * edges, using the pad+placement rotation), not a fixed world angle.
 */
function buildThermalKnockout(
  worldRing: ClipperRing,
  center: PcbPointMm,
  thermal: ThermalConfig,
): PathsD {
  const padCcw = toCcw(worldRing);
  const padPaths = polyToPathsD([padCcw]);
  const padInflated = offsetRound(padPaths, thermal.gapMm);
  if (padInflated.length === 0) return [];
  const outerRadius =
    ringRadius(padCcw, center) + thermal.gapMm + thermal.spokeWidthMm;
  const spokes = buildThermalSpokes(
    center,
    outerRadius,
    thermal.spokeWidthMm,
    thermal.spokeCount,
    thermal.angleDeg,
  ).map((poly): ClipperPolygon => poly.map(toCcw));
  const carve = union(padPaths, multiPolyToPathsD(spokes));
  return difference(padInflated, carve);
}

/** Bare copper of every pad/trace/via/free-pad touching `layer`, by net. */
function collectBareCopper(
  layer: PcbCopperLayerId,
  placements: ReadonlyArray<PcbPlacedPart>,
  traces: ReadonlyArray<PcbTrace>,
  vias: ReadonlyArray<PcbVia>,
  pourNetId: string | null,
  padNetIds: ReadonlyMap<string, string>,
  freePads: ReadonlyArray<PcbFreePad>,
  thermal: ThermalConfig | null,
): BareCopper {
  const diffNet: ClipperPolygon[] = [];
  const sameNet: ClipperPolygon[] = [];
  const sameNetPads: Array<{ key: string; poly: ClipperPolygon }> = [];
  const thermalKnockouts: PathsD[] = [];

  for (const placement of placements) {
    const pads = placement.footprint.preview?.pads ?? [];
    for (const pad of pads) {
      if (!resolvePadCopperLayers(pad, placement).has(layer)) continue;
      const local = padLocalRing(pad);
      if (!local || !local[0]) continue;
      const ring = applyPlacementTransform(local[0], placement);
      const world: ClipperPolygon = [ring];
      const net = padNetIds.get(`${placement.id}|${pad.number}`) ?? null;
      if (isSameNetAsPour(net, pourNetId)) {
        // Same-net pad is always an anchor (island keeping) and a connectivity
        // node, whether solid or thermally relieved — the spokes still reach its
        // copper. Thermal only adds a relief-gap knockout around it.
        sameNet.push(world);
        sameNetPads.push({ key: `${placement.id}|${pad.number}`, poly: world });
        if (thermal) {
          const knockout = buildThermalKnockout(
            ring,
            padWorldCenter(pad, placement),
            thermal,
          );
          if (knockout.length > 0) thermalKnockouts.push(knockout);
        }
      } else {
        diffNet.push(world);
      }
    }
  }

  for (const trace of traces) {
    if (trace.layer !== layer) continue;
    const bucket = isSameNetAsPour(trace.netId, pourNetId) ? sameNet : diffNet;
    for (const stadium of buildTraceMaskPolygons(trace, 0))
      bucket.push(stadium);
  }

  for (const via of vias) {
    if (!viaCrossesLayer(via, layer)) continue;
    const disc: ClipperPolygon = [
      buildDiscRing(via.centerMm, via.diameterMm / 2),
    ];
    (isSameNetAsPour(via.netId, pourNetId) ? sameNet : diffNet).push(disc);
  }

  for (const pad of freePads) {
    if (!freePadOnLayer(pad, layer)) continue;
    const ring = freePadCopperRing(pad);
    if (!ring) continue;
    (isSameNetAsPour(pad.netId, pourNetId) ? sameNet : diffNet).push(ring);
  }

  return { diffNet, sameNet, sameNetPads, thermalKnockouts };
}

/** Drill apertures (real holes) as bare discs — subtracted from every layer. */
function collectApertures(
  vias: ReadonlyArray<PcbVia>,
  placements: ReadonlyArray<PcbPlacedPart>,
  freeHoles: ReadonlyArray<PcbFreeHole>,
  freePads: ReadonlyArray<PcbFreePad>,
): ClipperPolygon[] {
  return collectDrills(vias, placements, freeHoles, freePads).map((d) => [
    buildDiscRing(d.centerMm, d.radiusMm),
  ]);
}

/**
 * Non-plated holes (mechanical mounting/tooling holes + free `hole`-type pads).
 * Unlike plated vias/PTH pads — whose copper plates right to the barrel — a NPTH
 * needs a hole-to-copper clearance ring so the pour doesn't touch the bare
 * drilled edge. Returned as bare discs; the caller round-inflates them by the
 * edge clearance. (Plated apertures stay exact via `collectApertures`.)
 */
function collectNonPlatedApertures(
  freeHoles: ReadonlyArray<PcbFreeHole>,
  freePads: ReadonlyArray<PcbFreePad>,
): ClipperPolygon[] {
  const out: ClipperPolygon[] = [];
  for (const hole of freeHoles) {
    if (hole.drillMm > 0)
      out.push([buildDiscRing(hole.centerMm, hole.drillMm / 2)]);
  }
  for (const pad of freePads) {
    if (pad.padType === "hole" && pad.drillMm !== null && pad.drillMm > 0)
      out.push([buildDiscRing(pad.centerMm, pad.drillMm / 2)]);
  }
  return out;
}

// --- Board extent (pourable region) ----------------------------------------

function insetOutline(outline: PcbBoardOutline, e: number): PcbBoardOutline {
  if (e <= 0) return outline;
  switch (outline.kind) {
    case "rect":
      return {
        ...outline,
        widthMm: Math.max(0.01, outline.widthMm - e * 2),
        heightMm: Math.max(0.01, outline.heightMm - e * 2),
      };
    case "roundrect":
      return {
        ...outline,
        widthMm: Math.max(0.01, outline.widthMm - e * 2),
        heightMm: Math.max(0.01, outline.heightMm - e * 2),
        cornerRadiusMm: Math.max(0, outline.cornerRadiusMm - e),
      };
    case "circle":
      return {
        ...outline,
        widthMm: Math.max(0.01, outline.widthMm - e * 2),
        heightMm: Math.max(0.01, outline.heightMm - e * 2),
      };
    default:
      return outline;
  }
}

function ringFromPoints(points: ReadonlyArray<PcbPointMm>): ClipperRing {
  return points.map((p): [number, number] => [p.x, p.y]);
}

/**
 * Pourable board region (mm) as a flat Clipper PathsD: board outline inset by
 * the copper-to-edge clearance, minus each cutout inflated by the same edge
 * clearance, with an aesthetic convex-corner fillet. Polygon/contour outlines
 * are offset (not analytically inset) so the edge clearance is honoured for all
 * board shapes (previously skipped — Codex review).
 */
function buildExtent(
  outline: PcbBoardOutline,
  cutouts: ReadonlyArray<PcbBoardCutout>,
  edgeMm: number,
  cornerRadiusMm: number,
) {
  const parametric =
    outline.kind === "rect" ||
    outline.kind === "roundrect" ||
    outline.kind === "circle";
  // Offset-based clearances (contour inset, cutout inflation) over-shoot by the
  // chord-error compensation so the discretized boundary never under-cuts the
  // edge clearance. Analytic parametric insets are exact and use `edgeMm` as-is.
  const edgeWithEps = edgeMm > 0 ? edgeMm + CLEARANCE_SAFETY_EPS_MM : edgeMm;
  let extent: PathsD;
  if (parametric) {
    extent = polyToPathsD([
      ringFromPoints(flattenOutline(insetOutline(outline, edgeMm))),
    ]);
  } else {
    // Polygon/contour boards: honour the edge clearance with an inward offset
    // (an analytic inset isn't defined for arbitrary contours).
    const rawRing = polyToPathsD([ringFromPoints(flattenOutline(outline))]);
    extent = edgeMm > 0 ? offsetRound(rawRing, -edgeWithEps) : rawRing;
  }
  if (cutouts.length > 0) {
    const cutPolys: ClipperPolygon[] = cutouts.map((c) => [
      ringFromPoints(flattenCutout(c.shape)),
    ]);
    const cutPaths = multiPolyToPathsD(cutPolys);
    const inflated = offsetRound(cutPaths, edgeWithEps);
    // Fail closed: if the edge inflation collapsed (offset threw → []), still
    // subtract the bare cutout so copper never floods into the physical slot —
    // we only lose the edge-clearance margin, never the hole itself.
    extent = difference(extent, inflated.length > 0 ? inflated : cutPaths);
  }
  return removeOnlyFillet(extent, cornerRadiusMm);
}

export interface CopperFillPourParams {
  layer: PcbCopperLayerId;
  outline: PcbBoardOutline;
  placements: ReadonlyArray<PcbPlacedPart>;
  traces: ReadonlyArray<PcbTrace>;
  vias: ReadonlyArray<PcbVia>;
  /** Net id of the pour on this layer; same-net copper merges (no clearance). */
  pourNetId: string | null;
  /** `${placementId}|${padNumber}` → netId. Missing pads count as unknown net. */
  padNetIds: ReadonlyMap<string, string>;
  clearanceMm: number;
  copperToBoardEdgeMm: number;
  cutouts?: ReadonlyArray<PcbBoardCutout>;
  freeHoles?: ReadonlyArray<PcbFreeHole>;
  freePads?: ReadonlyArray<PcbFreePad>;
  /** Min disconnected island area to keep (mm²). Connected islands always kept. */
  minIslandAreaMm2?: number;
  /** Minimum copper width (mm) — necks below this are removed. */
  minThicknessMm?: number;
  /** Aesthetic convex-corner fillet radius (mm). */
  cornerRadiusMm?: number;
  /**
   * How same-net footprint pads connect to the pour. `"solid"` (default) floods
   * over the pad; `"thermal"` leaves a relief gap crossed by spokes (IPC-2221).
   */
  padConnection?: "solid" | "thermal";
  /** Thermal spoke width (mm). Default 0.4. Only used when `padConnection` is `"thermal"`. */
  thermalSpokeWidthMm?: number;
  /** Thermal relief gap pad→pour (mm). Default 0.4. */
  thermalReliefGapMm?: number;
  /** Number of spokes per pad. Default 4. */
  thermalSpokeCount?: number;
  /** Spoke angle of the first spoke (deg). Default 45. */
  thermalSpokeAngleDeg?: number;
  /**
   * Optional closed polygon (mm) the pour is clipped to — a user/KiCad copper
   * ZONE outline. The fillable region becomes `boardInsetExtent ∩ clipPolygon`.
   * Omitted ⇒ board-wide pour (the whole inset board).
   */
  clipPolygonMm?: ReadonlyArray<PcbPointMm>;
}

/**
 * Poured copper islands as `THREE.Shape[]` for the canvas / 3D extrude — the
 * THREE view onto the shared pour kernel (`buildCopperFillPourIslands`).
 */
export function buildCopperFillPourShapes(
  params: CopperFillPourParams,
): THREE.Shape[] {
  return buildCopperFillPourIslands(params).map((island) => island.shape);
}

/**
 * Is a trace's copper already fully covered by the filled pour islands? Used by
 * the redundant-trace cleanup: a same-net trace that lies entirely within the
 * pour is electrically redundant (the plane already provides that copper) and
 * can be deleted. Conservative — uses an area-coverage test (intersection ≥
 * 99.9% of the trace mask) so a clipper failure yields "not covered" (no
 * deletion), never a false positive.
 */
export function isTraceCoveredByPour(
  trace: PcbTrace,
  islands: ReadonlyArray<CopperIsland["paths"]>,
): boolean {
  const stadia = buildTraceMaskPolygons(trace, 0);
  if (stadia.length === 0 || islands.length === 0) return false;
  const traceMask = union(multiPolyToPathsD(stadia));
  const maskArea = area(traceMask);
  if (maskArea <= 0) return false;
  const islandUnion = union(...islands.map((p) => p as PathsD));
  if (islandUnion.length === 0) return false;
  return area(intersection(traceMask, islandUnion)) >= maskArea * 0.999;
}

export interface CopperFillIslandInfo {
  areaMm2: number;
  /** Centroid of the island outer ring (mm) — DRC marker location. */
  centerMm: PcbPointMm;
  /** True if the island touches same-net copper (pad/trace/via anchor). */
  anchored: boolean;
}

/**
 * Per-island anchoring report for DRC. An `anchored: false` island is poured
 * copper kept only by its area (≥ min island area) that touches no same-net
 * pad/trace/via — i.e. floating/dead copper, which DRC flags.
 */
export function buildCopperFillIslandReport(
  params: CopperFillPourParams,
): CopperFillIslandInfo[] {
  const { islands, bare } = computePourIslands(params);
  const anchors = union(multiPolyToPathsD(bare.sameNet));
  return islands.map((island) => {
    const outer = island.paths[0] ?? [];
    let cx = 0;
    let cy = 0;
    for (const p of outer) {
      cx += p.x;
      cy += p.y;
    }
    const n = Math.max(1, outer.length);
    return {
      areaMm2: island.areaMm2,
      centerMm: { x: cx / n, y: cy / n },
      anchored:
        anchors.length > 0 && intersection(island.paths, anchors).length > 0,
    };
  });
}

/**
 * Pour-aware connectivity: same-net footprint pads grouped by the filled island
 * that electrically joins them. Two pad keys (`${placementId}|${padNumber}`) in
 * the same returned group are connected through poured copper, so the ratsnest
 * must treat them as a single node and draw no airwire between them. Pads split
 * across separate islands land in separate groups (a clearance moat or board
 * cutout broke the copper). A pad is "on" an island when its bare copper ring
 * intersects the island — robust to the THT drill knockout at the pad centre,
 * and to thermal-relief spokes (same-net copper that reaches the pad edge).
 */
export function buildCopperFillPadGroups(
  params: CopperFillPourParams,
): string[][] {
  const { islands, bare } = computePourIslands(params);
  if (bare.sameNetPads.length === 0) return [];
  const groups: string[][] = [];
  for (const island of islands) {
    const keys: string[] = [];
    for (const pad of bare.sameNetPads) {
      if (intersection(island.paths, polyToPathsD(pad.poly)).length > 0) {
        keys.push(pad.key);
      }
    }
    if (keys.length > 0) groups.push(keys);
  }
  return groups;
}

/**
 * Pour islands as flat Clipper `PathsD` — `[outer, ...holes]` rings of `{x, y}`
 * mm — instead of `THREE.Shape`. The Gerber exporter consumes this to emit the
 * pour as positive `G36/G37` regions (outer) with clear (`%LPC%`) hole regions,
 * so the manufactured copper plane is byte-identical to what the canvas draws.
 * (Same kernel, no THREE — backend-safe.)
 */
export function buildCopperFillPourPaths(
  params: CopperFillPourParams,
): CopperIsland["paths"][] {
  return buildCopperFillPourIslands(params).map((island) => island.paths);
}

/** Poured islands only (back-compat thin wrapper over `computePourIslands`). */
function buildCopperFillPourIslands(
  params: CopperFillPourParams,
): CopperIsland[] {
  return computePourIslands(params).islands;
}

/**
 * The single positive-copper pour kernel (2D + 3D). Returns the poured copper
 * islands ({outer+holes paths, THREE.Shape, area}, copper up to clearance,
 * smoothed, sliver-free); `buildCopperFillPourShapes` / `buildCopperFillPourPaths`
 * are the THREE / Gerber views onto it.
 *
 * Pipeline (KiCad ZONE_FILLER-equivalent, per the Codex gpt-5.5 review):
 *   1. extent   = board inset by edge clearance − cutouts, aesthetic fillet.
 *   2. holes    = round-inflate(different-net copper, clearance) ∪ drill apertures.
 *                 (Round-inflating the OBSTACLES rounds the gap-side/concave
 *                  copper corners safely — opening only rounds convex corners.)
 *   3. raw      = extent − holes.
 *   4. min-width: chamfer-deflate by r then round-inflate by r (r=minThick/2),
 *                 then RE-CLIP `∩ raw ∩ extent − holes` so clearance is exact.
 *   5. islands  = split; keep if area ≥ min OR connected to a same-net anchor.
 * Same-net copper is never subtracted → the pour flows up to its edge.
 */
function computePourIslands(params: CopperFillPourParams): {
  islands: CopperIsland[];
  bare: BareCopper;
} {
  const edge = Math.max(0, params.copperToBoardEdgeMm);
  const clearance = Math.max(0, params.clearanceMm);
  const cornerRadius = Math.max(
    0,
    params.cornerRadiusMm ?? DEFAULT_POUR_CORNER_RADIUS_MM,
  );
  const minThickness = Math.max(
    0,
    params.minThicknessMm ?? DEFAULT_MIN_COPPER_THICKNESS_MM,
  );
  const minIslandArea = Math.max(
    0,
    params.minIslandAreaMm2 ?? DEFAULT_MIN_POUR_ISLAND_AREA_MM2,
  );
  const thermal: ThermalConfig | null =
    params.padConnection === "thermal"
      ? {
          // Spokes must be ≥ the min-copper-width floor, else the min-width open
          // below would erase them and electrically isolate the pad from the pour.
          spokeWidthMm: Math.max(
            minThickness,
            params.thermalSpokeWidthMm ?? DEFAULT_THERMAL_SPOKE_WIDTH_MM,
          ),
          gapMm: Math.max(
            0,
            params.thermalReliefGapMm ?? DEFAULT_THERMAL_RELIEF_GAP_MM,
          ),
          spokeCount: Math.max(
            1,
            params.thermalSpokeCount ?? DEFAULT_THERMAL_SPOKE_COUNT,
          ),
          angleDeg:
            params.thermalSpokeAngleDeg ?? DEFAULT_THERMAL_SPOKE_ANGLE_DEG,
        }
      : null;

  // Bare copper first so every early return can carry the same-net pad set
  // (consumed by `buildCopperFillPadGroups` for pour-aware connectivity, which
  // must still attribute pads even when the fill itself collapses to empty).
  const freePads = params.freePads ?? [];
  const bare = collectBareCopper(
    params.layer,
    params.placements,
    params.traces,
    params.vias,
    params.pourNetId,
    params.padNetIds,
    freePads,
    thermal,
  );

  let extent = buildExtent(
    params.outline,
    params.cutouts ?? [],
    edge,
    cornerRadius,
  );
  // Clip the pour to a zone polygon when one is given (custom/imported copper
  // zone). The board-edge inset still applies via `buildExtent`, so the zone is
  // additionally bounded by the board.
  if (params.clipPolygonMm && params.clipPolygonMm.length >= 3) {
    extent = intersection(
      extent,
      polyToPathsD([ringFromPoints(params.clipPolygonMm)]),
    );
  }
  if (extent.length === 0) return { islands: [], bare };

  const freeHoles = params.freeHoles ?? [];
  const apertures = collectApertures(
    params.vias,
    params.placements,
    freeHoles,
    freePads,
  );

  // Fail CLOSED, not open. The kernel returns [] on any internal throw; for the
  // *obstacle* set [] means "no clearance hole", so a silent collapse here would
  // let the pour flood different-net copper un-clearanced (a DRC short). If there
  // WAS different-net copper but its union/offset vanished, bail to empty copper.
  const diffNetPaths = multiPolyToPathsD(bare.diffNet);
  const mergedDiffNet = union(diffNetPaths);
  if (diffNetPaths.length > 0 && mergedDiffNet.length === 0)
    return { islands: [], bare };
  // Over-clear by the polygonal-offset compensation so the discretized halo
  // never under-cuts the true `clearance` at edge midpoints.
  const diffNetHalo = offsetRound(
    mergedDiffNet,
    clearance > 0 ? clearance + CLEARANCE_SAFETY_EPS_MM : 0,
  );
  if (mergedDiffNet.length > 0 && diffNetHalo.length === 0)
    return { islands: [], bare };

  // Non-plated holes get a hole-to-copper ring (edge clearance + chord-error
  // compensation). The bare hole is still subtracted via `apertures`, so a
  // collapsed inflation only loses the RING, never the hole — an intentional
  // graceful degrade (copper never floods into the slot, only touches its edge).
  const npthHalo = offsetRound(
    multiPolyToPathsD(collectNonPlatedApertures(freeHoles, freePads)),
    edge > 0 ? edge + CLEARANCE_SAFETY_EPS_MM : 0,
  );

  const aperturePaths = multiPolyToPathsD(apertures);
  // Thermal-relief gaps are exact (already include the spoke carve-outs) and
  // same-net, so they carry NO short risk — excluded from the fail-closed bail
  // below. A thermal union failure therefore degrades to a solid flood (safe),
  // never an empty pour.
  const clearanceHoles = union(
    diffNetHalo,
    aperturePaths,
    npthHalo,
    ...bare.thermalKnockouts,
  );
  // Fail closed on a TOTAL obstacle collapse: if any DIFFERENT-NET obstacle
  // existed but the whole clip set vanished (union threw), bail to empty copper
  // rather than flood. (A partial NPTH-only collapse keeps `aperturePaths`, so
  // it degrades gracefully per above — it does not reach this bail.)
  if (
    (diffNetHalo.length > 0 ||
      aperturePaths.length > 0 ||
      npthHalo.length > 0) &&
    clearanceHoles.length === 0
  )
    return { islands: [], bare };

  const raw = difference(extent, clearanceHoles);
  if (raw.length === 0) return { islands: [], bare };

  let fill = raw;
  const r = Math.max(0, minThickness / 2 - MIN_THICKNESS_EPS_MM);
  if (r > 0) {
    const core = offsetChamfer(raw, -r);
    const restored = offsetRound(core, r);
    // Re-clip: round-inflate may bulge past the chamfer-eroded raw, so clamp
    // back inside raw ∩ extent and re-subtract the holes → clearance exact.
    fill = difference(
      intersection(intersection(restored, raw), extent),
      clearanceHoles,
    );
  }
  if (fill.length === 0) return { islands: [], bare };

  const islands = splitIslands(fill);
  const anchors = union(multiPolyToPathsD(bare.sameNet));
  const kept = islands.filter(
    (island) =>
      island.areaMm2 >= minIslandArea ||
      (anchors.length > 0 && intersection(island.paths, anchors).length > 0),
  );
  return { islands: kept, bare };
}
