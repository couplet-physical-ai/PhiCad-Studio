# Design tokens

> Consolidated 2026-08-02 from the per-screen token fragments scattered through a UI review
> transcript (home, schematic, PCB, 3D, BOM, settings, stacked cards, chat, diagrams, docked
> panel) plus the visual design system recorded in the website notes.
>
> The fragments were written independently, one per screen, and disagreed in several places.
> **Every disagreement is resolved to a single value below, and each resolution says what was
> picked and why.** Nothing is carried on both sides.

**Ownership:** tokens live in `core/` and are exposed to renderers and UI components through
`shared/`, per the one-way import rule. No module defines its own copy of a colour.

**Rendered reference:** the HTML mockups under [`mockups/`](mockups/) are these token values on a
screen — open one in a browser to see what a value looks like in context before changing it.

---

## 1. Structure

The system has two surface families. They are deliberately distinct, not an unresolved conflict.

| Family | Where it applies | Theming |
|---|---|---|
| **App chrome** | Shell, panels, modals, settings, dashboards, tables, forms | Light and dark |
| **Canvas** | Schematic, PCB and 3D viewports, and the chat surfaces that sit against them | Dark-biased; see §7 |

App chrome uses the Tailwind slate and violet scales. The canvas family uses a slightly cooler,
darker near-black. They are close in value and different on purpose: canvas backgrounds sit
behind saturated artwork and need more separation from it than panel chrome does.

---

## 2. Colour — accent

One accent ramp, used for selection, primary actions, AI-proposal framing and highlights.

| Token | Value | Use |
|---|---|---|
| `--accent-600` | `#7C3AED` | Primary buttons, primary strokes, the brand accent |
| `--accent-500` | `#8B5CF6` | Base for translucent fills — used only through the alpha tokens below |
| `--accent-400` | `#A78BFA` | Borders on active cards, hover strokes, selection halos |
| `--accent-300` | `#C4B5FD` | Accent text on dark surfaces, pill labels |
| `--accent-fill-subtle` | `rgba(139,92,246,0.06)` | Selection fill on canvas, expanded-card background |
| `--accent-fill` | `rgba(139,92,246,0.10)` | Selected list row, user message bubble, cloud banner |
| `--accent-fill-strong` | `rgba(139,92,246,0.18)` | Type pills, emphasis chips |
| `--accent-border` | `rgba(139,92,246,0.25)` | Expanded-card and banner borders |
| `--accent-border-strong` | `rgba(139,92,246,0.40)` | Resize-handle hover, drag indicators |
| `--accent-halo` | `rgba(167,139,250,0.35)` | Canvas selection halo |

The website notes name the primary accent violet-600 `#7c3aed`; the transcript fragments used
the same hex under a different name. **No conflict — one value.** The 500/400/300 steps are the
same Tailwind violet family and are kept as a ramp rather than flattened, because dark surfaces
need a lighter step for text and borders than for fills.

---

## 3. Colour — status

**Resolution:** the transcript used the 400-level of each Tailwind status family (tuned for dark
backgrounds); the website notes used the 500/600-level (tuned for light). Both are correct for
their theme, so each status is one semantic token with two theme values rather than two
competing tokens.

| Token | Dark theme | Light theme | Meaning |
|---|---|---|---|
| `--status-success` | `#34D399` (emerald-400) | `#10B981` (emerald-500) | Passed, connected, sourced, clean |
| `--status-warning` | `#FBBF24` (amber-400) | `#F59E0B` (amber-500) | Needs attention, unsigned, extended part |
| `--status-danger` | `#F87171` (red-400) | `#DC2626` (red-600) | Error, destructive action, blocking violation |
| `--status-neutral` | `#6B7280` (gray-500) | `#6B7280` | Not run, unknown, disabled |

**Second resolution:** the transcript contained two greens — `#34D399` and `#5DCAA5` — used
interchangeably for success and for "medium relevance". `#34D399` is the single success token.
`#5DCAA5` survives **only** as the ground-net colour in §6, where it is a domain colour, not a
status.

Relevance tiers, used by search-result and component cards, are expressed in status terms rather
than as a fourth palette:

