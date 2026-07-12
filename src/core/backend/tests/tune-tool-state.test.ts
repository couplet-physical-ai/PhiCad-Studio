import { describe, expect, test } from "bun:test";
import {
  initialTuneToolState,
  tuneToolReducer,
  TUNE_DEFAULT_AMPLITUDE_NM,
  TUNE_DEFAULT_SPACING_NM,
  type TuneToolState,
} from "../../../modules/designer/frontend/pcb/tools/tune-tool-state";
import {
  buildTuneHudModel,
  TUNE_OVERRIDE_TOLERANCE_MM,
} from "../../../modules/designer/frontend/pcb/tools/tune-hud-model";

const BASELINE = [
  { x: 0, y: 0 },
  { x: 20_000_000, y: 0 },
];

function started(): TuneToolState {
  return tuneToolReducer(initialTuneToolState, {
    kind: "start",
    traceId: "t1",
    baselinePointsNm: BASELINE,
    spanStartNm: 2_000_000,
  });
}

function session(state: TuneToolState) {
  if (state.kind !== "tuning") throw new Error("expected tuning");
  return state.session;
}

describe("tuneToolReducer", () => {
  test("start seeds a sweeping session with defaults", () => {
    const s = session(started());
    expect(s.traceId).toBe("t1");
    expect(s.spanStartNm).toBe(2_000_000);
    expect(s.spanEndNm).toBe(2_000_000);
    expect(s.sweeping).toBe(true);
    expect(s.amplitudeNm).toBe(TUNE_DEFAULT_AMPLITUDE_NM);
    expect(s.spacingNm).toBe(TUNE_DEFAULT_SPACING_NM);
  });

  test("sweep moves the span end only while sweeping", () => {
    const a = started();
    const b = tuneToolReducer(a, { kind: "sweep", spanEndNm: 15_000_000 });
    expect(session(b).spanEndNm).toBe(15_000_000);
    const frozen = tuneToolReducer(b, { kind: "freeze-span" });
    expect(session(frozen).sweeping).toBe(false);
    const after = tuneToolReducer(frozen, {
      kind: "sweep",
      spanEndNm: 3_000_000,
    });
    expect(after).toBe(frozen); // ignored once frozen
  });

  test("nudges are multiplicative and clamped", () => {
    let state = started();
    state = tuneToolReducer(state, { kind: "nudge-amplitude", direction: 1 });
    expect(session(state).amplitudeNm).toBe(2_500_000);
    for (let i = 0; i < 40; i += 1) {
      state = tuneToolReducer(state, {
        kind: "nudge-amplitude",
        direction: -1,
      });
    }
    expect(session(state).amplitudeNm).toBe(200_000); // floor
    for (let i = 0; i < 60; i += 1) {
      state = tuneToolReducer(state, { kind: "nudge-spacing", direction: 1 });
    }
    expect(session(state).spacingNm).toBe(10_000_000); // ceiling
  });

  test("target override sets, rejects nonsense, clears", () => {
    let state = started();
    state = tuneToolReducer(state, {
      kind: "set-target-override",
      targetMm: 25,
    });
    expect(session(state).targetOverrideMm).toBe(25);
    const rejected = tuneToolReducer(state, {
      kind: "set-target-override",
      targetMm: -1,
    });
    expect(rejected).toBe(state);
    state = tuneToolReducer(state, {
      kind: "set-target-override",
      targetMm: undefined,
    });
    expect(session(state).targetOverrideMm).toBeUndefined();
  });

  test("cancel returns to idle; non-start events on idle are inert", () => {
    expect(tuneToolReducer(started(), { kind: "cancel" })).toEqual(
      initialTuneToolState,
    );
    expect(
      tuneToolReducer(initialTuneToolState, { kind: "freeze-span" }),
    ).toEqual(initialTuneToolState);
  });
});

describe("buildTuneHudModel", () => {
  const base = {
    session: session(started()),
    netName: "DQ0",
    netOtherMm: 3,
    baselineMm: 20,
    proposalExtraMm: 4,
    meanderStatus: "ok" as const,
  };

  test("override wins over group; band uses the resolved tolerance", () => {
    const withOverride = buildTuneHudModel({
      ...base,
      session: { ...base.session, targetOverrideMm: 27 },
      group: { name: "DDR", targetMm: 40, toleranceMm: 1 },
    });
    expect(withOverride.targetSource).toBe("override");
    expect(withOverride.targetMm).toBe(27);
    expect(withOverride.currentMm).toBe(27); // 3 + 20 + 4
    expect(withOverride.band).toBe("ok");
    expect(withOverride.toleranceMm).toBe(1); // group tolerance still applies
  });

  test("group target with no override; short/long bands", () => {
    const short = buildTuneHudModel({
      ...base,
      group: { name: "DDR", targetMm: 40, toleranceMm: 1 },
    });
    expect(short.targetSource).toBe("group");
    expect(short.band).toBe("short"); // 27 vs 40
    const long = buildTuneHudModel({
      ...base,
      proposalExtraMm: 20,
      group: { name: "DDR", targetMm: 40, toleranceMm: 1 },
    });
    expect(long.band).toBe("long"); // 43 vs 40 ± 1
  });

  test("override without a group falls back to the default tolerance", () => {
    const model = buildTuneHudModel({
      ...base,
      session: { ...base.session, targetOverrideMm: 27.3 },
      group: null,
    });
    expect(model.toleranceMm).toBe(TUNE_OVERRIDE_TOLERANCE_MM);
    expect(model.band).toBe("ok"); // |27 − 27.3| ≤ 0.5
  });

  test("no target at all yields a bare gauge", () => {
    const model = buildTuneHudModel({ ...base, group: null });
    expect(model.targetSource).toBe("none");
    expect(model.targetMm).toBeNull();
    expect(model.band).toBeNull();
    expect(model.currentMm).toBe(27);
  });
});
