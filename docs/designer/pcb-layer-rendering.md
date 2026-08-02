# PCB layer rendering — rules

> This is a rules document, not a description of any current directory. The specification it was
> salvaged from described a file layout and a capability matrix that never existed; both have been
> dropped. What follows is the durable set of rendering rules, which are independent of where the
> renderer lives.

---

## Visual reference — `layer-reference/`

The rules in §1 (z-order) and §2 (two toggles per copper layer) are visual rules, and prose is a
poor medium for them. [`layer-reference/`](layer-reference/) holds 27 PNG captures of the PCB
layer renderer, each taken at a named combination of visible layers. Use it as the reference for
what a correct composite looks like, and as the before/after set when changing z-order,
visibility or the palette.

**Naming convention.** The filename *is* the state: a canvas prefix, then the set of layers that
were visible, joined by underscores. The order of the tokens is not meaningful — it records a
set, not a stack.

| Filename shape | Meaning |
|---|---|
| `PCB_<Layer>_<Layer>_….png` | The PCB canvas with exactly these layers visible and no others |
| `PCB_DefaultView.png` | The PCB canvas in its default layer-panel state |
| `PCB_No_layer_shown.png` | Every toggleable layer off |
| `PCB_<Layer>_only.png` | A single layer isolated — e.g. `PCB_DrillHoles_only.png` |
| `Schematic_reference.png` | The schematic canvas, for side-by-side comparison; not a PCB layer state |

Layer tokens are the layer-panel labels with spaces removed — `TopCopper`, `TopCopperFill`,
`DrillHoles`, `BoardBorder`, `Metadata` — so
`PCB_TopCopper_TopCopperFill_DrillHoles_BoardBorder_Metadata.png` is top-copper objects plus the
top-copper pour plus drill rings plus the board edge plus editor annotations, and nothing else.
Note that `TopCopper` and `TopCopperFill` appear as separate tokens: that is §2's two-toggles
rule made visible, and the pair of shots with and without `…Fill` is the evidence for why the
fill toggle has to exist.

Two rules are best checked against specific shots rather than read:

- `PCB_No_layer_shown.png` is the test of §5's always-on set. Grid, origin axes and the board
  silhouette must still be there; if the frame is empty, the silhouette has been wired to a
  layer toggle it does not belong to.
- `PCB_DrillHoles_only.png` and any shot combining drill with copper are the test of §1's
  deliberate departure: drill rings paint above copper, not under it.

The shot names use `BoardBorder` where §5 and §7 of this document say **Board Outline**. The
screenshots are the older naming; the names in §7 govern what the user reads.

---

## 1. Z-order

The canvas paints back to front. The ordering encodes three ideas: bottom-side artwork sits below
top-side artwork, each side's layers stack in physical order, and editor annotations sit above
everything physical.

| z | Layer |
|---|---|
| 0 | Canvas background and grid |
| 1 | Origin axis lines |
| 2 | Board silhouette and Board Outline stroke |
| 10 | Bottom Copper fill |
| 11 | Bottom Copper objects |
| 12 | Bottom Solder Mask |
| 13 | Bottom Solder Paste |
| 14 | Bottom Overlay (mirrored) |
| 20 | Mid-Layer 2 fill |
| 21 | Mid-Layer 2 objects |
| 22 | Mid-Layer 1 fill |
| 23 | Mid-Layer 1 objects |
| 30 | Top Copper fill |
| 31 | Top Copper objects |
| 32 | Top Solder Mask |
| 33 | Top Solder Paste |
| 34 | Top Overlay |
| 40 | Drill Holes |
| 50 | Metadata text |
| 90 | DRC markers, selection, hover |

**Within one side the order is copper fill < copper objects < mask < paste < overlay.** This
mirrors the physical stack-up: copper sits under the mask lacquer, which sits under the stencil
paste deposit, which sits under the printed silk. Getting this order right is what makes a
composite view look like a board rather than a pile of shapes.

Three deliberate departures from physical truth:

- **Drill holes render above every physical layer.** Physically a drill passes *through* copper,
  but in an editor the user needs to see hole positions unambiguously, so drill rings paint on top
  of pads rather than being occluded by them. Drill rings stay visible regardless of which copper
  layers are on.
- **Metadata sits above everything except live UI.** Editor labels must always be readable.
- **Mid-layer ordering is editor convention, not physics.** You cannot see inner layers on a real
  board. Any stable order works; the point is that it does not change between sessions.

### Side-mode flip

Switching the view from top-down to bottom-up **reverses z-order for physical layers only**.
Bottom-side artwork ends up on top. Annotation layers — metadata, drill holes, board outline — do
not move. The mirroring rule (§4) is re-applied in the new orientation, so top-side text becomes
the mirrored side.

---

## 2. Two toggles per copper layer

Every copper layer renders two independent things, and each needs its own visibility toggle:

| Toggle | Shows | In the user's words |
|---|---|---|
| Objects | Traces, pads and vias as drawn | "the lines I routed" |
| Fill | The flooded zone on this layer, with clearance halos | "the plane that wraps around them" |

Hiding *objects* alone is meaningless — you lose all context. Hiding *fill* alone is essential,
because a copper pour visually drowns the traces underneath it, and turning the pour off is how
anyone inspects routing on a poured layer.

Non-copper layers get one toggle.

---

## 3. Copper pour is negative artwork

The rule, in one sentence:

> A copper pour is a **net-tagged polygon** rendered as a solid fill, with **clearance halos
> subtracted** around every overlapping copper object on a **different** net.

Expanded to the four cases the renderer must handle:

