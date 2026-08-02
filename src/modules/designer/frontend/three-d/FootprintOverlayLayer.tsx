import { type ReactElement } from "react";
import type { PcbPlacedPart } from "../../../../sdks";
import { FootprintRenderLayer } from "../../../../shared/frontend/canvas/scene";
import {
  withPlacementReference,
  withUprightRefdesLabels,
  withoutRefdesLabels,
} from "../lib/footprint-labels";
import { getPlacementTransformProps } from "./transform-helpers";

const PCB_HIDDEN_LAYERS: ReadonlySet<string> = new Set([
  "F.Fab",
  "B.Fab",
  "F.Fabrication",
  "B.Fabrication",
]);
// Silkscreen / refdes sit just ABOVE the soldermask + copper traces (≈0.04mm)
// but just BELOW the exposed pad surface (`PAD_SURFACE_Z_MM` = 0.05mm in
// CopperPads). The pads render opaque and write depth, so placing silk beneath
// them lets the gold pad occlude any silk that overlaps it — matching real fab,
// where silkscreen is clipped out of soldermask openings — while silk between
// and around pads still shows. Avoids costly per-pad boolean clipping.
const FOOTPRINT_OVERLAY_Z_OFFSET_MM = 0.045;

// Pad copper is rendered by `CopperPads` (so through-hole pads can be annular
// and see-through). The shared layer can't hide pads via `hiddenLayers`, but
// `PadInstances` goes transparent when its opacity (= max of pad-layer
// opacities) drops below 1 — so force copper layers to 0 to suppress its pads
// while silkscreen / refdes labels (non-copper) stay fully opaque.
const COPPER_LAYERS_3D: ReadonlySet<string> = new Set([
  "F.Cu",
  "B.Cu",
  "In1.Cu",
  "In2.Cu",
]);
const hideCopperPadOpacity = (layer: string): number =>
  COPPER_LAYERS_3D.has(layer) ? 0 : 1;

function FootprintOverlay({
  placement,
  boardThicknessMm,
  showLabels,
}: {
  placement: PcbPlacedPart;
  boardThicknessMm: number;
  showLabels: boolean;
}): ReactElement | null {
  const preview = placement.footprint.preview;
  if (!preview) return null;

  const transform = getPlacementTransformProps(placement, boardThicknessMm);
  // Keep-upright applies here too: `getPlacementTransformProps` produces the
  // SAME label-affecting math as the 2D `PlacementRender` group — Z-rotation
  // of `placement.rotationDeg` plus an X scale of −1 for mirrored/B.Cu — and
  // the shared `FootprintRenderLayer` nests each label's own Z-rotation inside
  // it identically. Only the Z translation differs (board thickness), which
  // cannot change a glyph's orientation. Diverging here would reintroduce the
  // 2D/3D refdes mismatch f8cb114 closed.
  const model = showLabels
    ? withUprightRefdesLabels(
        withPlacementReference(preview, placement.reference),
        placement.rotationDeg,
        transform.scale[0] === -1,
      )
    : withoutRefdesLabels(preview);

  const zOffset =
    placement.layer === "B.Cu"
      ? -FOOTPRINT_OVERLAY_Z_OFFSET_MM
      : FOOTPRINT_OVERLAY_Z_OFFSET_MM;

  return (
    <group
      data-testid="designer-3d-footprint-overlay"
      position={[
        transform.position[0],
        transform.position[1],
        transform.position[2] + zOffset,
      ]}
      rotation={transform.rotation}
      scale={transform.scale}
    >
      <FootprintRenderLayer
        model={model}
        useLayerColors
        surface="pcb"
        hiddenLayers={PCB_HIDDEN_LAYERS}
        layerOpacity={hideCopperPadOpacity}
        placeholderSubstitutions={{ reference: placement.reference }}
        enableDepthTest
        hidePadNumbers
      />
    </group>
  );
}

export function FootprintOverlayLayer({
  placements,
  boardThicknessMm,
  showLabels = true,
}: {
  placements: readonly PcbPlacedPart[];
  boardThicknessMm: number;
  /** When false, reference-designator text is omitted on BOTH board sides. */
  showLabels?: boolean;
}): ReactElement | null {
  if (placements.length === 0) return null;

  return (
    <group data-testid="designer-3d-footprint-overlay-layer">
      {placements.map((placement) => (
        <FootprintOverlay
          key={placement.id}
          placement={placement}
          boardThicknessMm={boardThicknessMm}
          showLabels={showLabels}
        />
      ))}
    </group>
  );
}
