/**
 * Reference-designator semantics for footprint preview models.
 *
 * A footprint preview model is shared by every placement that uses that
 * library footprint, so the *text* of its reference label is never authoritative
 * — `PcbPlacedPart.reference` is. KiCad footprints normally carry the
 * `${REFERENCE}` / `REF**` placeholder, which the shared `FootprintRenderLayer`
 * rewrites via `placeholderSubstitutions`. But a footprint ingested from a
 * *board* (a `.kicad_pcb` `(footprint …)` instance, as the KiCad project
 * importer synthesizes in `import/kicad-project/ingest-library.ts`) carries the
 * literal designator of whichever instance was ingested first — e.g. every
 * `Resistor_SMD:R_0201_0603Metric` placement ends up silkscreened "R6".
 * Token substitution cannot repair that, because there is no token left.
 *
 * `withPlacementReference` closes the gap on the OpenPCB side: it rewrites
 * role-tagged reference labels to the placement's own designator before the
 * model reaches the shared renderer. Both helpers copy the model instead of
 * mutating it and return the input unchanged when nothing needs rewriting, so
 * React memo identity is preserved on the common path.
 */
import type { PcbPlacedPart } from "../../../../sdks";

export type FootprintPreviewModel = NonNullable<
  PcbPlacedPart["footprint"]["preview"]
>;
export type FootprintPreviewLabel = FootprintPreviewModel["labels"][number];

// KiCad reference placeholders. The parser normalizes `${REFERENCE}` → `REF**`,
// but older/fallback parse paths keep the raw token, so match both. Needed
// because the fallback path tags every text as role "footprint-text".
const REFERENCE_PLACEHOLDER_RE = /\$\{REFERENCE\}|REF\*\*/;

export function isRefdesLabel(label: FootprintPreviewLabel): boolean {
  if (label.role === "reference") return true;
  return REFERENCE_PLACEHOLDER_RE.test(label.text);
}

/**
 * Strip reference-designator text from a footprint preview. Used by the
 * 3D board view's "Refdes labels" toggle — bottom-side silk renders the
 * designator mirrored (real fab behaviour), so hiding it is the honest way
 * to get a clean board shot. Value / user silk text is left alone.
 */
export function withoutRefdesLabels(
  model: FootprintPreviewModel,
): FootprintPreviewModel {
  const labels = model.labels.filter((label) => !isRefdesLabel(label));
  if (labels.length === model.labels.length) return model;
  return { ...model, labels };
}

/**
 * Rewrite role-tagged reference labels to `reference`, the designator of the
 * placement being rendered. Placeholder-only labels (`REF**`) are left for the
 * shared renderer's `placeholderSubstitutions` to resolve — it already handles
 * them, and it also covers the `role`-less fallback parse path.
 */
export function withPlacementReference(
  model: FootprintPreviewModel,
  reference: string,
): FootprintPreviewModel {
  if (reference.length === 0) return model;
  let changed = false;
  const labels = model.labels.map((label) => {
    if (label.role !== "reference" || label.text === reference) return label;
    changed = true;
    return { ...label, text: reference };
  });
  return changed ? { ...model, labels } : model;
}
