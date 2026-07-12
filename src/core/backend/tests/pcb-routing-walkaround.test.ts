import { describe, expect, test } from "bun:test";
import {
  walkaroundHead,
  type WalkaroundInput,
} from "../../../shared/pcb-routing/walkaround";
import { pathIntersectsAny } from "../../../shared/pcb-routing/collision";
import {
  buildTracePathThroughAnchors,
  validatePath,
} from "../../../shared/pcb-geometry/pcb-trace-geometry";
import type {
  ObstacleRectNm,
  PointNm,
  RouteMode,
} from "../../../shared/pcb-routing/types";

const MM = 1_000_000;
const p = (x: number, y: number): PointNm => ({ x: x * MM, y: y * MM });

const rect = (
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  id: string,
): ObstacleRectNm => ({
  minX: minX * MM,
  minY: minY * MM,
  maxX: maxX * MM,
  maxY: maxY * MM,
  id,
});

const MODES: RouteMode[] = ["manhattan-45", "manhattan-90"];

const BLOCK = rect(4, -2, 6, 2, "block");

function baseInput(mode: RouteMode): WalkaroundInput {
  return {
    headStartNm: p(0, 0),
    headEndNm: p(10, 0),
    obstacles: [BLOCK],
    mode,
    posture: "auto",
  };
}

function assertDetourInvariants(
  input: WalkaroundInput,
  result: ReturnType<typeof walkaroundHead>,
): void {
  if (result.status !== "detour") {
    throw new Error(`expected detour, got ${result.status}`);
  }
  const rendered = buildTracePathThroughAnchors(
    [input.headStartNm, ...result.anchorsNm, input.headEndNm],
    input.mode,
    input.posture,
  );
  expect(validatePath(rendered, input.mode)).toBeNull();
  expect(pathIntersectsAny(rendered, input.obstacles)).toBe(false);
  // Endpoints are never moved.
  expect(rendered[0]).toEqual(input.headStartNm);
  expect(rendered[rendered.length - 1]).toEqual(input.headEndNm);
}

describe("walkaroundHead", () => {
  test("clear when the direct head misses everything", () => {
    for (const mode of MODES) {
      const result = walkaroundHead({
        ...baseInput(mode),
        headEndNm: p(10, 5),
        obstacles: [rect(4, -8, 6, -4, "far")],
      });
      expect(result.status).toBe("clear");
    }
  });

  test("detours around a single blocking rect in both modes", () => {
    for (const mode of MODES) {
      const input = baseInput(mode);
      const result = walkaroundHead(input);
      assertDetourInvariants(input, result);
    }
  });

  test("blocked when the cursor sits inside the keep-out", () => {
    const result = walkaroundHead({
      ...baseInput("manhattan-45"),
      headEndNm: p(5, 0),
    });
    expect(result.status).toBe("blocked");
  });

  test("blocked when the head start sits inside the keep-out", () => {
    const result = walkaroundHead({
      ...baseInput("manhattan-45"),
      headStartNm: p(5, 1),
    });
    expect(result.status).toBe("blocked");
  });

  test("touching obstacles merge into one wrapped cluster", () => {
    const input: WalkaroundInput = {
      ...baseInput("manhattan-45"),
      obstacles: [BLOCK, rect(6, -1, 7.5, 3, "annex")],
    };
    const result = walkaroundHead(input);
    assertDetourInvariants(input, result);
    if (result.status === "detour") {
      expect(result.clusterSignature).toBe("annex|block");
    }
  });

  test("hysteresis keeps the previous side within the tolerance band", () => {
    // Symmetric obstacle → both sides near-equal; default pick is ccw.
    const input = baseInput("manhattan-45");
    const first = walkaroundHead(input);
    expect(first.status).toBe("detour");
    if (first.status !== "detour") return;
    const flipped = first.side === "ccw" ? "cw" : "ccw";
    const sticky = walkaroundHead({
      ...input,
      previousChoice: {
        clusterSignature: first.clusterSignature,
        side: flipped,
      },
    });
    expect(sticky.status).toBe("detour");
    if (sticky.status === "detour") {
      expect(sticky.side).toBe(flipped);
    }
  });

  test("hysteresis yields when the previous side becomes much longer", () => {
    // Overlapping wall below the block merges into the cluster and makes the
    // bottom wrap far longer than the top one (beyond the 1.25× band).
    const input: WalkaroundInput = {
      ...baseInput("manhattan-45"),
      obstacles: [BLOCK, rect(3, -14, 7, -1, "south-wall")],
    };
    const fresh = walkaroundHead(input);
    expect(fresh.status).toBe("detour");
    if (fresh.status !== "detour") return;
    const other = fresh.side === "ccw" ? "cw" : "ccw";
    const result = walkaroundHead({
      ...input,
      previousChoice: {
        clusterSignature: fresh.clusterSignature,
        side: other,
      },
    });
    expect(result.status).toBe("detour");
    if (result.status === "detour") {
      expect(result.side).toBe(fresh.side);
    }
  });

  test("stale cluster signature disables hysteresis", () => {
    const input = baseInput("manhattan-45");
    const fresh = walkaroundHead(input);
    if (fresh.status !== "detour") throw new Error("expected detour");
    const flipped = fresh.side === "ccw" ? "cw" : "ccw";
    const result = walkaroundHead({
      ...input,
      previousChoice: { clusterSignature: "someone-else", side: flipped },
    });
    if (result.status !== "detour") throw new Error("expected detour");
    expect(result.side).toBe(fresh.side);
  });

  test("deterministic under obstacle permutation and repetition", () => {
    const obstacles = [
      BLOCK,
      rect(6.5, -3, 8, 0.5, "b"),
      rect(2, 1.5, 3, 4, "c"),
    ];
    const input: WalkaroundInput = {
      ...baseInput("manhattan-45"),
      obstacles,
    };
    const one = walkaroundHead(input);
    const two = walkaroundHead({
      ...input,
      obstacles: [obstacles[2]!, obstacles[0]!, obstacles[1]!],
    });
    expect(two).toEqual(one);
    expect(walkaroundHead(input)).toEqual(one);
  });
});
