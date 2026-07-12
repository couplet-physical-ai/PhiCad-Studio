/**
 * P6 — scoped priority clearance rules. Priority/first-match, relax-above-floor,
 * absolute floor, either-net scope, both-item area scope (BGA relaxation).
 */
import { describe, expect, test } from "bun:test";
import { runDrc } from "../../../modules/designer/backend/drc/drc-engine";
import type {
  DesignerPcbProjection,
  PcbBoardSettings,
  PcbDrcRule,
} from "../../../sdks/designer";
import { board, boardWithRules, codes, projection, trace } from "./helpers/drc-fixtures";

// Two different-net traces at a fixed 0.4 mm edge gap; the board clearance rule
// is 0.25, so by default they clear. Rules can tighten (flag) or relax.
function pair(boardSettings: PcbBoardSettings): DesignerPcbProjection {
  return projection({
    board: boardSettings,
    netNames: { hs1: "HS_A", hs2: "HS_B" },
    traces: [
      trace("a", "hs1", [[0, 0], [10, 0]]),
      trace("b", "hs2", [[0, 0.6], [10, 0.6]]),
    ],
  });
}

function withRules(rules: PcbDrcRule[]): PcbBoardSettings {
  return { ...board(), drcRules: rules };
}

const rule = (over: Partial<PcbDrcRule>): PcbDrcRule => ({
  id: over.id ?? "r",
  name: over.name ?? "rule",
  enabled: over.enabled ?? true,
  priority: over.priority ?? 1,
  scopes: over.scopes ?? [],
  constraint: over.constraint ?? { kind: "clearance", mm: 0.25 },
  ...(over.severity ? { severity: over.severity } : {}),
});

describe("DRC scoped rules — clearance", () => {
  test("no rules → default clearance (0.4 gap ≥ 0.25 rule, clean)", () => {
    expect(codes(runDrc(pair(board())))).not.toContain("TRACE_TO_TRACE_CLEARANCE");
  });

  test("a tightening rule flags the pair (0.4 < 0.5)", () => {
    const b = withRules([rule({ constraint: { kind: "clearance", mm: 0.5 } })]);
    expect(codes(runDrc(pair(b)))).toContain("TRACE_TO_TRACE_CLEARANCE");
  });

  test("net-scoped rule matches when EITHER item is on the net", () => {
    const b = withRules([
      rule({ scopes: [{ kind: "net", netIds: ["hs1"] }], constraint: { kind: "clearance", mm: 0.5 } }),
    ]);
    expect(codes(runDrc(pair(b)))).toContain("TRACE_TO_TRACE_CLEARANCE");
  });

  test("priority: higher-priority rule wins (relax overrides tighten)", () => {
    // A low-priority tighten (0.5) would flag; a high-priority relax (0.1)
    // wins first-match and the pair clears.
    const b = withRules([
      rule({ id: "tighten", priority: 1, constraint: { kind: "clearance", mm: 0.5 } }),
      rule({ id: "relax", priority: 10, constraint: { kind: "clearance", mm: 0.1 } }),
    ]);
    expect(codes(runDrc(pair(b)))).not.toContain("TRACE_TO_TRACE_CLEARANCE");
  });

  test("a rule can relax below the board default, but not below the floor", () => {
    // Board rule 0.25; relax to 0.1 → 0.4 gap clears. But a 0.5 floor overrides
    // the relax, so a 0.4 gap now flags.
    const floored = boardWithRules({ minimums: { clearanceMm: 0.5 } });
    const b: PcbBoardSettings = {
      ...floored,
      drcRules: [rule({ constraint: { kind: "clearance", mm: 0.1 } })],
    };
    expect(codes(runDrc(pair(b)))).toContain("TRACE_TO_TRACE_CLEARANCE");
  });

  test("area rule relaxes only when BOTH items are inside (BGA fanout)", () => {
    const insideArea = {
      kind: "area" as const,
      polygonMm: [
        { x: -1, y: -1 },
        { x: 11, y: -1 },
        { x: 11, y: 2 },
        { x: -1, y: 2 },
      ],
    };
    // Board tightened to 0.5 globally (both traces flag); an area-scoped relax
    // to 0.1 covers both trace midpoints → clears them.
    const relaxInArea = withRules([
      rule({ id: "global", priority: 1, constraint: { kind: "clearance", mm: 0.5 } }),
      rule({
        id: "bga",
        priority: 10,
        scopes: [insideArea],
        constraint: { kind: "clearance", mm: 0.1 },
      }),
    ]);
    expect(codes(runDrc(pair(relaxInArea)))).not.toContain(
      "TRACE_TO_TRACE_CLEARANCE",
    );

    // Same rules, but the area is elsewhere → the global tighten still flags.
    const relaxElsewhere = withRules([
      rule({ id: "global", priority: 1, constraint: { kind: "clearance", mm: 0.5 } }),
      rule({
        id: "bga",
        priority: 10,
        scopes: [
          {
            kind: "area",
            polygonMm: [
              { x: 50, y: 50 },
              { x: 60, y: 50 },
              { x: 60, y: 60 },
              { x: 50, y: 60 },
            ],
          },
        ],
        constraint: { kind: "clearance", mm: 0.1 },
      }),
    ]);
    expect(codes(runDrc(pair(relaxElsewhere)))).toContain(
      "TRACE_TO_TRACE_CLEARANCE",
    );
  });

  test("disabled rule is inert", () => {
    const b = withRules([
      rule({ enabled: false, constraint: { kind: "clearance", mm: 0.5 } }),
    ]);
    expect(codes(runDrc(pair(b)))).not.toContain("TRACE_TO_TRACE_CLEARANCE");
  });

  test("determinism: reversed input arrays → identical id set with rules active", () => {
    const b = withRules([
      rule({ scopes: [{ kind: "net", netIds: ["hs1"] }], constraint: { kind: "clearance", mm: 0.5 } }),
    ]);
    const p = pair(b);
    const r1 = runDrc(p);
    const rev = { ...p, traces: [...p.traces].reverse() };
    const r2 = runDrc(rev);
    expect(r2.violations.map((v) => v.id).sort()).toEqual(
      r1.violations.map((v) => v.id).sort(),
    );
  });
});
