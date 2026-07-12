/**
 * Audit regression suite B5 — engine architecture, waivers, live-DRC parity
 * (DRC_AUDIT_REPORT.md §4). Post-fix expectations; flip live per milestone.
 * Live-DRC tests exercise the frontend pure module under bun, matching the
 * repo convention (see route-tool-state.test.ts).
 */
import { describe, expect, test } from "bun:test";
import { runDrc } from "../../../modules/designer/backend/drc/drc-engine";
import { runLiveDrc } from "../../../modules/designer/frontend/pcb/drc/live-drc";
import {
  board,
  codes,
  pad,
  placement,
  projection,
  trace,
  via,
} from "./helpers/drc-fixtures";

const MM = 1_000_000;

describe("audit B5 — architecture / waivers / live parity", () => {
  // Fixed in P2c (layer-invalid items still collision-checked; span non-waivable).
  test("B5-VIA-MASK: layer-invalid via cannot mask a dead short", () => {
    const build = () =>
      projection({
        netNames: { n1: "A", n2: "B" },
        vias: [
          // In1→In2 on a 2-layer board → viaSpanLayers() = [] today, making
          // the via invisible to every clearance/short loop.
          via("v", {
            netId: "n1",
            center: { x: 5, y: 5 },
            fromLayer: "In1.Cu",
            toLayer: "In2.Cu",
          }),
        ],
        traces: [trace("t", "n2", [[3, 5], [7, 5]])],
      });
    const report = runDrc(build());
    expect(codes(report)).toContain("VIA_LAYER_SPAN");
    // Post-fix: the physical copper collision surfaces as well.
    expect(codes(report)).toContain("NET_SHORT_CIRCUIT");
    // And waiving the span violation must NOT hide it (non-waivable).
    const spanId = report.violations.find(
      (v) => v.code === "VIA_LAYER_SPAN",
    )!.id;
    const waived = runDrc(build(), { waivedIds: [spanId] });
    expect(waived.summary.errors).toBeGreaterThan(0);
  });

  // Fixed in P2c (pad/via layer legality check — PAD_LAYER_MISMATCH).
  test("B5-PAD-LAYER: off-stackup pad layer is flagged AND still collides", () => {
    const report = runDrc(
      projection({
        placements: [
          placement("U1", {
            positionMm: { x: 5, y: 5 },
            pads: [pad("1", { x: 0, y: 0 }, 1.2, 1.2, { layer: "In1.Cu" })],
          }),
        ],
        padNets: { "U1|1": "n1" },
        netNames: { n1: "A", n2: "B" },
        // Different-net B.Cu trace through the pad — an In1.Cu pad on a
        // 2-layer board is checked on all valid layers, so the short surfaces.
        traces: [trace("t", "n2", [[3, 5], [7, 5]], { layer: "B.Cu" })],
      }),
    );
    expect(codes(report).map(String)).toContain("PAD_LAYER_MISMATCH");
    expect(codes(report)).toContain("NET_SHORT_CIRCUIT");
  });

  // Fixed in P3 (violation-id v2 buckets location — waivers stop drifting).
  test("B5-WAIVER-DRIFT: waiver expires when the hotspot moves", () => {
    const marginal = projection({
      netNames: { n1: "A", n2: "B" },
      traces: [
        trace("a", "n1", [[0, 0], [10, 0]]),
        trace("b", "n2", [[0, 0.44], [10, 0.44]]), // gap 0.24 < 0.25
      ],
    });
    const id = runDrc(marginal).violations.find(
      (v) => v.code === "TRACE_TO_TRACE_CLEARANCE",
    )!.id;
    // Same pair, violation location moved to the other end of the board.
    const moved = projection({
      netNames: { n1: "A", n2: "B" },
      traces: [
        trace("a", "n1", [[0, 0], [10, 0]]),
        trace("b", "n2", [
          [0, 5],
          [9.9, 5],
          [9.9, 0.21], // dives in near x≈9.9 only
          [10, 0.21],
        ]),
      ],
    });
    const waived = runDrc(moved, { waivedIds: [id] });
    // Post-fix: the old waiver no longer matches the new hotspot.
    expect(
      waived.violations.some(
        (v) => v.code === "TRACE_TO_TRACE_CLEARANCE" && !v.waived,
      ),
    ).toBe(true);
  });

  // Fix: P7 (live pads use true rotated rings via the shared batch builders).
  test.todo("B5-LIVE-ROT-PAD: rotated non-square pad is checked as rotated", () => {
    const parts = [
      placement("U1", {
        positionMm: { x: 5, y: 5 },
        rotationDeg: 90,
        // 2.0×0.5 pad rotated 90° → occupies 0.5×2.0 in world space.
        pads: [pad("1", { x: 0, y: 0 }, 2.0, 0.5)],
      }),
    ];
    const violations = runLiveDrc({
      // Pending trace along the pad's TRUE long axis (vertical after
      // rotation), 0.35 mm from center: inside the rotated pad's clearance,
      // outside today's unrotated AABB.
      traceNm: [
        { x: 5.35 * MM, y: 3 * MM },
        { x: 5.35 * MM, y: 7 * MM },
      ],
      traceWidthMm: 0.2,
      netId: "n2",
      layer: "F.Cu",
      traces: [],
      placements: parts,
      padNetMap: new Map([["U1|1", "n1"]]),
      netClasses: board().netClasses,
      netClassId: "default",
      designRules: board().designRules,
    });
    expect(violations.length).toBeGreaterThan(0);
  });

  // Fix: P7 (live TH pads span both sides, like the batch context).
  test.todo("B5-LIVE-TH-PAD-SIDE: routing B.Cu sees top-side THT barrels", () => {
    const parts = [
      placement("U1", {
        positionMm: { x: 5, y: 5 },
        layer: "F.Cu",
        pads: [pad("1", { x: 0, y: 0 }, 1.6, 1.6, { drillDiameterMm: 0.8 })],
      }),
    ];
    const violations = runLiveDrc({
      traceNm: [
        { x: 3 * MM, y: 5 * MM },
        { x: 7 * MM, y: 5 * MM },
      ],
      traceWidthMm: 0.2,
      netId: "n2",
      layer: "B.Cu", // opposite side of the placement
      traces: [],
      placements: parts,
      padNetMap: new Map([["U1|1", "n1"]]),
      netClasses: board().netClasses,
      netClassId: "default",
      designRules: board().designRules,
    });
    expect(violations.length).toBeGreaterThan(0);
  });

  // Fixed in working tree (computePadGeoms hoisted out of the segment loop);
  // permanent guard = the P7 live/batch parity suite + kernel-count budget.
  test.todo("B5-LIVE-PADGEOMS: pad geometry built once per live run", () => {
    expect(true).toBe(true);
  });

  // Fixed in P2 (stackup 2–32; 6-layer no longer silently degrades to 2).
  test("B5-6LAYER: 6-layer board validates In3.Cu instead of degrading", () => {
    const report = runDrc(
      projection({
        // Post-P2 PcbLayerCount accepts 6; the cast documents today's gap.
        board: { ...board(), layerCount: 6 },
        traces: [trace("t", null, [[0, 0], [10, 0]], { layer: "In1.Cu" })],
      }),
    );
    // In1.Cu is valid copper on a 6-layer board — no mismatch.
    expect(codes(report)).not.toContain("TRACE_LAYER_MISMATCH");
  });

  // Fix: P7 (async DRC task executor; run route stops blocking the loop).
  test.todo("B5-SYNC: large-board DRC runs off the request path", () => {
    // Architectural: asserted in the P7 task-executor tests (enqueue +
    // progress + cancel), not through runDrc itself.
    expect(true).toBe(true);
  });
});
