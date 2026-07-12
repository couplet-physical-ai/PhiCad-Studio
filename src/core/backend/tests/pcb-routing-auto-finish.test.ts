import { describe, expect, test } from "bun:test";
import {
  routeAutoFinish,
  type AutoFinishInput,
} from "../../../shared/pcb-routing/auto-finish";
import { pathIntersectsAny } from "../../../shared/pcb-routing/collision";
import {
  buildTracePathThroughAnchors,
  validatePath,
  type TracePosture,
} from "../../../shared/pcb-geometry/pcb-trace-geometry";
import type {
  ObstacleRectNm,
  PointNm,
  RouteMode,
} from "../../../shared/pcb-routing/types";
import { buildPreviewPath } from "../../../modules/designer/frontend/pcb/tools/route-preview-geometry";

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
const POSTURES: TracePosture[] = ["auto", "axis", "diagonal"];

/** Every ok result must render mode-valid, collision-free, endpoint-exact. */
function assertOkInvariants(
  input: AutoFinishInput,
  result: ReturnType<typeof routeAutoFinish>,
): void {
  if (result.status !== "ok") {
    throw new Error(`expected ok, got ${result.status}`);
  }
  const rendered = buildTracePathThroughAnchors(
    [input.sourceNm, ...result.anchorsNm, input.targetNm],
    input.mode,
    input.posture,
  );
  expect(validatePath(rendered, input.mode)).toBeNull();
  expect(pathIntersectsAny(rendered, input.obstacles)).toBe(false);
  expect(rendered[0]).toEqual(input.sourceNm);
  expect(rendered[rendered.length - 1]).toEqual(input.targetNm);
}

describe("routeAutoFinish — escalation", () => {
  test("empty field resolves at the direct rung for all modes/postures", () => {
    for (const mode of MODES) {
      for (const posture of POSTURES) {
        const input: AutoFinishInput = {
          sourceNm: p(0, 0),
          targetNm: p(10, 6),
          obstacles: [],
          mode,
          posture,
        };
        const result = routeAutoFinish(input);
        assertOkInvariants(input, result);
        if (result.status === "ok") {
          expect(result.stats.escalation).toBe("direct");
        }
      }
    }
  });

  test("single wall between endpoints resolves at the elbow rung", () => {
    // Wall blocks the direct corridor but leaves the L-shaped elbows open.
    const input: AutoFinishInput = {
      sourceNm: p(0, 0),
      targetNm: p(10, 10),
      obstacles: [rect(4, 4, 6, 6, "block")],
      mode: "manhattan-45",
      posture: "auto",
    };
    const result = routeAutoFinish(input);
    assertOkInvariants(input, result);
    if (result.status === "ok") {
      expect(result.stats.escalation).toBe("elbow");
    }
  });

  test("U-trap around the source forces the A* rung", () => {
    // Walls on three sides of the source; only escape is +y then around.
    const obstacles = [
      rect(-1, -6, 0, 6, "left"),
      rect(0, -6, 8, -5, "bottom"),
      rect(7, -6, 8, 6, "right"),
    ];
    for (const mode of MODES) {
      const input: AutoFinishInput = {
        sourceNm: p(3, 0),
        targetNm: p(14, 0),
        obstacles,
        mode,
        posture: "auto",
      };
      const result = routeAutoFinish(input);
      assertOkInvariants(input, result);
      if (result.status === "ok") {
        expect(result.stats.escalation).toBe("astar");
        expect(result.stats.expansions).toBeGreaterThan(0);
      }
    }
  });

  test("straight corridor between walls routes through the gap", () => {
    const input: AutoFinishInput = {
      sourceNm: p(0, 0),
      targetNm: p(12, 0),
      obstacles: [
        rect(3, 0.8, 9, 6, "top"),
        rect(3, -6, 9, -0.8, "bottom"),
      ],
      mode: "manhattan-45",
      posture: "auto",
    };
    const result = routeAutoFinish(input);
    assertOkInvariants(input, result);
  });
});

describe("routeAutoFinish — failure honesty", () => {
  test("fully sealed box around the source reports no-path", () => {
    const input: AutoFinishInput = {
      sourceNm: p(3, 3),
      targetNm: p(20, 3),
      obstacles: [
        rect(0, 0, 6, 1, "s"),
        rect(0, 5, 6, 6, "n"),
        rect(0, 0, 1, 6, "w"),
        rect(5, 0, 6, 6, "e"),
      ],
      mode: "manhattan-45",
      posture: "auto",
    };
    expect(routeAutoFinish(input).status).toBe("no-path");
  });

  test("target inside a keep-out reports target-blocked", () => {
    const input: AutoFinishInput = {
      sourceNm: p(0, 0),
      targetNm: p(10, 10),
      obstacles: [rect(8, 8, 12, 12, "pad")],
      mode: "manhattan-45",
      posture: "auto",
    };
    expect(routeAutoFinish(input).status).toBe("target-blocked");
  });

  test("tiny expansion cap reports over-cap", () => {
    const input: AutoFinishInput = {
      sourceNm: p(3, 0),
      targetNm: p(14, 0),
      obstacles: [
        rect(-1, -6, 0, 6, "left"),
        rect(0, -6, 8, -5, "bottom"),
        rect(7, -6, 8, 6, "right"),
      ],
      mode: "manhattan-45",
      posture: "auto",
      caps: { maxExpansions: 3 },
    };
    expect(routeAutoFinish(input).status).toBe("over-cap");
  });
});

describe("routeAutoFinish — determinism", () => {
  const obstacles = [
    rect(2, -3, 3, 3, "a"),
    rect(5, 0, 6, 8, "b"),
    rect(8, -4, 9, 2, "c"),
  ];

  test("byte-equal results across repeated runs", () => {
    const input: AutoFinishInput = {
      sourceNm: p(0, 0),
      targetNm: p(12, 1),
      obstacles,
      mode: "manhattan-45",
      posture: "auto",
    };
    const one = routeAutoFinish(input);
    const two = routeAutoFinish(input);
    expect(two).toEqual(one);
  });

  test("results are independent of obstacle ordering", () => {
    const input: AutoFinishInput = {
      sourceNm: p(0, 0),
      targetNm: p(12, 1),
      obstacles,
      mode: "manhattan-45",
      posture: "auto",
    };
    const permuted = routeAutoFinish({
      ...input,
      obstacles: [obstacles[2]!, obstacles[0]!, obstacles[1]!],
    });
    expect(permuted).toEqual(routeAutoFinish(input));
  });
});

describe("routeAutoFinish — builder parity", () => {
  test("frontend buildPreviewPath renders ok anchors identically", () => {
    const input: AutoFinishInput = {
      sourceNm: p(3, 0),
      targetNm: p(14, 0),
      obstacles: [
        rect(-1, -6, 0, 6, "left"),
        rect(0, -6, 8, -5, "bottom"),
        rect(7, -6, 8, 6, "right"),
      ],
      mode: "manhattan-45",
      posture: "auto",
    };
    const result = routeAutoFinish(input);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    const anchors = [input.sourceNm, ...result.anchorsNm, input.targetNm];
    const shared = buildTracePathThroughAnchors(
      anchors,
      input.mode,
      input.posture,
    );
    const frontend = buildPreviewPath(anchors, input.mode, input.posture);
    expect(frontend).toEqual(shared);
  });
});
