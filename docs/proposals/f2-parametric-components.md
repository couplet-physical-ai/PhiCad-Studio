# Proposal — Parametric components

**Status: proposal. Not built, not scheduled, no owner.** This document exists to preserve the
design reasoning. It is not a task list, and nothing here is a commitment.

## Problem

Connector libraries balloon with near-identical entries — the same pin geometry, only the counts
differ. `Pin Header 01x04`, `01x06`, `02x10`, `02x20`, screw terminals, mounting-hole arrays, DIP
sockets and edge connectors are all variations on a handful of shapes. This wastes storage, clogs
search and forces users to hunt for the exact variant they need.

It is also a genuine differentiator. KiCad has no real templated components; the workaround there is
custom scripting.

## Proposed approach

Define a component as **a typed parameter schema plus a deterministic generator function**, rather
than a frozen symbol-and-footprint pair. The user picks a template — say **Pin Header** — supplies
parameters (rows = 2, pins per row = 10, pitch = 2.54 mm, mount type = THT, orientation = vertical),
and the system materialises a concrete library component on demand.

This is a generalisation of a pattern already proven in the codebase: the library module ships an
IPC-7351B generator covering Chip, SOT, SOIC, QFP and QFN families parameterised by size and density.

### Templates

Each template declares a parameter schema — a subset of JSON Schema covering int, float, enum and
bool with bounds and defaults — and registers a generator factory under
`src/shared/rendering/parametric/`. Templates seed the same way IPC-7351B presets and built-in
resistors and capacitors do today, through idempotent boot-time seeding.

Suggested first templates: **pin header**, **screw terminal**, **mounting hole array**. Those three
absorb the majority of the redundant library entries.

### Materialisation

1. The user picks a template in the library picker.
2. A parameter dialog opens, auto-rendered from the template's schema.
3. On submit the backend hashes the parameter set and looks up a materialisation table. On a cache
   hit it reuses the existing component row. On a miss it runs the generator — producing a symbol
   detail, a footprint detail, an auto-name, auto-tags and a package code — inserts the symbol,
   footprint and component rows, records the materialisation and returns the new component id.
4. From that point the materialised component is an ordinary library component, placed through the
   existing `place-part` command. **No designer changes are needed.**

That last property is what makes the feature cheap: the whole thing lives in the library module and
the designer never learns about templates.

### Naming and tags

The auto-name composes from template plus parameters — `Pin Header 02x10 2.54mm THT Vertical` — and
auto-tags feed the existing tag search (`#connector`, `#pinheader`, `#tht`, `#2.54mm`, `#02x10`).

### Edit after place

A placed part stores its `templateId` and parameter JSON, so the inspector can offer "Edit
parameters", which re-runs the generator and swaps the snapshot on the placement — optionally
creating a new materialised component rather than mutating the existing one.

### Generator versioning

Each materialisation records the generator version. When the generator is bumped, existing instances
keep their frozen output until the user explicitly re-materialises. This mirrors the block-versioning
approach in `f1-design-blocks.md`.

## Surfaces this would touch

A library-module migration for templates and materialisations; library schema, queries and routes
(list templates, template detail with schema, materialise); built-in template registrations; the
parametric registry, parameter-schema validator and per-kind generators under
`src/shared/rendering/parametric/`; a parametric picker dialog and a generic parameter-schema form
renderer on the frontend; an "Edit parameters" action in the designer part inspector; and
`LibraryTemplate` / `LibraryParamSchema` / materialise request and response types in the library SDK.

Verification would rest on deterministic snapshot tests of generator output across a representative
parameter matrix, cache-behaviour tests (same parameters yield the same component id, different
parameters yield distinct ones), parameter validation rejecting out-of-range values, an end-to-end
placement asserting a 2×10 header produces 20 pins and 20 pads, and visual regression on thumbnails.

## Open questions

1. **Which templates ship first?** Pin header, screw terminal and mounting-hole array is the
   recommendation.
2. **3D models** — generate procedurally at materialise time, or accept "no 3D" with a placeholder?
3. **Caching policy** — persist materialisations forever, garbage-collect unused ones, or generate
   on demand without persisting at all?
4. **User-defined templates** — built-ins only, or expose authoring? Authoring needs either a DSL or
   sandboxed JS, which is a much larger commitment.
5. **Migrate existing built-ins** — fold resistor and capacitor variants into a parametric template,
   leave them as variants, or both?
6. **Symbol versus footprint parameterisation** — clarify the boundary against the existing
   component-footprints join table. Variants there mean one symbol with several fixed footprints;
   parametric means both symbol and footprint vary with parameters. These should not blur.
7. **Place-time UX** — a modal dialog before placement, or place with defaults and edit in place?
8. **Relation to design blocks** — should a block be modelled as a parametric component? Probably
   not; the lifecycles differ. Worth confirming rather than assuming.
