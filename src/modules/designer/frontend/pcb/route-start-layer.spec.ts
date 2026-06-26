import { describe, test, expect } from "vitest";
import { pickRouteStartLayer } from "./route-start-layer";

describe("pickRouteStartLayer", () => {
  test("locked: focused layer always wins, ignoring the clicked pad", () => {
    expect(
      pickRouteStartLayer({
        focusedLayer: "B.Cu",
        anchorLayer: "F.Cu",
        viewSide: "top",
      }),
    ).toBe("B.Cu");
  });

  test("auto: follows the clicked pad's layer", () => {
    expect(
      pickRouteStartLayer({
        focusedLayer: null,
        anchorLayer: "B.Cu",
        viewSide: "top",
      }),
    ).toBe("B.Cu");
    expect(
      pickRouteStartLayer({
        focusedLayer: null,
        anchorLayer: "F.Cu",
        viewSide: "bottom",
      }),
    ).toBe("F.Cu");
  });

  test("auto: through-hole / via anchor (null) falls back to the viewed side", () => {
    expect(
      pickRouteStartLayer({
        focusedLayer: null,
        anchorLayer: null,
        viewSide: "top",
      }),
    ).toBe("F.Cu");
    expect(
      pickRouteStartLayer({
        focusedLayer: null,
        anchorLayer: null,
        viewSide: "bottom",
      }),
    ).toBe("B.Cu");
  });

  test("auto: dangling anchor (undefined) falls back to the viewed side", () => {
    expect(
      pickRouteStartLayer({
        focusedLayer: null,
        anchorLayer: undefined,
        viewSide: "bottom",
      }),
    ).toBe("B.Cu");
  });
});
