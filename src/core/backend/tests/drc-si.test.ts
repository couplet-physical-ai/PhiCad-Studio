/**
 * P11 — signal-integrity diff-pair checks (gap, skew, uncoupled length) + the
 * name-convention / explicit-table resolver.
 */
import { describe, expect, test } from "bun:test";
import { runDrc } from "../../../modules/designer/backend/drc/drc-engine";
import { resolveDiffPairs } from "../../../modules/designer/backend/pcb/diff-pair-resolver";
import type { PcbBoardSettings } from "../../../sdks/designer";
import { board, codes, projection, trace } from "./helpers/drc-fixtures";

function boardWith(over: Partial<PcbBoardSettings>): PcbBoardSettings {
  return { ...board(), ...over };
}

describe("diff-pair resolver", () => {
  test("name convention: _P/_N auto-detects a pair", () => {
    const pairs = resolveDiffPairs(undefined, {
      n1: "USB_DP_P",
      n2: "USB_DP_N",
      n3: "SIG",
    });
    expect(pairs).toHaveLength(1);
    expect(new Set([pairs[0]!.pNetId, pairs[0]!.nNetId])).toEqual(
      new Set(["n1", "n2"]),
    );
  });

  test("explicit table wins and claims its nets", () => {
    const pairs = resolveDiffPairs(
      [{ id: "e1", name: "LANE0", pNetId: "a", nNetId: "b" }],
      { a: "FOO_P", b: "FOO_N", c: "BAR_P", d: "BAR_N" },
    );
    // explicit LANE0 + auto BAR
    expect(pairs.map((p) => p.name).sort()).toEqual(["BAR", "LANE0"]);
  });
});

describe("DRC — diff-pair checks", () => {
  // A well-coupled pair: two parallel traces 0.15 mm apart (width 0.2 → gap
  // 0.15... actually edge gap = 0.35 centerline − 0.2 = 0.15), equal length.
  function pairBoard(gapMm: number, tolMm = 0.05): PcbBoardSettings {
    return boardWith({
      diffPairs: [
        {
          id: "dp",
          name: "USB",
          pNetId: "p",
          nNetId: "n",
          gapMm,
          gapTolMm: tolMm,
        },
      ],
    });
  }

  test("on-target gap → no DIFF_PAIR_GAP", () => {
    const report = runDrc(
      projection({
        board: pairBoard(0.15),
        netNames: { p: "USB_P", n: "USB_N" },
        traces: [
          trace("tp", "p", [[0, 0], [20, 0]]),
          trace("tn", "n", [[0, 0.35], [20, 0.35]]), // edge gap 0.15
        ],
      }),
    );
    expect(codes(report)).not.toContain("DIFF_PAIR_GAP");
  });

  test("off-target gap → DIFF_PAIR_GAP", () => {
    const report = runDrc(
      projection({
        board: pairBoard(0.15),
        netNames: { p: "USB_P", n: "USB_N" },
        traces: [
          trace("tp", "p", [[0, 0], [20, 0]]),
          trace("tn", "n", [[0, 0.7], [20, 0.7]]), // edge gap 0.5, way off 0.15
        ],
      }),
    );
    expect(codes(report)).toContain("DIFF_PAIR_GAP");
  });

  test("length skew → DIFF_PAIR_SKEW", () => {
    const report = runDrc(
      projection({
        board: boardWith({
          diffPairs: [
            { id: "dp", name: "USB", pNetId: "p", nNetId: "n", maxSkewMm: 0.5 },
          ],
        }),
        netNames: { p: "USB_P", n: "USB_N" },
        traces: [
          trace("tp", "p", [[0, 0], [25, 0]]), // 25 mm
          trace("tn", "n", [[0, 0.35], [20, 0.35]]), // 20 mm → skew 5 mm
        ],
      }),
    );
    expect(codes(report)).toContain("DIFF_PAIR_SKEW");
  });

  test("long uncoupled breakout → DIFF_PAIR_UNCOUPLED_LENGTH", () => {
    const report = runDrc(
      projection({
        board: boardWith({
          outline: {
            kind: "rect",
            widthMm: 100,
            heightMm: 100,
            centerMm: { x: 0, y: 0 },
          },
          diffPairs: [
            {
              id: "dp",
              name: "USB",
              pNetId: "p",
              nNetId: "n",
              maxUncoupledMm: 5,
            },
          ],
        }),
        netNames: { p: "USB_P", n: "USB_N" },
        traces: [
          // P and N each run 30 mm but offset far apart → never coupled, so
          // the whole 30 mm is uncoupled (> 5 mm max).
          trace("tp", "p", [[-15, -10], [15, -10]]),
          trace("tn", "n", [[-15, 10], [15, 10]]),
        ],
      }),
    );
    expect(codes(report)).toContain("DIFF_PAIR_UNCOUPLED_LENGTH");
  });

  test("no diff pairs configured → no SI violations", () => {
    const report = runDrc(
      projection({
        netNames: { a: "SIG_A", b: "SIG_B" },
        traces: [
          trace("ta", "a", [[0, 0], [10, 0]]),
          trace("tb", "b", [[0, 5], [10, 5]]),
        ],
      }),
    );
    expect(codes(report).filter((c) => c.startsWith("DIFF_PAIR"))).toEqual([]);
  });

  test("determinism: run twice → byte-identical", () => {
    const p = projection({
      board: pairBoard(0.15),
      netNames: { p: "USB_P", n: "USB_N" },
      traces: [
        trace("tp", "p", [[0, 0], [20, 0]]),
        trace("tn", "n", [[0, 0.7], [20, 0.7]]),
      ],
    });
    expect(JSON.stringify(runDrc(structuredClone(p)))).toBe(
      JSON.stringify(runDrc(structuredClone(p))),
    );
  });
});