| Tier | Token |
|---|---|
| High (≥ 90%) | `--status-success` |
| Medium (60–90%) | `--status-success` at 70% opacity |
| Low (30–60%) | `--status-warning` |
| Poor (< 30%) | `--status-neutral` |

---

## 4. Colour — surfaces

### 4.1 App chrome

| Token | Dark | Light |
|---|---|---|
| `--surface-app` | `#020617` (slate-950) | `#F8FAFC` (slate-50) |
| `--surface-panel` | `#0F172A` (slate-900) | `#FFFFFF` |
| `--border-default` | `#1E293B` (slate-800) | `#E2E8F0` (slate-200) |
| `--border-subtle` | `rgba(255,255,255,0.06)` | `rgba(0,0,0,0.06)` |

### 4.2 Canvas family

| Token | Value | Use |
|---|---|---|
| `--surface-canvas` | `#0A0E14` | Schematic, PCB and 3D-dark viewport background; also the recessed body of a diagram card |
| `--surface-rail` | `#070A0F` | Side rails, docked-panel header strips |
| `--surface-card` | `#13191F` | Cards, list rows, tool-call blocks, diagram cards |
| `--surface-card-hover` | `#171E26` | Card hover |
| `--surface-input` | `#10141B` | Inputs, recessed wells, collapsed stacked-card headers |

**Resolution:** three fragments assigned a card background — `#13191F` from the home set,
`#10141B` from the stacked-card and diagram-card sets. `#13191F` is the single card surface.
`#10141B` is retained only as the *recessed* surface (inputs, collapsed headers), which is the
role it was actually playing in those fragments. A card and an input should not share a value.

### 4.3 Text

| Token | Value |
|---|---|
| `--text-primary` | `#F3F4F6` |
| `--text-secondary` | `#9CA3AF` |
| `--text-tertiary` | `#6B7280` |
| `--text-disabled` | `#4B5563` |

Light-theme text inverts against the slate scale; the dark values above are authoritative for
every canvas surface regardless of app theme.

---

## 5. Shape, spacing and motion

| Token | Value | Use |
|---|---|---|
| `--radius-card` | `10px` | Dashboard cards, chat cards, modals |
| `--radius-control` | `8px` | Buttons, inputs, stacked cards |
| `--radius-pill` | `999px` | Status pills, tags, model pills |
| `--card-header-padding` | `11px 14px` | Stacked-card collapsed header |
| `--card-body-padding` | `14px` | Stacked-card expanded body |
| `--card-gap` | `6px` | Vertical gap in a stacked-card list |

Shadows are minimal: a subtle elevation for toolbars, a stronger one for modals. Backdrop blur is
used on floating toolbars and overlays. Scrollbars are hidden on tab strips and thin on panels.

---

## 6. Domain colours

These encode meaning from the electronics domain, not visual hierarchy. They are not
interchangeable with the status palette.

### 6.1 Net classes — schematic

Three net classes, three colours. The reasoning: a single-colour schematic (the KiCad
convention) is slow to parse, and colour-coding by net class is the single change that most
improves scan speed on a dense sheet.

| Token | Value | Applies to |
|---|---|---|
| `--net-power` | `#E0573A` | VCC, +5V, +3V3, and other supply nets |
| `--net-ground` | `#5DCAA5` | GND, AGND, and other return nets |
| `--net-signal` | `#94A3B8` | Everything else — the default |
| `--net-bus` | `#FBBF24` | Multi-bit buses |
| `--net-hover` | `#A78BFA` | The net under the cursor or selection |

Hover behaviour that these tokens exist to support: hovering a wire fades every other net to
about 30% opacity and raises the hovered net to `--net-hover`. This is net tracing, and it is
the reason the hover colour is a distinct token rather than a generic selection colour.

### 6.2 Schematic canvas

| Token | Value |
|---|---|
| `--schem-bg` | `--surface-canvas` |
| `--grid-major` | `rgba(255,255,255,0.04)` — 100 mil rectangular grid |
| `--grid-minor-dot` | `rgba(255,255,255,0.06)` — 20 mil dot grid |
| `--sel-halo` | `--accent-halo` |
| `--sel-fill` | `--accent-fill-subtle` |

### 6.3 PCB — realistic preview materials

