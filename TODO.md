# OpenPCB — TODO

> Live tracker. Last reviewed **2026-08-02** · repo version **0.1.1-beta**.
> Open work only. Completed work lives in git history, not in this file.
> Six programs: Route tool · Compiler agent · MCP integration · Release hardening · DRC · Backlog.

## Repo state

- **Unmerged local branch `integ/trace-drag`** — 6 commits, ~1.9k lines: trace segment drag
  editing, vertex handles, 555-blinker fab fixture + tests. Unpushed. Push, then integrate or
  rebase. **Do not delete.**
- **Verify then drop:** the CI-red pair recorded 2026-07-12 — `@openpcb/contracts` needing a
  `contracts-v0.3.0` cut plus a repin, and a `package-lock.json` SHA refresh for
  `opclib-pack-v0.3.0`. Both may already be resolved; confirm against master before carrying
  either as work.

---

## 1. Route tool

**Locked decisions.** Length tuning before bundles · walkaround-lite, no shove · batch-per-session
commit · rbush is the only new dependency · through-vias in v1 · DRC hard-block plus explain ·
match groups with an in-tool target · diff pairs by `_P`/`_N` suffix convention only.

P1–P4 shipped. P5 Tune and P6 Bundle are code-complete with their review-session fixes landed;
both are gated on manual QA on a real board before their dev flags can graduate.

- [ ] **P5 Tune — manual QA on a real 45-routed board.** Diagonal meanders, painted-span halo,
      idle hover pick and honest per-status HUD copy (`target-met` / `blocked` / `span-too-small`)
      all landed. QA is the last gate before `pcb.lengthTuning` graduates.
- [ ] **P6 Bundle — manual QA.** Ghost-stability fixes landed (lanes never unmount, degraded lanes
      hold last-good geometry in amber, stable fan-out direction). `pcb.bundleRouting`, toolbar-only.
      Known v1 weakness to judge during QA: breakout connector quality near tight pin rows.
- [ ] **P6 diff pairs — blocked on Bundle QA.** Suffix convention only; `PcbNetClass.diffPairGapMm`
      sets pair pitch and is stripped from the cloud BoardSnapshot to keep the wire schema stable.
- [ ] **Skew tuning** = P5 Tune applied to the shorter leg. No extra code; usable once Tune passes QA.
- [ ] **Release notes are required when graduating a dev flag.** Behaviour changes that must be
      written up: snap tolerance moved to 8px/zoom (P2d), the `pcb.padShapeConnectivity` DRC shift,
      and auto-finish / walkaround / lengthTuning / bundleRouting behaviour.
- [ ] Follow-up: migrate `/autoroute/apply` onto `pcb_commit_route`. Carries an open UX decision —
      per-op cherry-pick (today's route apply) versus all-or-nothing batch (today's place apply).
- [ ] Follow-up: pad-bearing E2E fixture board covering Tab→accept, tune-a-trace, bundle
      pad-collect and one-undo-multi-via. Blocked on library fixture infrastructure.
- [ ] Follow-up: **bundle v2** — target-row landing (v1 lanes end dangling), via support, per-net
      lane widths, crossing warnings when pads are not monotone, smarter breakout connectors.
      Also: diagonal-segment obstacle AABB pre-split (≤2 mm) if dense-board QA shows auto-finish
      misses, and walkaround multi-cluster.
- [ ] P7 cloud corridor routing — optional, only if bundle usage shows demand.

---

## 2. Compiler agent (cloud copilot → local)

**Locked decisions.** LLM → declarative circuit-spec IR → deterministic expander → ERC; the IR
stays TS-internal and only the expanded `DesignerCommand` batch crosses a boundary · local-first
brain (cloud is a model gateway plus stateless tools, never the orchestrator) · hybrid recipes
(primitives in code, functional blocks as cloud data later) · **parameter calculation lives in the
expander, not the LLM** · auto-apply non-destructive changes once ERC-clean, gate destructive ones,
ERC self-correct ≤N · guardrails: clarify-first, installed-parts-only, schematic-only.

**Layout invariant for new blocks** (documented in `compiler/lowering.ts`): auto-routes must not
graze foreign pins. The original one-row grid put a straight R→A route through `LED.K`, and that
pin-on-wire junction shorted every LED into GND. Every new block must respect it.