1. Flood the enclosed pour polygon in the layer colour.
2. For each copper object **not** on the pour's net: subtract the object's shape expanded by the
   clearance margin. This renders as a dark ring around the object.
3. For each copper object **on the same net** as the pour: subtract nothing. It merges into the
   flood.
4. For each drill hole piercing this layer: subtract the hole. There is no copper at a hole,
   regardless of net.

This is net-aware rendering: the pour must carry its net, and the renderer must know the net of
every overlapping object. That is what the input contract encodes.

### Renderer input contract

```
input:
  pour:      { polygon, layerId, netId, clearance }
  objects[]: { shape, layerId, netId }     // pads, traces, vias on this layer
  holes[]:   { center, radius }            // every drill piercing this layer
output:
  filled region geometry
```

Any pour renderer that cannot be expressed against this input is missing information it needs.
Note that the contract carries no thermal-relief parameter: same-net pads merge flat. Thermal
spokes are a later refinement and would extend the contract, not replace it.

---

## 4. Mirroring, and the one exception

In the default top-down view, bottom-side artwork is X-flipped — rendered as if you could see
through the board — so that it reads correctly when you imagine flipping the board over.

| Content on the bottom side | Mirrored |
|---|---|
| Copper pads and traces | Yes (usually no visible change; symmetric geometry) |
| Solder mask apertures | Yes (usually no visible change) |
| Solder paste apertures | Yes (usually no visible change) |
| Overlay text (reference designators, values) | **Yes** |
| Overlay component body outlines | **Yes** |
| **Metadata** — pad names, net names | **No** |

**Metadata escapes the mirror.** It is the editor's annotation overlay, not a physical layer. A
user reading a pad designator should always read it left-to-right regardless of which side the pad
is on. Editor convention beats physical realism here, and this is the one place where the two
conflict.

The practical shape of it: on a composite bottom-side view, the silkscreen reference designator is
mirrored and unreadable-as-text, while the pad name sitting on the same pad is upright.

---

## 5. Silhouette is not the outline

Two different things, easy to conflate:

- The **board silhouette** is the physical substrate — a dark fill following the board polygon,
  darker than the canvas. It is **canvas chrome and renders unconditionally**. It is what tells
  you where the board is when every layer is off.
- The **Board Outline** is the mechanical edge rendered as a bright stroke. It is a
  **toggleable layer**.

The always-on set — rendered regardless of layer-panel state — is: grid, origin axes, and board
silhouette.

---

## 6. Default colour palette

Strong, saturated colours against a dark canvas. Ship these as defaults with a theme override.

| Layer | Default |
|---|---|
| Top Copper | `#E03030` |
| Mid-Layer 1 | `#FFCC00` |
| Mid-Layer 2 | `#00B8E0` |
| Bottom Copper | `#3858E8` |
| Top Overlay | `#3DD7CC` |
| Bottom Overlay | `#E040A0` |
| Solder Mask (top and bottom) | `#28C04A` |
| Top Solder Paste | `#E0A0D8` |
| Bottom Solder Paste | `#A0DDF0` |
| Board Outline | `#34D058` |
| Drill Holes | `#34D058` |
| Metadata | `#F0F0F0` |

**Open recommendation:** Board Outline and Drill Holes share the same green, which is a known
source of minor confusion. Nudge drill rings to a distinct green — `#88E090` — and keep the
outline at `#34D058`.

The mask is rendered green in the editor regardless of the final manufacturing mask colour. Mask
colour is a build-time export setting, not an editor concern.

---

## 7. Layer naming — a live product decision

Adopt friendly layer names, not KiCad's shorthand:

| Concept | KiCad | OpenPCB |
|---|---|---|
| Top copper | `F.Cu` | **Top Copper** |
| Bottom copper | `B.Cu` | **Bottom Copper** |
| Inner copper | `In1.Cu`, `In2.Cu`, … | **Mid-Layer 1 … N** |
| Top silkscreen | `F.SilkS` | **Top Overlay** |
| Bottom silkscreen | `B.SilkS` | **Bottom Overlay** |
| Top solder mask | `F.Mask` | **Top Solder Mask** |
| Bottom solder mask | `B.Mask` | **Bottom Solder Mask** |
| Top paste | `F.Paste` | **Top Solder Paste** |
| Bottom paste | `B.Paste` | **Bottom Solder Paste** |
| Board edge | `Edge.Cuts` | **Board Outline** |
| Drill | derived from pad geometry | **Drill Holes** |
| Editor annotations | (none) | **Metadata** |

The rationale is market fit: `F.Cu` and `Edge.Cuts` carry high friction for the target user, who
is frequently someone leaving KiCad specifically because of its UX.

**This is a live decision, not a settled fact.** Internal identifiers may still be KiCad-shaped;
what this rule governs is what the user reads. If the decision is revisited, revisit it here.

---

## 8. Update granularity

When a layer's visibility toggles, **flip the group's `visible` flag. Never destroy and rebuild
geometry.**

This is the rule that keeps layer toggling instant regardless of board complexity, and it composes
with a demand-render loop: a visibility change flips a flag and invalidates, and only the affected
group changes state. Rebuilding geometry on toggle turns a free operation into one that scales
with board size, and it is an easy mistake to make when visibility is derived from a store
selector that also feeds geometry construction.

---

## 9. Pour caching

Pour polygons with clearance halos are expensive to compute — Boolean operations over every
overlapping object on the layer. Recompute only on:

- routing edits that touch the pour's net,
- pour parameter changes,
- net-assignment changes.

Cache the result per `(pourId, designRevision)`. Anything that does not change one of those three
inputs must reuse the cached geometry.