**These are the materials of the realistic/soldermask preview render, not the per-layer artwork
palette.** The authoritative per-layer colour palette for the 2D editor — top copper, mid
layers, bottom copper, overlays, mask, paste, board outline, drill, metadata — lives in
`docs/designer/pcb-layer-rendering.md` §6 and is not duplicated here. Where the two disagree (for
example, the board outline is green in the layer palette and yellow in the preview materials),
they are describing different render modes and both are correct within their own mode.

| Token | Value |
|---|---|
| `--pcb-bg` | `--surface-canvas` |
| `--board-mask` | `#0D4D2C` — default green soldermask |
| `--edge-cuts` | `#D4A017` — board outline in preview mode |
| `--pad-copper` | `#D97757` — exposed pad |
| `--trace-copper` | `#D97757` — may darken slightly relative to pads |
| `--silkscreen` | `#FFFFFF` |
| `--silkscreen-faded` | `rgba(255,255,255,0.4)` — courtyard outlines |
| `--ratsnest` | `#94A3B8` |
| `--drc-warn` | `--status-warning` |
| `--drc-error` | `--status-danger` |
| `--sel-courtyard` | `--accent-400` |

Default soldermask is green because it is the most common manufactured output. A per-design
colour picker is a backlog item, not a token change.

### 6.4 3D viewport

| Token | Value |
|---|---|
| `--3d-bg-dark` | `--surface-canvas` |
| `--3d-bg-light` | `#F5F5F4` |
| `--3d-floor` | `rgba(31,41,55,0.4)` |
| `--heatmap-cold` | `--status-success` — shortest components |
| `--heatmap-mid` | `--status-warning` |
| `--heatmap-hot` | `--status-danger` — tallest components |
| `--enclosure-margin-default` | `1.0` mm |
| `--enclosure-airgap-default` | `1.0` mm |

The height heatmap reuses the status ramp deliberately: red reads as "tall enough to be a
problem", which is the question the heatmap answers. It is not colourblind-safe; an alternative
perceptual ramp is a backlog item.

### 6.5 BOM row states

Row tints are near-transparent so the table still reads as a table. The accent is the left rule
and the status text.

| State | Row tint | Accent |
|---|---|---|
| Sourced | `rgba(52,211,153,0.10)` | `--status-success` |
| Suggested | `rgba(139,92,246,0.07)` | `--accent-400` |
| Extended part | `rgba(251,191,36,0.04)` | `--status-warning` |
| Critical / unsourced | `rgba(248,113,113,0.04)` | `--status-danger` |
| Do not populate | `rgba(255,255,255,0.02)` | `--status-neutral` |

---

## 7. The always-dark canvas rule

**The PCB canvas is always dark, regardless of the app theme.**

This is a product rule, not a styling preference. PCB artwork is a set of saturated,
high-contrast layer colours designed to be distinguishable from one another; those colours are
chosen against a dark background and lose their separation against a light one. Inverting the
canvas with the app theme would mean maintaining a second layer palette that is worse.

Consequences:

| Surface | Theme behaviour |
|---|---|
| PCB canvas | Always dark |
| 3D viewport | Has its own token set with an explicit light preset (`--3d-bg-light`), selected by scene, not by app theme |
| Schematic canvas | Follows the app theme; the values in §6.2 are its dark-theme values |
| Library | Follows the app theme |
| App chrome | Follows the app theme |

---

## 8. Typography

| Property | Value |
|---|---|
| Font stack | `Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` |
| Monospace | Used for identifiers, part numbers, net names, coordinates and latency values |
| Scale | Small sizes dominant. The UI is dense by design; `text-xs` and `text-sm` carry most content |

Monospace is a semantic choice, not decoration: it marks a string as a machine identifier the
user may need to copy or compare character by character.

---

## 9. Icons and primitives

| Concern | Choice |
|---|---|
| Icon set | Lucide |
| Interactive primitives | Radix — dialog, context menu, tabs, scroll area — wrapped in local UI components |

Provider and vendor marks are deliberately **not** used as icons; a Lucide icon that suggests the
provider type is used instead, to avoid trademark obligations on third-party logos.

---

## 10. Component-specific tokens

