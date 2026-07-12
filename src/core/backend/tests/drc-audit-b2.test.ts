/**
 * Audit regression suite B2 — manufacturability + fab presets
 * (DRC_AUDIT_REPORT.md §4). Post-fix expectations; flip live per milestone.
 */
import { describe, expect, test } from "bun:test";
import { runDrc } from "../../../modules/designer/backend/drc/drc-engine";
import { FAB_PRESETS } from "../../../modules/designer/backend/pcb/fab-presets";
import {
  boardWithRules,
  codes,
  freeHole,
  freePad,
  pad,
  placement,
  projection,
  via,
} from "./helpers/drc-fixtures";

describe("audit B2 — manufacturability / fab presets", () => {
  // Fixed in P1 (below() in fab validators kills the derived-float false positive).
  test("B2-1: exact-spec annular (0.7−0.4)/2 emits no FAB_ANNULAR_RING", () => {
    const report = runDrc(
      projection({
        board: boardWithRules({
          fabricator: "jlcpcb_2l",
          minimums: { annularRingMm: 0.1, viaDiameterMm: 0.6 },
        }),
        // (0.7 − 0.4) / 2 = 0.14999999999999997 — exactly at the 0.15 preset.
        vias: [via("v", { diameterMm: 0.7, drillMm: 0.4 })],
      }),
    );
    expect(codes(report)).not.toContain("FAB_ANNULAR_RING");
  });

  // Fixed in P8 (fab profiles refresh — jlcpcb_4l self-consistency).
  test("B2-2: jlcpcb_4l's own minimum-compliant via does not self-flag", () => {
    const report = runDrc(
      projection({
        board: boardWithRules({
          fabricator: "jlcpcb_4l",
          layerCount: 4,
          minimums: {
            annularRingMm: 0.05,
            viaDiameterMm: 0.25,
            viaDrillMm: 0.15,
            drillSizeMm: 0.15,
          },
        }),
        // Smallest via the (current) preset calls pad/drill-compliant.
        vias: [via("v", { diameterMm: 0.45, drillMm: 0.2 })],
      }),
    );
    expect(codes(report).filter((c) => c.startsWith("FAB_"))).toEqual([]);
  });

  // Fixed in P8 (values refreshed to the live JLCPCB capability page).
  test("B2-3: JLCPCB preset floors match live capabilities (2026-07)", () => {
    // Audit §7 drift table: 2L trace/space 0.10, drill 0.15, via Ø 0.25.
    // NOTE: P8 restructures presets into fab-profiles — update imports then.
    expect(FAB_PRESETS.jlcpcb_2l?.minTraceWidthMm).toBe(0.1);
    expect(FAB_PRESETS.jlcpcb_2l?.minClearanceMm).toBe(0.1);
    expect(FAB_PRESETS.jlcpcb_2l?.minDrillMm).toBe(0.15);
    expect(FAB_PRESETS.jlcpcb_4l?.minDrillMm).toBe(0.15);
  });

  // Fixed in P8 (via vs PTH annular thresholds applied to the right entity class).
  test("B2-4: via annular uses the VIA minimum, PTH pads get the PTH one", () => {
    // Via with 0.1 mm/side ring: legal per JLC via rule (≥ 0.05), today warns.
    const viaReport = runDrc(
      projection({
        board: boardWithRules({
          fabricator: "jlcpcb_2l",
          minimums: { annularRingMm: 0.05, viaDiameterMm: 0.5 },
        }),
        vias: [via("v", { diameterMm: 0.6, drillMm: 0.4 })],
      }),
    );
    expect(codes(viaReport)).not.toContain("FAB_ANNULAR_RING");

    // TH component pad with 0.12 mm/side ring: below the 2L PTH minimum
    // (0.18) — today gets NO fab check at all.
    const pthReport = runDrc(
      projection({
        board: boardWithRules({
          fabricator: "jlcpcb_2l",
          minimums: { annularRingMm: 0.05 },
        }),
        placements: [
          placement("U1", {
            pads: [
              pad("1", { x: 0, y: 0 }, 1.0, 1.0, { drillDiameterMm: 0.76 }),
            ],
          }),
        ],
      }),
    );
    expect(codes(pthReport)).toContain("FAB_ANNULAR_RING");
  });

  // Fix: P5/A6 slot-aware DrcHole (template) + P2 follow-through (B2-5 proper).
  test.todo("B2-5: slotted drills use slot geometry, not a round-hole model", () => {
    // Free std pad 2.0×1.0 with a 1.8×0.5 slot: true slot-end ring is
    // (2.0 − 1.8)/2 = 0.1 < 0.2 minimum. Round model sees (1.0 − 0.5)/2 = 0.25.
    const report = runDrc(
      projection({
        freePads: [
          freePad("fp1", {
            padType: "std",
            shape: "oval",
            widthMm: 2.0,
            heightMm: 1.0,
            drillMm: 0.5,
            drillSlot: { lengthMm: 1.8, widthMm: 0.5, angleDeg: 0 },
          }),
        ],
      }),
    );
    expect(codes(report)).toContain("ANNULAR_RING_MIN");
  });

  // Fix: unassigned (needs true trapezoid/custom pad outlines in the model —
  // record in P9 overlays work). padOdMm = min(w,h) is a bbox for these.
  test.todo("B2-6: trapezoid/custom pad annular uses true copper, not bbox", () => {
    const report = runDrc(
      projection({
        placements: [
          placement("U1", {
            pads: [
              // Trapezoid whose narrow flank leaves < 0.2 ring around a 1.7
              // drill; bbox model sees (2.0 − 1.7)/2 = 0.15 < 0.2 anyway, so
              // pick bbox-passing dims: bbox 2.2 → 0.25 ring, true ring less.
              pad("1", { x: 0, y: 0 }, 2.2, 2.2, {
                shape: "trapezoid",
                drillDiameterMm: 1.7,
              }),
            ],
          }),
        ],
      }),
    );
    expect(codes(report)).toContain("ANNULAR_RING_MIN");
  });

  // Fix: P2 (per-via-type aspect/support model) + P8 (profile fields).
  test.todo("B2-7: blind via on a fab without blind-via support is flagged", () => {
    const report = runDrc(
      projection({
        board: boardWithRules({
          fabricator: "jlcpcb_4l",
          layerCount: 4,
          minimums: {
            annularRingMm: 0.05,
            viaDiameterMm: 0.3,
            viaDrillMm: 0.15,
            drillSizeMm: 0.15,
          },
        }),
        vias: [
          via("v", {
            diameterMm: 0.3,
            drillMm: 0.15,
            fromLayer: "F.Cu",
            toLayer: "In1.Cu",
          }),
        ],
      }),
    );
    expect(codes(report).map(String)).toContain("VIA_TYPE_UNSUPPORTED");
  });

  // Fixed in P8 (fab drill floor applies to ALL holes, not just vias).
  test("B2-8: free hole below the fab drill floor gets a FAB warning", () => {
    const report = runDrc(
      projection({
        board: boardWithRules({
          fabricator: "jlcpcb_2l",
          minimums: { drillSizeMm: 0.05 },
        }),
        freeHoles: [freeHole("h1", { x: 0, y: 0 }, 0.1)],
      }),
    );
    expect(codes(report)).toContain("FAB_DRILL");
  });

  // Fix: P1 (creation gates share pcb/tolerance.ts with the engine).
  test.todo("B2-9: via creation gate and DRC agree on identical geometry", () => {
    // Gate parity is exercised through the command executor
    // (command-executor.ts via gates) once both consume below()/exceeds()
    // from pcb/tolerance.ts — write as an executor-level test in P1.
    expect(true).toBe(true);
  });
});
