# Proposal — Reusable design blocks (hierarchical designs)

**Status: proposal. Not built, not scheduled, no owner.** This document exists to preserve the
design reasoning. It is not a task list, and nothing here is a commitment.

## Problem

Designers repeatedly rebuild the same sub-circuits — power supplies, MCU power and decoupling,
USB-C front ends, level shifters, op-amp filters. That is wasted time and a recurring defect
surface. There is no way to freeze a known-good circuit plus its layout once and reuse it as a
unit, and no way for a team to build an internal circuit library.

OpenPCB has no equivalent mechanism today: every design is flat and standalone, with no parent,
child or include relation between designs. The comparable features elsewhere are KiCad hierarchical
sheets, Altium device sheets and OrCAD blocks.

## Proposed approach

Take an entire OpenPCB design, publish it as a reusable **block**, then drop that block into another
design as a single boxed entity exposing only its declared I/O terminals. Internally the block holds
its full schematic and optionally its PCB sub-layout; externally, to the parent design, it looks and
behaves like a multi-pin component.

### Authoring

Some primitives in the source design are designated **block ports** — the terminals that become the
block's external pins. Each port carries a name, an electrical type (input / output / bidirectional
/ power / ground) and an optional side hint (left / right / top / bottom) for the generated symbol.
Structurally this is either a flag on the existing `net_portal` primitive or a new `block_port`
primitive kind.

A **Publish as Block** action prompts for name, version label, description, optional tags and the
set of ports to expose, then produces an immutable snapshot bundle: the schematic ECS subset,
optionally the PCB sub-layout (placements, traces and vias relative to a block origin), an
auto-generated **block symbol** (a rectangle with one pin per port, laid out by side hint and sort
order), and optionally an auto-generated **block footprint** (the bounding box of the contained PCB).

The bundle persists as a block row plus a version-keyed snapshot row.

### Placement

The block appears in the component picker beside library components with a distinguishing indicator.
Placing it creates an instance referencing `blockId + blockVersion`. On the schematic it renders as
its generated symbol box; only port pins are externally connectable, and all internal nets stay
isolated from the parent's net extraction. On the PCB, the contained footprints are either flattened
into the parent and group-tagged, or placed as a sub-region with a locked relative layout that moves
and rotates as a unit — see open question 3.

### Net stitching

Each port appears to the parent's net extraction as a pin owned by the block instance. Internal net
names never leak into the parent; parent nets connect only at port pins.

### Versioning

Each instance pins a `blockVersion`. Re-publishing the source design creates a new snapshot but does
not retroactively change existing instances. The instance inspector shows the pinned version, the
latest available version, and an explicit "Update to vN" action. **Updates are user-initiated only,
never silent.** Update remaps port pin IDs by name and type.

Unpublishing is a soft delete: existing instances remain readable from their snapshot, but the block
disappears from the picker.

### Editing inside a block

Out of scope for a first version. To change a block you open the source design, edit it and
re-publish.

## Surfaces this would touch

Designer backend schema and a blocks migration; new commands for publish, place, update and
unpublish; `projection-read.ts` to include port pins; the PCB sync path for the flatten-versus-
sub-region behaviour; a block-instance inspector panel and a publish dialog on the frontend; a
symbol generator under `src/shared/rendering/blocks/`; and new `BlockDefinition` / `BlockInstance` /
`BlockPort` / `BlockSnapshot` types in the designer SDK.

Verification would centre on a publish → place → wire → undo → redo round trip, version pinning and
update remapping, port net stitching, and an end-to-end build-a-regulator → publish → place → wire →
save → reopen scenario. A PCB regression would assert that the flattened footprint count matches the
source and that group selection round-trips.

## Open questions

1. **Link versus snapshot semantics** — frozen copy, live link, or pinned version with manual
   update? Pinned plus manual update is the recommendation.
2. **Scope** — schematic-only in a first version, or PCB sub-layout too?
3. **PCB strategy** — flatten footprints into the parent, or keep a sub-region with a locked
   relative layout?
4. **Storage ownership** — library-module-owned (as a component `kind`), or designer-owned?
5. **Port UI** — a new `block_port` primitive kind, or an `exported` flag on `net_portal`?
6. **Nesting** — allow blocks inside blocks, or flat-only to start?
7. **Symbol glyph** — auto-generated rectangle only, or user-drawn custom symbols?
8. **Cross-project reuse** — importable across `.openpcb` files when that format lands, or
   local-database only for now?

## Relations

- A parametric component (see `f2-parametric-components.md`) has a different lifecycle from a block;
  modelling a block as a parametric component is probably wrong, but worth confirming.
- KiCad hierarchical sheets currently flatten on import (see `f3-kicad-project-import.md`).
  Preserving them as blocks is the obvious upgrade path if this proposal is ever built.
