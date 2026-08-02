/**
 * KiCad project importer: the shared library footprint synthesized from a
 * *board* `(footprint …)` instance must not carry that instance's literal
 * designator. Regression guard for "every R_0201 placement silkscreens R6".
 */

import { describe, expect, test } from "bun:test";
import {
  buildFootprintRawMap,
  synthesizeFootprintContent,
} from "../../../modules/designer/backend/import/kicad-project/ingest-library";

function footprintNodeFrom(pcbSource: string, libId: string) {
  const node = buildFootprintRawMap(pcbSource).get(libId);
  if (!node) throw new Error(`fixture has no footprint '${libId}'`);
  return node;
}

const PCB_KICAD8 = `
(kicad_pcb (version 20231120) (generator pcbnew)
  (footprint "Resistor_SMD:R_0201_0603Metric" (layer "F.Cu") (at 25 20 0)
    (property "Reference" "R6" (at 0 -1.2 90) (layer "F.SilkS") (uuid "u-ref")
      (effects (font (size 0.5 0.5) (thickness 0.08))))
    (property "Value" "10k" (at 0 1.2 0) (layer "F.Fab"))
    (pad "1" smd rect (at -0.45 0 0) (size 0.5 0.6) (layers "F.Cu"))
  )
  (footprint "Resistor_SMD:R_0201_0603Metric" (layer "F.Cu") (at 30 20 0)
    (property "Reference" "R7" (at 0 -1.2 90) (layer "F.SilkS"))
  )
)`.trim();

const PCB_LEGACY = `
(kicad_pcb (version 20211014) (generator pcbnew)
  (footprint "Capacitor_SMD:C_0402" (layer "F.Cu") (at 10 10 0)
    (fp_text reference "C3" (at 0 -1 0) (layer "F.SilkS")
      (effects (font (size 1 1) (thickness 0.15))))
    (fp_text value "100n" (at 0 1 0) (layer "F.Fab"))
  )
)`.trim();

describe("synthesizeFootprintContent", () => {
  test("rewrites a KiCad 8 Reference property to the REF** placeholder", () => {
    const out = synthesizeFootprintContent(
      footprintNodeFrom(PCB_KICAD8, "Resistor_SMD:R_0201_0603Metric"),
    );

    expect(out).toContain("(property Reference REF** ");
    expect(out).not.toContain("R6");
  });

  test("rewrites the legacy fp_text reference form too", () => {
    const out = synthesizeFootprintContent(
      footprintNodeFrom(PCB_LEGACY, "Capacitor_SMD:C_0402"),
    );

    expect(out).toContain("(fp_text reference REF** ");
    expect(out).not.toContain("C3");
  });

  test("preserves position, layer and effects of the reference node", () => {
    const out = synthesizeFootprintContent(
      footprintNodeFrom(PCB_KICAD8, "Resistor_SMD:R_0201_0603Metric"),
    );

    expect(out).toContain("(at 0 -1.2 90)");
    expect(out).toContain("(layer F.SilkS)");
    expect(out).toContain("(uuid u-ref)");
    expect(out).toContain("(effects (font (size 0.5 0.5) (thickness 0.08)))");
  });

  test("leaves Value and pads untouched", () => {
    const out = synthesizeFootprintContent(
      footprintNodeFrom(PCB_KICAD8, "Resistor_SMD:R_0201_0603Metric"),
    );

    expect(out).toContain("(property Value 10k ");
    expect(out).toContain("(pad 1 smd rect");
  });

  test("does not mutate the source node — the raw map stays reusable", () => {
    const map = buildFootprintRawMap(PCB_KICAD8);
    const node = map.get("Resistor_SMD:R_0201_0603Metric");
    if (!node) throw new Error("fixture missing");

    synthesizeFootprintContent(node);

    expect(JSON.stringify(node)).toContain("R6");
  });

  test("is a no-op when the board block already carries the placeholder", () => {
    const source = `
(kicad_pcb (version 20231120)
  (footprint "Lib:Part" (layer "F.Cu")
    (property "Reference" "REF**" (at 0 0 0)))
)`.trim();
    const node = footprintNodeFrom(source, "Lib:Part");

    expect(synthesizeFootprintContent(node)).toContain(
      "(property Reference REF** ",
    );
  });

  test("only the first board instance is kept, and it is normalized", () => {
    // buildFootprintRawMap keeps the FIRST instance per lib_id — that is
    // exactly why the literal used to leak. Assert the leak is closed.
    const map = buildFootprintRawMap(PCB_KICAD8);
    expect(map.size).toBe(1);
    const out = synthesizeFootprintContent(
      map.get("Resistor_SMD:R_0201_0603Metric")!,
    );
    expect(out).not.toContain("R6");
    expect(out).not.toContain("R7");
  });
});
