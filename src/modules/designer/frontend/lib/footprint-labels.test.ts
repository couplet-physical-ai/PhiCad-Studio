import { describe, expect, test } from "vitest";
import {
  isRefdesLabel,
  uprightLabelRotationDeg,
  withPlacementReference,
  withUprightRefdesLabels,
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

/**
 * The renderers nest the label inside the placement group, so the glyph's
 * world-space baseline angle is `placementRot ± labelRot` (minus when the
 * placement is mirrored). Text reads upright while that lands in (-90, 90].
 */
function effectiveGlyphAngle(
  labelRotationDeg: number,
  placementRotationDeg: number,
  mirrored: boolean,
): number {
  const raw =
    placementRotationDeg + (mirrored ? -labelRotationDeg : labelRotationDeg);
  return ((raw % 360) + 360) % 360;
}

function isUpright(angle: number): boolean {
  return angle <= 90 || angle > 270;
}

describe("uprightLabelRotationDeg", () => {
  const placementRotations = [0, 90, 180, 270];
  const labelRotations = [0, 90];

  for (const mirrored of [false, true]) {
    for (const placementRot of placementRotations) {
      for (const labelRot of labelRotations) {
        test(`placement ${placementRot}° × label ${labelRot}°${
          mirrored ? " (mirrored)" : ""
        } reads upright`, () => {
          const corrected = uprightLabelRotationDeg(
            labelRot,
            placementRot,
            mirrored,
          );
          expect(
            isUpright(effectiveGlyphAngle(corrected, placementRot, mirrored)),
          ).toBe(true);
        });
      }
    }
  }

  test("only ever adds 180 — never invents a new angle", () => {
    for (const placementRot of [0, 45, 90, 135, 180, 225, 270, 315]) {
      for (const labelRot of [0, 90, 270]) {
        const corrected = uprightLabelRotationDeg(labelRot, placementRot, false);
        expect([labelRot, labelRot + 180]).toContain(corrected);
      }
    }
  });

  test("leaves the already-upright cases untouched", () => {
    expect(uprightLabelRotationDeg(0, 0, false)).toBe(0);
    expect(uprightLabelRotationDeg(90, 0, false)).toBe(90); // vertical: KiCad keeps 90
    expect(uprightLabelRotationDeg(0, 90, false)).toBe(0);
    expect(uprightLabelRotationDeg(0, -45, false)).toBe(0);
  });

  test("flips the upside-down band, matching KiCad's (-90, 90] normalization", () => {
    expect(uprightLabelRotationDeg(0, 180, false)).toBe(180);
    expect(uprightLabelRotationDeg(0, 270, false)).toBe(180);
    expect(uprightLabelRotationDeg(90, 90, false)).toBe(270);
    expect(uprightLabelRotationDeg(0, 91, false)).toBe(180);
  });

  test("mirrored placements flip the sign of the label's contribution", () => {
    // Unmirrored: 90 + 90 = 180 → upside-down, needs the flip.
    expect(uprightLabelRotationDeg(90, 90, false)).toBe(270);
    // Mirrored: 90 - 90 = 0 → already upright, must NOT flip.
    expect(uprightLabelRotationDeg(90, 90, true)).toBe(90);
    // And the converse pair.
    expect(uprightLabelRotationDeg(90, 270, false)).toBe(90);
    expect(uprightLabelRotationDeg(90, 270, true)).toBe(270);
  });

  test("normalizes negative and >360 placement rotations", () => {
    expect(uprightLabelRotationDeg(0, -180, false)).toBe(180);
    expect(uprightLabelRotationDeg(0, 540, false)).toBe(180);
  });
});

describe("withUprightRefdesLabels", () => {
  test("uprights role-tagged and placeholder refdes text", () => {
    const source = model([
      label({ id: "ref", role: "reference", text: "R1", rotationDeg: 0 }),
      label({ id: "ph", text: "REF**", rotationDeg: 0 }),
    ]);

    const out = withUprightRefdesLabels(source, 180, false);

    expect(out.labels.map((l) => l.rotationDeg)).toEqual([180, 180]);
  });

  test("leaves value / user silk alone — no keep-upright flag for it", () => {
    const source = model([
      label({ id: "ref", role: "reference", text: "R1", rotationDeg: 0 }),
      label({ id: "val", role: "value", text: "1K", rotationDeg: 0 }),
      label({ id: "usr", role: "footprint-text", text: "TP", rotationDeg: 0 }),
    ]);

    const out = withUprightRefdesLabels(source, 180, false);

    expect(out.labels.map((l) => l.rotationDeg)).toEqual([180, 0, 0]);
  });

  test("returns the same object when nothing changes (memo identity)", () => {
    const upright = model([
      label({ id: "ref", role: "reference", text: "R1", rotationDeg: 0 }),
    ]);
    expect(withUprightRefdesLabels(upright, 0, false)).toBe(upright);
    expect(withUprightRefdesLabels(upright, 90, false)).toBe(upright);

    const noRefdes = model([label({ id: "val", role: "value", text: "1K" })]);
    expect(withUprightRefdesLabels(noRefdes, 180, false)).toBe(noRefdes);

    const empty = model([]);
    expect(withUprightRefdesLabels(empty, 180, false)).toBe(empty);
  });

  test("copies instead of mutating the shared model", () => {
    const source = model([
      label({ id: "ref", role: "reference", text: "R1", rotationDeg: 0 }),
    ]);

    withUprightRefdesLabels(source, 180, false);

    expect(source.labels[0]?.rotationDeg).toBe(0);
  });

  test("preserves every other label field", () => {
    const source = model([
      label({
        id: "ref",
        role: "reference",
        text: "R1",
        rotationDeg: 0,
        at: { x: 1.5, y: -2 },
        layer: "B.SilkS",
        fontSizeMm: 0.6,
      }),
    ]);

    expect(withUprightRefdesLabels(source, 180, false).labels[0]).toEqual({
      ...source.labels[0],
      rotationDeg: 180,
    });
  });

  test("composes with withPlacementReference without losing either fix", () => {
    const shared = model([
      label({ id: "ref", role: "reference", text: "R6", rotationDeg: 0 }),
    ]);

    const out = withUprightRefdesLabels(
      withPlacementReference(shared, "R1"),
      180,
      false,
    );

    expect(out.labels[0]).toMatchObject({ text: "R1", rotationDeg: 180 });
  });
});
