/**
 * Audit regression suite B1 — clearance engine (DRC_AUDIT_REPORT.md §4).
 * One named test per audit bug id. `test.todo` bodies encode the POST-FIX
 * expectation and flip live when the owning milestone (DRC_HARDENING_PLAN.md)
 * merges. Do not delete a todo — fix the engine instead.
 */
import { describe, expect, test } from "bun:test";
import { runDrc } from "../../../modules/designer/backend/drc/drc-engine";
import {
  board,
  boardWithRules,
  codes,
  pad,
  placement,
  projection,
  trace,
  via,
} from "./helpers/drc-fixtures";

describe("audit B1 — clearance engine", () => {
  // Fixed in P2c (shared pad-copper-layers side-flip helper).
  test("B1-1: authored pad.layer is side-flipped on B.Cu placements", () => {
    // KiCad-imported SMD pad carries layer:"F.Cu"; placement flipped to B.Cu.
    // Physical copper is on B.Cu — a B.Cu foreign-net trace through the pad
    // is a dead short and MUST be flagged.
    const shortOnBack = runDrc(
      projection({
        placements: [
          placement("U1", {
            positionMm: { x: 5, y: 5 },
            layer: "B.Cu",
            mirrored: true,
            pads: [pad("1", { x: 0, y: 0 }, 1.2, 1.2, { layer: "F.Cu" })],
          }),
        ],
        padNets: { "U1|1": "n1" },
        netNames: { n1: "A", n2: "B" },
        traces: [
          trace("t", "n2", [[3, 5], [7, 5]], { layer: "B.Cu" }),
        ],
      }),
    );
    expect(codes(shortOnBack)).toContain("NET_SHORT_CIRCUIT");

    // Mirror image: an F.Cu trace at the same XY must NOT be flagged against
    // copper that does not exist on F.Cu (today's false positive).
    const cleanOnFront = runDrc(
      projection({
        placements: [
          placement("U1", {
            positionMm: { x: 5, y: 5 },
            layer: "B.Cu",
            mirrored: true,
            pads: [pad("1", { x: 0, y: 0 }, 1.2, 1.2, { layer: "F.Cu" })],
          }),
        ],
        padNets: { "U1|1": "n1" },
        netNames: { n1: "A", n2: "B" },
        traces: [trace("t", "n2", [[3, 5], [7, 5]], { layer: "F.Cu" })],
      }),
    );
    expect(codes(cleanOnFront)).not.toContain("NET_SHORT_CIRCUIT");
    expect(codes(cleanOnFront)).not.toContain("TRACE_TO_PAD_CLEARANCE");
  });

  // Fixed in P2d (live netclass resolution; stored netClassId demoted for DRC).
  test("B1-2: trace uses the CURRENT per-net class, not its stored one", () => {
    const wide = {
      id: "wide",
      name: "Wide",
      traceWidthMm: 0.25,
      clearanceMm: 2.0,
      viaDiameterMm: 0.8,
      viaDrillMm: 0.4,
      color: "#fff",
      defaultViaProtection: "tented" as const,
    };
    const base = board();
    const report = runDrc(
      projection({
        board: {
          ...base,
          netClasses: [...base.netClasses, wide],
          perNetClassAssignments: { n1: "wide" },
        },
        netNames: { n1: "A", n2: "B" },
        traces: [
          // t1 routed BEFORE the assignment — stored class is stale "default".
          trace("t1", "n1", [[0, 0], [10, 0]], { netClassId: "default" }),
          // 0.4 mm edge gap: passes default (0.25), violates wide (2.0).
          trace("t2", "n2", [[0, 0.6], [10, 0.6]]),
        ],
      }),
    );
    expect(codes(report)).toContain("TRACE_TO_TRACE_CLEARANCE");
  });

  // Fixed in P1 (epsilon unification — below() grace on the clearance tier).
  test("B1-3: 1 nm clearance deficit is forgiven after eps unification", () => {
    const report = runDrc(
      projection({
        board: boardWithRules({
          fabricator: "custom",
          clearance: { traceToTraceMm: 0.127 },
        }),
        traces: [
          trace("a", null, [[0, 0], [10, 0]], { netClassId: "nc-none" }),
          // Sub-eps deficit (2.5e-7 mm) injected via widthMm — coordinates are
          // nm-quantized so eps-fraction gaps are only expressible through
          // width. Exactly-eps (1 nm) is the ULP-dependent boundary, untested.
          trace("b", null, [[0, 0.327], [10, 0.327]], {
            netClassId: "nc-none",
            widthMm: 0.2000005,
          }),
        ],
      }),
    );
    expect(codes(report)).not.toContain("TRACE_TO_TRACE_CLEARANCE");
  });

  // Fixed in P1 (AABB prefilter ceiling includes SHORT_EPS_MM).
  test("B1-4: zero-rule config cannot prune tangency-band shorts", () => {
    const base = boardWithRules({
      fabricator: "custom",
      clearance: {
        traceToTraceMm: 0,
        traceToPadMm: 0,
        padToPadMm: 0,
        traceToViaMm: 0,
        viaToViaMm: 0,
      },
    });
    const report = runDrc(
      projection({
        board: { ...base, netClasses: [] },
        netNames: { n1: "A", n2: "B" },
        traces: [
          trace("a", "n1", [[0, 0], [10, 0]]),
          // Edge gap 5e-5 mm: inside the short band (≤ 1e-4) but the AABB
          // prefilter threshold max(required=0, fabMin=0) prunes it today.
          trace("b", "n2", [[0, 0.20005], [10, 0.20005]]),
        ],
      }),
    );
    expect(codes(report)).toContain("NET_SHORT_CIRCUIT");
  });

  // Fixed in P2c (report a SHARED layer for via-via pairs).
  test("B1-5: VIA_TO_VIA_CLEARANCE reports a layer both vias occupy", () => {
    const report = runDrc(
      projection({
        board: { ...board(), layerCount: 4 },
        netNames: { n1: "A", n2: "B" },
        vias: [
          via("a", { netId: "n1", center: { x: 0, y: 0 } }), // through F→B
          via("b", {
            netId: "n2",
            center: { x: 0.9, y: 0 },
            fromLayer: "In2.Cu",
            toLayer: "B.Cu",
          }),
        ],
      }),
    );
    const v = report.violations.find((x) => x.code === "VIA_TO_VIA_CLEARANCE");
    expect(v).toBeDefined();
    // Shared span of {F..B} × {In2..B} = {In2.Cu, B.Cu}; today reports F.Cu.
    expect(["In2.Cu", "B.Cu"]).toContain(String(v!.layer));
  });

  // Fixed in P2c ("*.Cu" pads span all copper layers, like the zone-fill engine).
  test("B1-6: pad with layer '*.Cu' collides on every copper layer", () => {
    const report = runDrc(
      projection({
        placements: [
          placement("U1", {
            positionMm: { x: 5, y: 5 },
            pads: [pad("1", { x: 0, y: 0 }, 1.2, 1.2, { layer: "*.Cu" })],
          }),
        ],
        padNets: { "U1|1": "n1" },
        netNames: { n1: "A", n2: "B" },
        traces: [trace("t", "n2", [[3, 5], [7, 5]], { layer: "B.Cu" })],
      }),
    );
    expect(codes(report)).toContain("NET_SHORT_CIRCUIT");
  });
});
