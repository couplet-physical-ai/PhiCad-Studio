# Proposal — Full KiCad project import

**Status: proposal. Not built, not scheduled, no owner.** This document exists to preserve the
design reasoning. It is not a task list, and nothing here is a commitment.

## Problem

OpenPCB imports KiCad **library** files today — `.kicad_sym`, `.kicad_mod` and ZIP bundles of those.
It does not consume project files at all. Anyone with an existing KiCad project therefore cannot try
OpenPCB on real work without rebuilding the design from scratch. That is the single largest adoption
barrier.

Two things make it tractable. The library module already proves out the s-expression parsing
pipeline and the ZIP plus STEP→GLB ingestion path. And KiCad's data model is close enough to
OpenPCB's — refdes-keyed parts, footprint instances carrying `lib_id`, standard layer names already
aligned with `PcbCopperLayerId` — that direct mapping is feasible rather than speculative.

## Proposed approach

Consume an entire KiCad project — project settings, one or more schematic sheets, the board file,
referenced footprints and 3D models — and produce **one OpenPCB design** containing all parts, wires,
labels, primitives, PCB placements, traces and vias, with any missing components automatically
ingested into the OpenPCB library as part of the same operation.

Input is either a ZIP archive containing a KiCad project directory, or on Electron a directory path
chosen through the native file picker.

### Two-phase pipeline

The pipeline mirrors the library module's existing `inspect → commit` shape.

**Phase A — inspect.** Parse the project file (JSON: metadata, layer stackup, net classes, custom
rules), each schematic sheet (s-expression: symbol instances, wires, labels, junctions, hierarchical
sheet references, power symbols, no-connects) and the board file (s-expression: footprint placements
with refdes and `lib_id`, segments and arcs, vias, zones, nets, Edge.Cuts board outline polygons,
drill data). Produce a **candidate report**: components found with their existing-or-missing status
against the OpenPCB library, sheet count, layer count, total net count, board dimensions, warnings
for unsupported features, and a dropped-data summary.

**Phase B — commit**, in a single transaction. Create the design with imported metadata and board
settings (layer count from the stackup, dimensions from the Edge.Cuts bounds). For every referenced
`lib_id`, reuse a library match on `(libraryName, partName)`, or otherwise extract from the
project's resolved library tables and ingest through the existing KiCad commit path, tagging
provenance. Insert the schematic entities, then the PCB entities matched to schematic parts by
refdes. Map KiCad net names onto OpenPCB's derived nets, preserving names as label primitives, and
warn when KiCad's declared net count disagrees with the derived count. Queue STEP→GLB conversions
through the existing background worker. Seed a synthetic import command in the command log so the
entire import is a single undo step.

**Transactional safety is the load-bearing property.** The whole commit sits in one transaction: any
failure rolls back the design, the library inserts and the command-log entry. There is never a
partial design.

### Mapping

| KiCad | OpenPCB |
| --- | --- |
| project file | new design head plus board settings |
| schematic `symbol` | schematic part plus snapshot |
| schematic `wire` | schematic wire (Manhattan-normalised; warn on diagonals) |
| schematic `label` / `global_label` | schematic label |
| schematic `power` | schematic primitive, kind `gnd` or `pwr` |
| hierarchical sheet | flattened to one sheet; revisit with design blocks |
| board `footprint` | PCB placement plus library footprint snapshot |
| board `segment` | PCB trace (single segment) |
| board `via` | PCB via |
| board `zone` | **dropped with a warning** — zones are backlog |
| board net | mapped 1:1, KiCad name preserved as a label |
| Edge.Cuts polygons | board outline (bounding box first, full polygons later) |
| net classes | PCB net classes; unknown rules dropped with a warning |
| 3D model references | footprint models, async STEP→GLB |

### UI

The home screen gains an "Import KiCad Project" entry beside "Create New Design". The wizard runs
file picker → inspect report (component list with reuse/ingest status, warnings, dropped data) →
confirm → progress (parsing, ingesting library, placing, converting) → open the imported design.
Long-running progress is backed by the Tasks module over SSE, which fits the existing async-task
pattern.

## Surfaces this would touch

Three new KiCad parsers (project, schematic, board) alongside the existing s-expression parser in
the library module; an inspect-and-commit pair plus a mapping module in the designer backend; two
new designer routes; a synthetic `import-kicad-project` command for single-step undo; reuse of the
library's KiCad ZIP commit path for embedded libraries; an import wizard component and a home-screen
entry point; and inspect-report and commit-request types in the designer SDK.

Verification would rest on parser fixtures with golden ECS output per file kind, a net-count
preservation assertion, stackup detection across 2- and 4-layer projects, hierarchical flattening, a
missing-component library ingestion case, and a round-trip end-to-end import of a real open-source
KiCad project.

## Open questions

1. **Zones** — skip with a warning, preserve as inert geometry, or block the import until zones are
   supported? Skip plus warning is the recommendation.
2. **Hierarchical sheets** — flatten on import, preserve as design blocks (see
   `f1-design-blocks.md`), or store as separate sheet entities?
3. **Custom KiCad pad shapes** — chamfered rounded rectangles, polygon pads: map to the closest
   supported shape with a warning, or refuse?
4. **3D model resolution** — require bundled models, apply path heuristics, or accept "no 3D"?
5. **Net class fidelity** — drop unknown rules (differential-pair gap, microvia, uvia) with a
   warning, or refuse the import?
6. **Re-import collisions** — always create a new design, or detect and offer a merge? Always-new is
   the recommendation.
7. **Schematic and PCB correlation** — import the schematic first and merge PCB footprints by
   refdes, or treat the two as independent?
8. **Round-trip** — scope to import only, or design with eventual export back to KiCad in mind?
9. **KiCad version target** — v8 only, or v6/v7/v8 multi-version support? v7 and later is the
   recommendation.
10. **Library deduplication** — when an identical component arrives from two different KiCad
    projects, merge by hash or keep per-project copies?
