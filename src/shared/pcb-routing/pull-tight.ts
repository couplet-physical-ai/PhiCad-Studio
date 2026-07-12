import {
  buildTracePathThroughAnchors,
  simplifyCollinearPath,
  type TracePosture,
} from "../pcb-geometry/pcb-trace-geometry";
import { pathIntersectsAny } from "./collision";
import type { ObstacleRectNm, PointNm, RouteMode } from "./types";

/**
 * Greedy line-of-sight simplification: from each kept anchor, jump to the
 * farthest later anchor whose elbow-builder hop renders collision-free.
 * Kills A* grid staircases down to a handful of anchors.
 *
 * Heuristic, not a proof: with posture "auto" the full-path render can elbow a
 * hop differently than the standalone hop validated here (posture is inferred
 * from the previous segment). Callers MUST re-validate the final full render
 * and fall back to the un-tightened path if it collides.
 */
export function pullTight(input: {
  pathNm: readonly PointNm[];
  obstacles: readonly ObstacleRectNm[];
  mode: RouteMode;
  posture: TracePosture;
}): PointNm[] {
  const anchors = simplifyCollinearPath([...input.pathNm]);
  if (anchors.length <= 2) return anchors;
  const out: PointNm[] = [anchors[0]!];
  let i = 0;
  while (i < anchors.length - 1) {
    let jumped = false;
    for (let j = anchors.length - 1; j > i + 1; j -= 1) {
      const hop = buildTracePathThroughAnchors(
        [anchors[i]!, anchors[j]!],
        input.mode,
        input.posture,
      );
      if (!pathIntersectsAny(hop, input.obstacles)) {
        out.push(anchors[j]!);
        i = j;
        jumped = true;
        break;
      }
    }
    if (!jumped) {
      out.push(anchors[i + 1]!);
      i += 1;
    }
  }
  return out;
}
