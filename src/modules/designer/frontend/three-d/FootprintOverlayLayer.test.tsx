import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import type { PcbPlacedPart } from "../../../../sdks";
import { FootprintOverlayLayer } from "./FootprintOverlayLayer";

const renderLayerMock = vi.hoisted(() => vi.fn(() => <group data-testid="mock-footprint-render-layer" />));

vi.mock("../../../../shared/frontend/canvas/scene", () => ({
  FootprintRenderLayer: renderLayerMock,
}));

function fixturePlacement(overrides: Partial<PcbPlacedPart> = {}): PcbPlacedPart {
  return {
    id: "placement-1",
    partId: "part-1",
    componentId: "component-1",
    reference: "U2",
    positionMm: { x: 10, y: 20 },
    rotationDeg: 90,
    mirrored: false,
    layer: "F.Cu",
    footprint: {
      footprintId: "footprint-1",
      name: "SOIC",
      mountType: "smd",
      sourceHash: null,
      preview: {
        kind: "footprint",
        units: "mm",
        name: "SOIC",
        pads: [
          {
            id: "pad-1",
            number: "1",
            centerMm: { x: -1, y: 0 },
            widthMm: 1.2,
            heightMm: 0.6,
            rotationDeg: 0,
            shape: "rect",
            layer: "F.Cu",
          },
        ],
        graphics: [],
        labels: [
          {
            id: "ref",
            text: "REF**",
            at: { x: 0, y: -2 },
            rotationDeg: 0,
            fontSizeMm: 1,
            anchorX: "center",
            anchorY: "middle",
            layer: "F.SilkS",
          },
          {
            id: "ref-by-role",
            text: "U9",
            at: { x: 0, y: 2 },
            rotationDeg: 0,
            fontSizeMm: 1,
            anchorX: "center",
            anchorY: "middle",
            layer: "B.SilkS",
            role: "reference",
          },
          {
            id: "value",
            text: "10k",
            at: { x: 0, y: 3 },
            rotationDeg: 0,
            fontSizeMm: 1,
            anchorX: "center",
            anchorY: "middle",
            layer: "F.SilkS",
            role: "value",
          },
        ],
        bounds: { minX: -2, minY: -2, maxX: 2, maxY: 2 },
        warnings: [],
      },
    },
    ...overrides,
  };
}

