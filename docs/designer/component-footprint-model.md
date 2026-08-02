# Component-to-footprint model — decision memo

What the component/footprint relationship actually is, the one invariant nothing enforces, and the
five product questions that are still open. One page, because the model is small; the open
questions are the reason this file exists.

## The data model, in one sentence

A component accepts N footprints through the 1:N join table `library_component_footprints`
(`component_id`, `footprint_id`, `is_default`, `variant_label`, `sort_order`, `pinmap_json`), and
identity is the **footprint's own id** — no variant or option entity exists, and no separate
option id is ever minted.

Everything else follows from that. There is no variant table, no `variantId`, no
`footprintOptionId`. "Variant" is a display label on a join row.

## The unenforced invariant

The schema documents this invariant:

> Exactly one row per component has `is_default = 1`, and it matches the cached
> `library_components.footprint_id`.

**Nothing enforces it.** Specifically:

- The default is stored **twice** — authoritatively as `is_default = 1` on the join row, and as a
  cached copy in `library_components.footprint_id` for the fast read path.
- There is **no database constraint** tying the two together, and none preventing zero or multiple
  `is_default = 1` rows for one component.
- The two copies are used for **different things**. Placement and the detail page resolve the
  footprint by reading `library_components.footprint_id` — the cache. `is_default` is only used to
  decide which row in the variants list gets a "Default" badge.

So a divergence between the two does not fail loudly. It produces a list where the badge is on one
footprint and placement silently uses another. The import path happens to keep them aligned
because it deletes and re-inserts all join rows on every (re)import, setting `is_default` from the
package's declared default — but nothing outside that path is obliged to.

This is the open risk in the model. The fix is a choice, not a patch: add a constraint or check
that enforces the invariant, or collapse to a single source of truth and drop the cache.

## 3D models key on the footprint

`library_footprint_models` has `footprint_id` as its primary key, with `ON DELETE CASCADE` to
`library_footprints`. One model row per footprint.

**Implication:** every alternative footprint *can* carry its own 3D model, and the storage layer
already supports it. But the detail page's 3D pane is keyed to the resolved default footprint's
id, and the STEP upload control is wired to the same place. So non-default footprints can own
models that no part of the UI will ever show or let you upload.

## Two unrelated things are called "footprint snapshot"

They are not related and conflating them has already caused a wrong premise in one planning
document.

| Name | What it is | Status |
|---|---|---|
| `footprint_snapshot` (ECS component) | A field set in an archived design doc, including a `footprintOptionId` | **Never built.** No such contract file exists. |
| `footprint_snapshot_json` (designer storage) | A column on the designer's part storage holding the full `LibraryFootprintPlacementSnapshot` — complete footprint geometry | **Live.** Written on placement and by the world projection, and **actively read** by the projection read path. Contains no option id. |

When a document says footprint snapshot is "stored but unused", it is talking about the first one.
The second is stored, used, and load-bearing.

## Open product questions

These have no answers yet and the code is waiting on them.

**1. Naming.** Today's model is "a component accepts N footprints, one default." Is the
user-facing concept **footprint variant**, **footprint option**, or **alternative footprint**?
Pick one and align SQL, TypeScript and UI copy — see the drift below.

**2. Per-placement override.** The inspector already renders a footprint dropdown for a placed
part, marks the current selection, badges the default — and disables every option with the
message "Per-instance override coming soon." Nothing behind it exists. Shipping it needs three
things:

- a new designer command (no command can change a placed part's footprint today),
- a place-time footprint id threaded through to the place-part payload builder, which currently
  freezes the component's resolved default,
- **a field in the routes parser.** This is the recorded gotcha: command fields that the route
  parser does not explicitly read are **silently dropped over HTTP**. The place-part parser reads
  only the component id and the transform. A new field that is added to the command type but not
  to the parser will work in tests and vanish in the app.

**3. Should a placed part remember which footprint it used?** A placed part freezes a footprint
snapshot but keeps no back-reference to the join row it came from. The archived `part_origin_ref`
idea would cover this. **Adopt it or formally retire it** — leaving it archived-but-cited is how
it keeps resurfacing as a premise.

**4. 3D per alternative footprint.** Models already key on footprint id, so each alternative can
carry one. Should the detail page expose per-footprint 3D view and upload, or stay
default-only?

**5. The default invariant.** See above. Enforce it, or collapse the dual storage.

## Terminology drift

The live model has no "option" anywhere, and uses "variant" three different ways for what is
structurally just *an alternative footprint*:

| Layer | Term |
|---|---|
| SQL | `variant_label` — a display label column |
| TypeScript | `LibraryComponentFootprintVariant` — the type name |
| UI copy | "Footprint variants" (detail page), "Package Variants" (import wizard) |

Question 1 resolves this. Until it does, expect "variant" in a conversation to mean any of the
three.
