# Website design notes

The residue of a longer marketing document that used to live in this repository. Only three things
from it were worth keeping: the design tokens, the screenshot shot-list, and the positioning
language. They are here because the website repository has no better home for them yet.

**The original's feature matrix has been dropped, deliberately.** It was materially false: it
described Gerber output, drill files, pick-and-place and manufacturing export as "not started"
when all of them had shipped roughly two months earlier, and it carried the same error into its
"honesty" section. A feature matrix maintained by hand beside the product it describes will rot
faster than anyone notices.

**Regenerate every feature claim from [`../../ROADMAP.md`](../../ROADMAP.md).** That file is
maintained, public-facing, and grouped exactly the way website copy needs — shipped, next, out of
scope. If the website says a feature exists, the roadmap should be the reason.

Note also that this is an application repository. Website copy, assets and code belong in the
website repository; these notes are a handoff, not a home.

## Design tokens

| Token            | Value                   |
| ---------------- | ----------------------- |
| Primary accent   | Violet-600 `#7c3aed`    |
| Dark canvas bg   | Slate-950 `#020617`     |
| Light canvas bg  | Slate-50 `#f8fafc`      |
| Panel bg (dark)  | Slate-900 `#0f172a`     |
| Panel bg (light) | White                   |
| Border (dark)    | Slate-800 `#1e293b`     |
| Border (light)   | Slate-200 `#e2e8f0`     |
| Error            | Red-600 `#dc2626`       |
| Warning          | Amber-500 `#f59e0b`     |
| Success          | Emerald-500 `#10b981`   |

- **Typography.** System sans-serif, small sizes dominant. The UI is dense by design.
  Font stack: Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif.
- **Icons.** Lucide throughout.
- **Components.** Custom primitives built on Radix (Dialog, ContextMenu, Tabs, ScrollArea).
- **Shape.** Consistent `rounded-lg`, `rounded-xl` for cards. Subtle `shadow-sm` on toolbars,
  `shadow-lg` on modals. Backdrop blur on floating toolbars and overlays. Scrollbars hidden on
  tabs, thin on panels.

**Rule: the PCB canvas is always dark, regardless of the app theme.** The 3D view has its own dark
token set. Schematic and Library follow the app theme. Screenshots should respect this — a
light-theme PCB screenshot is not a theming choice, it is a bug.

## Screenshot shot-list

Still a valid task list for the website: no final screenshot has been captured. **There is
usable source material already in the repository, though, and the shot-list should start from
it rather than from an empty canvas:**

- [`mockups/`](mockups/) — 13 self-contained HTML mockups (home screen, schematic editor, PCB
  editor, 3D view, BOM, settings, assistant chat and the docked panel) plus 17 PNG captures.
  The HTML mockups render in a browser at any size, which makes them the fastest way to produce
  a clean, well-composed frame for shots 1–8 while the real UI catches up. Anything captured
  from them is a mockup and must be labelled as such if it ships.
- [`../designer/layer-reference/`](../designer/layer-reference/) — 27 PNG captures of the PCB
  layer renderer at named layer-visibility combinations, plus a schematic reference shot. These
  are captures of the real renderer, so they are directly usable for shot 2 and for any layer
  or stack-up explainer.

Must have:

1. **Hero** — schematic editor with components, wires and labels on a dark canvas.
2. **PCB editor** — trace routing with the ratsnest visible and the layer panel open.
3. **3D preview** — board with component models, rotated at an angle.
4. **Component palette** — search open, a component highlighted, preview visible.
5. **Library view** — component grid with search and tag filters.
6. **Component detail** — split view showing symbol, footprint and 3D preview.
7. **Import wizard** — the symbol step with the editor canvas visible.
8. **Home screen** — the design list with cards.

Nice to have:

9. Schematic and PCB side by side, if that layout is ever supported.
10. Animated captures: trace routing, via placement, component placement.

Not applicable: mobile and responsive layouts. OpenPCB is a desktop application.

## Positioning language

The durable claims, in the order they tend to matter to someone deciding whether to try it:

- **Local-first.** The app runs on your machine and your designs stay there.
- **No login.** There is no account, and no sign-up wall in front of any feature.
- **No cloud dependency.** Nothing in the core workflow requires a server to be reachable.
- **KiCad-compatible.** Existing KiCad symbol and footprint libraries import directly.
- **Open source.** AGPL-3.0-or-later, with a commercial license available separately.

**Required qualification.** "No cloud" is no longer strictly true and copy must not claim it as an
absolute. Cloud sync and shared workspaces exist as **opt-in** features. They are absent from
release builds today, and when they ship they will be opt-in: a design that is not shared never
contacts a server. Write the claim as *local-first, with cloud sync as an opt-in* rather than *no
cloud*. The distinction is small in copy and large in trust — a user who discovers an undisclosed
cloud path will not believe the rest of the page.

The same care applies to the AI assistant: it is optional, it works against a local model endpoint,
and design data leaves the machine only if the user points it at a hosted provider. Say that
plainly rather than avoiding the subject.
