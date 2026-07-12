import { describe, expect, test } from "bun:test";
import {
  DEFAULT_LAYER_PAIR,
  nextRouteLayer,
  routableCopperLayers,
} from "../../../modules/designer/frontend/pcb/tools/route-layer";

describe("nextRouteLayer", () => {
  test("toggles within the default pair on a 2-layer board", () => {
    expect(nextRouteLayer("F.Cu", 2)).toBe("B.Cu");
    expect(nextRouteLayer("B.Cu", 2)).toBe("F.Cu");
  });

  test("toggles within a custom pair on a 4-layer board", () => {
    expect(nextRouteLayer("F.Cu", 4, ["F.Cu", "In1.Cu"])).toBe("In1.Cu");
    expect(nextRouteLayer("In1.Cu", 4, ["F.Cu", "In1.Cu"])).toBe("F.Cu");
  });

  test("current layer outside the pair jumps to the pair's first entry", () => {
    expect(nextRouteLayer("B.Cu", 4, ["F.Cu", "In1.Cu"])).toBe("F.Cu");
  });

  test("inner-layer pair on a 2-layer board falls back to F↔B", () => {
    expect(nextRouteLayer("F.Cu", 2, ["In1.Cu", "In2.Cu"])).toBe("B.Cu");
    // Degenerate current layer (not routable on this board) → pair's first.
    expect(nextRouteLayer("In1.Cu", 2, ["In1.Cu", "In2.Cu"])).toBe("F.Cu");
  });

  test("degenerate pair falls back to the default", () => {
    expect(nextRouteLayer("F.Cu", 4, ["F.Cu", "F.Cu"])).toBe("B.Cu");
  });

  test("routableCopperLayers matches layerCount", () => {
    expect(routableCopperLayers(2)).toEqual(["F.Cu", "B.Cu"]);
    expect(routableCopperLayers(4)).toEqual([
      "F.Cu",
      "In1.Cu",
      "In2.Cu",
      "B.Cu",
    ]);
    expect(DEFAULT_LAYER_PAIR).toEqual(["F.Cu", "B.Cu"]);
  });
});
