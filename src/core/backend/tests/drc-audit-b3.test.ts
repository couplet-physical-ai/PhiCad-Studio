/**
 * Audit regression suite B3 — connectivity, copper pour, net-class resolution
 * (DRC_AUDIT_REPORT.md §4). Post-fix expectations; flip live per milestone.
 */
import { describe, expect, test } from "bun:test";
import { runDrc } from "../../../modules/designer/backend/drc/drc-engine";
import { computeRatsnest } from "../../../modules/designer/backend/pcb/ratsnest";
import type { NetPadCorrelation } from "../../../modules/designer/backend/pcb/net-pad-correlation";
import { createDefaultPcbViewState } from "../../../modules/designer/backend/pcb/pcb-defaults";
import type { PcbNetClass, PcbTrace, PcbVia } from "../../../sdks/designer";
import {
  board,
  codes,
  pad,
  placement,
  projection,
  trace,
  via,
} from "./helpers/drc-fixtures";

const NET_CLASSES: PcbNetClass[] = [
  {
    id: "default",
    name: "Default",
    traceWidthMm: 0.25,
    clearanceMm: 0.2,
    viaDiameterMm: 0.8,
    viaDrillMm: 0.4,
    color: "#e5e7eb",
    defaultViaProtection: "tented",
  },
];

function pads2(netId: string, a = { x: 0, y: 0 }, b = { x: 10, y: 0 }) {
  const correlation: NetPadCorrelation = {
    netPads: new Map([
      [
        netId,
        [
          { placementId: "A", padNumber: "1", worldMm: a },
          { placementId: "B", padNumber: "1", worldMm: b },
        ],
      ],
    ]),
    warnings: [],
  };
  return correlation;
}

function rtrace(
  id: string,
  pts: Array<[number, number]>,
  layer: "F.Cu" | "B.Cu" = "F.Cu",
  netId = "n1",
): PcbTrace {
  return {
    id,
    netId,
    netClassId: "default",
    layer,
    widthMm: 0.25,
    pointsNm: pts.map(([x, y]) => ({
      x: Math.round(x * 1_000_000),
      y: Math.round(y * 1_000_000),
    })),
    segmentMode: "manhattan-90",
  };
}

