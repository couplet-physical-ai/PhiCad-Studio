import { describe, expect, test } from "bun:test";
import { computeWireCrossingGaps } from "../../../shared/schematic-routing/crossing-gaps";

const GAP = 1_000; // small test gap half-width (nm)

describe("wire crossing gaps (audit §4.8)", () => {
  test("X crossing: the vertical segment splits into two runs, horizontal unchanged", () => {
    const wires = [
      {
        id: "h",
        pointsNm: [
          { x: 0, y: 0 },
          { x: 20_000, y: 0 },
        ],
      },
      {
        id: "v",
        pointsNm: [
          { x: 10_000, y: -10_000 },
          { x: 10_000, y: 10_000 },
        ],
      },
    ];
    const gaps = computeWireCrossingGaps(wires, [], GAP);
    expect(gaps.get("h")).toEqual([
      [
        { x: 0, y: 0 },
        { x: 20_000, y: 0 },
      ],
    ]);
    expect(gaps.get("v")).toEqual([
      [
        { x: 10_000, y: -10_000 },
        { x: 10_000, y: -1_000 },
      ],
      [
        { x: 10_000, y: 1_000 },
        { x: 10_000, y: 10_000 },
      ],
    ]);
  });

  test("T-touch: an endpoint landing on another wire's interior never gaps", () => {
    const wires = [
      {
        id: "h",
        pointsNm: [
          { x: 0, y: 0 },
          { x: 20_000, y: 0 },
        ],
      },
      {
        id: "v",
        pointsNm: [
          { x: 10_000, y: 10_000 },
          { x: 10_000, y: 0 }, // terminus ON h's interior
        ],
      },
    ];
    const gaps = computeWireCrossingGaps(wires, [], GAP);
    expect(gaps.get("v")).toEqual([
      [
        { x: 10_000, y: 10_000 },
        { x: 10_000, y: 0 },
      ],
    ]);
    expect(gaps.get("h")?.length).toBe(1);
  });

  test("shared corner vertex (pass-through) never gaps", () => {
    const wires = [
      {
        id: "w1",
        pointsNm: [
          { x: 0, y: 10_000 },
          { x: 10_000, y: 10_000 },
          { x: 10_000, y: 20_000 },
        ],
      },
      {
        id: "w2",
        pointsNm: [
          { x: 10_000, y: 0 },
          { x: 10_000, y: 10_000 },
          { x: 20_000, y: 10_000 },
        ],
      },
    ];
    const gaps = computeWireCrossingGaps(wires, [], GAP);
    expect(gaps.get("w1")?.length).toBe(1);
    expect(gaps.get("w2")?.length).toBe(1);
  });

  test("a crossing at a junction coordinate is skipped", () => {
    const wires = [
      {
        id: "h",
        pointsNm: [
          { x: 0, y: 0 },
          { x: 20_000, y: 0 },
        ],
      },
      {
        id: "v",
        pointsNm: [
          { x: 10_000, y: -10_000 },
          { x: 10_000, y: 10_000 },
        ],
      },
    ];
    const gaps = computeWireCrossingGaps(
      wires,
      [{ xNm: 10_000, yNm: 0 }],
      GAP,
    );
    expect(gaps.get("v")?.length).toBe(1);
  });

  test("two crossings on one vertical segment produce three runs", () => {
    const wires = [
      {
        id: "h1",
        pointsNm: [
          { x: 0, y: -5_000 },
          { x: 20_000, y: -5_000 },
        ],
      },
      {
        id: "h2",
        pointsNm: [
          { x: 0, y: 5_000 },
          { x: 20_000, y: 5_000 },
        ],
      },
      {
        id: "v",
        pointsNm: [
          { x: 10_000, y: -10_000 },
          { x: 10_000, y: 10_000 },
        ],
      },
    ];
    const gaps = computeWireCrossingGaps(wires, [], GAP);
    expect(gaps.get("v")).toEqual([
      [
        { x: 10_000, y: -10_000 },
        { x: 10_000, y: -6_000 },
      ],
      [
        { x: 10_000, y: -4_000 },
        { x: 10_000, y: 4_000 },
      ],
      [
        { x: 10_000, y: 6_000 },
        { x: 10_000, y: 10_000 },
      ],
    ]);
  });

  test("descending vertical segments gap correctly and mid-path gaps keep the tail", () => {
    const wires = [
      {
        id: "h",
        pointsNm: [
          { x: 0, y: 0 },
          { x: 20_000, y: 0 },
        ],
      },
      {
        id: "z",
        pointsNm: [
          { x: 5_000, y: 10_000 },
          { x: 10_000, y: 10_000 },
          { x: 10_000, y: -10_000 }, // descending through h
          { x: 15_000, y: -10_000 },
        ],
      },
    ];
    const gaps = computeWireCrossingGaps(wires, [], GAP);
    expect(gaps.get("z")).toEqual([
      [
        { x: 5_000, y: 10_000 },
        { x: 10_000, y: 10_000 },
        { x: 10_000, y: 1_000 },
      ],
      [
        { x: 10_000, y: -1_000 },
        { x: 10_000, y: -10_000 },
        { x: 15_000, y: -10_000 },
      ],
    ]);
  });
});
