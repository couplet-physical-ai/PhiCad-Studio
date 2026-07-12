import { describe, expect, test } from "bun:test";
import {
  bundleAnchorNm,
  bundleToolReducer,
  initialBundleToolState,
  type BundlePad,
  type BundleToolState,
} from "../../../modules/designer/frontend/pcb/tools/bundle-tool-state";

const MM = 1_000_000;

function pad(id: string, x: number, y: number, netId = `net-${id}`): BundlePad {
  return {
    padId: id,
    netId,
    netName: netId.toUpperCase(),
    centerNm: { x: x * MM, y: y * MM },
  };
}

const TOGGLE_DEFAULTS = {
  layer: "F.Cu",
  segmentMode: "manhattan-45",
  widthMm: 0.25,
  netClassId: "default",
  pitchNm: 500_000,
} as const;

function toggle(state: BundleToolState, p: BundlePad): BundleToolState {
  return bundleToolReducer(state, {
    kind: "toggle-pad",
    pad: p,
    ...TOGGLE_DEFAULTS,
  });
}

function session(state: BundleToolState) {
  if (state.kind !== "bundling") throw new Error("expected bundling");
  return state.session;
}

describe("bundleToolReducer", () => {
  test("first pad starts the session with the carried defaults", () => {
    const s = session(toggle(initialBundleToolState, pad("u1|1", 0, 0)));
    expect(s.pads.map((p) => p.padId)).toEqual(["u1|1"]);
    expect(s.layer).toBe("F.Cu");
    expect(s.pitchNm).toBe(500_000);
    expect(s.waypointsNm).toEqual([]);
  });

  test("toggling collects, re-toggling removes, empty returns to idle", () => {
    let state = toggle(initialBundleToolState, pad("a", 0, 0));
    state = toggle(state, pad("b", 0, 1));
    expect(session(state).pads).toHaveLength(2);
    state = toggle(state, pad("a", 0, 0));
    expect(session(state).pads.map((p) => p.padId)).toEqual(["b"]);
    state = toggle(state, pad("b", 0, 1));
    expect(state).toEqual(initialBundleToolState);
  });

  test("waypoints need ≥2 pads and lock the collection", () => {
    let state = toggle(initialBundleToolState, pad("a", 0, 0));
    const rejected = bundleToolReducer(state, {
      kind: "commit-waypoint",
      pointNm: { x: 5 * MM, y: 0 },
    });
    expect(rejected).toBe(state); // single pad can't route
    state = toggle(state, pad("b", 0, 1));
    state = bundleToolReducer(state, {
      kind: "commit-waypoint",
      pointNm: { x: 5 * MM, y: 0 },
    });
    expect(session(state).waypointsNm).toHaveLength(1);
    // Collection is locked once routing started.
    const lockedAdd = toggle(state, pad("c", 0, 2));
    expect(lockedAdd).toBe(state);
    // Consecutive duplicate waypoint collapses.
    const dup = bundleToolReducer(state, {
      kind: "commit-waypoint",
      pointNm: { x: 5 * MM, y: 0 },
    });
    expect(dup).toBe(state);
  });

  test("pitch nudges are additive and clamped at the floor", () => {
    let state = toggle(initialBundleToolState, pad("a", 0, 0));
    state = bundleToolReducer(state, {
      kind: "nudge-pitch",
      direction: 1,
      minPitchNm: 450_000,
    });
    expect(session(state).pitchNm).toBe(550_000);
    for (let i = 0; i < 10; i += 1) {
      state = bundleToolReducer(state, {
        kind: "nudge-pitch",
        direction: -1,
        minPitchNm: 450_000,
      });
    }
    expect(session(state).pitchNm).toBe(450_000);
  });

  test("set-pitch replaces the pitch (diff-pair gap adoption)", () => {
    let state = toggle(initialBundleToolState, pad("a", 0, 0));
    state = bundleToolReducer(state, { kind: "set-pitch", pitchNm: 400_000 });
    expect(session(state).pitchNm).toBe(400_000);
    expect(
      bundleToolReducer(state, { kind: "set-pitch", pitchNm: 0 }),
    ).toBe(state);
  });

  test("step-back pops waypoints, then pads, then goes idle", () => {
    let state = toggle(initialBundleToolState, pad("a", 0, 0));
    state = toggle(state, pad("b", 0, 1));
    state = bundleToolReducer(state, {
      kind: "commit-waypoint",
      pointNm: { x: 5 * MM, y: 0 },
    });
    state = bundleToolReducer(state, { kind: "step-back" });
    expect(session(state).waypointsNm).toHaveLength(0);
    state = bundleToolReducer(state, { kind: "step-back" });
    expect(session(state).pads.map((p) => p.padId)).toEqual(["a"]);
    state = bundleToolReducer(state, { kind: "step-back" });
    expect(state).toEqual(initialBundleToolState);
  });

  test("bundleAnchorNm is the rounded pad centroid", () => {
    let state = toggle(initialBundleToolState, pad("a", 0, 0));
    state = toggle(state, pad("b", 0, 1));
    state = toggle(state, pad("c", 3, 2));
    expect(bundleAnchorNm(session(state))).toEqual({
      x: 1 * MM,
      y: 1 * MM,
    });
  });
});
