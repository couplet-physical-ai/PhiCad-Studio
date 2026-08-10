// Ephemeral preview of one Auto Layout candidate.
//
// Previewing must not touch canonical state: no command is dispatched, no revision moves,
// and switching candidates is a local recompute — the result envelope already contains both
// the placement and the routing operations for every candidate, so flipping between them
// never calls the cloud again.
//
// Placement ghosts reuse `buildProposedTransforms`, the same op-replay the auto-place
// preview uses (move → position, rotate → absolute cardinal, flip → toggle BOTH layer and
// mirrored, applied in operation order). Sharing it is the point: the ghost a user sees
// must be produced by the same composition rule the atomic apply will commit.

import type {
  LayoutCandidate,
  PlaceOperation,
} from "../../../../../../sdks/designer/cloud-autolayout";
import type { PcbPlacedPart } from "../../../../../../sdks/designer";
import {
  buildProposedTransforms,
  type ProposedTransform,
} from "../../usePcbPlacePreview";

/**
 * Ghost trace, structurally identical to `AutoroutePreviewTrace` in PcbScene.tsx and
 * assignable to it. Declared here rather than imported because this module is pure logic
 * compiled by the backend tsconfig (its tests run under Bun), which does not enable JSX —
 * importing a type out of a `.tsx` would drag the whole scene into that project.
 */
export interface CandidatePreviewTrace {
  pointsNm: readonly { x: number; y: number }[];
  layer: string;
  widthMm: number;
}

export interface CandidatePreviewVia {
  centerMm: { x: number; y: number };
  netId: string | null;
}

export interface AutoLayoutCandidatePreview {
  candidateId: string;
  /** Ghost poses, keyed by placement id. Empty for an input-preserved candidate. */
  placementOverrides: Map<string, ProposedTransform>;
  /** Candidate copper, in the shape the scene's existing trace-ghost layer consumes. */
  traces: CandidatePreviewTrace[];
  /**
   * Candidate vias. The scene has no via-ghost layer yet, so these are currently surfaced
   * as a count in the results UI rather than drawn — an honest gap, not a silent one.
   */
  vias: CandidatePreviewVia[];
}

export const EMPTY_PREVIEW: AutoLayoutCandidatePreview = {
  candidateId: "",
  placementOverrides: new Map(),
  traces: [],
  vias: [],
};

/**
 * Build the preview for one candidate.
 *
 * `placements` is the CURRENT board: placement ops are relative to it, and an
 * `input_preserved` candidate legitimately has no placement envelope at all — its ghost set
 * is empty and only its copper is previewed.
 */
export function buildCandidatePreview(
  candidate: LayoutCandidate,
  placements: readonly PcbPlacedPart[],
): AutoLayoutCandidatePreview {
  const placeOps = (candidate.placeEnvelope?.operations ?? []) as PlaceOperation[];
  const placementOverrides = placeOps.length
    ? buildProposedTransforms(placements, placeOps)
    : new Map<string, ProposedTransform>();

  const traces: CandidatePreviewTrace[] = [];
  const vias: CandidatePreviewVia[] = [];
  for (const op of candidate.routeEnvelope?.operations ?? []) {
    const payload = op.payload;
    if (payload.type === "pcb_add_trace") {
      traces.push({
        pointsNm: payload.pointsNm,
        layer: payload.layer,
        widthMm: payload.widthMm,
      });
    } else if (payload.type === "pcb_add_via") {
      vias.push({ centerMm: payload.centerMm, netId: payload.netId ?? null });
    } else {
      traces.push({
        pointsNm: payload.trace.pointsNm,
        layer: payload.trace.layer,
        widthMm: payload.trace.widthMm,
      });
      vias.push({
        centerMm: payload.via.centerMm,
        netId: payload.via.netId ?? null,
      });
    }
  }

  return {
    candidateId: candidate.candidateId,
    placementOverrides,
    traces,
    vias,
  };
}
