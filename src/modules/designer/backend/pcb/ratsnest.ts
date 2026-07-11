// Ratsnest = MST of pad positions per net. Edges are airwires the user must route.
// Prim's algorithm, O(N^2) — fine for hundreds of pads per net; revisit if it bites.

import type {
  PcbBoardCutout,
  PcbBoardOutline,
  PcbCopperLayerId,
  PcbDesignRules,
  PcbFreeHole,
  PcbFreePad,
  PcbNetClass,
  PcbPlacedPart,
  PcbPointMm,
  PcbTrace,
  PcbVia,
  RatsnestSegment,
} from "../../../../sdks/designer";
import type { NetPadCorrelation, PadRef } from "./net-pad-correlation";
import { GND_NAMES, resolveNetClassId } from "./net-class-resolver";
import { pointToPolylineDistance } from "../../../../shared/pcb-geometry/pcb-trace-geometry";
import {
  buildCopperFillPadGroups,
  resolveCopperFillClearanceMm,
} from "../../../../shared/rendering/copper-fill/copper-fill-geometry";

function distSq(a: PcbPointMm, b: PcbPointMm): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/** Tolerance for considering two coordinates "touching" (mm, ~1µm). */
const TOUCH_EPS_MM = 0.001;

function pointsTouch(a: PcbPointMm, b: PcbPointMm): boolean {
  return distSq(a, b) < TOUCH_EPS_MM * TOUCH_EPS_MM;
}

