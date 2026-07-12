/**
 * Audit regression suite B4 — board-edge / off-board / hole-to-hole
 * (DRC_AUDIT_REPORT.md §4). Post-fix expectations; flip live per milestone.
 */
import { describe, expect, test } from "bun:test";
import { runDrc } from "../../../modules/designer/backend/drc/drc-engine";
import type { PcbBoardSettings } from "../../../sdks/designer";
import {
  board,
  codes,
  freeHole,
  pad,
  placement,
  projection,
  trace,
} from "./helpers/drc-fixtures";

function board100(overrides: Partial<PcbBoardSettings> = {}): PcbBoardSettings {
  return {
    ...board(),
    outline: {
      kind: "rect",
      widthMm: 100,
      heightMm: 100,
      centerMm: { x: 0, y: 0 },
    },
    ...overrides,
  };
}

describe("audit B4 — board checks", () => {
  // Fix: P4 (edge checks move to exact segment geometry, not point sampling).
  test.todo("B4-1: trace crossing a narrow cutout between samples is OFF-BOARD", () => {
    const report = runDrc(
      projection({
        board: board100({
          cutouts: [
            {
              id: "c1",
              shape: {
                kind: "circle",
                widthMm: 4,
                heightMm: 4,
                centerMm: { x: 20, y: 0 },
              },
            },
          ],
        }),
        // Vertices ±40 and midpoint 0 all sit OUTSIDE the cutout at (20,0):
        // today's sampling misses the crossing and demotes it to a
        // distance-0 edge warning.
        traces: [trace("t", "n1", [[-40, 0], [40, 0]], { widthMm: 1 })],
        netNames: { n1: "SIG" },
      }),
    );
    expect(codes(report)).toContain("COPPER_OFF_BOARD");
  });

  // Fix: P4 (pad off-board must test edges/containment, not vertices only).
  test.todo("B4-2: slot cutout passing through a pad interior is OFF-BOARD", () => {
    const report = runDrc(
      projection({
        board: board100({
          cutouts: [
            {
              id: "c1",
              // Thin 8×1 mm routed slot straight through the pad center:
              // no cutout vertex inside the pad, no pad vertex inside the
              // cutout — today both vertex tests miss it.
              shape: {
                kind: "roundrect",
                widthMm: 8,
                heightMm: 1,
                centerMm: { x: 0, y: 0 },
                cornerRadiusMm: 0.4,
              },
            },
          ],
        }),
        placements: [
          placement("U1", {
            pads: [pad("1", { x: 0, y: 0 }, 3, 3)],
          }),
        ],
        padNets: { "U1|1": "n1" },
        netNames: { n1: "SIG" },
      }),
    );
    expect(codes(report)).toContain("COPPER_OFF_BOARD");
  });

  // Fixed in P5 (same-footprint skip must not exempt overlapping drills).
  test("B4-3: overlapping drills within ONE footprint are flagged", () => {
    const report = runDrc(
      projection({
        placements: [
          placement("U1", {
            pads: [
              pad("1", { x: 0, y: 0 }, 1.6, 1.6, { drillDiameterMm: 1.0 }),
              // 0.8 mm apart: drill edges overlap by 0.2 mm — a broken drill
              // file regardless of footprint membership.
              pad("2", { x: 0.8, y: 0 }, 1.6, 1.6, { drillDiameterMm: 1.0 }),
            ],
          }),
        ],
      }),
    );
    expect(codes(report)).toContain("HOLE_TO_HOLE");
  });

  // Fixed in P5b (new HOLE_TO_BOARD_EDGE check; audit's silent-failure repro).
  test("B4-4: NPTH hole crossing the board edge is flagged", () => {
    const report = runDrc(
      projection({
        board: board100(),
        // Drill edge reaches x = 50.7 — physically crossing the x = 50 edge.
        // Today: zero violations.
        freeHoles: [freeHole("h1", { x: 49.2, y: 0 }, 3)],
      }),
    );
    expect(codes(report).map(String)).toContain("HOLE_TO_BOARD_EDGE");
  });

  // Fixed in P5b (checks/outline.ts resurrects BOARD_OUTLINE_INVALID).
  test("B4-5: self-intersecting outline emits BOARD_OUTLINE_INVALID", () => {
    const report = runDrc(
      projection({
        board: {
          ...board(),
          outline: {
            kind: "polygon",
            widthMm: 10,
            heightMm: 10,
            centerMm: { x: 5, y: 5 },
            // Bow-tie: edges (0,0)-(10,10) and (10,0)-(0,10) cross.
            pointsMm: [
              { x: 0, y: 0 },
              { x: 10, y: 10 },
              { x: 10, y: 0 },
              { x: 0, y: 10 },
            ],
          },
        },
      }),
    );
    expect(codes(report)).toContain("BOARD_OUTLINE_INVALID");
  });

  // Fix: P4 rider (flatten cutout arcs with outward-conservative sampling).
  test.todo("B4-6: circular cutout polygonization does not under-measure", () => {
    // Inscribed-polygon flattening shrinks the hole by up to ~0.024 mm at
    // r = 20 (false-pass direction for copper-to-cutout-edge). Post-fix:
    // circumscribed (or tolerance-compensated) sampling for cutouts.
    // Fixture: copper at exactly edge-clearance from the TRUE circle must
    // flag. Written against the P4 edge-tree implementation.
    expect(true).toBe(true);
  });

  // Fix: P4 (pointInFlattenedOutline on precomputed rings — perf only).
  test.todo("B4-7: containment queries reuse the precomputed outline rings", () => {
    // Structural/perf: covered by the P4 kernel-count assertions (the
    // re-flatten-per-sample pattern disappears with the edge tree).
    expect(true).toBe(true);
  });
});