### 10.1 Chat

| Token | Value |
|---|---|
| `--bubble-user-bg` | `--accent-fill` |
| `--bubble-user-bd` | `rgba(139,92,246,0.20)` |
| `--bubble-user-radius` | `10px 10px 2px 10px` — tail at bottom right |
| `--card-pending-bd` | `rgba(139,92,246,0.20)` |
| `--card-ready-bd` | `rgba(52,211,153,0.25)` |
| `--card-applied-bd` | `rgba(139,92,246,0.10)` — faded |
| `--badge-best-match-bg` | `rgba(52,211,153,0.12)` |
| `--badge-best-match-text` | `--status-success` |

Proposal card borders encode state: pending is accent, ready is success, applied fades. The card
does not change fill, only its rule — an applied proposal stays readable as history.

### 10.2 Diagram cards

| Token | Value |
|---|---|
| `--diagram-card-bg` | `--surface-card` |
| `--diagram-card-bd` | `--border-subtle` |
| `--diagram-body-bg` | `--surface-canvas` |
| `--diagram-type-pill-bg` | `--accent-fill-strong` |
| `--diagram-type-pill-text` | `--accent-300` |
| `--diagram-node-bg` | `--surface-card` |
| `--diagram-node-bd` | `--accent-400` |
| `--diagram-arrow` | `--text-secondary` |
| `--diagram-arrow-yes` | `--status-success` |
| `--diagram-arrow-no` | `--status-warning` |
| `--diagram-arrow-err` | `--status-danger` |

Categorical series colour, for pie and multi-series diagrams, in order:
`--accent-600`, `--status-success`, `--status-warning`, `--status-danger`, `#94A3B8`.

### 10.3 Stacked card

| Token | Value |
|---|---|
| `--card-collapsed-bg` | `--surface-input` |
| `--card-collapsed-bd` | `--border-subtle` |
| `--card-expanded-bg` | `--accent-fill-subtle` |
| `--card-expanded-bd` | `--accent-border` |
| `--card-warning-bg` | `rgba(251,191,36,0.04)` |
| `--card-warning-bd` | `rgba(251,191,36,0.20)` |

### 10.4 Docked panel

| Token | Value |
|---|---|
| `--docked-chat-width-default` | `380px` |
| `--docked-chat-width-min` | `280px` |
| `--docked-chat-width-max` | `600px` |
| `--resize-handle-width` | `4px` |
| `--resize-handle-bg` | `--surface-rail` |
| `--resize-handle-bg-hover` | `--accent-border-strong` |
| `--panel-header-bg` | `--surface-rail` |
| `--panel-subheader-bg` | `rgba(0,0,0,0.10)` |
| `--panel-header-pad` | `7px 10px` |
| `--panel-subheader-pad` | `6px 10px` |
| `--card-narrow-symbol-size` | `30px × 24px` |
| `--card-narrow-padding` | `7px 9px` |
| `--card-narrow-gap` | `5px` |

The behavioural contract these serve — bounds, double-click snap, per-design persistence, and
the 480 px reflow breakpoint — is in `docs/assistant/chat-ui-spec.md` §12.

---

## 11. Summary of resolutions

| Disagreement | Resolution |
|---|---|
| Two dark backgrounds: `#020617` (slate-950) and `#0A0E14` | Both kept, with distinct scopes: slate-950 for app chrome, `#0A0E14` for canvas surfaces. This is a structural split, not a conflict. |
| Two greens for success: `#34D399` and `#5DCAA5` | `#34D399` is the single success token. `#5DCAA5` survives only as the ground-net domain colour. |
| Status colours at 400-level vs 500/600-level | One semantic token per status, with a dark value and a light value. |
| Two card backgrounds: `#13191F` and `#10141B` | `#13191F` is the card surface. `#10141B` is the recessed/input surface. |
| Board outline green (layer palette) vs yellow (preview materials) | Different render modes; both correct. The layer palette is authoritative for the 2D editor and lives in `docs/designer/pcb-layer-rendering.md`. |
| Purple named variously accent-purple, violet-600, `#8B5CF6`, `#A78BFA` | One accent ramp, 600/500/400/300, plus named alpha fills. |