class UnionFind {
  private parent = new Map<string, string>();
  add(key: string): void {
    if (!this.parent.has(key)) this.parent.set(key, key);
  }
  find(key: string): string {
    let root = key;
    while (this.parent.get(root) !== root) {
      root = this.parent.get(root)!;
    }
    let cursor = key;
    while (cursor !== root) {
      const next = this.parent.get(cursor)!;
      this.parent.set(cursor, root);
      cursor = next;
    }
    return root;
  }
  union(a: string, b: string): void {
    this.add(a);
    this.add(b);
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

function padKey(pad: PadRef): string {
  return `pad:${pad.placementId}:${pad.padNumber}`;
}

/**
 * For each net, group pads into connected components via routed traces+vias on that net.
 * Returns a map from net id → array of pad-component-representatives (one PadRef per component).
 * If a net has 0 routed connections, every pad is its own component.
 */
export function groupPadsByConnectivity(
  netId: string,
  pads: PadRef[],
  traces: PcbTrace[],
  vias: PcbVia[],
  /** Pad-key groups (`${placementId}|${padNumber}`) joined by a same-net pour. */
  pourGroups?: string[][],
  opts?: {
    /**
     * Accept a trace endpoint anywhere inside the pad's copper AABB, not only
     * within 1 µm of pad center. Flag `pcb.padShapeConnectivity`.
     */
    padShapeTouch?: boolean;
  },
): PadRef[][] {
  const uf = new UnionFind();
  for (const pad of pads) uf.add(padKey(pad));

  const netTraces = traces.filter((t) => t.netId === netId);
  const netVias = vias.filter((v) => v.netId === netId);

  // Pour-aware: union all pads sharing a filled copper island. A ground/power
  // plane connects its pads exactly as a routed trace would, so the MST below
  // collapses them to one component and draws no airwire.
  if (pourGroups && pourGroups.length > 0) {
    const padById = new Map<string, PadRef>();
    for (const pad of pads) {
      padById.set(`${pad.placementId}|${pad.padNumber}`, pad);
    }
    for (const group of pourGroups) {
      let anchor: PadRef | undefined;
      for (const id of group) {
        const pad = padById.get(id);
        if (!pad) continue;
        if (!anchor) anchor = pad;
        else uf.union(padKey(anchor), padKey(pad));
      }
    }
  }

  // Union pads ↔ trace endpoints
  const padShapeTouch = opts?.padShapeTouch === true;
  for (const trace of netTraces) {
    const traceKey = `trace:${trace.id}`;
    uf.add(traceKey);
    const endpoints =
      trace.pointsNm.length >= 2
        ? [trace.pointsNm[0]!, trace.pointsNm[trace.pointsNm.length - 1]!]
        : [];
    for (const epNm of endpoints) {
      const epMm: PcbPointMm = { x: epNm.x / 1_000_000, y: epNm.y / 1_000_000 };
      for (const pad of pads) {
        if (pointsTouch(pad.worldMm, epMm)) {
          uf.union(traceKey, padKey(pad));
          continue;
        }
        // Pad-shape connectivity: an endpoint inside the pad copper connects
        // even when it misses the exact center (KiCad imports commonly end
        // traces at pad edges).
        if (padShapeTouch && pad.halfExtentsMm) {
          const inX =
            Math.abs(epMm.x - pad.worldMm.x) <=
            pad.halfExtentsMm.x + TOUCH_EPS_MM;
          const inY =
            Math.abs(epMm.y - pad.worldMm.y) <=
            pad.halfExtentsMm.y + TOUCH_EPS_MM;
          if (inX && inY) uf.union(traceKey, padKey(pad));
        }
      }
    }
  }

  // Chain traces sharing endpoints (trace ↔ trace)
  for (let i = 0; i < netTraces.length; i++) {
    const ti = netTraces[i]!;
    const tiKey = `trace:${ti.id}`;
    const tiEnds = [ti.pointsNm[0], ti.pointsNm[ti.pointsNm.length - 1]];
    for (let j = i + 1; j < netTraces.length; j++) {
      const tj = netTraces[j]!;
      const tjKey = `trace:${tj.id}`;
      const tjEnds = [tj.pointsNm[0], tj.pointsNm[tj.pointsNm.length - 1]];
      for (const a of tiEnds) {
        if (!a) continue;
        for (const b of tjEnds) {
          if (!b) continue;
          if (a.x === b.x && a.y === b.y) uf.union(tiKey, tjKey);
        }
      }
    }
  }

  // T-junctions: an endpoint landing on the INTERIOR of a same-layer sibling
  // trace connects them (the route tool's same-net-copper finish produces
  // exactly this geometry). Same layer only — cross-layer copper connects
  // through vias, never by overlap. Endpoint-to-endpoint touch above keeps
  // its historical layer-agnostic behavior.
  for (const ta of netTraces) {
    if (ta.pointsNm.length < 2) continue;
    const taEnds = [ta.pointsNm[0]!, ta.pointsNm[ta.pointsNm.length - 1]!];
    for (const tb of netTraces) {
      if (tb.id === ta.id || tb.layer !== ta.layer) continue;
      if (tb.pointsNm.length < 2) continue;
      const tbMm: PcbPointMm[] = tb.pointsNm.map((p) => ({
        x: p.x / 1_000_000,
        y: p.y / 1_000_000,
      }));
      for (const ep of taEnds) {
        const epMm: PcbPointMm = {
          x: ep.x / 1_000_000,
          y: ep.y / 1_000_000,
        };
        if (pointToPolylineDistance(epMm, tbMm).distance <= TOUCH_EPS_MM) {
          uf.union(`trace:${ta.id}`, `trace:${tb.id}`);
        }
      }
    }
  }

  // Union vias to traces whose endpoints land at the via center
  for (const via of netVias) {
    const viaKey = `via:${via.id}`;
    uf.add(viaKey);
    for (const trace of netTraces) {
      const ends = [
        trace.pointsNm[0],
        trace.pointsNm[trace.pointsNm.length - 1],
      ];
      for (const ep of ends) {
        if (!ep) continue;
        const epMm: PcbPointMm = { x: ep.x / 1_000_000, y: ep.y / 1_000_000 };
        if (pointsTouch(epMm, via.centerMm)) {
          uf.union(`trace:${trace.id}`, viaKey);
        }
      }
    }
  }

  // Group pads by component root
  const groups = new Map<string, PadRef[]>();
  for (const pad of pads) {
    const root = uf.find(padKey(pad));
    const list = groups.get(root) ?? [];
    list.push(pad);
    groups.set(root, list);
  }
  return [...groups.values()];
}

function mstForRepresentatives(
  netId: string,
  netClassId: string,
  components: PadRef[][],
): RatsnestSegment[] {
  // Pick one representative pad per component (smallest worldMm.x then y for determinism).
  const reps = components
    .map(
      (comp) =>
        [...comp].sort((a, b) =>
          a.worldMm.x === b.worldMm.x
            ? a.worldMm.y - b.worldMm.y
            : a.worldMm.x - b.worldMm.x,
        )[0]!,
    )
    .filter(Boolean);
  if (reps.length < 2) return [];

  const inTree = new Array<boolean>(reps.length).fill(false);
  const minDistSq = new Array<number>(reps.length).fill(
    Number.POSITIVE_INFINITY,
  );
  const parent = new Array<number>(reps.length).fill(-1);

  inTree[0] = true;
  for (let i = 1; i < reps.length; i++) {
    minDistSq[i] = distSq(reps[0]!.worldMm, reps[i]!.worldMm);
    parent[i] = 0;
  }

  const segments: RatsnestSegment[] = [];

  for (let added = 1; added < reps.length; added++) {
    let nextIdx = -1;
    let nextDist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < reps.length; i++) {
      if (!inTree[i] && minDistSq[i]! < nextDist) {
        nextDist = minDistSq[i]!;
        nextIdx = i;
      }
    }
    if (nextIdx === -1) break;

    inTree[nextIdx] = true;
    const parentIdx = parent[nextIdx]!;
    const a = reps[parentIdx]!;
    const b = reps[nextIdx]!;
    segments.push({
      netId,
      netClassId,
      fromMm: a.worldMm,
      toMm: b.worldMm,
      fromPlacementId: a.placementId,
      fromPadNumber: a.padNumber,
      toPlacementId: b.placementId,
      toPadNumber: b.padNumber,
    });

    for (let i = 0; i < reps.length; i++) {
      if (!inTree[i]) {
        const d = distSq(reps[nextIdx]!.worldMm, reps[i]!.worldMm);
        if (d < minDistSq[i]!) {
          minDistSq[i] = d;
          parent[i] = nextIdx;
        }
      }
    }
  }