- [ ] **More primitive blocks** in `compiler/blocks.ts` — decoupling, pull-up/down, RC.
- [ ] **P2 data recipes + additive editing** · **P3 edit reconciliation** · cloud stateless tools +
      model gateway · golden-IR / fixture / telemetry validation.
- [ ] `compile_circuit` polish: a tool-description hint to reuse existing rail names when extending
      a design (rails merge by name only), and `designer_resolve_design` by-UUID lookup — name-only
      today.
- [ ] (deprioritized) `get_design_state` completion-pressure read.

### Assistant loop follow-ups

Same module, out of the Phases 0–4 scope that landed 2026-06-02. Not blocking.

- [ ] **P5 prompt + context engineering** (`prompt-service.ts` + `run-service.ts`): agentic-mode
      triad (persistence / tool-first / principled-stop); two-register selection by capability probe,
      dropping plan-then-reflect for reasoning models; inject a live design summary into the system
      prompt (reuse the existing `buildDesignContextSummary`); lean read-tool envelopes; additive presets.
- [ ] **P6 loop robustness** (ai-core `run-loop.ts`): fingerprint dedup keyed on
      `{tool, normalizedArgs, designRevision}` plus outcome; no-progress/stall detection off the
      design-revision signal; per-tool call caps; wall-clock timeout. Warning codes are already
      reserved in `events.ts`.
