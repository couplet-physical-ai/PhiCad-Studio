import { describe, expect, test } from "vitest";
import {
  isRefdesLabel,
  withPlacementReference,
  withoutRefdesLabels,
  type FootprintPreviewLabel,
  type FootprintPreviewModel,
} from "./footprint-labels";

function label(
  overrides: Partial<FootprintPreviewLabel> & { id: string },
): FootprintPreviewLabel {
  return {
    text: "REF**",
    at: { x: 0, y: 0 },
    rotationDeg: 0,
    fontSizeMm: 1,
    anchorX: "center",
    anchorY: "middle",
    layer: "F.SilkS",
    ...overrides,
  };
}

function model(labels: FootprintPreviewLabel[]): FootprintPreviewModel {
  return {
    kind: "footprint",
    units: "mm",
    name: "R_0201_0603Metric",
    pads: [],
    graphics: [],
    labels,
    bounds: null,
    warnings: [],
  };
}

describe("isRefdesLabel", () => {
  test("matches the role tag and both placeholder spellings", () => {
    expect(isRefdesLabel(label({ id: "a", role: "reference", text: "R6" }))).toBe(
      true,
    );
    expect(isRefdesLabel(label({ id: "b", text: "REF**" }))).toBe(true);
    expect(isRefdesLabel(label({ id: "c", text: "${REFERENCE}" }))).toBe(true);
  });

  test("leaves value / user text alone", () => {
    expect(isRefdesLabel(label({ id: "d", role: "value", text: "1K" }))).toBe(
      false,
    );
    expect(
      isRefdesLabel(label({ id: "e", role: "footprint-text", text: "TP1" })),
    ).toBe(false);
  });
});

describe("withPlacementReference", () => {
  test("rebinds a literal designator baked into a shared footprint", () => {
    // A footprint ingested from a .kicad_pcb instance carries that instance's
    // designator, so every placement sharing it silkscreens the same text.
    const source = model([
      label({ id: "ref", role: "reference", text: "R6", layer: "F.SilkS" }),
      label({ id: "val", role: "value", text: "1K", layer: "F.Fab" }),
    ]);

    const out = withPlacementReference(source, "R1");

    expect(out.labels.map((l) => l.text)).toEqual(["R1", "1K"]);
  });

  test("copies instead of mutating the shared model", () => {
    const source = model([
      label({ id: "ref", role: "reference", text: "R6" }),
    ]);

    withPlacementReference(source, "R1");

    expect(source.labels[0]?.text).toBe("R6");
  });

  test("returns the same object when nothing changes (memo identity)", () => {
    const alreadyCorrect = model([
      label({ id: "ref", role: "reference", text: "R1" }),
    ]);
    expect(withPlacementReference(alreadyCorrect, "R1")).toBe(alreadyCorrect);

    const noReferenceLabel = model([
      label({ id: "val", role: "value", text: "1K" }),
    ]);
    expect(withPlacementReference(noReferenceLabel, "R1")).toBe(
      noReferenceLabel,
    );

    const empty = model([]);
    expect(withPlacementReference(empty, "R1")).toBe(empty);
  });

  test("leaves placeholder text for the shared renderer to substitute", () => {
    // `REF**` without a role tag is the fallback parse path; the shared
    // FootprintRenderLayer already rewrites it via placeholderSubstitutions.
    const source = model([label({ id: "ph", text: "REF**" })]);
    expect(withPlacementReference(source, "R1")).toBe(source);
  });

  test("rewrites a role-tagged placeholder too", () => {
    const source = model([
      label({ id: "ref", role: "reference", text: "REF**" }),
    ]);
    expect(withPlacementReference(source, "R1").labels[0]?.text).toBe("R1");
  });

  test("no-ops on an empty reference rather than blanking the silk", () => {
    const source = model([
      label({ id: "ref", role: "reference", text: "R6" }),
    ]);
    expect(withPlacementReference(source, "")).toBe(source);
  });

  test("rebinds on both sides — layer is irrelevant to the rewrite", () => {
    const source = model([
      label({ id: "ref", role: "reference", text: "R6", layer: "B.SilkS" }),
    ]);
    const out = withPlacementReference(source, "R9");
    expect(out.labels[0]).toMatchObject({ text: "R9", layer: "B.SilkS" });
  });
});

describe("withoutRefdesLabels", () => {
  test("drops role-tagged and placeholder refdes text, keeps the rest", () => {
    const source = model([
      label({ id: "ref", role: "reference", text: "R6" }),
      label({ id: "ph", text: "REF**" }),
      label({ id: "val", role: "value", text: "1K" }),
    ]);

    expect(withoutRefdesLabels(source).labels.map((l) => l.id)).toEqual(["val"]);
  });

  test("returns the same object when there is nothing to drop", () => {
    const source = model([label({ id: "val", role: "value", text: "1K" })]);
    expect(withoutRefdesLabels(source)).toBe(source);
  });
});