  return segments;
}

/**
 * Inputs needed to compute filled copper-pour islands for pour-aware
 * connectivity. When present, pads tied together by a same-net pour are treated
 * as connected (no airwire), so a ground plane satisfies the net the same way a
 * routed trace would. Absent ⇒ legacy trace/via-only connectivity.
 */
export interface RatsnestFillContext {
  outline: PcbBoardOutline;
  designRules: PcbDesignRules;
  placements: ReadonlyArray<PcbPlacedPart>;
  /** `${placementId}|${padNumber}` → netId (authoritative schematic map). */
  padNetIds: ReadonlyMap<string, string>;
  cutouts?: ReadonlyArray<PcbBoardCutout>;
  freeHoles?: ReadonlyArray<PcbFreeHole>;
  freePads?: ReadonlyArray<PcbFreePad>;
  /**
   * Enabled pours: board-wide (no `clipPolygonMm`) and explicit copper zones
   * (clipped to their polygon). Each floods `netId` on `layer`.
   */
  pours: ReadonlyArray<{
    layer: PcbCopperLayerId;
    netId: string;
    clipPolygonMm?: ReadonlyArray<PcbPointMm>;
  }>;
}

export interface ComputeRatsnestContext {
  /** Schematic net id → human net name for net-class auto-assignment. */
  netNames: Map<string, string>;
  /** Net classes available on the board (drives color routing). */
  netClasses: ReadonlyArray<PcbNetClass>;
  /** Explicit per-net → net-class overrides (netId → netClassId). */
  perNetClassAssignments?: Record<string, string>;
  /** Routed traces; ratsnest hides airwires already covered by routing. */
  traces?: ReadonlyArray<PcbTrace>;
  /** Routed vias; chain trace segments across layers when computing connectivity. */
  vias?: ReadonlyArray<PcbVia>;
  /** Copper-pour inputs; when present, same-net pours satisfy connectivity. */
  fill?: RatsnestFillContext;
  /** Pad-shape (AABB) endpoint acceptance — flag `pcb.padShapeConnectivity`. */
  padShapeTouch?: boolean;
}

/**
 * For each net, compute the groups of same-net footprint pads that a copper
 * pour electrically joins (`${placementId}|${padNumber}` keys). Returns
 * `netId → padKey[][]` (one inner array per filled island). Empty when no fill
 * context is supplied. Built once per projection and reused across nets.
 */
function computePourPadGroups(
  fill: RatsnestFillContext,
  traces: ReadonlyArray<PcbTrace>,
  vias: ReadonlyArray<PcbVia>,
): Map<string, string[][]> {
  const byNet = new Map<string, string[][]>();
  const clearanceMm = resolveCopperFillClearanceMm(fill.designRules.clearance);
  for (const pour of fill.pours) {
    const groups = buildCopperFillPadGroups({
      layer: pour.layer,
      outline: fill.outline,
      placements: fill.placements,
      traces,
      vias,
      pourNetId: pour.netId,
      padNetIds: fill.padNetIds,
      clearanceMm,
      copperToBoardEdgeMm: fill.designRules.clearance.copperToBoardEdgeMm,
      cutouts: fill.cutouts ?? [],
      freeHoles: fill.freeHoles ?? [],
      freePads: fill.freePads ?? [],
      minThicknessMm: fill.designRules.minimums.traceWidthMm,
      ...(pour.clipPolygonMm ? { clipPolygonMm: pour.clipPolygonMm } : {}),
    });
    if (groups.length === 0) continue;
    const existing = byNet.get(pour.netId);
    if (existing) existing.push(...groups);
    else byNet.set(pour.netId, groups);
  }
  return byNet;
}

export function computeRatsnest(
  correlation: NetPadCorrelation,
  ctx: ComputeRatsnestContext,
): RatsnestSegment[] {
  const traces = (ctx.traces ?? []) as PcbTrace[];
  const vias = (ctx.vias ?? []) as PcbVia[];
  const pourGroupsByNet =
    ctx.fill && ctx.fill.pours.length > 0
      ? computePourPadGroups(ctx.fill, traces, vias)
      : undefined;
  const result: RatsnestSegment[] = [];
  for (const [netId, pads] of correlation.netPads) {
    const netName = ctx.netNames.get(netId) ?? "";
    // Ground nets are connected by the copper pour (ground plane) by
    // convention, so their airwires are intentionally suppressed — showing
    // a ratsnest for GND clutters the board with connections the fill
    // provides. A board-wide GND pour also collapses these geometrically, but
    // suppressing by name hides them even before a fill layer is enabled.
    if (GND_NAMES.test(netName.trim())) continue;
    const classId = resolveNetClassId(
      netName,
      ctx.netClasses,
      ctx.perNetClassAssignments,
      netId,
    );
    const components = groupPadsByConnectivity(
      netId,
      pads,
      traces,
      vias,
      pourGroupsByNet?.get(netId),
      { padShapeTouch: ctx.padShapeTouch === true },
    );
    result.push(...mstForRepresentatives(netId, classId, components));
  }
  return result;
}