- [ ] **Emulated-tool-call guard.** Weak or distilled local models emit tool-call-shaped ```json in
      assistant *content* rather than real `tool_calls`, so they narrate fake progress, nothing is
      built, and the DoD verifier never runs. Detect the pattern and surface it.
- [ ] **Verify:** headed Playwright assistant scenarios (a)–(e) were pending a local oMLX endpoint
      at :8000. Typecheck, backend, react and ai-core suites were green at the time. Re-run and
      close, or re-open with a real blocker.

---

## 3. MCP integration — in flight

The largest live workstream and the newest. Uncommitted WIP in the working tree as of the
2026-07-28 verification pass; it is **not** unshipped and it is **not** finished.

OpenPCB exposes its assistant tool registry over MCP so external agents (Claude Code, Claude
Desktop, Codex) can drive whatever design the user has open. It lives inside the assistant module,
which already owns the registry, the `ContextResolver`, proposals and the write policy.

**Shape as designed** (full description in `CLAUDE.md` — only the load-bearing constraints repeat here):

- Streamable HTTP at `/api/modules/assistant/mcp`; sessions are backed by a real assistant chat,
  one per client, keyed on `metadata.mcp.clientKey`. That key must be **header-stable and never the
  display name** — it is what lets every existing designer tool resolve its design unchanged via
  `contextResolver.getPrimaryDesign(chatId)`, and why MCP calls and proposals render in the panel.
- The 15 in-app `AiTool`s projected 1:1, plus MCP-only extended reads and the session-scoped
  `designer_use_design`. **Do not add the extended reads to the in-app registry** — its prompt and
  DoD harness are tuned against the current 15.
- Design targeting: explicit `designId` → session pin → UI-active design, pushed by the frontend to
  `PUT /api/modules/designer/active-design`.
- Two settings, both default off (`mcp_enabled`, `mcp_allow_writes`). Writes are forced off when the
  server is off, and write tools are then not registered at all.
- Bearer token plus loopback-only Origin check; discovery through a 0600 `mcp.json`. stdio clients
  use the bundled shim on the app's own Electron binary. The app must be running — there is no
  headless fallback, because there is one SQLite writer.

**Working-tree surfaces:** `src/modules/assistant/backend/mcp/`, `electron/src/mcp-shim/`,
`McpSection.tsx`, `0014_mcp_settings.sql`, `assistant-mcp-endpoint.test.ts`,
`designer/backend/active-design.ts`, `useActiveDesignSync.ts`.

- [ ] **Finish the WIP and commit it.** It is currently the only unversioned work in the repo.
- [ ] **Test it.** `assistant-mcp-endpoint.test.ts` exists; establish what it covers and fill the
      gaps — auth rejection paths, session/client-key stability, tool projection fidelity, the
      write-policy matrix (server off, server on + writes off, server on + writes on), and the
      active-design targeting precedence chain.
- [ ] **Exercise the stdio shim end-to-end** from a real external client against a running app,
      including the `mcp.json` discovery handoff.
- [ ] **Decide `mcp.server` flag graduation.** It is a `dev` flag today. Graduating it means
      flipping the registry entry to `"all"`, and carries the same release-notes obligation as the
      route-tool flags.
- [ ] Document the feature for users once the two settings are considered stable.

---

## 4. Release hardening

The least complete program. **The target has been corrected**: the old plan aimed at a signed,
notarized, auto-updating `1.0.0`. `ROADMAP.md` defers code signing and notarization while the
project is a solo beta, and the repo is at **0.1.1-beta**. This program now hardens the 0.1.x beta
line; signing is a Phase 5 item held behind explicit triggers.

**Signing position (from the roadmap, authoritative).** macOS Developer ID plus a Windows
individual-validation certificate — EV certificates are not available to individual developers.
Deferred while the project is a solo beta. **Revisit triggers:** 500 downloads/month, the first
commercial-licence enquiry, or macOS download share overtaking Windows. Until then, releases ship
`SHA256SUMS.txt` as the verification path. macOS auto-update is blocked behind the same decision —
Squirrel.Mac rejects the ad-hoc signature, so `canAutoUpdate()` excludes darwin; Windows (NSIS) and
Linux (AppImage) auto-update already ship.

### Correctness and data integrity

- [ ] Graceful shutdown — SIGTERM/SIGINT close the server and sqlite; the Electron backend-manager
      awaits exit before `app.quit()`.
- [ ] Global error handling — React error boundary, `window` error/unhandledrejection, main-process
      `uncaughtException`/`unhandledRejection` → Sentry plus a crash/recover UI. Sweep
      release-critical silent `catch {}`.
- [ ] Global toast: lift the designer toast into `core/frontend`, surface `DesignerDrcView` and
      `model-conversion.ts` silent catches, and translate `problem+json` by extending
      `commandErrorMessage`.
- [ ] DRC trust — remove or disable the broken thermal-relief check, fix the free-pad false
      `UNCONNECTED_NET`, then re-run `drc-parity-harness`.
- [ ] KiCad ZIP import: aggregate size cap in `routes.ts` (mirror the opclib 256 MB limit).
- [ ] Symbol-only import: warn or block on 0-pad components (`commit-kicad.ts`,
      `placeholder-footprint.ts`).
- [ ] Show *all* import warnings in an expandable list, not only the first.

### Security

- [ ] Path-traversal fix in Electron static serving — `path.resolve` both sides plus a separator
      boundary check.
- [ ] Evaluate `sandbox: true`; confirm `contextIsolation`, `nodeIntegration: false`, CSP and the
      `127.0.0.1` binding.
- [ ] GLB `sha256` validation after fetch, and partition `ModelCacheProvider` by `backendURL`.
- [ ] `/security-review` clean on the cumulative diff.

### Assistant readiness

- [ ] **Blocker:** default-provider fallback when the cloud flag is off (`settings-store.ts`,
      `Space.tsx`, `DesignerChatDock.tsx`).
- [ ] Pre-send config validation (base URL plus API key) and an `empty_response` banner with retry.
- [ ] Keep `manifest.json availability: "all"`; correct the "dev-only" assistant wording in README
      and `CLAUDE.md`.
- [ ] Assistant tests: `run-service` mock-provider integration plus a Playwright chat smoke.
- [ ] Failed-apply regression test for the write/apply path.

### CoreLibrary runtime updates — import and security hardening

The status service, routes and Settings UI shipped. What remains is the security envelope and its
test matrix. *One item needs verification first: the stricter-signature requirement may already be
satisfied by the production Ed25519 signing key minted and trusted on 2026-07-27.*

- [ ] Enforce `manifest.library.minOpenPcbVersion` when present (plus a rejection test).
- [ ] Replace the ad-hoc semver compare in `sync/bootstrap.ts` and `sync/package-locator.ts` with a
      prerelease-aware comparison.
- [ ] Fix the URL install redirect policy in `sync/install-source.ts` — manual redirects, or
      validate the final redirected host against an allowlist (plus a regression test).
- [ ] Prevent generic `/sources/install` from replacing `openpcb.core` unless the package is
      trusted and the caller opts into the core-replacement path.
- [ ] **Verify, then enforce:** a production official core update must be signed by the committed
      trusted key; dev and test may warn.
- [ ] Source collision guard — reject packages that overwrite rows owned by another source, unless
      it is an allowed core legacy-alias migration.
- [ ] Rework `reconcileSourceRows()` so stale core rows are deleted only when unreferenced by
      components or design placements; otherwise mark and retain (plus a retained-when-referenced test).
- [ ] Preview SVG and model-store cleanup for unreferenced cache files after safe reconciliation.
- [ ] Finish the `.opclib` integrity gate: manifest integrity, `library.id === "openpcb.core"`,
      minimum component threshold and trusted signature are in; the compatibility gate is pending.
- [ ] Remaining status-route matrix cases (no installed core, installed-only, bundled-only) and the
      Libraries panel state/enablement tests.

### Packaging and distribution

- [ ] Revisit auto-update metadata before the first public non-beta release.
- [ ] GPG-sign Linux artifacts (deb / rpm / AppImage) — currently all unsigned.
- [ ] AppImage zsync / update channel for AppImageUpdate-compatible in-place delta updates.
- [ ] Validate the remote release workflow and the downloaded app after a commit/tag/push.
- [ ] Deferred behind the signing triggers: macOS Developer ID + hardened runtime + notarization,
      Windows signing (Azure Trusted Signing is the recommendation; an EV token does not work in
      CI), the `release.yml` identity/notarize flips, and gating `allowPrerelease` behind
      `!app.isPackaged`.

### Test, QA and accessibility

- [ ] Flagship E2E: schematic capture, PCB route, export → ZIP validate, DRC/ERC UI, undo/redo,
      settings persistence, library drag-and-drop.
- [ ] Import integration tests (malformed / missing-model / oversized / signature-fail) plus an
      export validation harness.
- [ ] Frontend Vitest uplift — coverage is still thin.
- [ ] Fix or quarantine the `library-opclib-importer-idempotent-reimport.test.ts` flake.
- [ ] Accessibility baseline: aria labels, keyboard canvas navigation, a screen-reader pass.
- [ ] Project export/import for backup and portability — ZIP of schematic + PCB JSON with embedded
      models.
- [ ] Wire the new suites into `.github/workflows/ci.yml`.
- [ ] Per-OS clean-machine smoke: install, launch, deep link, design, export, 3D. Verify Gatekeeper
      and SmartScreen behaviour for the current unsigned reality, and auto-update from a prior build
      on Windows and Linux.
- [ ] Rollback / yank runbook, extending `.github/RELEASE_DRY_RUN.md`.

### Owner tasks and open questions

- [ ] `LICENSE-COMMERCIAL.md` plus a working `licensing@openpcb.app` inbox (the dual licence stands).
- [ ] GH secrets for Sentry; the signing secrets wait on the signing decision.
- [ ] Sentry: opt-in and off by default per the roadmap. Needs first-run consent, a Settings toggle,
      sourcemap upload in `release.yml`, and a live DSN. **Open:** is a DSN provisioned?
- [ ] **Open:** is `licensing@openpcb.app` monitored?

---

## 5. DRC production hardening (P0–P12)

Nine of thirteen milestones shipped: P0, P1, P2, P3, P5, P6, P8, P10, P11. Open: **P4, P7, P9,
P12** plus the review follow-ups. Tracks: [E]ngine, [C]hecks, [I]nfra. Branch
`feat/drc-p<N>-<slug>`.

**Binding decisions.** Full scope — core plus DFM plus electrical plus SI · scoped priority rules
(first-match, *can relax*, board-minimum floor) · full multilayer 2–32 · breaking changes allowed
with migration (violation-id v2, KiCad-aligned severities, live net-class resolution).

**Open bugs.** 19 audit findings remain unresolved and are tracked as `test.todo` in
`drc-audit-b*.test.ts`. They are enumerated with mechanism and file anchors in
[`docs/drc/OPEN_FINDINGS.md`](docs/drc/OPEN_FINDINGS.md) — do not restate them here.

- [ ] **B3-1 has no owner.** An unrouted `GND` net reports DRC-clean on a default board: GND-named
      nets are dropped from the ratsnest *before* any pour-existence check, and with the default
      empty `copperFillLayers` you get neither `UNCONNECTED_NET` nor `ISOLATED_COPPER_ISLAND`. It is
      tracked as a regression test but appears in no milestone's "Owns" line. Rated HIGH, and an
      existing test codifies the wrong behaviour. **Assign it.**

- [ ] **P4** [I] **Backend spatial index.** rbush static trees per item kind (trace / pad / via /
      hole / edge-segment) held on the DRC context; the query ceiling must include `SHORT_EPS`.
      Query plus index-sorted candidates must preserve `(i asc, j asc)` emit order so reports stay
      byte-identical — that byte-identity is the gate. `broadPhase: 'rtree' | 'exhaustive'` stays in
      permanently as an oracle, not as a migration switch. Also `pointInFlattenedOutline` over
      precomputed rings, `scripts/drc-bench.ts`, kernel-count assertions, and a fuzz pass.
      Depends on P2. Target: 10k primitives under 300 ms.
- [ ] **P7** [I] **Async DRC + engine relocation + live/batch parity.** A `'designer.drc'`
      TaskRuntime executor (scope id `drc:<designId>`) with slice-yield every 256 items and between
      groups, SSE progress and `AbortSignal` cancel; the route runs synchronously at ≤2000
      primitives and otherwise returns `202 {taskId}`. `run-helper.ts` dedupes the four call sites.
      The engine moves to `src/shared/drc/` behind re-export shims so live DRC and the worker
      consume the identical engine (only the net-class resolver and fab presets block the move, and
      both are pure). Live rewrite covers rotated pad rings, through-hole pads on all layers,
      session vias, neighbour net class and the short tier. **Parity acceptance:
      `|measured_live − measured_batch| ≤ 1e-9`; cancel must leave no partial persistence.**
      High blast radius. Depends on P4, and on P6 for live rules.
- [ ] **P9** [C] **DFM overlay checks** — courtyard, silk-over-pad, mask sliver/bridge, copper
      sliver, acute angle. Needs a `drc-context-overlays.ts` extraction: world-transformed graphics,
      courtyard loop-chaining with a bbox + 0.25 mm fallback, silk strokes and mask apertures built
      **at Gerber parity** with the writer. Depends on P2, and on P8 for the mask dam.
- [ ] **P12** [I] **Rules and severity UI** — `PcbRulesTableEditor`, severity grid, waiver-comment
      flow, `customFabProfile` editor. The backend contracts (`drcRules`, `drcSeverityOverrides`,
      `customFabProfile`, `diffPairs`) are all persisted and ready to bind. Depends on P3, P6, P7.
- [ ] **Review follow-ups** — enforce scalar scoped constraints (trackWidth / via / annular / hole /
      edge rules; v1 enforcement is clearance-only), apply the scoped-rule optional severity, wire
      the v1→v2 waiver migration, improve area-scope closest-point precision (today it tests a
      representative midpoint and can over-relax a long trace), and fix cutout crossing-overlap
      (vertex containment misses perpendicular crossing rects).

**Program exit:** all 40 audit regressions live with zero `test.todo`, golden boards matching, and
a 6-layer board routing and checking end-to-end.

---

## 6. Backlog

Unscheduled. Nothing here is committed to a release.

- [ ] **Export dialog — rest of the overhaul.** Fab-preset selector, per-layer and per-artifact
      selection, individual-file downloads. Extend `GerberExportOptions` *and* `parseExportOptions`
      — new fields that are not added to the parser are silently dropped over HTTP.
- [ ] **MPN data sources.** Map MPN/LCSC from KiCad symbol fields on import (in
      `@openpcb/kicad-import`), a component-editor sourcing UI, and optional CoreLibrary `.opclib`
      sourcing. The columns and the BOM inheritance plumbing are already in place; this populates them.
- [ ] **4-layer UI.** Current position, stated precisely because the old tracker contradicted
      itself three ways: after DRC P2 the type model supports **stackup 2–32**; the Gerber/drill
      export path handles 2 and 4 layers (12 artifacts for 2-layer, 14 for 4-layer); and
      `PcbBoardPanel.tsx` still renders a **hardcoded static "2-layer" pill** that is not bound to
      `board.layerCount`. The earlier "N-layer beyond 4 is impossible" claim is false and has been
      dropped. Remaining work is the UI: a layer-count / fabricator picker replacing the pill,
      per-design board thickness (`job-file.ts` hardcodes 1.6 mm), inner-layer Gerber validation
      (In1/In2.Cu, drill spans, via annuli, `.gbrjob` stack-up) and a 4-layer export-validation
      fixture. Note the cloud snapshot contract is deliberately pinned to 2/4 even though the
      desktop is 2–32.
- [ ] **Document plaintext API-key storage.** Keys are stored in plaintext today; `safeStorage` is
      the 1.1 plan. Until it lands, do not ship a "saved, encrypted locally" badge — document the
      actual behaviour instead.
- [ ] **Batch-undo grouping.** "Single undoable batch" is not true today: `groupId` is
      dataset-capture-only, so a compiled circuit costs one Cmd+Z per command — 40 for the 5-LED
      build. Needed for compiled circuits and for command batches generally.
- [ ] **Cloud Teams — desktop integration P1.9–P1.11. Not started.** The cloud side (org
      workspaces, members/roles, per-design grants, share links, role-aware authz) shipped and was
      E2E-validated 2026-06-10; the desktop side is the only remaining P1 work. Shared designs must
      become cloud-authoritative in the editor while personal and unshared designs stay local-first.
      P1.9 is the `cloud_link_authority` migration plus `cloudLink` authority fields (re-verify the
      next free migration number). P1.10 is `dispatchToCloudAndReplicate` — projection-driven
      refetch, **not** replay — plus a reversible authority upgrade/downgrade and a "Shared with me"
      list; note `linkDesignToCloud` cannot be reused because it early-returns. P1.11 is
      read-only/offline gating. P2 (WS client plus SSE push) and P3 (client rebase, multiplayer
      undo) follow later. **Full spec: `../docs/TODO-teams-sharing.md`** — that copy is authoritative.
- [ ] **Drill slot authoring.** Write-side create-command plus the `routes.ts` parser and an
      inspector UI for free hole/pad slots, plus canvas slot rendering; then footprint-pad slots and
      KiCad `(drill oval W H)` import. Read and export paths already exist.
- [ ] **THREE-free copper-fill kernel** — replace `THREE.Path` in the relocated kernel with plain
      point-array arc maths so `shared/rendering/copper-fill` carries no THREE dependency.
- [ ] **Visual verification before a production fab run** — render a board with copper pours and
      silk text in gerbv or the JLCPCB online viewer, and validate bottom-side CPL rotation against
      JLCPCB's 3D assembly preview. Top-side rotation is solid.
- [ ] **E2E with the 555-blinker fixture** plus a manual JLCPCB DFM check. Deferred to the first
      real fab attempt.
- [ ] **ESLint + `eslint-plugin-boundaries`** for compile-time `core ← shared ← sdks ← modules`
      enforcement.
- [ ] **Copper zones / keepouts.** Pour fill renders and exports to Gerber `G36/G37`;
      KiCad-imported zones are outline-only; keepouts are still pending.
- [ ] Library variants / families / presets / provenance.
- [ ] Symbol and footprint editor expansion — multi-unit, alternate graphical body styles.
- [ ] OpenAPI codegen pipeline — revisit `gen:openapi` if and when frontend SDK regeneration is needed.
- [ ] E2E test expansion beyond smoke.
- [ ] Housekeeping: reconcile the shared `package-lock.json` left dirty by the `ai-core` 0.3.0 /
      `contracts` 0.2.4 bumps, delete the local FF-merged `fix/library-model-double-apply-guard`
      branch, and confirm a tag-based build on a fresh CI runner.

**Wontfix.** Schematic wire → PCB trace auto-sync. The bridge between schematic and PCB is the
netlist; ratsnest plus manual routing replaces it.

**Not doing (export).** Protel filenames, a UTF-8 BOM on the BOM CSV, and mixed-side splits — both
target fabs accept X2 filenames, a UTF-8 BOM risks JLC's column auto-mapper, and mixed-side is
informational. IPC-2581 / ODB++ / Gerber X3 component layers are deferred; X3 is the best-ROI
"intelligent format" when revisited, but it depends on MPN inheritance landing first.

---

## Proposals

Unbuilt, unscheduled feature proposals live in `docs/proposals/`:

- [`f1-design-blocks.md`](docs/proposals/f1-design-blocks.md) — reusable hierarchical design blocks
- [`f2-parametric-components.md`](docs/proposals/f2-parametric-components.md) — templated components
- [`f3-kicad-project-import.md`](docs/proposals/f3-kicad-project-import.md) — full KiCad project import