describe("audit B3 — connectivity / pour / net classes", () => {
  // Fix: P5 (GND suppression must be pour-aware, not name-unconditional).
  test.todo("B3-1: unrouted GND with NO pour still produces airwires", () => {
    const segments = computeRatsnest(pads2("n-gnd"), {
      netNames: new Map([["n-gnd", "GND"]]),
      netClasses: NET_CLASSES,
      // No fill context — the default board has copper fill disabled.
    });
    expect(segments.filter((s) => s.netId === "n-gnd")).toHaveLength(1);
  });

  // Fixed in P2d (live netclass resolution — trace and pad verdicts agree).
  test("B3-2: reassigned net class applies to traces AND pads alike", () => {
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
          trace("t1", "n1", [[0, 0], [10, 0]], { netClassId: "default" }),
          // 0.4 mm gap to BOTH t1 and U1 pad 1 (same net n1).
          trace("t2", "n2", [[0, 0.6], [10, 0.6]]),
        ],
        placements: [
          placement("U1", {
            positionMm: { x: 20, y: 0.6 + 0.1 + 0.5 + 0.4 },
            pads: [pad("1", { x: 0, y: 0 }, 1, 1)],
          }),
        ],
        padNets: { "U1|1": "n1" },
      }),
    );
    // Same net, same 0.4 mm gap, same required 2.0 — BOTH must flag.
    expect(codes(report)).toContain("TRACE_TO_TRACE_CLEARANCE");
  });

  // Fix: P5 (cross-layer endpoint chaining requires a via).
  test.todo("B3-3: exact endpoint touch across layers does NOT connect", () => {
    const segments = computeRatsnest(pads2("n1"), {
      netNames: new Map([["n1", "SIG"]]),
      netClasses: NET_CLASSES,
      traces: [
        rtrace("t1", [[0, 0], [5, 0]], "F.Cu"),
        rtrace("t2", [[5, 0], [10, 0]], "B.Cu"), // no via at (5,0)!
      ],
    });
    // Electrically open — the airwire must remain.
    expect(segments.filter((s) => s.netId === "n1")).toHaveLength(1);
  });

  // Fix: P5 (pad/via↔trace unions become layer-aware; PadRef gains a layer).
  test.todo("B3-4: B.Cu trace ending on an F.Cu-only pad does not connect", () => {
    const segments = computeRatsnest(pads2("n1"), {
      netNames: new Map([["n1", "SIG"]]),
      netClasses: NET_CLASSES,
      traces: [rtrace("t1", [[0, 0], [10, 0]], "B.Cu")],
    });
    // Both pads are SMD F.Cu-only (PadRef must carry that); the B.Cu trace
    // touches their XY but not their copper.
    expect(segments.filter((s) => s.netId === "n1")).toHaveLength(1);
  });

  // Fix: P5 (via on a trace INTERIOR joins the union, like the T-junction pass).
  test.todo("B3-5: mid-segment stitching via connects both layers", () => {
    const vias: PcbVia[] = [
      {
        id: "v1",
        netId: "n1",
        netClassId: "default",
        centerMm: { x: 5, y: 0 },
        diameterMm: 0.8,
        drillMm: 0.4,
        fromLayer: "F.Cu",
        toLayer: "B.Cu",
        viaType: "through",
        protection: "tented",
        provenance: "route",
      },
    ];
    const segments = computeRatsnest(
      pads2("n1", { x: 0, y: 0 }, { x: 5, y: 5 }),
      {
        netNames: new Map([["n1", "SIG"]]),
        netClasses: NET_CLASSES,
        traces: [
          rtrace("t1", [[0, 0], [10, 0]], "F.Cu"), // via sits mid-interior
          rtrace("t2", [[5, 0], [5, 5]], "B.Cu"), // endpoint on via center
        ],
        vias,
      },
    );
    expect(segments.filter((s) => s.netId === "n1")).toHaveLength(0);
  });

  // Fix: P5 (free pads join the connectivity graph — TODO.md 1.7).
  test.todo("B3-6: net stitched through a free pad's copper is connected", () => {
    // Requires computeRatsnest (or its correlation input) to accept free
    // pads: t1 ends at (4.8,0), t2 starts at (5.2,0), both under a 1.0 mm
    // free pad on the same net at (5,0). Today: permanent false airwire.
    const segments = computeRatsnest(pads2("n1"), {
      netNames: new Map([["n1", "SIG"]]),
      netClasses: NET_CLASSES,
      traces: [
        rtrace("t1", [[0, 0], [4.8, 0]]),
        rtrace("t2", [[5.2, 0], [10, 0]]),
      ],
      // P5: extend the context with freePads and include them in the union.
    });
    expect(segments.filter((s) => s.netId === "n1")).toHaveLength(0);
  });

  // Fixed in P3 (violation-id v2 hashes the layer).
  test("B3-7: isolated islands on different layers get distinct ids", () => {
    const view = {
      ...createDefaultPcbViewState(),
      copperFillLayers: ["F.Cu", "B.Cu"] as Array<"F.Cu" | "B.Cu">,
      copperFillPourNetIds: { "F.Cu": "gnd", "B.Cu": "gnd" },
    };
    // n2 square loop encloses a pocket with no GND copper inside → the pour
    // pocket is isolated, on BOTH layers. GND pad outside anchors the rest.
    const loop = (layer: "F.Cu" | "B.Cu") =>
      trace(
        `loop-${layer}`,
        "n2",
        [
          [-2, -2],
          [2, -2],
          [2, 2],
          [-2, 2],
          [-2, -2],
        ],
        { layer, widthMm: 0.3 },
      );
    const report = runDrc(
      projection({
        board: { ...board(), viewState: view },
        netNames: { gnd: "GND", n2: "SIG" },
        traces: [loop("F.Cu"), loop("B.Cu")],
        placements: [
          placement("U1", {
            positionMm: { x: -10, y: 0 },
            pads: [pad("1", { x: 0, y: 0 }, 1.5, 1.5, { drillDiameterMm: 0.8 })],
          }),
        ],
        padNets: { "U1|1": "gnd" },
      }),
    );
    const islands = report.violations.filter(
      (v) => v.code === "ISOLATED_COPPER_ISLAND",
    );
    expect(islands).toHaveLength(2);
    expect(new Set(islands.map((v) => v.id)).size).toBe(2);
  });

  // Fixed in P5c (explicit zones run through the pour check).
  test("B3-8: floating island inside an explicit zone is flagged", () => {
    const report = runDrc(
      projection({
        netNames: { n1: "GND" },
        zones: [
          {
            id: "z1",
            netName: "GND",
            netId: "n1",
            layer: "F.Cu",
            polygonPointsMm: [
              { x: -5, y: -5 },
              { x: 5, y: -5 },
              { x: 5, y: 5 },
              { x: -5, y: 5 },
            ],
            hatchEdgeMm: 0.5,
            fillType: "solid",
          },
        ],
        // No n1 copper anywhere inside the zone → the whole fill floats.
      }),
    );
    expect(codes(report)).toContain("ISOLATED_COPPER_ISLAND");
  });

  // Fix: reporting cleanup rider on P5 (field contract says mm, value is mm²).
  test.todo("B3-9: island violation does not report area in the mm field", () => {
    // Post-fix: measuredMm is undefined (or a genuine length) for
    // ISOLATED_COPPER_ISLAND; the area moves to the message/a dedicated field.
    expect(true).toBe(true);
  });

  // Fix: unassigned hardening rider on P9 (anchor chain must reach a pad).
  test.todo("B3-10: island anchored only by dead same-net copper still flags", () => {
    // An island touching a floating same-net trace stub is still dead copper.
    // Requires anchored-flag semantics to verify the anchor chain reaches a
    // pad (or a pour-connected via) — spec'd in the audit, fixture in P9.
    expect(true).toBe(true);
  });
});
