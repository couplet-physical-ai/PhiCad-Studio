/**
 * Arc-preserving, multi-loop edge assembler. Takes an unordered soup of
 * directed-or-not edges (lines + circular arcs) — as produced by a DXF / SVG
 * importer — and chains them into closed loops by endpoint adjacency, keeping
 * arc segments intact (reversing an edge flips its arc winding). Reports every
 * loop plus diagnostics for gaps, branches, and leftover open chains, so the
 * caller can require explicit selection rather than silently guessing.
 *
 * Unlike KiCad's `computeBoardOutlinePolygon` this (a) does not tessellate arcs,
 * (b) returns *all* loops (outer + inner), and (c) surfaces ambiguity.
 */
import type { PcbPointMm } from "../../../sdks";

export interface EdgeArc {
  centerMm: PcbPointMm;
  /** Clockwise from the edge's `from` to its `to`. */
  cw: boolean;
}

/** One import edge. `arc` present ⇒ a circular arc, else a straight segment. */
export interface EdgeSeg {
  from: PcbPointMm;
  to: PcbPointMm;
  arc?: EdgeArc;
}

export interface AssembledLoop {
  /** Directed, ordered edges; the last edge's `to` ≈ the first edge's `from`. */
  edges: EdgeSeg[];
}

export interface ChainResult {
  loops: AssembledLoop[];
  /** Chains that never closed (dangling / gapped geometry). */
  openChainCount: number;
  diagnostics: string[];
}

interface InternalEdge {
  aRep: number;
  bRep: number;
  arc?: EdgeArc;
}

function distance(a: PcbPointMm, b: PcbPointMm): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Chain `edges` into closed loops. `epsilonMm` is the endpoint-merge tolerance —
 * points within it are treated as the same vertex (and snapped to a shared
 * representative so consecutive edges join exactly).
 */
export function chainEdgesToLoops(
  edges: readonly EdgeSeg[],
  epsilonMm: number,
): ChainResult {
  const diagnostics: string[] = [];
  const reps: PcbPointMm[] = [];

  // Endpoint clustering via a spatial grid (cell = epsilon): a point within
  // `epsilonMm` of an existing representative can only fall in the same or an
  // adjacent cell, so scanning the 3×3 neighbourhood is O(1) amortised — the
  // whole clustering is O(n), not O(n²).
  const cell = Math.max(epsilonMm, 1e-9);
  const buckets = new Map<string, number[]>();
  const key = (cx: number, cy: number): string => `${cx}:${cy}`;
  const repIndex = (p: PcbPointMm): number => {
    const cx = Math.round(p.x / cell);
    const cy = Math.round(p.y / cell);
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        const list = buckets.get(key(cx + dx, cy + dy));
        if (list) {
          for (const i of list) {
            if (distance(reps[i]!, p) <= epsilonMm) return i;
          }
        }
      }
    }
    const idx = reps.length;
    reps.push({ x: p.x, y: p.y });
    const k = key(cx, cy);
    const list = buckets.get(k);
    if (list) list.push(idx);
    else buckets.set(k, [idx]);
    return idx;
  };

  const internal: InternalEdge[] = [];
  for (const e of edges) {
    const aRep = repIndex(e.from);
    const bRep = repIndex(e.to);
    if (aRep === bRep) {
      diagnostics.push("dropped a zero-length edge");
      continue; // degenerate; a full circle must arrive pre-split into 2 arcs
    }
    internal.push({ aRep, bRep, ...(e.arc ? { arc: e.arc } : {}) });
  }

  // Incidence: rep index → edges touching it.
  const incidence: number[][] = reps.map(() => []);
  internal.forEach((e, i) => {
    incidence[e.aRep]!.push(i);
    incidence[e.bRep]!.push(i);
  });

  const used = new Array<boolean>(internal.length).fill(false);

  const orient = (edgeIdx: number, fromRep: number): { toRep: number; seg: EdgeSeg } => {
    const e = internal[edgeIdx]!;
    if (e.aRep === fromRep) {
      return {
        toRep: e.bRep,
        seg: {
          from: { ...reps[e.aRep]! },
          to: { ...reps[e.bRep]! },
          ...(e.arc ? { arc: e.arc } : {}),
        },
      };
    }
    // Reversed traversal — flip the arc winding.
    return {
      toRep: e.aRep,
      seg: {
        from: { ...reps[e.bRep]! },
        to: { ...reps[e.aRep]! },
        ...(e.arc ? { arc: { centerMm: e.arc.centerMm, cw: !e.arc.cw } } : {}),
      },
    };
  };

  const loops: AssembledLoop[] = [];
  let openChainCount = 0;

  for (let seed = 0; seed < internal.length; seed += 1) {
    if (used[seed]) continue;
    const loopStart = internal[seed]!.aRep;
    used[seed] = true;
    const first = orient(seed, loopStart);
    const loopEdges: EdgeSeg[] = [first.seg];
    let current = first.toRep;

    while (current !== loopStart) {
      const candidates = incidence[current]!.filter((i) => !used[i]);
      if (candidates.length === 0) {
        openChainCount += 1;
        diagnostics.push(
          `open chain: no edge continues from (${reps[current]!.x.toFixed(2)}, ${reps[current]!.y.toFixed(2)})`,
        );
        break;
      }
      if (candidates.length > 1) {
        diagnostics.push(
          `branch at (${reps[current]!.x.toFixed(2)}, ${reps[current]!.y.toFixed(2)}) — took the first edge`,
        );
      }
      const pick = candidates[0]!;
      used[pick] = true;
      const step = orient(pick, current);
      loopEdges.push(step.seg);
      current = step.toRep;
    }

    if (current === loopStart) {
      loops.push({ edges: loopEdges });
    }
  }

  return { loops, openChainCount, diagnostics };
}

/** Signed area (shoelace) of a loop, using edge endpoints (arcs as chords). */
export function loopSignedArea(loop: AssembledLoop): number {
  let a = 0;
  for (const e of loop.edges) {
    a += e.from.x * e.to.y - e.to.x * e.from.y;
  }
  return a / 2;
}