describe("FootprintOverlayLayer", () => {
  test("delegates to the shared PCB footprint renderer", () => {
    renderLayerMock.mockClear();

    const markup = renderToStaticMarkup(
      <FootprintOverlayLayer placements={[fixturePlacement()]} boardThicknessMm={1.6} />,
    );

    expect(markup).toContain("designer-3d-footprint-overlay-layer");
    expect(renderLayerMock).toHaveBeenCalledTimes(1);
    expect(renderLayerMock.mock.calls[0]?.[0]).toMatchObject({
      useLayerColors: true,
      surface: "pcb",
      placeholderSubstitutions: { reference: "U2" },
      // 3D board view must depth-test so silk (incl. refdes text) is occluded
      // by component bodies / pads instead of drawing always-on-top.
      enableDepthTest: true,
      hidePadNumbers: true,
    });
  });

  test("keeps every label when showLabels is not set", () => {
    renderLayerMock.mockClear();

    renderToStaticMarkup(
      <FootprintOverlayLayer placements={[fixturePlacement()]} boardThicknessMm={1.6} />,
    );

    expect(renderLayerMock.mock.calls[0]?.[0]).toMatchObject({
      model: {
        labels: [{ id: "ref" }, { id: "ref-by-role" }, { id: "value" }],
      },
    });
  });

  test("rebinds a role-tagged refdes label to the placement's own designator", () => {
    // `ref-by-role` carries "U9" — a literal baked in by whichever board
    // instance the footprint was ingested from. It must render as this
    // placement's reference ("U2"), not the shared footprint's leftover text.
    renderLayerMock.mockClear();

    renderToStaticMarkup(
      <FootprintOverlayLayer placements={[fixturePlacement()]} boardThicknessMm={1.6} />,
    );

    expect(renderLayerMock.mock.calls[0]?.[0]).toMatchObject({
      model: {
        labels: [
          // Untouched: the shared renderer substitutes the placeholder itself.
          { id: "ref", text: "REF**" },
          { id: "ref-by-role", text: "U2" },
          { id: "value", text: "10k" },
        ],
      },
    });
  });

  test("drops refdes text — placeholder and role-tagged, both sides — when showLabels is false", () => {
    renderLayerMock.mockClear();

    renderToStaticMarkup(
      <FootprintOverlayLayer
        placements={[fixturePlacement()]}
        boardThicknessMm={1.6}
        showLabels={false}
      />,
    );

    expect(renderLayerMock.mock.calls[0]?.[0]).toMatchObject({
      model: { labels: [{ id: "value" }] },
    });
  });

  test("keeps refdes silk upright on a 180°-rotated placement", () => {
    // The label transform composes the same way here as in 2D PcbScene, so a
    // 180° placement would silkscreen its designator upside-down without the
    // keep-upright pass. Value text has no such flag and must stay put.
    renderLayerMock.mockClear();

    renderToStaticMarkup(
      <FootprintOverlayLayer
        placements={[fixturePlacement({ rotationDeg: 180 })]}
        boardThicknessMm={1.6}
      />,
    );

    expect(renderLayerMock.mock.calls[0]?.[0]).toMatchObject({
      model: {
        labels: [
          { id: "ref", rotationDeg: 180 },
          { id: "ref-by-role", rotationDeg: 180 },
          { id: "value", rotationDeg: 0 },
        ],
      },
    });
  });

  test("leaves an unrotated placement's labels untouched", () => {
    renderLayerMock.mockClear();

    renderToStaticMarkup(
      <FootprintOverlayLayer
        placements={[fixturePlacement({ rotationDeg: 0 })]}
        boardThicknessMm={1.6}
      />,
    );

    expect(renderLayerMock.mock.calls[0]?.[0]).toMatchObject({
      model: {
        labels: [
          { id: "ref", rotationDeg: 0 },
          { id: "ref-by-role", rotationDeg: 0 },
          { id: "value", rotationDeg: 0 },
        ],
      },
    });
  });

  test("mirrored placements flip the label's contribution, not the rule", () => {
    // B.Cu negates X, so the glyph angle is placementRot − labelRot. With both
    // at 180 the text already reads upright and must NOT be flipped again.
    renderLayerMock.mockClear();

    const base = fixturePlacement();
    const preview = base.footprint.preview!;
    renderToStaticMarkup(
      <FootprintOverlayLayer
        placements={[
          {
            ...base,
            layer: "B.Cu",
            rotationDeg: 180,
            footprint: {
              ...base.footprint,
              preview: {
                ...preview,
                labels: preview.labels.map((l) => ({ ...l, rotationDeg: 180 })),
              },
            },
          },
        ]}
        boardThicknessMm={1.6}
      />,
    );

    expect(renderLayerMock.mock.calls[0]?.[0]).toMatchObject({
      model: {
        labels: [
          { id: "ref", rotationDeg: 180 },
          { id: "ref-by-role", rotationDeg: 180 },
          { id: "value", rotationDeg: 180 },
        ],
      },
    });
  });

  test("skips placements without footprint preview data", () => {
    renderLayerMock.mockClear();
    const placement = fixturePlacement({
      footprint: {
        ...fixturePlacement().footprint,
        preview: null,
      },
    });

    renderToStaticMarkup(
      <FootprintOverlayLayer placements={[placement]} boardThicknessMm={1.6} />,
    );

    expect(renderLayerMock).not.toHaveBeenCalled();
  });
});
