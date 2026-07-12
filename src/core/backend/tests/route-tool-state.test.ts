import { describe, expect, test } from "bun:test";
import {
  initialRouteToolState,
  nextPosture,
  routeToolReducer,
  sessionAnchors,
} from "../../../modules/designer/frontend/pcb/tools/route-tool-state";

const startEvent = {
  kind: "start",
  anchorNm: { x: 0, y: 0 },
  layer: "F.Cu",
  segmentMode: "manhattan-45",
  netId: null,
  netClassId: "default",
  widthMm: 0.25,
} as const;

describe("routeToolReducer", () => {
  test("transitions idle → routing on start", () => {
    const next = routeToolReducer(initialRouteToolState, startEvent);
    expect(next.kind).toBe("routing");
    if (next.kind === "routing") {
      expect(next.session.anchorNm).toEqual({ x: 0, y: 0 });
      expect(next.session.waypointsNm).toEqual([]);
      expect(next.session.layer).toBe("F.Cu");
    }
  });

  test("commits a waypoint", () => {
    const after = routeToolReducer(
      routeToolReducer(initialRouteToolState, startEvent),
      { kind: "commit-waypoint", pointNm: { x: 1_000_000, y: 0 } },
    );
    if (after.kind !== "routing") throw new Error("expected routing");
    expect(after.session.waypointsNm).toEqual([{ x: 1_000_000, y: 0 }]);
  });

  test("ignores duplicate consecutive waypoint", () => {
    const a = routeToolReducer(initialRouteToolState, startEvent);
    const b = routeToolReducer(a, {
      kind: "commit-waypoint",
      pointNm: { x: 1_000_000, y: 0 },
    });
    const c = routeToolReducer(b, {
      kind: "commit-waypoint",
      pointNm: { x: 1_000_000, y: 0 },
    });
    if (c.kind !== "routing") throw new Error("expected routing");
    expect(c.session.waypointsNm.length).toBe(1);
  });

  test("commit-waypoints appends an ordered batch with dedupe", () => {
    const a = routeToolReducer(initialRouteToolState, startEvent);
    const b = routeToolReducer(a, {
      kind: "commit-waypoints",
      pointsNm: [
        { x: 0, y: 0 }, // duplicate of the anchor — dropped
        { x: 1_000_000, y: 0 },
        { x: 1_000_000, y: 0 }, // consecutive duplicate — dropped
        { x: 1_000_000, y: 2_000_000 },
      ],
    });
    if (b.kind !== "routing") throw new Error("expected routing");
    expect(b.session.waypointsNm).toEqual([
      { x: 1_000_000, y: 0 },
      { x: 1_000_000, y: 2_000_000 },
    ]);
    // All-duplicate batch is a no-op returning the same state object.
    const c = routeToolReducer(b, {
      kind: "commit-waypoints",
      pointsNm: [{ x: 1_000_000, y: 2_000_000 }],
    });
    expect(c).toBe(b);
  });

  test("step-back removes last waypoint, then exits to idle", () => {
    const a = routeToolReducer(initialRouteToolState, startEvent);
    const b = routeToolReducer(a, {
      kind: "commit-waypoint",
      pointNm: { x: 1_000_000, y: 0 },
    });
    const c = routeToolReducer(b, { kind: "step-back" });
    if (c.kind !== "routing") throw new Error("expected routing");
    expect(c.session.waypointsNm.length).toBe(0);
    const d = routeToolReducer(c, { kind: "step-back" });
    expect(d.kind).toBe("idle");
  });

  test("rebase-layer resets anchor, clears waypoints, flips layer", () => {
    const a = routeToolReducer(initialRouteToolState, startEvent);
    const withWaypoint = routeToolReducer(a, {
      kind: "commit-waypoint",
      pointNm: { x: 1_000_000, y: 0 },
    });
    const b = routeToolReducer(withWaypoint, {
      kind: "rebase-layer",
      layer: "B.Cu",
      anchorNm: { x: 2_000_000, y: 0 },
      runPointsNm: [
        { x: 0, y: 0 },
        { x: 2_000_000, y: 0 },
      ],
      via: { centerNm: { x: 2_000_000, y: 0 } },
    });
    if (b.kind !== "routing") throw new Error("expected routing");
    expect(b.session.layer).toBe("B.Cu");
    expect(b.session.anchorNm).toEqual({ x: 2_000_000, y: 0 });
    expect(b.session.waypointsNm).toEqual([]);
    // Width / net / posture / segmentMode preserved.
    expect(b.session.widthMm).toBe(0.25);
    expect(b.session.netId).toBe(null);
    expect(b.session.netClassId).toBe("default");
    expect(b.session.segmentMode).toBe("manhattan-45");
    // Finished run + via accumulated in the boundary log (F.Cu at old width).
    expect(b.session.boundaries).toHaveLength(1);
    expect(b.session.boundaries[0]!.run?.layer).toBe("F.Cu");
    expect(b.session.boundaries[0]!.via?.centerNm).toEqual({
      x: 2_000_000,
      y: 0,
    });
  });

  test("set-via-diameter and set-via-drill update overrides", () => {
    const a = routeToolReducer(initialRouteToolState, startEvent);
    const b = routeToolReducer(a, {
      kind: "set-via-diameter",
      diameterMmOverride: 0.9,
    });
    const c = routeToolReducer(b, {
      kind: "set-via-drill",
      drillMmOverride: 0.45,
    });
    if (c.kind !== "routing") throw new Error("expected routing");
    expect(c.session.viaDiameterMmOverride).toBe(0.9);
    expect(c.session.viaDrillMmOverride).toBe(0.45);

    // Setting back to undefined clears.
    const d = routeToolReducer(c, {
      kind: "set-via-diameter",
      diameterMmOverride: undefined,
    });
    if (d.kind !== "routing") throw new Error("expected routing");
    expect(d.session.viaDiameterMmOverride).toBeUndefined();
  });

  test("rebase-layer preserves via-size overrides", () => {
    const a = routeToolReducer(initialRouteToolState, startEvent);
    const withOverride = routeToolReducer(a, {
      kind: "set-via-diameter",
      diameterMmOverride: 1.2,
    });
    const b = routeToolReducer(withOverride, {
      kind: "rebase-layer",
      layer: "B.Cu",
      anchorNm: { x: 2_000_000, y: 0 },
      runPointsNm: [],
      via: { centerNm: { x: 2_000_000, y: 0 }, diameterMmOverride: 1.2 },
    });
    if (b.kind !== "routing") throw new Error("expected routing");
    expect(b.session.viaDiameterMmOverride).toBe(1.2);
    // Via-only boundary (no segments before the drop): no run recorded.
    expect(b.session.boundaries).toHaveLength(1);
    expect(b.session.boundaries[0]!.run).toBeUndefined();
  });

  test("set-mode toggles segment mode", () => {
    const a = routeToolReducer(initialRouteToolState, startEvent);
    const b = routeToolReducer(a, { kind: "set-mode", mode: "manhattan-90" });
    if (b.kind !== "routing") throw new Error("expected routing");
    expect(b.session.segmentMode).toBe("manhattan-90");
  });

  test("set-width updates width and its source", () => {
    const a = routeToolReducer(initialRouteToolState, startEvent);
    if (a.kind !== "routing") throw new Error("expected routing");
    // Width from the net class until the user overrides it.
    expect(a.session.widthSource).toBe("netclass");
    const b = routeToolReducer(a, {
      kind: "set-width",
      widthMm: 0.5,
      source: "preset",
    });
    if (b.kind !== "routing") throw new Error("expected routing");
    expect(b.session.widthMm).toBe(0.5);
    expect(b.session.widthSource).toBe("preset");
    const c = routeToolReducer(b, {
      kind: "set-width",
      widthMm: 0.42,
      source: "manual",
    });
    if (c.kind !== "routing") throw new Error("expected routing");
    expect(c.session.widthSource).toBe("manual");
  });

  test("rebase preserves width source unless overridden", () => {
    const a = routeToolReducer(initialRouteToolState, startEvent);
    const b = routeToolReducer(a, {
      kind: "set-width",
      widthMm: 0.5,
      source: "manual",
    });
    const c = routeToolReducer(b, {
      kind: "rebase",
      anchorNm: { x: 10, y: 10 },
      widthMm: 0.5,
      runPointsNm: [],
    });
    if (c.kind !== "routing") throw new Error("expected routing");
    expect(c.session.widthSource).toBe("manual");
    const d = routeToolReducer(c, {
      kind: "rebase",
      anchorNm: { x: 20, y: 20 },
      widthMm: 0.25,
      widthSource: "netclass",
      runPointsNm: [],
    });
    if (d.kind !== "routing") throw new Error("expected routing");
    expect(d.session.widthSource).toBe("netclass");
  });

  test("cancel returns to idle", () => {
    const a = routeToolReducer(initialRouteToolState, startEvent);
    const b = routeToolReducer(a, { kind: "cancel" });
    expect(b.kind).toBe("idle");
  });

  test("sessionAnchors returns anchor + waypoints in order", () => {
    const a = routeToolReducer(initialRouteToolState, startEvent);
    const b = routeToolReducer(a, {
      kind: "commit-waypoint",
      pointNm: { x: 1_000_000, y: 0 },
    });
    if (b.kind !== "routing") throw new Error("expected routing");
    expect(sessionAnchors(b.session)).toEqual([
      { x: 0, y: 0 },
      { x: 1_000_000, y: 0 },
    ]);
  });

  test("start defaults posture to auto", () => {
    const a = routeToolReducer(initialRouteToolState, startEvent);
    if (a.kind !== "routing") throw new Error("expected routing");
    expect(a.session.posture).toBe("auto");
  });

  test("cycle-posture rotates auto → axis → diagonal → auto", () => {
    const a = routeToolReducer(initialRouteToolState, startEvent);
    const b = routeToolReducer(a, { kind: "cycle-posture" });
    const c = routeToolReducer(b, { kind: "cycle-posture" });
    const d = routeToolReducer(c, { kind: "cycle-posture" });
    if (b.kind !== "routing" || c.kind !== "routing" || d.kind !== "routing") {
      throw new Error("expected routing");
    }
    expect(b.session.posture).toBe("axis");
    expect(c.session.posture).toBe("diagonal");
    expect(d.session.posture).toBe("auto");
  });

  test("set-posture jumps directly to the requested value", () => {
    const a = routeToolReducer(initialRouteToolState, startEvent);
    const b = routeToolReducer(a, {
      kind: "set-posture",
      posture: "diagonal",
    });
    if (b.kind !== "routing") throw new Error("expected routing");
    expect(b.session.posture).toBe("diagonal");
  });

  test("nextPosture wraps cleanly", () => {
    expect(nextPosture("auto")).toBe("axis");
    expect(nextPosture("axis")).toBe("diagonal");
    expect(nextPosture("diagonal")).toBe("auto");
  });

  test("rebase resets anchor + waypoints + width while keeping layer/net/posture", () => {
    const a = routeToolReducer(initialRouteToolState, startEvent);
    const b = routeToolReducer(a, {
      kind: "commit-waypoint",
      pointNm: { x: 1_000_000, y: 0 },
    });
    const c = routeToolReducer(b, {
      kind: "rebase",
      anchorNm: { x: 1_000_000, y: 0 },
      widthMm: 0.5,
      runPointsNm: [
        { x: 0, y: 0 },
        { x: 1_000_000, y: 0 },
      ],
    });
    if (c.kind !== "routing") throw new Error("expected routing");
    expect(c.session.anchorNm).toEqual({ x: 1_000_000, y: 0 });
    expect(c.session.waypointsNm).toEqual([]);
    expect(c.session.widthMm).toBe(0.5);
    expect(c.session.layer).toBe("F.Cu"); // preserved
    expect(c.session.netClassId).toBe("default"); // preserved
    expect(c.session.posture).toBe("auto"); // preserved
    // Old-width run recorded as a boundary.
    expect(c.session.boundaries).toHaveLength(1);
    expect(c.session.boundaries[0]!.run?.widthMm).toBe(0.25);
  });

  test("step-back pops across boundaries: reopens the run behind a via", () => {
    const a = routeToolReducer(initialRouteToolState, startEvent);
    const b = routeToolReducer(a, {
      kind: "commit-waypoint",
      pointNm: { x: 1_000_000, y: 0 },
    });
    const runStart = { x: 0, y: 0 };
    const runEnd = { x: 2_000_000, y: 0 };
    const run = [runStart, runEnd];
    const c = routeToolReducer(b, {
      kind: "rebase-layer",
      layer: "B.Cu",
      anchorNm: { x: 2_000_000, y: 0 },
      runPointsNm: run,
      via: { centerNm: { x: 2_000_000, y: 0 } },
    });
    // Backspace right after the via: reopen the F.Cu run, via gone.
    const d = routeToolReducer(c, { kind: "step-back" });
    if (d.kind !== "routing") throw new Error("expected routing");
    expect(d.session.layer).toBe("F.Cu");
    expect(d.session.anchorNm).toEqual(runStart);
    expect(d.session.waypointsNm).toEqual([runEnd]);
    expect(d.session.boundaries).toEqual([]);
    // Two more step-backs: drop the waypoint, then idle.
    const e = routeToolReducer(d, { kind: "step-back" });
    if (e.kind !== "routing") throw new Error("expected routing");
    expect(e.session.waypointsNm).toEqual([]);
    expect(routeToolReducer(e, { kind: "step-back" }).kind).toBe("idle");
  });

  test("step-back on a via-only boundary restores the pre-via layer", () => {
    const a = routeToolReducer(initialRouteToolState, startEvent);
    const b = routeToolReducer(a, {
      kind: "rebase-layer",
      layer: "B.Cu",
      anchorNm: { x: 0, y: 0 },
      runPointsNm: [],
      via: { centerNm: { x: 0, y: 0 } },
    });
    const c = routeToolReducer(b, { kind: "step-back" });
    if (c.kind !== "routing") throw new Error("expected routing");
    expect(c.session.layer).toBe("F.Cu");
    expect(c.session.anchorNm).toEqual({ x: 0, y: 0 });
    expect(c.session.boundaries).toEqual([]);
  });

  test("width-split boundary restores the old width on step-back", () => {
    const a = routeToolReducer(initialRouteToolState, startEvent);
    const b = routeToolReducer(a, {
      kind: "commit-waypoint",
      pointNm: { x: 1_000_000, y: 0 },
    });
    const c = routeToolReducer(b, {
      kind: "rebase",
      anchorNm: { x: 1_000_000, y: 0 },
      widthMm: 0.5,
      widthSource: "preset",
      runPointsNm: [
        { x: 0, y: 0 },
        { x: 1_000_000, y: 0 },
      ],
    });
    const d = routeToolReducer(c, { kind: "step-back" });
    if (d.kind !== "routing") throw new Error("expected routing");
    expect(d.session.widthMm).toBe(0.25);
    expect(d.session.widthSource).toBe("netclass");
    expect(d.session.layer).toBe("F.Cu");
    expect(d.session.waypointsNm).toEqual([{ x: 1_000_000, y: 0 }]);
  });
});
