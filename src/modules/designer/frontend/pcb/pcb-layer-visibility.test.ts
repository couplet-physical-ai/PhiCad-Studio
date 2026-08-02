import { describe, expect, test } from "vitest";
import type {
  PcbLayerId,
  PcbOverlayShape,
  PcbOverlayText,
} from "../../../../sdks";
import { hitOverlayText } from "./pcb-hit";
import {
  isOverlayVisible,
  visibleLayerSet,
  visibleOverlayEntities,
} from "./pcb-layer-visibility";

/** The `top-side` preset's layer set (see PCB_LAYER_PRESETS) — no B.SilkS. */
const TOP_SIDE_LAYERS: ReadonlyArray<PcbLayerId> = [
  "F.Cu",
  "F.Mask",
  "F.Paste",
  "F.SilkS",
  "Edge.Cuts",
  "Drill",
  "Metadata",
];

function text(id: string, layer: PcbOverlayText["layer"]): PcbOverlayText {
  return {
    id,
    layer,
    positionMm: { x: 0, y: 0 },
    text: id,
    fontSizeMm: 1,
    rotationDeg: 0,
    mirror: false,
    justify: "center",
    lockedAt: null,
  };
}

function shape(id: string, layer: PcbOverlayShape["layer"]): PcbOverlayShape {
  return {
    id,
    layer,
    kind: "line",
    pointsMm: [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ],
    strokeWidthMm: 0.15,
    fill: "none",
  };
}

describe("isOverlayVisible", () => {
  test("follows the entity's own layer", () => {
    const visible = visibleLayerSet(TOP_SIDE_LAYERS);
    expect(isOverlayVisible(visible, text("t1", "F.SilkS"))).toBe(true);
    expect(isOverlayVisible(visible, text("t2", "B.SilkS"))).toBe(false);
    expect(isOverlayVisible(visible, shape("s1", "Edge.Cuts"))).toBe(true);
    expect(isOverlayVisible(visible, shape("s2", "B.Fab"))).toBe(false);
  });
});

describe("visibleOverlayEntities", () => {
  test("drops bottom-silk text under the top-side preset", () => {
    const visible = visibleLayerSet(TOP_SIDE_LAYERS);
    const texts = [text("front", "F.SilkS"), text("back", "B.SilkS")];

    expect(visibleOverlayEntities(visible, texts).map((t) => t.id)).toEqual([
      "front",
    ]);
  });

  test("gates every overlay layer generically, not just silkscreen", () => {
    const visible = visibleLayerSet(["F.SilkS", "F.Fab", "Edge.Cuts"]);
    const shapes = [
      shape("silk", "F.SilkS"),
      shape("fab", "F.Fab"),
      shape("courtyard", "F.CrtYd"),
      shape("outline", "Edge.Cuts"),
      shape("back-fab", "B.Fab"),
    ];

    expect(visibleOverlayEntities(visible, shapes).map((s) => s.id)).toEqual([
      "silk",
      "fab",
      "outline",
    ]);
  });

  test("keeps every entity when all its layers are visible", () => {
    const visible = visibleLayerSet(["F.SilkS", "B.SilkS"]);
    const texts = [text("front", "F.SilkS"), text("back", "B.SilkS")];

    expect(visibleOverlayEntities(visible, texts)).toHaveLength(2);
  });

  test("returns nothing when the overlay layers are all hidden", () => {
    const visible = visibleLayerSet(["F.Cu", "B.Cu"]);
    const texts = [text("front", "F.SilkS"), text("back", "B.SilkS")];

    expect(visibleOverlayEntities(visible, texts)).toHaveLength(0);
  });
});

/**
 * `PcbCanvas` has no unit-testable seam of its own (one 6k-line component), so
 * this pins the composition it performs: the overlay-text hit test is fed
 * `visibleOverlayEntities(visibleLayers, projection.overlayTexts)` — the SAME
 * gate `PcbScene.renderOverlayTexts` applies — instead of the raw projection
 * list. Without it, text hidden by the layers panel stayed click-selectable.
 */
describe("overlay-text hit-testing is gated by layer visibility", () => {
  const cursor = { x: 0, y: 0 };

  test("hidden bottom-silk text is not selectable under the top-side preset", () => {
    const visible = visibleLayerSet(TOP_SIDE_LAYERS);
    const texts = [text("back", "B.SilkS")];

    // Ungated (the pre-fix behaviour) the cursor DOES land on it…
    expect(hitOverlayText(texts, cursor)?.id).toBe("back");
    // …but the gated list the canvas now hit-tests is empty.
    expect(
      hitOverlayText(visibleOverlayEntities(visible, texts), cursor),
    ).toBeNull();
  });

  test("visible text on the same spot is still selectable", () => {
    const visible = visibleLayerSet(TOP_SIDE_LAYERS);
    const texts = [text("front", "F.SilkS")];

    expect(
      hitOverlayText(visibleOverlayEntities(visible, texts), cursor)?.id,
    ).toBe("front");
  });

  test("a hidden item stacked over a visible one does not shadow it", () => {
    const visible = visibleLayerSet(TOP_SIDE_LAYERS);
    // Paint order puts the bottom-silk text first; ungated it wins the hit.
    const texts = [text("back", "B.SilkS"), text("front", "F.SilkS")];

    expect(hitOverlayText(texts, cursor)?.id).toBe("back");
    expect(
      hitOverlayText(visibleOverlayEntities(visible, texts), cursor)?.id,
    ).toBe("front");
  });
});
