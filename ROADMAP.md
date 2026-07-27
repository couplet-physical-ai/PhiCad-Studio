# OpenPCB Roadmap

Public roadmap for the OpenPCB desktop application. This is a living document and may shift as feedback arrives — the order below reflects current priorities, not commitments.

## v0.1.x-beta — first public beta (current)

Shipped:

- Schematic capture: symbol placement, Manhattan wire routing, net labels, junction detection, net extraction, ERC scaffolding, full undo/redo
- PCB layout: trace routing (Manhattan + 45°), via placement with V-key layer switch, pad rendering, MST ratsnest, board outline, component placement, live DRC, IPC-2221B-aware net classes
- Component library: symbols, footprints (IPC-7351B preset generator + drawn editor), variants, KiCad `.kicad_sym` / `.kicad_mod` import, built-in seeded components, 3D models via STEP → GLB
- Manufacturing export: Gerber X2, Excellon drill, BOM, Pick-and-Place, single-ZIP export
- Module runtime: dynamic discovery, topological boot, per-module SQLite + auto-applied migrations, codegenerated SDK + module registry
- Cross-platform Electron desktop (macOS arm64/x64, Windows x64, Linux x64) — **unsigned in this beta**

## v0.1.1-beta — second public beta

Shipped on top of v0.1.0-beta:

- Bundled component library grows from 17 to **227 components** (223 symbols, 146 footprints, 136 3D models) — CoreLibrary now pre-bakes GLBs into the `.opclib` pack instead of shipping STEP-only.
- PCB: custom board shapes with dimensioned sketching; route-tool UX overhaul (finish-anywhere, live HUD, keymap fixes, bundle routing, diagonal meanders, tune/walkaround); auto-picked route layer from the clicked pad; decluttered toolbar.
- DRC production-hardening pass (P0–P11) plus independent-review fixes.
- Schematic: wiring overhaul from a full wire audit — drag wire segments, robust drag lifecycle, phantom-wall re-route fixes.
- New Knowledge module: docs pages with a rich-text editor and tree, PDF-as-page plus text/markdown import.
- Library: pack metadata surfaced end-to-end — subcategory, datasheet links, keywords, manufacturer part numbers.
- Releases now publish `SHA256SUMS.txt`; the auto-update feed points at the correct repository.

Still open from the original v0.1.1 list:

- Frontend Vitest coverage uplift (still thin).
- Bug-fix backlog from beta feedback.

## Phase 4 polish — next minor releases

- Trace segment drag-edit
- Net-class-aware width / clearance on routing
- Silkscreen text rasterization in Gerber export
- 4-layer board support (currently 2-layer only)
- Differential pair routing
- Copper zones / pours

## Phase 5 — production readiness

- Code signing + notarization — macOS Developer ID, and a Windows individual-validation
  certificate (EV certificates are not available to individual developers). Deferred while the
  project is a solo beta; revisited at 500 downloads/month, on the first commercial-licence
  enquiry, or if macOS download share overtakes Windows. Until then, releases ship
  `SHA256SUMS.txt` as the verification path.
- macOS auto-update — blocked on the above: Squirrel.Mac rejects the ad-hoc signature, so
  `canAutoUpdate()` excludes darwin. Windows (NSIS) and Linux (AppImage) auto-update already ship.
- ESLint module-boundary enforcement
- Expanded frontend test coverage
- Sentry crash reporting (opt-in, off by default — wiring already exists)

## Out of scope for v1.0

- Cloud sync, multi-user collaboration, library marketplace (separate SaaS, closed source)
- Autorouting beyond manual + DRC-assisted

## How to influence the roadmap

Open a GitHub issue with the `discussion` or `feature_request` label and explain the use case. Roadmap items are weighted by user demand, technical risk, and license compatibility.
