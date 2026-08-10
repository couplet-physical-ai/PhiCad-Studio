// Auto Layout run state + candidate preview — pure frontend logic, run under Bun with the
// backend suite per the repo convention.
//
// The properties worth pinning: preview never mutates, candidate switching is local, an
// apply failure returns to review rather than a dead end, and progress is deterministic
// work rather than anything time-shaped.
import { describe, expect, test } from "bun:test";

import { AutoLayoutClientError } from "../../../modules/designer/frontend/pcb/autolayout/api";
import { buildCandidatePreview } from "../../../modules/designer/frontend/pcb/autolayout/preview/build-candidate-preview";
import {
  INITIAL_STATE,
  autoLayoutReducer,
  foldProgressFrame,
} from "../../../modules/designer/frontend/pcb/autolayout/state/reducer";
import {
  EMPTY_PROGRESS,
  selectedCandidate,
  type AutoLayoutRunState,
} from "../../../modules/designer/frontend/pcb/autolayout/state/types";
import type {
  LayoutCandidate,
  LayoutResultEnvelope,
} from "../../../sdks/designer/cloud-autolayout";
import type { PcbPlacedPart } from "../../../sdks/designer";

const RUN = {
  jobId: "job_1",
  snapshotDigest: "digest",
  baseRevision: 4,
  warnings: [],
};

function candidate(overrides: Partial<LayoutCandidate> = {}): LayoutCandidate {
  return {
    candidateId: "cand_1",
    kind: "default_placer",
    rank: 0,
    recommended: true,
    scorecard: { objectiveKey: [] },
    explanation: "",
    ...overrides,
  } as LayoutCandidate;
}

function result(candidates: LayoutCandidate[]): LayoutResultEnvelope {
  return {
    kind: "designer_pcb_autolayout",
    envelopeId: "env",
    snapshotHash: "h",
    engineVersions: {},
    objectiveVersion: "layout-1",
    recommendedCandidateId: candidates[0]?.candidateId ?? "",
    candidates,
    warnings: [],
    determinism: {},
    manifest: {},
  } as unknown as LayoutResultEnvelope;
}

function reduceAll(
  actions: Parameters<typeof autoLayoutReducer>[1][],
  from: AutoLayoutRunState = INITIAL_STATE,
): AutoLayoutRunState {
  return actions.reduce(autoLayoutReducer, from);
}

describe("progress frames", () => {
  test("progress is work-based, never time-based", () => {
    const progress = foldProgressFrame(EMPTY_PROGRESS, {
      type: "layout.progress",
      data: { workConsumed: 250, workTotal: 1000 },
    });
    expect(progress.fraction).toBe(0.25);
  });

  test("candidate frames track per-candidate stage and completion", () => {
    let progress = foldProgressFrame(EMPTY_PROGRESS, {
      type: "layout.candidate.started",
      data: { candidateId: "c1", index: 0, candidates: 5 },
    });
    progress = foldProgressFrame(progress, {
      type: "layout.candidate.stage",
      data: { candidateId: "c1", stage: "route" },
    });
    expect(progress.candidatesTotal).toBe(5);
    expect(progress.candidates[0]!.stage).toBe("route");

    progress = foldProgressFrame(progress, {
      type: "layout.candidate.finished",
      data: { candidateId: "c1" },
    });
    expect(progress.candidatesFinished).toBe(1);
  });

  test("an unknown frame type is ignored, never fatal", () => {
    // The engine emits frames the contract does not declare yet (portfolio variants);
    // a progress tick must never be able to fail a run.
    const progress = foldProgressFrame(EMPTY_PROGRESS, {
      type: "route.variant.started",
      data: { index: 2 },
    });
    expect(progress.fraction).toBeNull();
    expect(progress.candidates).toHaveLength(0);
  });
});

describe("run reducer", () => {
  test("a result selects the RECOMMENDED candidate and applies nothing", () => {
    const state = reduceAll([
      { type: "submit" },
      { type: "submitted", run: RUN },
      {
        type: "result",
        result: result([
          candidate({ candidateId: "a", rank: 1, recommended: false }),
          candidate({ candidateId: "b", rank: 0, recommended: true }),
        ]),
      },
    ]);
    expect(state.type).toBe("review");
    if (state.type !== "review") return;
    // recommendedCandidateId comes from the first entry of the array above ("a"), so use
    // the envelope's own field rather than array order.
    expect(state.selectedCandidateId).toBe("a");
  });

  test("switching candidates is local — no new run, no dispatch", () => {
    const reviewed = reduceAll([
      { type: "submitted", run: RUN },
      { type: "result", result: result([candidate({ candidateId: "a" }), candidate({ candidateId: "b" })]) },
      { type: "selectCandidate", candidateId: "b" },
    ]);
    expect(reviewed.type).toBe("review");
    if (reviewed.type !== "review") return;
    expect(reviewed.selectedCandidateId).toBe("b");
    expect(reviewed.run.jobId).toBe(RUN.jobId);
    expect(selectedCandidate(reviewed)?.candidateId).toBe("b");
  });

  test("a stale board keeps the result inspectable", () => {
    const state = reduceAll([
      { type: "submitted", run: RUN },
      { type: "result", result: result([candidate()]) },
      { type: "markStale" },
    ]);
    expect(state.type).toBe("review");
    if (state.type !== "review") return;
    expect(state.stale).toBe(true);
    // still selectable/previewable — only Apply is withheld (enforced in the dialog)
    expect(state.selectedCandidateId).toBe("cand_1");
  });

  test("an apply failure returns to review, not to a dead end", () => {
    const state = reduceAll([
      { type: "submitted", run: RUN },
      { type: "result", result: result([candidate({ candidateId: "a" }), candidate({ candidateId: "b" })]) },
      { type: "applyStarted" },
      {
        type: "failed",
        error: new AutoLayoutClientError("AUTO_LAYOUT_OPERATION_INVALID", "nope"),
      },
    ]);
    expect(state.type).toBe("review");
    if (state.type !== "review") return;
    expect(state.stale).toBe(false); // a rejected op is not a stale board
    expect(state.result.candidates).toHaveLength(2); // user can pick another candidate
  });

  test("a stale apply failure marks the result stale on the way back", () => {
    const state = reduceAll([
      { type: "submitted", run: RUN },
      { type: "result", result: result([candidate()]) },
      { type: "applyStarted" },
      {
        type: "failed",
        error: new AutoLayoutClientError("AUTO_LAYOUT_STALE", "changed"),
      },
    ]);
    expect(state.type === "review" && state.stale).toBe(true);
  });

  test("cancellation is cooperative — requesting it does not end the run", () => {
    const requested = reduceAll([
      { type: "submitted", run: RUN },
      { type: "cancelRequested" },
    ]);
    expect(requested.type).toBe("running");
    if (requested.type !== "running") return;
    expect(requested.cancelling).toBe(true);

    // a cancelled job that still produced a partial result goes to review
    const withResult = autoLayoutReducer(requested, {
      type: "result",
      result: result([candidate()]),
    });
    expect(withResult.type).toBe("review");
  });

  test("apply success reports DRC without treating it as a gate", () => {
    const state = reduceAll([
      { type: "submitted", run: RUN },
      { type: "result", result: result([candidate()]) },
      { type: "applyStarted" },
      {
        type: "applied",
        candidateId: "cand_1",
        revision: 9,
        drcErrors: 2,
        drcWarnings: 1,
        warnings: [],
      },
    ]);
    expect(state.type).toBe("completed");
    if (state.type !== "completed") return;
    expect(state.revision).toBe(9);
    expect(state.drcErrors).toBe(2);
  });
});

describe("candidate preview", () => {
  const placements = [
    {
      id: "U1",
      positionMm: { x: 0, y: 0 },
      rotationDeg: 0,
      mirrored: false,
      layer: "F.Cu",
    },
  ] as unknown as PcbPlacedPart[];

  test("composes move + rotate + flip in operation order", () => {
    const preview = buildCandidatePreview(
      candidate({
        placeEnvelope: {
          operations: [
            {
              id: "1",
              kind: "pcb_move_placement",
              payload: { type: "pcb_move_placement", placementId: "U1", positionMm: { x: 5, y: 5 } },
            },
            {
              id: "2",
              kind: "pcb_rotate_placement",
              payload: { type: "pcb_rotate_placement", placementId: "U1", rotationDeg: 90 },
            },
            {
              id: "3",
              kind: "pcb_flip_placement",
              payload: { type: "pcb_flip_placement", placementId: "U1" },
            },
          ],
        },
      } as never),
      placements,
    );
    const transform = preview.placementOverrides.get("U1")!;
    expect(transform.positionMm).toEqual({ x: 5, y: 5 });
    expect(transform.rotationDeg).toBe(90);
    expect(transform.layer).toBe("B.Cu");
    expect(transform.mirrored).toBe(true);
  });

  test("copper ops become trace + via overlays", () => {
    const preview = buildCandidatePreview(
      candidate({
        routeEnvelope: {
          operations: [
            {
              id: "1",
              kind: "pcb_add_trace",
              payload: {
                type: "pcb_add_trace",
                layer: "F.Cu",
                pointsNm: [
                  { x: 0, y: 0 },
                  { x: 1000, y: 0 },
                ],
                widthMm: 0.2,
                netId: null,
                netClassId: "default",
                segmentMode: "manhattan-45",
              },
            },
            {
              id: "2",
              kind: "pcb_add_trace_via",
              payload: {
                type: "pcb_add_trace_via",
                trace: {
                  layer: "B.Cu",
                  pointsNm: [
                    { x: 0, y: 0 },
                    { x: 0, y: 500 },
                  ],
                  widthMm: 0.25,
                  netId: null,
                  netClassId: "default",
                  segmentMode: "manhattan-45",
                },
                via: { centerMm: { x: 1, y: 1 }, netId: null, netClassId: "default" },
              },
            },
          ],
        },
      } as never),
      placements,
    );
    // a trace+via op contributes BOTH — dropping either would under-preview the candidate
    expect(preview.traces).toHaveLength(2);
    expect(preview.vias).toHaveLength(1);
    expect(preview.traces[1]!.layer).toBe("B.Cu");
  });

  test("an input-preserved candidate previews copper only", () => {
    const preview = buildCandidatePreview(
      candidate({ kind: "input_preserved" }),
      placements,
    );
    expect(preview.placementOverrides.size).toBe(0);
    expect(preview.traces).toHaveLength(0);
  });
});
