> **Unmerged local branch (S1 note, 2026-07-12):** `integ/trace-drag` — 6 commits (~1.9k lines: trace segment drag editing, vertex handles, 555-blinker fab fixture + tests). Unpushed; push then integrate or rebase. Do not delete.

# Route Tool Evolution (active 2026-07-11)

> Plan (7 phases, UX-first): `~/.claude-personal/plans/act-as-expert-on-snoopy-sketch.md`.
> Locked decisions: length tuning before bundles · walkaround-lite (no shove) · batch-per-session
> commit · rbush only new dep · through-vias v1 · DRC hard-block+explain · match groups +
> in-tool target · diff pairs by `_P/_N` suffix.

## Done — P1 zero-config UX polish (green: bun test + vitest + tsc -b + e2e smoke)

- [x] P1.1 finish-anywhere: Enter/End + double-click + context-menu Finish (`pcb/tools/route-interactions.ts`)
- [x] P1.2 same-net copper finish (trace-interior click) + backend T-junction connectivity (`ratsnest.ts`)
- [x] P1.3 Route HUD (`pcb/RouteHud.tsx` + `pcb/tools/route-hud-model.ts`): net · layer · width+source · via · live length · DRC · key hints
- [x] P1.4 width precedence (`widthSource` netclass|preset|manual) + reset-to-netclass + Alt+W inline input (window.prompt removed)
- [x] P1.5 keymap coherence (`pcb/tools/route-keymap.ts`); fixed dead `T`→F.Cu hotkey; H/P/T/M/R inert while routing
- [x] P1.6 error surfacing: problem-detail toast (`pcb/dispatch-failure.ts`); sessions survive backend rejection
- [x] P1.7 pad-shape connectivity behind `pcb.padShapeConnectivity` dev flag (AABB endpoint acceptance; graduate after bake)

## Done — P2 commit engine + P3 multi-layer (green: bun test + vitest + tsc -b + e2e smoke)

- [x] P2a `pcb_commit_route` atomic batch (types + parser + executor, validate-all-then-insert-all, 1 revision/undo; atomicity + one-undo tests)
- [x] P2b session accumulation: `RouteSessionBoundary[]` log in reducer (runs + vias, event-carried paths), smart-via/width-split fully local, ONE `commitRoute` at finish, cross-boundary Backspace (reopens the run behind a via), pending geometry feeds snap/guides/rendering (`routePendingPreview`/`routePendingVias`)
- [x] P2b fix: `activeLayer`/`visibleLayers` stripped from undo ECS world + re-attached in `applyHistoryPatches` (layer switches no longer pollute undo; also fixed board-size redo corruption from the missing re-attach)
- [x] P2c DRC commit gate: finish blocked on clearance conflicts (all runs), HUD explain + session-only "allow violations" override
- [x] P2d rbush spatial index (`pcb/spatial-index.ts`): snap + live-DRC broad-phase; `computePadGeoms` hoisted; snap tolerance now 8px/zoom (was fixed 0.5mm — release-note)
- [x] P2e Shift suppresses object+guide snap (grid stays); keymap hints updated
- [x] P3 via spans: optional `fromLayer/toLayer/viaType` on via commands + `resolveViaSpan` validation (stackup order, layerCount, through=F↔B) behind `pcb.advancedVias` dev flag; `nextRouteLayer` + layer-pair selector (view store + toolbar, 4-layer); V cycles the pair

## Done — P4 auto-finish + walkaround + P5 length matching (green: bun test + vitest + tsc -b + e2e)

- [x] P4 pure module `src/shared/pcb-routing/` (int-nm, deterministic, Bun-tested): `collision.ts` (slab clip, boundary-contact OK, canonical order, clusters) · `route-obstacles.ts` (segment-level rects, live-DRC `required` parity, same-net/layer skips) · `auto-finish.ts` (direct→elbow→corridor octile A*→pull-tight; ok/no-path/over-cap/target-blocked) · `pull-tight.ts` · `corner-fixup.ts` (45° chamfer-vs-hugged-corner: 1µm SAFETY search margin + bounded corner cuts) · `walkaround.ts` (cluster wrap, CW/CCW, 1.25× hysteresis) · `meander.ts` (square/chamfered U's, last-U binary-search trim, obstacle shrink ladder)
- [x] P4a auto-finish UX (`pcb.routeAutoFinish` dev flag): Tab → nearest ratsnest pad (shared `route-target.ts`, WYSIWYG with the dashed guide) · Ctrl/Cmd+Click pad (pure `resolveRouteClickAction` "auto-finish") · dimmed proposal preview (TracePreviewLayer opacity) · HUD row Enter-accept/Esc-dismiss · accept = `finishRoute(extraAnchorsNm)` through the existing gate+atomic commit · stale-on-any-session-change
- [x] P4b walkaround-lite (`pcb.routeWalkaround` dev flag): ghost head bends around the hit cluster inside the `routePreview` memo (~53µs/move @60 obstacles); endpoint never moved (snap wins); commit parity via `commit-waypoints` reducer event + `extraAnchorsNm`; HUD "detour" chip; blocked ⇒ today's collision highlight
- [x] P5 length matching (`pcb.lengthTuning` dev flag): `PcbBoardSettings.lengthMatchGroups` (parse+clear semantics, `pcb_set_design_rules` threading, HTTP round-trip test) · backend DRC `checks/length.ts` (`NET_LENGTH_OUT_OF_RANGE`, longest/absolute, unrouted skipped) · shared `polylineLength` · Route HUD live gauge "total/target" · rules-dialog match-groups editor (chips, add/remove, target kind, tolerance)
- [ ] **P5 Tune tool — review-session fixes landed (diagonal meanders, span halo, hover pick, honest statuses — see Next); pending manual QA on a real board before checking off**: `tools/tune-tool-state.ts` reducer (click trace → sweep span → freeze → +/- amplitude, ,/. pitch → Enter commit via `pcb_update_trace_geometry`, one undo) + `tune-hud-model.ts` (override>group>none, band) + `TuneHud` (typed target override — anti-KiCad-v8) + toolbar Tune (U) + serpentine ghost preview
- [x] Drive-by fixes the new E2Es exposed: RouteHud/workspace-error toast were nested under `autoLayoutEnabled` (invisible without cloud config) — moved to general overlays; global Escape now exits Tune mode

## P6 bundle routing + diff pairs — code + review-session glitch fixes landed (tests/tsc/e2e green); pending manual QA

- [x] P6 pure geometry `shared/pcb-routing/bundle-geometry.ts`: integer-exact parallel offset of mixed 45/90 polylines (4 line families + miter intersections, ≤1nm diagonal parity nudge), miter-blow-up/degenerate detection, `assignLaneOffsets` monotone pad→lane mapping (no fan-out crossings)
- [ ] **P6 Bundle tool — ghost-stability fixes landed (see Next); pending manual QA before checking off** (`pcb.bundleRouting` dev flag, toolbar-only): click pads to collect (toggle; amber rings; wrong-layer pads rejected) → free-space click routes ONE centerline from the pad centroid → N ghost lanes at pitch with per-pad elbow connectors (degraded lanes hold last-good geometry in amber, never blink out) → `,`/`.` pitch, ⌫ step-back (waypoints→pads), Enter = gate (every lane vs committed copper AND vs the other lanes; hard block, no override) + ONE atomic `pcb_commit_route` = one undo · `tools/bundle-tool-state.ts` reducer + BundleHud
- [ ] **P6 diff pairs — pending Bundle tool manual QA** (locked: suffix convention only): `tools/diff-pair.ts` (`_P/_N` case-preserved, trailing `+/-`); clicking a pad auto-collects the nearest partner-net pad; new optional `PcbNetClass.diffPairGapMm` sets pair pitch (falls back to clearance); field STRIPPED from the cloud BoardSnapshot (`SnapshotNetClass = Omit<…>`, builder copy) to keep the wire schema byte-stable
- [ ] Skew tuning = P5 Tune on the shorter leg (no extra code; usable once Tune passes manual QA)

## Next

- [x] **Fix Tune tool (review session 2026-07-12)** — root cause was axis-only meanders (real boards are 45-routed → mostly diagonal runs → generator placed nothing): `meander.ts` now builds U's in a per-segment LATTICE FRAME (integer step vectors; diagonal U legs = diagonal families, chamfers = axis segs; all vertices exact integer nm) so diagonals meander too · statuses split honestly (`target-met` / `blocked` / `span-too-small`) with per-status HUD copy + dimmed Enter when nothing to apply · painted-span halo scene pass (`slicePolylineByArcLengthNm`, always visible while tuning) · idle hover highlights the trace under the cursor (any VISIBLE copper layer; pick adopts the trace's layer). Tests: meander diagonal/blocked/target-met, span slicer. **Remaining before graduating `pcb.lengthTuning`: manual QA on a real 45-routed board.**
- [x] **Fix Bundle tool ghost glitches (review session 2026-07-12)** — lanes hid mid-drag because `ok:false` lanes were FILTERED out (offset legitimately degenerates whenever the cursor leg is shorter than the outer lane's miter) and lane sides reshuffled because the fan-out dir came from the posture-"auto" first render segment: lanes now NEVER unmount — degraded lanes render last-good geometry (per-pad cache) in amber; stable `fanOutDir` (octant-snapped centroid→first-waypoint/cursor, frozen once routing); cursor dropped from the centerline while within max-lane-offset+pitch of the last anchor (lanes hold instead of collapsing); ok/degraded lanes batched into ONE LineSegments2 each (kills N×-per-move geometry churn + index-key remounts) · amber rings mark collected pads in-scene · wrong-layer pad clicks rejected with a HUD notice (visible in idle too) · lane points deduped before commit. **Remaining before graduating `pcb.bundleRouting`: manual QA (breakout connector quality near tight pin rows still v1 — see bundle v2).**
- [ ] Route/walkaround drive-bys from the same review: walkaround re-queries obstacles over the detour's own bbox when it outgrows the head window (ghost detours can no longer cross unseen copper) · `snap`/`snapPoint` now useCallback (per-move memos stopped recomputing every render) · auto-finish corridor-vs-broad-phase gap documented (gate re-validates on accept). Remaining: none — listed for release-notes context.
- [ ] P7 cloud corridor routing (optional — only if bundle usage shows demand)
- [ ] Follow-up: migrate `/autoroute/apply` onto `pcb_commit_route` (per-op vs all-or-nothing UX decision)
- [ ] Follow-up: pad-bearing E2E fixture board → full Tab→accept + tune-a-trace + bundle pad-collect + one-undo-multi-via scenarios (blocked on library fixture infra)
- [ ] Follow-up: bundle v2 — target-row landing (lanes end dangling v1), via support, per-net lane widths, crossing warnings when pads aren't monotone, smarter breakout connectors (posture-auto elbows can cross near tight pin rows) · diagonal-segment obstacle AABB pre-split (≤2mm) if dense-board QA shows auto-finish misses · walkaround multi-cluster (diagonal meanders DONE 2026-07-12)
- [ ] Release-notes when graduating flags: snap 8px/zoom (P2d), `pcb.padShapeConnectivity` DRC shift, auto-finish/walkaround/lengthTuning/bundleRouting behavior
- Note: `library-facets.test.ts` core-catalog count failure is pre-existing (fails on clean tree, unrelated) · library/3D E2Es are load-flaky when the full suite runs back-to-back (all pass in isolation)

---

# Cloud Copilot → local compiler agent (active 2026-07-08)

> Separate effort from everything below. Full context/decisions:
> `~/.claude/plans/act-as-expert-on-snug-nest.md`. Narrative: `HANDOFF.md`. State: `CURRENT_STATE.md` (top section).
> Goal: local-first compiler copilot (LLM → IR → deterministic expand + ERC), no whole-design sync, cloud = tools + model gateway.

## Now

- [ ] **P1.3 `compile_circuit(IR)` AiTool** — Ajv-validate IR → resolve roles→componentIds (LibrarySDK) → `expandCircuit → lowerNetlist → applyCompiledPlan` → ERC gate + report → register in `openpcb-tool-registry.ts` + clarify-first/installed-only/schematic-only guards.

## Done (all green: bun test + tsc -b)

- [x] P0 resolver ranking fix (LDR-for-resistor) — tag-based category scoring in `tools/library-tools.ts` + regression tests. (Deviation: no new column — category == tags[0].)
- [x] P1.1 IR + primitive block + deterministic expander (`compiler/{ir,units,blocks,expander}.ts`)
- [x] P1.2a lowering `ResolvedNetlist → CompiledPlan` (`compiler/lowering.ts`)
- [x] P1.2b live apply + apply-time pin resolution (`compiler/apply.ts`) — tested vs a fake DesignerSDK
- [x] Atomic place+wire — rescoped: apply-time deferred resolution (provisional-index infeasible; place_part owns ref/pin ids)

## Next

- [ ] P1.3 (above) then live 5-LED smoke (OpenCode/DeepSeek) — real-designer fidelity (apply only fake-tested so far)
- [ ] More primitive blocks (decoupling, pull-up/down, RC)
- [ ] P2 data recipes + additive editing · P3 edit reconciliation · cloud stateless tools + model gateway · golden-IR/fixture/telemetry validation
- [ ] (deprioritized) `get_design_state` completion-pressure read

---

# Release 1.0 — Production Hardening (active 2026-06-21)

## CoreLibrary Live Link Setup (active)

- [x] Add dev CoreLibrary pack watcher script and `dev:*:corelib` wiring
- [x] Unify CoreLibrary import/status policy for dev SHA changes
- [x] Add backend live `.opclib` watcher for development
- [x] Refresh Library frontend list/facets/detail from installed SHA changes
- [x] Verify with targeted backend tests, CoreLibrary validation, typecheck/codegen, runtime QA

> Goal: ship a **signed, notarized, auto-updating `1.0.0`** (macOS signed now / Windows method
> chosen pre-launch), AI assistant **visible** (local providers; cloud presets dev-gated),
> **4-layer in scope**, **Sentry on-by-default + first-run consent**, full hardening.
> Plan: `~/.claude/plans/act-as-senior-software-snug-piglet.md`. Basis: 17-area code audit +
> adversarial verification (2026-06-21). Branch landed: `feat/release-1.0-hardening`.

## Phase 0 — Release prerequisites (owner)

- [ ] Apple Developer Program + **Developer ID Application** cert (.p12) + App Store Connect API key (notarytool)
- [ ] GH secrets: `CSC_LINK`/`CSC_KEY_PASSWORD`, `APPLE_API_KEY`/`_ID`/`_ISSUER`, `APPLE_TEAM_ID`, `SENTRY_*`
- [ ] Windows signing method chosen before launch (recommend **Azure Trusted Signing**; EV token ≠ CI)
- [ ] `LICENSE-COMMERCIAL.md` + working `licensing@openpcb.app` inbox (dual-license kept)

## Phase 1 — Correctness & data-integrity (no certs)

- [x] **1.1** Atomic `deleteDesign` + 8 missing tables (`store.ts`) + regression test `designer-delete-design.test.ts`
- [x] **1.4** Schematic initial-view invalidate (`SchematicCanvas` `requestRender()` on fit/frame/initial-viewport)
- [x] **1.5** Wire self-loop backend reject (`create-wire.ts` `sourcePinId === targetPinId`)
- [ ] **1.2** Graceful shutdown — SIGTERM/SIGINT close server+sqlite; electron backend-manager awaits exit before `app.quit()`
- [ ] **1.3** Global error handling — React error boundary + `window` error/unhandledrejection + main `uncaughtException`/`unhandledRejection` → Sentry + crash/recover UI; sweep release-critical silent `catch {}`
- [ ] **1.6** Global toast (lift designer toast → `core/frontend`) + surface `DesignerDrcView` + `model-conversion.ts` silent catches; translate `problem+json` (extend `commandErrorMessage`)
- [ ] **1.7** DRC trust — remove/disable broken thermal-relief; fix free-pad false `UNCONNECTED_NET`; re-run `drc-parity-harness`
- [ ] **1.8** KiCad ZIP import aggregate size cap (`routes.ts:1444`; mirror opclib 256 MB)
- [ ] **1.9** Symbol-only import 0-pad component warn/block (`commit-kicad.ts:137`, `placeholder-footprint.ts:89`)
- [ ] **1.10** Show all import warnings (`Space.tsx` expandable list, not just first)

## Phase 2 — Signing / updater / Sentry / version / docs (needs Phase 0)

- [ ] macOS Dev ID + `hardenedRuntime:true` + `entitlements.plist` + notarize; `afterSign.cjs` guard (ad-hoc only when no identity)
- [ ] Windows signing wired once method chosen (pre-launch; interim builds unsigned)
- [ ] `release.yml`: mac `CSC_IDENTITY_AUTO_DISCOVERY` flip + notarize step; `releaseType` prerelease→release; drop `--prerelease`
- [ ] Auto-update: gate `allowPrerelease` behind `!app.isPackaged`; verify feeds; test update from prior build
- [ ] Sentry ON + first-run consent + Settings toggle; sourcemap upload in `release.yml`; verify DSN/project live
- [ ] Version → `1.0.0` (root + `electron/package.json` — release.yml asserts match)
- [ ] Docs: fix README "signed/notarized" claim; add `LICENSE-COMMERCIAL.md`; fix stale doc links; correct assistant "dev-only" wording; update `ROADMAP.md`

## Phase 3 — Security hardening

- [ ] Path-traversal fix in Electron static serving (`path.resolve` both + separator boundary)
- [ ] Evaluate `sandbox:true`; confirm `contextIsolation`/`nodeIntegration:false`/CSP/`127.0.0.1`
- [ ] GLB `sha256` validation after fetch + `ModelCacheProvider` partition by `backendURL`
- [ ] `/security-review` clean on cumulative diff

## Phase 4 — AI Assistant polish (visible, local providers)

- [ ] **BLOCKER** default-provider fallback when cloud flag off (`settings-store.ts:71`, `Space.tsx:152/393-407`, `DesignerChatDock.tsx:142/219-223`)
- [ ] Pre-send config validation (baseUrl + API key); `empty_response` UI banner/retry
- [ ] Keep `manifest.json availability:"all"`; correct README/CLAUDE.md "dev-only" wording
- [ ] Document plaintext key storage (safeStorage → 1.1); write/apply failed-apply regression test
- [ ] Assistant tests: `run-service` mock-provider integration + Playwright chat smoke

## Phase 4b — 4-layer board support (in 1.0)

- [ ] Layer-count / fabricator picker UI in `PcbBoardPanel.tsx` (replace hardcoded "2-layer")
- [ ] Validate inner-layer Gerber (In1/In2.Cu), drill spans, via annuli, `.gbrjob` stack-up
- [ ] Per-design board thickness (`job-file.ts:24` hardcodes 1.6 mm)
- [ ] 4-layer export-validation fixture

## Phase 5 — Test, QA & accessibility

- [ ] Flagship E2E: schematic capture, PCB route, export→ZIP validate, DRC/ERC UI, undo/redo, settings persist, library drag-drop
- [ ] Import integration tests (malformed / missing-model / oversized / sig-fail); export validation harness
- [ ] Frontend Vitest uplift (from ~4 files)
- [ ] Fix/quarantine `library-opclib-importer-idempotent-reimport.test.ts` flake
- [ ] Accessibility baseline (aria labels, keyboard canvas nav, screen-reader pass)
- [ ] Project export/import (backup/portability) — ZIP schematic+pcb JSON + embedded models
- [ ] Wire new suites into `.github/workflows/ci.yml`

## Phase 6 — Cross-platform smoke & launch

- [ ] `release.yml` rc tag; per-OS clean-machine smoke (install/launch/deep-link/design/export/3D)
- [ ] Verify Gatekeeper (mac) + SmartScreen (win, once signed) + auto-update from prior build
- [ ] **Windows signing in place before promoting rc → 1.0.0**
- [ ] Rollback/yank runbook (extend `.github/RELEASE_DRY_RUN.md`)
- [ ] Cut `v1.0.0-rc.1` → promote `v1.0.0`; update `web/` download page

## Release 1.0 — open questions (do not block Phase 1/4/4b)

1. Windows signing vendor (Azure Trusted Signing recommended)
2. Live Sentry DSN/project provisioned?
3. `licensing@openpcb.app` monitored?
4. Unsigned Windows acceptable for `rc.1` smoke only?

---

# OpenPCB Rewrite Tracking

## Decisions (locked)

- ECS storage: JSON blob per entity
- Command idempotency: keep command log table
- Net rebuild: full rebuild on each relevant change
- Schematic→PCB sync: auto-sync on schematic changes
- Migrations: automatic on startup

## Current Status

- Canvas comments implementation validated 2026-06-10: local-first schematic+PCB anchored Markdown threads, screenshot attachments (<=5MB), cloud sync via comments module, AI tagging deferred.
- Branch `aggresive-cleanup` merged to `master`. Phases 1–3 complete; Phase 4 partially shipped (trace routing, vias, layer switching, live DRC, ratsnest).
- F4 drill cutouts + lime outline + unified drill selector: **shipped** (`pcb-drills.ts:collectDrills`, `BoardFill` ShapeGeometry holes, `DrillLayer` RingGeometry).
- F5 Part B free entities (free hole / free pad / manual smart via): **shipped** (commands `pcb_add_free_hole/pad`, `pcb_add_manual_via`, migration `0008_pcb_free_entities.sql`, `FreePadLayer`, toolbar tools, `PcbCanvas.placeSmartVia`).
- Manufacturing export (Gerber X2 + Excellon + BOM + PnP + ZIP + Export dialog): **shipped 2026-05-17**; **overhauled 2026-06-02** (P0 correctness — copper FileFunction L-code/`,Signal`, CPL rotation, copper-pour `G36/G37`; plus Excellon decimals, `.gbrjob`, export preflight, silk-text rasterization, determinism, dialog warnings) — see "Manufacturing Export Overhaul (2026-06-02)" section below. **First fab-able beta is unblocked.**
- Active sprint: post-merge cleanup + dead-code removal (see plan in `.claude/plans/act-as-senior-software-resilient-meadow.md`).

## Cloud Teams + Sharing — Desktop integration (PENDING, 2026-06-10)

Full handoff: **`CURRENT_STATE.md`** (this dir). Plan:
`~/.claude/plans/act-as-senior-software-atomic-lightning.md`. Cross-repo tracker:
workspace-root `TODO.md`. Memory: `project_teams_sharing_collab_plan`.

The cloud backend (cloud-api) + web dashboard + SDK for company/team usage are **DONE +
E2E-validated 2026-06-10** (org workspaces, members/roles, per-design grants, share links,
role-aware authz). The **desktop integration is the only remaining P1 work** — shared
designs must become cloud-authoritative in the editor; personal/unshared stay local-first.

- [ ] **P1.9** `designer/backend/migrations/0016_cloud_link_authority.sql` (next free = 0016) + `cloudLink` Drizzle: `authority` (`local_first`|`cloud`), `cloud_role` (UI hint),
      `cloud_workspace_kind`, `applied_revision`, `read_only`.
- [ ] **P1.10** `dispatchToCloudAndReplicate` (projection-driven refetch, NOT replay;
      per-design queue; `baseRevision=applied_revision`; 200→refetch; 409→resync; 403→read-only;
      block `pcb_*`); `upgradeLinkToCloudAuthority` (don't reuse `linkDesignToCloud` — it
      early-returns); `downgradeLinkToLocalFirst` (un-share is reversible); widen lossy
      `CloudProjection` (`core/frontend/src/cloud/queries.ts`); shared-open via
      `existingCloudDesignId` (skip `/seed`); "Shared with me" list.
- [ ] **P1.11** read-only/offline gating (`editable = cloud authority && role editor+ &&
  connected`), offline banner + never-synced-offline empty state, role via
      `GET /v1/designs/:id/access`, role-gated toolbar/palette, `commandErrorMessage` for
      `FORBIDDEN_ROLE`/`OFFLINE_READONLY`/`PCB_NOT_SHARED`.
- [ ] **P2 (later)** backend WS client (`cloud-ws-client.ts`, ref-counted) + SSE→renderer
      (reuse tasks SSE) for live command/presence push.
- [ ] **P3 (later)** client rebase + per-user multiplayer undo (gated on a field-level patch refactor).

Files: `src/modules/designer/backend/{schema,store,cloud-sync,routes}.ts` ·
`frontend/{api,hooks/useDesignerWorkspace,Space,components/CloudDesignBrowser}` ·
`core/frontend/src/cloud/queries.ts`.

## Agentic Loop Upgrade (Phases 0–4) — LANDED 2026-06-02

Full record: `~/.claude/plans/act-as-senior-ts-foamy-treasure.md` + handoff
`docs/assistant/agentic-loop-upgrade.md`. Verified by 3-round Codex (gpt-5.5) review
(FAIL→FAIL→CONCERNS) + live E2E (OpenRouter Sonnet-4.5 built a 555 blinker, ERC 0/0/0).
Shipped on `master` @ `6443b69` (release v0.1.0-beta.7); shared `ai-core-v0.3.0` +
`contracts-v0.2.4` released; off-link gate green (typecheck 0, backend 609/0, ai-core 69/0).

**Implemented:**

- P0 loop correctness (ai-core run-loop): honor tool-own `ok:false`→`run.tool.failed`;
  build turn from `run.message.completed` (non-streaming providers); terminal event for
  every requested/capped/cancelled call (no orphan `tool_call_id`s); balanced model
  envelope `{ok,status,summary,warnings,truncated,data}` + `modelResultJson`/`modelData`
  split; `max_completion_tokens` fallback; abort-after-exec persists the completed result.
- P1 Ajv validation: `validateToolInput` compiled once at registration; called before exec.
- P2 tool staging: unbound `create→place→wire` exposed up-front in one run.
- P3 ERC connected-semantics: pin connected only with a real second endpoint/NC
  (`netIsConnected`); single-pin nets no longer false-"connected"; electrical-type gating.
- P4 DoD verifier + correction harness: BOM-intent table (`0009`), `getProjectionAndErc`
  single snapshot, 4 hard-fail checks, dynamic shrink-or-stall re-run, partial+proposed-fixes.
- Idempotency: `action_id` on write tools; UNIQUE index (`0010`) backstop (F6).
- Truthful results: partial/failed auto-apply → `ok:false`/`partial`; failed-event carries
  the balanced envelope for faithful replay (#3); deduped no-call warning (#4).

## Agentic Loop — Remaining / Deferred (follow-ups)

Not blocking; intentionally out of the Phases 0–4 scope.

- [ ] **P5 — Prompt + context engineering** (assistant backend `prompt-service.ts` +
      `run-service.ts`): agentic-mode triad (persistence / tool-first / principled-stop),
      two-register by capability-probe (drop plan-then-reflect for reasoning models),
      inject live design summary into the system prompt (`buildDesignContextSummary` already
      exists — reuse), lean read-tool envelopes (connectivity/summary diffs), additive presets.
- [ ] **P6 — Loop robustness heuristics** (ai-core `run-loop.ts`): fingerprint dedup keyed on
      `{tool, normalizedArgs, designRevision}` + outcome; no-progress/stall detection via
      design-revision signal; per-tool call caps; wall-clock timeout (warning codes already
      reserved in `events.ts`).
- [ ] **Emulated-tool-call guard**: weak/distilled local models (e.g. oMLX
      `Qwen3.5-27B-Distilled`) emit tool-call-shaped ```json in assistant *content* instead of
real `tool_calls` → narrate fake progress, no build, DoD never runs. Detect the pattern
      and surface it (don't let the model claim a build it didn't do). Surfaced during E2E.
- [ ] **Reconcile shared `package-lock.json`** (dirty from the 0.3.0/0.2.4 version bumps):
      `cd ../shared && npm install` then commit, or leave as workspace state. Not part of the
      released subtrees, so it doesn't affect consumers.
- [ ] **Clean up** local merged branch `fix/library-model-double-apply-guard` (FF-merged into
      master; local-only) — optional.
- [ ] **CI / clean-clone check**: the off-link gate proved beta.7 builds from the tags
      locally; confirm on a fresh CI runner. (Note: plain `npm install` can keep a stale git
      dep — force with `npm install @openpcb/ai-core@github:…#ai-core-v0.3.0 …` if needed.)

## Active Assistant Release-Readiness (P0→P2 fixes + hardening)

Plan: `~/.claude/plans/read-openpcb-assistant-findings-handoff-robust-island.md`. Shared dev: edit `../shared/packages/{ai-core,contracts}/src` → build → `npm run shared:link`; restart Vite after `src/modules`/`src/shared` edits; verify headed, **27B only** (OOM).

- **P0 empty bubbles**: reasoning_content discarded + payload bloat (13 tools + ~7KB prompt) + no empty-completed fallback.

Status: Phases 0–6 implemented + green (typecheck clean; backend 450 pass; frontend 198 pass; ai-core 38 pass). Phase 7 = release tagging (needs push auth) + headed Playwright (needs oMLX :8000 up).

### Phase 0 — testability seam + dev unblock

- [x] `run-service.ts`: optional `buildClient` in `RunServiceOptions` (default `buildAiProviderClient`)
- [~] dev: clear poisoned `assistant_provider_capability` omlx row (probe fix prevents re-poison; clear at verify time)

### Phase 1 — P0 payload reduction

- [x] `stageRegistryForBindings()` bind-gated staging (unbound 5 tools, bound 13) — tested
- [x] wire into `run-service.ts` (after providerAllowsTools gate)
- [x] condense `TOOL_INSTRUCTIONS` → core (always) + write-workflow (bound only) in `prompt-service.ts`

### Phase 2 — P0 reasoning capture + empty-completed fallback

- [x] ai-core `events.ts`: `reasoningContent?`/`finishReason?` on completed event
- [x] ai-core `openai-compatible.ts`: capture reasoning_content/reasoning; emit in completed
- [x] ai-core `run-loop.ts`: pass through finishReason/reasoning
- [x] contracts `AssistantMessageMetadata.ai`: `reasoning?`/`truncated?`/`emptyResponse?`
- [x] backend `run-service.ts`: runState threading + empty-completed detect + auto-retry + persist reasoning
- [x] FE `Space.tsx`: `run.warning` handler; onTerminal keep-empty-run→failed+lastError
- [x] FE `MessageCard.tsx`: collapsed "Show reasoning" disclosure (auto-open when empty)

### Phase 3 — P1 probe + finish_reason

- [x] ai-core `probeToolCall`: maxOutputTokens 16→256; length→inconclusive (never cache false)
- [x] ai-core `run-loop.ts`: `run.warning(truncated)` on length; accurate finishReason
- [x] backend/FE: surface truncated warning (metadata.truncated + MessageCard note)

### Phase 4 — P1 composer auto-grow

- [x] `ChatComposer.tsx`: scrollHeight auto-grow (value-driven useLayoutEffect) + reset on send

### Phase 5 — P2 hardening

- [x] chat-selection race guard; rename committing state + draft-keep; dismissible error banner
- [x] SSE parse drop counting; wire `"disconnected"` status; a11y (aria-label/live/current); Export-markdown impl; removed Attach-file stub

### Phase 6 — tests

- [x] ai-core tests (reasoning capture, probe finish_reason, truncation, sse drop) — 38 pass
- [x] backend `assistant-run-service.test.ts` (empty/retry/reasoning/staging) — 7 pass

### Phase 7 — release + verification

- [ ] tag ai-core-v0.2.0 + contracts-v0.2.3 (push to shared repo — needs user auth); then `shared:unlink` + bump deps + reinstall
- [~] typecheck + test:backend + test:react + ai-core bun test = ALL GREEN; headed Playwright (a)-(e) pending oMLX :8000

## Active Dev CoreLibrary Integration

- [x] Add OpenPCB dev script to pack sibling `../CoreLibrary` as fixed `999.0.0-dev` package.
- [x] Prefer `../CoreLibrary/dist` only in development runtime; keep release/package builds using bundled resources.
- [x] Allow normal dev DB to switch back from dev core package to bundled release package.
- [x] Reconcile stale core rows when a reimported `.opclib` removes components/symbols/footprints.
- [x] Cover locator precedence, bootstrap switching, and stale cleanup with focused backend tests.

## Active CoreLibrary Runtime Update Hardening

Decisions:

- Runtime update source: GitHub Releases for `OpenPCB-app/CoreLibrary`.
- Default channel: stable releases only.
- Signature policy: require trusted Ed25519 signatures in production/package builds; warn in dev/test.
- UI surface: Settings → Libraries.
- Stale core rows: remove only unreferenced stale rows; keep rows referenced by user data/designs.

### Phase A — backend update/status service

- [x] Add `src/modules/library/backend/sync/core-library-updates.ts`.
- [x] Expose installed core release summary: version, channel, package SHA, signature status, component count, installedAt.
- [x] Expose bundled package summary from `locateBundledOpclib()` without importing it.
- [x] Add GitHub Releases client using `fetch` directly; do not depend on `gh` CLI at runtime.
- [x] Filter default remote candidates to non-prerelease stable releases only.
- [x] Download selected `.opclib` plus `SHA256SUMS`; verify SHA before import.
- [~] Verify `.opclib` manifest integrity, `library.id === "openpcb.core"`, minimum component threshold, and trusted signature (signature required in production; compatibility gate pending).
- [ ] Enforce `manifest.library.minOpenPcbVersion` when present.
- [ ] Add routes:
  - [x] `GET /api/modules/library/core-library/status`
  - [x] `POST /api/modules/library/core-library/check`
  - [x] `POST /api/modules/library/core-library/update`
- [x] Return structured update state: `missing | up_to_date | bundled_update_available | remote_update_available | blocked | error` (implemented states currently exclude explicit `blocked`; update failures return problem details).

### Phase B — import/security hardening

- [ ] Replace ad-hoc semver compare in `sync/bootstrap.ts` and `sync/package-locator.ts` with prerelease-aware comparison.
- [ ] Fix URL install redirect policy in `sync/install-source.ts`: use manual redirects or validate final redirected host against allowlist.
- [ ] Prevent generic `/sources/install` from replacing `openpcb.core` unless package is trusted and caller opts into core replacement path.
- [ ] Enforce stricter signature behavior: production official core update must be signed by committed trusted key; dev/test may warn.
- [ ] Add source collision guard: reject packages that attempt to overwrite rows owned by another source unless it is an allowed core legacy alias migration.
- [ ] Rework `reconcileSourceRows()` so stale core rows are deleted only when unreferenced by components/design placements; otherwise mark/retain.
- [ ] Add preview SVG/model-store cleanup follow-up for unreferenced cache/files after safe source reconciliation.

### Phase C — Settings UI

- [x] Add Core Library card at top of `src/core/frontend/src/settings/panels/LibrariesPanel.tsx`.
- [x] Show installed version, bundled/latest version, latest remote version after check, signature state, component count, and last check error.
- [x] Add `Check for updates` button.
- [x] Add `Download update` button when `remote_update_available`.
- [x] Disable update button with clear reason when no remote update is available; backend surfaces unsigned/incompatible/untrusted failures.
- [x] Refresh `/sources` after successful update.
- [x] Dispatch/listen to a lightweight library-updated event so open Library space refreshes component list.

### Phase D — tests / validation

- [~] Backend: status route with no installed core, installed-only, bundled-only, bundled newer, remote newer (covered installed+bundled and bundled-newer; remaining cases pending).
- [x] Backend: prerelease semver ordering and stable-only filtering.
- [x] Backend: reject unsigned/untrusted prod core update; warn/allow in dev.
- [ ] Backend: reject incompatible `minOpenPcbVersion`.
- [ ] Backend: URL redirect allowlist regression.
- [ ] Backend: stale core rows retained when referenced and removed when unreferenced.
- [ ] Frontend: Libraries panel update states and button enable/disable behavior.
- [ ] Run focused backend tests, frontend tests for panel, `npm run typecheck`, `npm run gen:check` if SDK/routes generated code changes.

## Active Electron Desktop Stabilization

- [x] Diagnose module 404s in Desktop: Electron backend loaded `better-sqlite3` with Node ABI instead of Electron ABI.
- [x] Add native dependency ABI check/rebuild before Electron dev/package flows.
- [x] Fail fast when required Desktop modules (`library`, `designer`) do not load.
- [x] Hide settings panels backed by unavailable modules.
- [x] Harden Electron window policy, CSP, and release resources.
- [x] Validate with typecheck, Electron build, frontend build, module validation, focused migration test, and packaged Desktop smoke.

## Active Electron Desktop Release E2E Gate

- [x] Add packaged Electron Playwright smoke that launches the desktop binary, validates backend/bootstrap/security, creates a design, and verifies persistence after relaunch.
- [x] Add `electron-desktop` Playwright project and npm script.
- [x] Gate `release.yml` matrix with packaged desktop E2E on macOS, Windows, and Linux/Xvfb before publishing.
- [x] Validate locally with typecheck, packaged macOS build, and packaged Electron smoke.
- [x] Run updated release workflow via GitHub Actions after commit/push approval.

## Active PCB Canvas UX Optimization

- [x] Add centralized PCB visual-state resolver for layer/net focus.
- [x] Apply Flux-like route-focus after first routing click only.
- [x] Keep same-net copper bright across layers during route focus.
- [x] Use neutral ratsnest and white pending route preview.
- [x] Add route hint / active-session hotkey strip.
- [x] Improve layer panel active styling with layer-colored accent.
- [x] Improve component selection with cyan bbox and handles.
- [x] Make mask, paste, drills, selection, and ratsnest follow live component drag positions.
- [x] Validate with typecheck/tests and Playwright manual review.

## Active Electron Forge + Electron-owned backend migration

- [x] Migrate Electron packaging from electron-builder to Electron Forge.
- [x] Start backend as Electron-owned localhost server.
- [x] Remove Bun sidecar runtime and package path.
- [x] Update release workflow for Forge artifacts.
- [x] Validate typecheck, frontend build, Electron build, and macOS Forge make locally.
- [ ] Revisit auto-update metadata before first public release.
- [x] Add AppImage maker/hook after Forge baseline.
- [ ] GPG-sign Linux artifacts (deb/rpm/AppImage) — currently all unsigned.
- [ ] AppImage zsync/update channel for AppImageUpdate-compatible in-place delta updates.

## Active Electron Beta Release CI

- [x] Configure electron-builder for GitHub prerelease publishing on beta channel.
- [x] Keep macOS development builds unsigned/ad-hoc until signing secrets are provided.
- [x] Add macOS `dmg` + `zip` targets for updater metadata.
- [x] Add packaged-app beta auto-update checks via `electron-updater`.
- [x] Add tag-triggered GitHub Actions matrix for macOS arm64, macOS x64, and Windows x64.
- [x] Validate locally with Electron typecheck, frontend build, Bun sidecar compile, mac arm64 package, and screenshot.
- [ ] Validate remote release workflow and downloaded app after commit/tag/push approval.

## Active Task System + Assistant Modules

- [x] Add hidden-sidebar module support.
- [x] Add hidden `tasks` module with persisted runtime, chunks, events, SSE, SDK.
- [x] Add visible `assistant` module with global chats and env-configured OpenAI/Ollama/LM Studio providers.
- [x] Add read-only tools plus simple confirm/reject flow scaffold for write tools.
- [x] Add persisted Assistant provider settings + API keys.
- [x] Add global Settings → Assistant provider configuration UI.
- [x] Redesign Assistant chat UI with professional IDE styling.
- [ ] Verify with typecheck, backend/frontend tests, module validation, gen check.

## Active 3D Regression Fix

- [x] Reproduce ATTINY-style ZIP+STEP import path and stuck conversion risk.
- [x] Trace ZIP model extraction, worker conversion, backend upload, and preview flow.
- [x] Fix import wizard / ZIP STEP conversion UX: import commits first; conversion runs in background.
- [x] Add failed-state retry conversion in Library 3D preview.
- [x] Add ATTINY-style ZIP regression coverage and STEP conversion failure coverage.
- [~] Verify with focused backend/frontend tests. Full typecheck blocked by unrelated assistant/tasks WIP errors.

## Phase 0 — Browser Dev Stabilization (done)

- [x] Frontend lazy-loads `src/modules/*`
- [x] Module catalog and SDK exports for `library` + `designer`
- [x] Module/shared TypeScript coverage in root `npm run typecheck`
- [x] Playwright browser smoke tests
- [x] Verified: typecheck + backend + frontend + e2e

## Phase 1 — Architecture Alignment (done except boundary lint)

- [x] `src/sdks/` structure (`library`, `designer`, root token map)
- [x] SDK contracts migrated from `src/contracts/modules/*` to `src/sdks/*`
- [x] Backward-compatible facade exports in `src/contracts/modules/*`
- [x] Shared ECS core (`entity`, `component`, `world`, `query`, `system`)
- [x] Shared command+patch infrastructure (`patch`, `apply`, `invert`, `history`)
- [x] Backend tests for ECS and patch/history foundations
- [x] Shared command/patch infrastructure integrated into designer runtime store
- [ ] Boundary enforcement lint rules (deferred — see Backlog)

## Phase 2 — Designer Domain Rewrite (done)

- [x] ECS component model for schematic entities (part/wire/label/net/primitive)
- [x] Command handlers emit ECS patches
- [x] Apply/invert/history flow wired into dispatch pipeline
- [x] Full net rebuild system from ECS world
- [x] Projection builder from ECS world
- [x] Real undo/redo in backend + frontend controls
- [x] Backend tests for command idempotency, history, undo/redo, nets, junctions
- [x] Per-session undo/redo snapshots persisted across runtime reloads
- [x] Designer result parsing, history state, projection/world, wire geometry helpers extracted from `store.ts`
- [x] Command execution extracted into `command-executor.ts`
- [x] Projection read mapping in `projection-read.ts`

## Phase 3 — Basic PCB Foundation (done)

- [x] PCB board settings entity types and persistence
- [x] Persisted empty PCB projection with default 100x80mm board
- [x] Basic PCB tab canvas + board-size settings form
- [x] PCB undo/redo with separate history session from schematic
- [x] PCB render ordering (grid < fill < outline)
- [x] Canvas mount stable across revision changes
- [x] PCB entity/component types for placements
- [x] Auto-sync schematic parts into PCB placements (center + deterministic offset)
- [x] Component placement rendering via FootprintRenderLayer
- [x] Pad world-position helper + net↔pad correlation (pin.number == pad.number)
- [x] Ratsnest (Prim's MST per net, always-on)
- [x] PCB placement selection + drag-to-move + R rotate, with combined-world undo/redo
- [~] Schematic wire → PCB trace auto-sync — **wontfix**, replaced by ratsnest + manual routing. Bridge between schematic and PCB is the netlist.

## Manufacturing Export (v0, shipped 2026-05-17)

- [x] Gerber X2 writer (`src/modules/designer/backend/export/gerber/writer.ts`) — copper / mask / paste / silk / Edge.Cuts per Ucamco spec with `.FileFunction`, `.FilePolarity`, `.AperFunction`, `.TO.N` attributes; rect / circle / obround / roundrect (aperture-macro) apertures.
- [x] Excellon drill writer (`export/excellon/writer.ts`) — Metric LZ, FMAT,2; PTH/NPTH grouped by diameter with annotation comments.
- [x] BOM CSV writer (`export/bom/writer.ts`) — JLCPCB-compatible columns; refdes grouping; alphanumeric refdes sort (R1 < R2 < R10).
- [x] Pick-and-place CSV writer (`export/pnp/writer.ts`) — Designator, Val, Package, Mid X/Y mm, Rotation, Layer.
- [x] ZIP packager (`export/zip.ts`) — STORE method, hand-rolled CRC-32; no external deps.
- [x] Orchestrator (`export/index.ts`) — produces 12 artifacts for 2-layer board, 14 for 4-layer.
- [x] Backend route `POST /api/modules/designer/designs/:designId/exports/gerber` (`?format=zip` for binary download, default JSON manifest).
- [x] Frontend export dialog (`pcb/PcbExportDialog.tsx`) + toolbar button on PcbCanvas.
- [x] 23 Bun unit tests covering Ucamco X2 compliance, Excellon spec, BOM grouping, PnP rows, ZIP signature + CRC-32 reference vector.

## Manufacturing Export Overhaul (2026-06-02)

Audit + deep standards research (Ucamco Gerber X2/X3 2024.05, Excellon/XNC, JLCPCB/PCBWay CPL+BOM) → fixed correctness bugs that silently corrupted fab data, then added assembly + robustness. Full record: `~/.claude/plans/act-as-senior-ts-tingly-sunset.md` + memory `manufacturing-export-overhaul`. Target fabs: **JLCPCB + PCBWay + spec-clean universal bundle**. Verified: **51 export + 625 backend Bun tests green**, modules + frontend typecheck clean, and **Playwright-verified live** on the "Dual LED Blinker" board.

### Shipped — P0 correctness (was manufacturing/assembly-blocking)

- [x] Copper FileFunction L-code from `board.layerCount` — B.Cu was hardcoded `Copper,L2,Bot` (wrong; must be `L4` on a 4-layer board) + missing `,Signal`. JLCPCB/PCBWay read X2 attributes first, so this misidentified the stackup. (`gerber/writer.ts`)
- [x] **Soldermask `FilePolarity,Negative` verified CORRECT** (KiCad-standard; the research pass flagged it a "P0 bug" — a false positive, conflating soldermask polarity with deprecated negative copper-plane files). No change made.
- [x] CPL rotation rewrite (`pnp/writer.ts` + new `pnp/rotation-db.ts`, canonical matthewlai/JLCKicadTools DB): footprint-family offset, bottom-side `(180−rot)`, SMD-only filter, DNP exclusion, `Top`/`Bottom` casing, per-part `propertiesJson.pnpRotation` override. `buildPnpCsv` now takes overrides (threaded via orchestrator + `pnp.csv` route). Store is Cartesian Y-up → no Y-flip needed.
- [x] Copper pours → positive `G36/G37` regions, using the canvas's OWN clipper fill kernel (`buildCopperFillPourPaths` added to `frontend/pcb/layers/copper-fill-geometry.ts`; backend reuses it — clipper2-ts + THREE proven Bun-safe). Outer dark region + `%LPC%` antipad holes (spec-preferred over cut-ins); pour emitted before pads/traces/vias. Config read from `board.viewState.copperFillLayers` / `copperFillPourNetIds`.

### Shipped — P1 / P2

- [x] Excellon: explicit-decimal coords (eliminates zero-suppression ambiguity, the #1 drill-rejection cause) + `; #@! TF.FileFunction,Plated/NonPlated,1,N,…,Drill*` CAM comment + `G05`.
- [x] `.gbrjob` Gerber Job File (`export/gerber/job-file.ts` + `gerber.job` artifact kind) — GeneralSpecs (size from outline bbox, layer count, thickness) + FilesAttributes; deterministic project GUID.
- [x] Export preflight (`export/preflight.ts`) populates bundle `warnings[]` — fab-preset min-drill/min-trace (`FAB_PRESETS`), missing outline, unsourced assembly parts.
- [x] **Silkscreen text rasterization** — new monospace single-stroke font `export/text/stroke-font.ts` + `textToStrokes` (matches canvas anchor: justify + vertical-middle; rotation/mirror); `emitSilk` emits overlayTexts as NonConductor stroke polylines. (Closes the v0 backlog item.)
- [x] Determinism — `createdAt` threaded through Gerber `%TF.CreationDate%` + `.gbrjob` → byte-identical bundles for identical inputs.
- [x] Mask/paste expansion honored from `board.solderMaskExpansionMm` / `solderPasteExpansionMm` (was hardcoded 0.05 / none); collapsed paste openings dropped.
- [x] Shared `exportBundleName` (`sdks/designer/pcb-helpers`, barrel-exported) — removed the duplicated backend `makeBundleName` / frontend `clientBundleName`.
- [x] Export dialog surfaces preflight **warnings + file count** — new `?format=summary` route (light: names + warnings, no file text) + `api.fetchExportSummary` + `ExportSummary`; dialog refetches on open/option-change. Playwright-verified on a real board.

### Shipped — follow-up wave (2026-06-02, commits 604e8cf + fa8ccdc)

- [x] **Architectural cleanup — copper-fill kernel relocated to `shared/`** (`604e8cf`). Moved the pure compute closure to `src/shared/rendering/copper-fill/` (kernel trio) + `src/shared/rendering/pcb/` (`outline-geometry`, `pcb-drills`); 5 re-export shims at the old paths keep canvas/3D/DRC/test consumers untouched; backend writer/job-file repoint to `shared`; scene helpers import from `@openpcb/r3f-eda-canvas` directly. Backend no longer imports across the frontend boundary. THREE kept (Bun-safe) — purifying to a THREE-free point kernel is a follow-up.
- [x] **Library→BOM MPN/LCSC inheritance — plumbing** (`fa8ccdc`). `library_components` gains manufacturer/manufacturer_part_number/lcsc_part_number/supplier (migration `0008`) + `LibraryComponent` fields + `mapComponent`; `buildPlacePartPayload` seeds the placement's `propertiesJson` from `detail.component` (BOM already reads those keys). Activates the moment a path writes the columns.
- [x] **Drill slots / oblong holes — free-entity read + export path** (`fa8ccdc`). `PcbDrillSlot {lengthMm,widthMm,angleDeg}` + optional `drillSlot` on `PcbFreeHole`/`PcbFreePad` (rides the JSON blob — no migration), parsed by the loaders; Excellon emits `G85` canned slots (tool = slot width) instead of a round hit. Chose `G85` over rout-mode `M15/M16` (JLCPCB-documented, stays in drill mode).

### Remaining

- [ ] **MPN data sources for #9 inheritance**: map MPN/LCSC from KiCad symbol fields on import (lives in `@openpcb/kicad-import` — shared pkg) + a component-editor sourcing UI + optional CoreLibrary `.opclib` sourcing. (Columns + inheritance plumbing are in place; this populates them.)
- [ ] **Drill slot authoring + full coverage**: write-side (create-command + `routes.ts` parser [HTTP-parser gotcha] + inspector UI for free hole/pad slots) + canvas slot rendering; then footprint-pad slots + KiCad `(drill oval W H)` import — both need shared pkgs (`@openpcb/rendering-core` `FootprintRenderSourcePad`, KiCad parser).
- [ ] **THREE-free copper-fill kernel**: replace `THREE.Path` in the relocated kernel with plain point-array arc math so `shared/rendering/copper-fill` carries zero THREE dep.
- [ ] **Export dialog — rest of overhaul**: fab-preset selector, per-layer / per-artifact selection, individual-file downloads (extend `GerberExportOptions` + `parseExportOptions` — new fields must be added to the parser or they're silently dropped over HTTP).
- [ ] **Visual verification before production**: render a board WITH copper pours + silk text in gerbv / JLCPCB online viewer (confirm clearances, thermals, glyph shapes); validate bottom-side CPL rotation against JLCPCB's 3D assembly preview (top-side is solid).

### Explicitly NOT doing (rationale)

- N-layer >4 — impossible: `PcbLayerCount = 2 | 4`, copper caps at In1/In2; the 2/4 handling is already complete.
- Protel filenames / BOM UTF-8 BOM / mixed-side split — both target fabs accept X2 filenames; a UTF-8 BOM risks JLC's column auto-mapper; mixed-side is informational. Low value / real downside.
- IPC-2581 / ODB++ / Gerber X3 component layers — backlog (X3 is the best-ROI "intelligent format" when revisited, but depends on MPN inheritance landing first).

## Phase 4 — PCB routing + DRC (partially shipped)

Shipped:

- [x] Trace + via entity model + migrations (`0005_pcb_traces.sql`)
- [x] Manual trace routing tool (Manhattan-90 + Manhattan-45 with corner chamfer)
- [x] Layer switching on V key (smart via: + / - flips layer, v drops via)
- [x] Live DRC (trace-trace + trace-pad clearance, same-net skip, same-layer filter, design-rule + net-class fallback)
- [x] Net classes applied via trace presets (Default/Power/GND with width/clearance/via dims)
- [x] Trace presets array on board settings ([0.15, 0.2, 0.25, 0.5, 1.0] mm)
- [x] Posture cycling (auto/axis/diagonal via `/` key)
- [x] Cursor layer chip + 45° corner chamfer
- [x] Schematic primitives (GND/PWR/net portals + wiring + edits)
- [x] Label upsert
- [x] Footprint editor + IPC-7351B preset generator + drawn-footprint commit path

Backlog:

- [x] Marquee / multi-select / group move on PCB
- [x] Trace split + reroute from context menu
- [x] Layer-visibility panel UI
- [x] Ratsnest visibility toggle UI
- [x] Explicit component-footprint `pinmap` with `pin.number == pad.number` fallback
- [ ] Trace segment drag editing

## Backlog (post-Phase 4)

- [ ] ESLint + `eslint-plugin-boundaries` for compile-time `core ← shared ← sdks ← modules` enforcement
- [x] Manufacturing export — Gerber X2, Excellon drill, BOM CSV, pick-and-place CSV (writers + route + ZIP packager + Export dialog; 23 Bun tests)
  - [ ] E2E with 555-blinker fixture + manual JLCPCB DFM check (deferred to first real fab attempt)
  - [x] Silkscreen text rasterization (overlay text → polylines on silk Gerber) — shipped in the 2026-06-02 overhaul (`export/text/stroke-font.ts`)
  - [x] Per-pad net-attribute (.TO.N) emission via projection net-pad correlation
- [ ] Library variants / families / presets / provenance
- [ ] Differential pair rules + length tuning
- [ ] Copper pours / zones / keepouts — pour fill renders (clipper kernel) **and exports to Gerber `G36/G37`** (2026-06-02); KiCad-imported zones are outline-only; keepouts still pending
- [ ] Symbol/footprint editor expansion (multi-unit, alt graphical body styles)
- [ ] OpenAPI codegen pipeline (revisit `gen:openapi` if/when frontend SDK regen is needed)
- [ ] E2E test expansion (currently smoke only)

---

# Future Feature Tasks

Each task below is a self-contained feature proposal. Tasks are deliberately verbose: they describe what the feature is, why it exists, how it should behave, the surfaces it touches, the verification strategy, and the open design questions to resolve before implementation begins. They are intended as planning artifacts — convert into checklist items per subtask when work starts.

---

## Task F1 — Reusable Design Blocks (Hierarchical Designs)

### What it is

A first-class mechanism to take an entire OpenPCB design (e.g. a 5 V switching regulator with its support components, layout, and routing) and **publish it as a reusable block**, then **drop that block into another design** as a single boxed entity exposing only its declared I/O terminals. Internally the block contains its full schematic and (optionally) its PCB sub-layout; externally, to the parent design, it looks and behaves like a multi-pin component.

Comparable concepts: KiCad hierarchical sheets, Altium device sheets, OrCAD blocks. OpenPCB has no equivalent today — every design is flat and standalone, and there is no parent/child or include relation between designs.

### Why it exists

- Designers repeatedly rebuild the same sub-circuits (power supplies, MCU power+decoupling, USB-C front ends, level shifters, op-amp filters). This is wasted time and a defect surface.
- A reusable block freezes a known-good circuit + layout once, then ships it as one immutable unit that can be wired in seconds.
- Encourages a culture of internal "circuit libraries" inside teams.

### How it should work

**Authoring**

1. User builds a normal design. Some primitives in that design are designated as **block ports** — these are the terminals that will become external pins of the block. Ports are likely a flag on existing `schematicPrimitives` (extending `net_portal`) or a new `block_port` primitive kind. Each port carries: name, electrical type (input / output / bidir / power / gnd), and an optional side hint for the auto-generated symbol (left / right / top / bottom).
2. User runs **Publish as Block**. The publish action prompts for: block name, version label, description, optional tags, and selection of which `net_portal`/`block_port` primitives to expose.
3. Backend produces an immutable snapshot bundle: the schematic ECS subset, optionally the PCB sub-layout (placements + traces + vias relative to the block origin), an auto-generated **block symbol** (rectangle with one pin per port, laid out by side hint and sortOrder), and optionally an auto-generated **block footprint** (bounding box around the contained PCB).
4. Bundle is persisted as a new row in `designer_blocks` plus a `designer_block_snapshots` row keyed by version.

**Placement**

1. The block appears in the component picker beside library components, with an indicator distinguishing it from a normal part.
2. Placement creates a `part_instance` (or new `block_instance` entity kind) referencing `blockId + blockVersion`.
3. The block renders on the schematic as its generated symbol box. Only port pins are externally connectable; all internal nets stay isolated from the parent design's net extraction.
4. On the PCB, depending on the chosen strategy (see Q3 below), either: (a) the block's contained footprints are flattened into the parent PCB at place time and grouped, or (b) the block is placed as a sub-region with a locked relative layout that can be moved/rotated as a unit.

**Net stitching**

- Each block port shows up to the parent's net extraction as a pin owned by the block instance.
- Internal nets of the block never leak names into the parent; parent nets connect only at port pins.

**Versioning and update**

- Each block instance pins to a `blockVersion`. Re-publishing the source design creates a new snapshot row (e.g. v2) but does not retroactively change existing instances.
- The inspector for a block instance shows the current pinned version, the latest available version, and an explicit "Update to vN…" action. Updates are user-initiated only — never silent.

**Editing inside a block**

- Out of scope for v1: editing block contents from inside a parent. To change a block, open the source design, edit, re-publish.

### Subtasks

- [ ] Data model: `designer_blocks`, `designer_block_ports`, `designer_block_snapshots`; migration `0008_blocks.sql`; add `blockInstanceId` / `blockVersion` columns to `schematicParts` or introduce `block_instance` entity kind.
- [ ] Port primitive: either extend `schematicPrimitives.kind` with `block_port` or add an `isPort` flag on `net_portal`; UI to mark/unmark ports inside source design; port property editor (name, electrical type, side hint, sortOrder).
- [ ] Publish flow: `publish-block` command + handler that freezes ECS subset + PCB sub-layout + generated symbol/footprint into a snapshot row. Roundtrip-tested.
- [ ] Symbol auto-generation: rectangular glyph with port pins distributed by side hint and order; generator lives in `src/shared/rendering/blocks/`.
- [ ] Placement: `place-block-instance` command; block instance entity rendering on schematic canvas; picker integration so blocks appear alongside library components (filterable by `kind = "block"`).
- [ ] Net stitching: projection-read includes port pins as connection points; internal net IDs namespaced to the block and not surfaced to parent.
- [ ] PCB sub-layout strategy (decision in Q3): flatten or sub-region; if flatten, group-tag the placed footprints with `blockInstanceId` so future selection/move operates as a unit.
- [ ] Version update: `update-block-instance` command that swaps the pinned `blockVersion` and remaps port pin IDs by name + type; inspector UI for current/latest/update.
- [ ] Unpublish: `unpublish-block` (soft-delete; existing instances remain readable from their snapshot, but block is hidden from picker).
- [ ] Bun tests: publish→place→wire→undo→redo; version pinning; update remap; port net stitching.
- [ ] E2E: build small regulator → publish → new design → place block → wire VIN/GND/VOUT → save → reopen → still valid.

### Files / surfaces (forecast)

- `src/modules/designer/backend/schema.ts`, `migrations/0008_blocks.sql`
- `src/modules/designer/backend/commands/{publish-block,place-block-instance,update-block-instance,unpublish-block}.ts`
- `src/modules/designer/backend/projection-read.ts` — include block port pins
- `src/modules/designer/backend/pcb/*` — flatten vs sub-region behavior at sync time
- `src/modules/designer/frontend/components/SelectionInspector/BlockInstanceInspectorPanel.tsx` (new)
- `src/modules/designer/frontend/components/PublishBlockDialog.tsx` (new)
- `src/shared/rendering/blocks/symbol-generator.ts` (new)
- `src/sdks/designer/types.ts` — `BlockDefinition`, `BlockInstance`, `BlockPort`, `BlockSnapshot`

### Verification

- Bun tests for publish/place/update/undo round-trip.
- E2E test for end-to-end authoring workflow on a small fixture.
- PCB regression: flattened footprint count matches source; group selection round-trips.

### Open questions

1. **Link vs snapshot semantics**: frozen copy, live link, or pinned-version with manual update? (Recommend pinned + manual update.)
2. **Scope**: schematic-only or also PCB sub-layout in v1?
3. **PCB strategy**: flatten footprints into parent, or sub-region with locked relative layout?
4. **Storage**: library-module-owned (`kind = "block"`) or designer-owned (`designer_blocks`)?
5. **Port UI**: new `block_port` primitive kind, or extend `net_portal` with an `exported` flag?
6. **Nesting**: allow blocks inside blocks in v1, or flat-only?
7. **Symbol glyph**: auto-rectangle, or user-drawn custom symbol?
8. **Cross-project**: importable across `.openpcb` files when that format lands, or local-DB only for now?

---

## Task F2 — Parametric Components

### What it is

A component definition that is **a typed parameter schema plus a deterministic generator function**, rather than a frozen symbol+footprint pair. The user picks a template (e.g. **Pin Header**), supplies parameters (rows = 2, pins per row = 10, pitch = 2.54 mm, mount type = THT, orientation = vertical), and the system materializes a concrete `library_components` row on demand. Many fixed library entries (today: `Pin Header 01x04`, `01x06`, `02x10`, `02x20`, screw terminals, mounting hole arrays, DIP sockets, edge connectors) collapse into a small number of templates.

### Why it exists

- Connector libraries balloon with near-identical entries (same pin geometry, only counts differ). This wastes storage, clogs search, and forces users to hunt.
- Parametric is a genuine differentiator versus KiCad, which has no real templated components (workaround is custom scripts).
- The library module already ships an IPC-7351B generator (Chip, SOT, SOIC, QFP, QFN families with size + density parameters). Parametric components are a generalization of that proven pattern.

### How it should work

**Templates**

- Templates are typed: each declares a parameter schema (subset of JSON Schema — int / float / enum / bool with bounds and defaults) and registers a generator factory in `src/shared/rendering/parametric/`.
- Built-in v1 templates: **pin header**, **screw terminal**, **mounting hole array** — these absorb the majority of redundant library entries.
- Templates are seeded the same way IPC-7351B / built-in resistors and capacitors are today (idempotent boot-time seeding phases).

**Materialization**

1. User picks a template in the library picker.
2. A parameter dialog opens — form auto-rendered from the template's parameter schema.
3. On submit, the backend hashes the parameter set, looks up `library_template_materializations`. On cache hit, reuse the existing `library_components` row. On miss, run the generator (which produces a `LibrarySymbolDetail` + `LibraryFootprintDetail` + auto-name + auto-tags + package code), insert the symbol/footprint/component rows, record the materialization, and return the new `componentId`.
4. From this point on, the materialized component is an ordinary library component — placed via the existing `place-part` command, no designer changes needed.

**Naming and tags**

- Auto-name is composed from the template + params: `Pin Header 02x10 2.54mm THT Vertical`.
- Auto-tags feed the existing tag search: `#connector`, `#pinheader`, `#tht`, `#2.54mm`, `#02x10`.

**Edit-after-place**

- The placed part stores `templateId` + `paramsJson` so the inspector can offer "Edit parameters…", which re-runs the generator, swaps the snapshot on the placement, and (optionally) creates a new materialized component or mutates the existing one.

**Generator versioning**

- Each materialization records the generator version. On bump, existing instances keep their old materialized output (frozen) until the user explicitly re-materializes. Same pattern as Feature F1 block versioning.

### Subtasks

- [ ] Data model: `library_templates` (id, name, kind, paramSchema JSON, defaultParams, generatorVersion, tags, isBuiltin), `library_template_materializations` (templateId, paramsHash, paramsJson, componentId).
- [ ] Migration `0005_templates.sql` in library module.
- [ ] Param schema spec: types int/float/enum/bool with bounds/units/defaults; validator + form-renderer types in `src/shared/rendering/parametric/param-schema.ts`.
- [ ] Generator registry: `src/shared/rendering/parametric/registry.ts` + per-kind generators (`pin-header.ts`, `screw-terminal.ts`, `mounting-array.ts`).
- [ ] Pin-header generator v1: rows × pinsPerRow grid; pitch; THT round/oval pads or SMD rectangular; vertical/horizontal orientation; reference designator `J?`.
- [ ] Backend routes: `GET /templates` (list), `GET /templates/:id` (detail with schema), `POST /templates/:id/materialize` (returns componentId).
- [ ] Frontend: `ParametricPickerDialog` with auto-rendered form (number input, enum select, bool toggle) + live preview canvas; integration into the library picker so templates show beside fixed components with an "fx" badge.
- [ ] Component detail page: surface `paramSchema` + `paramsJson` + "Re-materialize" button on materialized components.
- [ ] Designer part inspector: "Edit parameters…" action for placements of parametric components.
- [ ] Built-in seeding: register the three v1 templates in `src/modules/library/backend/builtins/templates/`.
- [ ] Bun tests: deterministic generator output (snapshot tests for representative param sets), materialization cache (same params → same componentId; different params → distinct componentId), param validation (out-of-range rejected).
- [ ] E2E: place 2×10 pin header, verify pin count = 20, footprint pad count = 20, thumbnail correct.

### Files / surfaces (forecast)

- `src/modules/library/backend/migrations/0005_templates.sql`
- `src/modules/library/backend/schema.ts`, `queries.ts`, `routes.ts`
- `src/modules/library/backend/builtins/templates/{pin-header,screw-terminal,mounting-array}.ts`
- `src/shared/rendering/parametric/{registry,param-schema,pin-header,screw-terminal,mounting-array}.ts`
- `src/modules/library/frontend/ParametricPickerDialog.tsx` (new)
- `src/modules/library/frontend/ParamSchemaForm.tsx` (new — generic form renderer)
- `src/modules/designer/frontend/components/SelectionInspector/PartInspectorPanel.tsx` — "Edit parameters…" action
- `src/sdks/library/types.ts` — `LibraryTemplate`, `LibraryParamSchema`, `MaterializeRequest/Response`

### Verification

- Deterministic snapshot tests on generator output across representative param matrices.
- Cache behavior tests (hash → componentId mapping).
- E2E placement + count assertions.
- Visual regression for thumbnails at representative parameters.

### Open questions

1. Which templates ship in v1? (Recommend pin header, screw terminal, mounting hole array.)
2. **3D models**: procedurally generate at materialize time, or accept "no 3D" with placeholder?
3. **Caching policy**: persist materializations forever, GC unused, or generate-on-demand without persistence?
4. **User-defined templates**: built-ins only in v1, or expose authoring (would need DSL or sandboxed JS)?
5. **Migrate existing builtins** (resistor/capacitor variants): fold into a parametric template, leave as variants, or both?
6. **Symbol vs footprint parameterization**: clarify boundary versus existing `library_component_footprints` variants table (variants = same symbol, multiple fixed footprints; parametric = both symbol and footprint vary by params).
7. **Place-time UX**: modal dialog before placement, or place defaults and edit-in-place?
8. **Relation to F1 (blocks)**: should a block be modeled as a parametric component? (Likely no — different lifecycle — but confirm.)

---

## Task F3 — Full KiCad Project Import

### What it is

An importer that consumes an **entire KiCad project** (a `.kicad_pro` bundle: project settings, one or more `.kicad_sch` schematic sheets, the `.kicad_pcb` board file, referenced footprints and 3D models) and produces **one OpenPCB design** containing all parts, wires, labels, primitives, PCB placements, traces, and vias, with **any missing components automatically ingested into the OpenPCB library** as part of the same operation.

Today OpenPCB only imports KiCad **library** files (`.kicad_sym`, `.kicad_mod`, ZIP bundles of those). It does not consume project files at all.

### Why it exists

- Migration barrier: anyone with an existing KiCad project cannot try OpenPCB on real work without rebuilding from scratch.
- The library module already proves out the s-expression parsing pipeline and the ZIP + STEP→GLB ingestion path; extending it to project files unlocks a major adoption funnel.
- KiCad's data model is close enough to OpenPCB's (refdes-keyed parts, footprint instances with `lib_id`, standard layer names already aligned with `PcbCopperLayerId`) that direct mapping is feasible.

### How it should work

**Input**

- Accept either a ZIP archive containing a KiCad project directory (`.kicad_pro` + sheet files + `.kicad_pcb` + optional `footprints/`, `symbols/`, `3dmodels/`) or, on Electron, a directory path via native file picker.

**Two-phase pipeline** (mirrors the library's `inspect → commit`)

**Phase A — Inspect**

- Parse `.kicad_pro` (JSON: project metadata, layer stackup, net classes, custom rules).
- Parse each `.kicad_sch` sheet (s-expr: symbol instances, wires, labels, junctions, hierarchical sheet refs, power symbols, no-connects).
- Parse `.kicad_pcb` (s-expr: footprint placements with refdes + `lib_id`, segments/arcs, vias, zones, nets, board outline polygons on Edge.Cuts, drill data).
- Build a **candidate report**: components found and their existing-or-missing status against the OpenPCB library, sheet count, layer count, total net count, board dimensions, warnings (unsupported features like zones, custom pad shapes, hierarchical sheets if flattening), and a dropped-data summary.

**Phase B — Commit (single transaction)**

1. Create a new `designer_design_heads` row with imported metadata and board settings (layer count from stackup, board dimensions from Edge.Cuts bounds).
2. For every referenced `lib_id`:
   - If matched in OpenPCB library by `(libraryName, partName)` hash → reuse.
   - Else extract from the project's resolved `sym-lib-table` / `fp-lib-table` paths and ingest via the existing `commit-kicad` library path. Record provenance tag `imported-from-kicad`.
3. Insert all schematic entities (parts with snapshots from the just-ingested library, wires normalized to Manhattan, labels, primitives for power symbols).
4. Insert all PCB entities (placements matched to schematic parts by refdes, traces as single-segment polylines, vias).
5. Map KiCad net names to OpenPCB derived nets; preserve names as label primitives at sensible positions; warn on mismatch between KiCad's declared net count and OpenPCB's derived net count.
6. Queue STEP→GLB conversions for any included 3D models via the existing background worker pipeline.
7. Seed a synthetic `import-kicad-project` entry in the command log so the entire import is a single undo step.

**Mapping (KiCad → OpenPCB)**

| KiCad                                 | OpenPCB                                                   |
| ------------------------------------- | --------------------------------------------------------- |
| `.kicad_pro`                          | new `designer_design_heads` + board settings              |
| `.kicad_sch` `symbol`                 | `schematicParts` + snapshot                               |
| `.kicad_sch` `wire`                   | `schematicWires` (Manhattan normalize; warn on diagonals) |
| `.kicad_sch` `label` / `global_label` | `schematicLabels`                                         |
| `.kicad_sch` `power`                  | `schematicPrimitives` kind `gnd` / `pwr`                  |
| `.kicad_sch` hierarchical sheet       | flatten to one sheet in v1; revisit with F1 blocks        |
| `.kicad_pcb` `footprint`              | `pcb_placement` + library footprint snapshot              |
| `.kicad_pcb` `segment`                | `pcb_trace` (single segment)                              |
| `.kicad_pcb` `via`                    | `pcb_via`                                                 |
| `.kicad_pcb` `zone`                   | **dropped with warning in v1** (zones are backlog)        |
| `.kicad_pcb` net                      | mapped 1:1; KiCad name preserved as label                 |
| Edge.Cuts polygons                    | board outline (v1: bounding box; full polygons later)     |
| Net classes                           | `pcb_net_classes` (unknown rules dropped with warning)    |
| 3D model refs (.stp/.step/.wrl)       | `library_footprint_models`, async STEP→GLB                |

**Transactional safety**

- Whole commit wrapped in a single Drizzle transaction. Any failure rolls back design + library inserts + command log entry — never a partial design.

**UI**

- `HomeScreen` gains an "Import KiCad Project" entry alongside "Create New Design".
- Wizard: file picker → inspect report (component list with "reuse" / "ingest" status, warnings, dropped-data) → confirm → progress (parsing → ingesting library → placing → conversion) → open imported design.
- Long-running progress backed by the Tasks module (SSE) — fits the existing async-task pattern.

### Subtasks

- [ ] Parser: `kicad-project-parser.ts` (`.kicad_pro` JSON; project settings, stackup, net classes).
- [ ] Parser: `kicad-schematic-parser.ts` (`.kicad_sch` s-expr; reuses `sexpr-parser.ts`).
- [ ] Parser: `kicad-pcb-parser.ts` (`.kicad_pcb` s-expr).
- [ ] Inspect route + report builder: counts, warnings, dropped data, missing-component diff.
- [ ] Commit pipeline: transactional designer + library ingestion; refdes-keyed schematic↔PCB merge.
- [ ] Net name preservation as labels + post-import net count verification.
- [ ] Synthetic `import-kicad-project` command for single-step undo.
- [ ] `HomeScreen` entry point + import wizard UI; progress via Tasks SDK.
- [ ] Bun tests: fixture-based round-trips (minimal one-resistor schematic; minimal two-via PCB; 2-vs-4-layer stackup detection; hierarchical flatten; missing-component library ingestion).
- [ ] E2E: import a small real-world KiCad project; open in designer; verify visible parts, wires, traces, vias.

### Files / surfaces (forecast)

- `src/modules/library/backend/infrastructure/parsers/kicad/{kicad-project-parser,kicad-schematic-parser,kicad-pcb-parser}.ts` (new)
- `src/modules/designer/backend/import/kicad-project/{inspect,commit,mapping}.ts` (new)
- `src/modules/designer/backend/routes.ts` — `POST /imports/kicad-project/inspect`, `POST /imports/kicad-project`
- `src/modules/designer/backend/commands/import-kicad-project.ts` (synthetic command for history)
- `src/modules/library/backend/import/commit-kicad-zip.ts` — reused for embedded library imports
- `src/modules/designer/frontend/KicadProjectImportWizard.tsx` (new)
- `src/core/frontend/src/components/HomeScreen.tsx` — entry point
- `src/sdks/designer/types.ts` — `KicadProjectInspectReport`, `KicadProjectCommitRequest`
- `tests/e2e/kicad-project-import.spec.ts`

### Verification

- Parser fixtures for each file kind with golden ECS output.
- Net count preservation assertion.
- Stackup detection (2 vs 4 layers).
- Round-trip E2E on a real open-source KiCad project.

### Open questions

1. **Zones**: skip with warning (v1), preserve as inert geometry, or block until supported? (Recommend skip + warning.)
2. **Hierarchical sheets**: flatten on import, preserve as F1 blocks, or store as separate sheet entities?
3. **Custom KiCad pad shapes** (rounded rect with chamfer, polygon pads): map to closest with warning, or refuse?
4. **3D model resolution**: require bundled models, path heuristics, or accept "no 3D"?
5. **Net class fidelity**: drop unknown rules (diff pair gap, microvia, uvia) with warning, or refuse?
6. **Re-import collisions**: always new design, or detect + offer merge? (Recommend always new design.)
7. **Schematic↔PCB correlation**: import sch first then merge PCB footprints by refdes, or treat as independent?
8. **Round-trip / export back to KiCad**: scope v1 import-only, or design with eventual round-trip in mind?
9. **KiCad version target**: v8 only, or v6/v7/v8 multi-version support? (Recommend v7+.)
10. **Library dedup**: identical component arriving from two different KiCad projects — merge by hash, or keep per-project copies?

---

## Task F4 — Real Drill Hole Rendering (See-Through Cutouts + Lime Outline)

### What it is

Replace today's drill hole rendering — opaque black `CircleGeometry` discs layered on top of the board substrate with depth-test disabled — with **real geometric cutouts in the board substrate**, so the user actually sees through the hole to the background behind the PCB. Each drill (both PTH pad drills and via drills) also gains a **lime-green outline ring** for high-contrast visibility, matching the reference screenshot.

### Why it exists

- Current rendering visually approximates a hole by stacking a black circle above the board fill (`depthTest: false`, `renderOrder: 7`). This is misleading: it doesn't read as "a hole." On a red soldermask board (or any colored background), the eye expects to see the canvas/background through the hole, not a black disc.
- Drill visibility is critical during routing and DRC review — small drills on dense boards disappear into copper. A bright lime outline at high contrast is the proven convention (visible in the reference image; also used by Flux.ai and several PCB review tools).
- The codebase already has the right precedent: `SolderMaskLayer.tsx` builds its translucent layer as a `ShapeGeometry` with `THREE.Shape.holes[]` for pad apertures. The same primitive can punch real holes into the board fill.

### How it should work

**True cutouts in the board substrate**

- `BoardFill` (in `PcbScene.tsx`) today renders a solid `PlaneGeometry`. Replace with a `ShapeGeometry`:
  - The outer contour is the board outline (rectangle in v1; full Edge.Cuts polygon later).
  - For every drill (every `via.drillMm > 0` and every pad with `pad.drillDiameterMm > 0`), push a circular path into `shape.holes[]` at the drill's world XY position with radius `drill / 2`.
- The board fill mesh now has actual missing geometry at every drill location. With nothing else rendered behind it, the WebGL clear color (canvas background, theme-driven) shows through naturally — this is what the eye reads as "a hole."
- Preserve the existing shoulder ring (a slightly larger plane behind the main board for the bevel effect). The shoulder remains solid; only the main board is punched. Result: each drill is a clean cutout against the shoulder/background.

**Per-side cutout consistency**

- Both copper layers (top/bottom views) read from the same global drill list — cutouts are identical regardless of viewing side. Drill layer's `reverseOnFlip: false` already aligns with this.

**Lime-green outline ring**

- Replace the unified `DrillLayer` `InstancedMesh` (currently black filled circles) with an **outline ring** using `THREE.RingGeometry(drillRadius, drillRadius + lineWidthMm, 32)`.
- Color: `#84cc16` (Tailwind lime-500) or `#a3e635` (lime-400) — final pick gated on contrast testing against board theme colors.
- Ring thickness: ~0.06 mm scaled (a few px at typical zoom). Keep the ring visually thin so it does not eclipse the actual hole.
- Material: `meshBasicMaterial` with `depthTest: false, depthWrite: false, transparent: false`.
- `renderOrder`: keep `RENDER_ORDER.DRILL` (= 7) for the ring slot, so it sits above the cut board fill but below copper and silkscreen.
- Mounting holes (large ≥ 1.5 mm holes) keep the existing magenta outer ring as a secondary marker; the lime outline still applies as the immediate hole boundary.

**Via rendering update**

- Today's `ViaLayer` draws (a) a copper-colored outer annulus and (b) a black inner drill circle.
- New behavior: outer annulus stays (copper color from `PCB_TRACE_COLORS[via.fromLayer]`), inner drill is now a **cutout** (handled by the board-substrate hole), and a **lime-green ring** marks the drill boundary on top of the cutout. Drop the black `CircleGeometry` inside.

**Performance**

- A single `ShapeGeometry` rebuild per board-fill change is cheap (drills typically number in the tens to low hundreds). Already done for soldermask aperture pads in `SolderMaskLayer.tsx` — same scale, same approach.
- Lime outlines are best as a single `InstancedMesh` of unit `RingGeometry` scaled per-instance, mirroring the existing instanced approach in `DrillLayer.tsx`.
- Invalidate on: placement add/move/remove, via add/remove, pad drill changes, board outline changes. Memoize otherwise.

**Theming**

- Lime outline color is a theme token (e.g. `PCB_DRILL_OUTLINE_COLOR`) defined in `src/shared/frontend/canvas/layers.ts` so it can be tuned without code edits.
- Background (WebGL clear color) remains theme-controlled; users on a lighter theme see drills as light cutouts, on a dark theme as dark cutouts — both read correctly because the lime ring provides the boundary regardless.

**Selection / hover affordance**

- Hovered or selected drills can boost ring opacity or brightness; not v1 scope, but design the ring color/width as a value passed in so this hooks in cleanly later.

### Subtasks

- [ ] Refactor `BoardFill` in `PcbScene.tsx` to construct `ShapeGeometry` with `shape.holes[]` collected from all current drills (vias + PTH pad drills).
- [ ] Build a single source of truth for the drill list — a memoized selector that collects `via.drillMm` from all vias plus `pad.drillDiameterMm` from all placement pads, returning `{ x, y, radiusMm }[]`.
- [ ] Rewrite `DrillLayer.tsx`: replace black `CircleGeometry` filled instances with lime `RingGeometry` outline instances. Keep `renderOrder: RENDER_ORDER.DRILL`.
- [ ] Remove the inner black `CircleGeometry` from `ViaLayer.tsx` (now redundant — handled by board cutout). Keep outer copper annulus + lime ring.
- [ ] Audit per-footprint drill rendering in `src/shared/frontend/canvas/scene/footprint-render-layer.tsx` (lines 354–371) — if it duplicates the unified DrillLayer's drill rendering, decide one source of truth and remove the other to avoid two coats of paint.
- [ ] Theme tokens: `PCB_DRILL_OUTLINE_COLOR`, `PCB_DRILL_OUTLINE_THICKNESS_MM` in `src/shared/frontend/canvas/layers.ts` (or wherever PCB colors live).
- [ ] Update `SolderMaskLayer.tsx` to ensure its aperture holes still align with the drill positions and don't fight the new substrate cutouts visually.
- [ ] Bun unit test: drill list selector returns the union of via drills + pad drills with correct world positions under placement rotation/mirror (extend `designer-pcb-pad-geometry.test.ts`).
- [ ] Bun render-order test: confirm `RENDER_ORDER.DRILL` is between board fill and copper layers; lime ring sits above the cutout (`designer-pcb-render-order.test.ts`).
- [ ] Playwright visual smoke: place a THT footprint and a via, take screenshot, assert lime ring pixels are present at drill centers and that the board fill alpha is zero at the drill centers.
- [ ] Manual verification on top view, bottom view, flipped view, and during routing (route-focus dimming must not eat the lime outline).

### Files / surfaces

- `src/modules/designer/frontend/pcb/PcbScene.tsx` — `BoardFill` rebuilt with `ShapeGeometry` + holes.
- `src/modules/designer/frontend/pcb/layers/DrillLayer.tsx` — outline rings instead of filled discs.
- `src/modules/designer/frontend/pcb/layers/ViaLayer.tsx` — drop inner black `CircleGeometry`.
- `src/shared/frontend/canvas/scene/footprint-render-layer.tsx` (lines ~354–371) — reconcile vs unified DrillLayer.
- `src/shared/frontend/canvas/layers.ts` — drill outline color/thickness tokens; renderOrder unchanged.
- `src/core/backend/tests/designer-pcb-render-order.test.ts`, `designer-pcb-pad-geometry.test.ts` — extend.
- `tests/e2e/pcb-drill-visibility.spec.ts` — new.

### Verification

- Visual: drill positions show the canvas background (with shoulder bevel framing) through real cutouts, with a crisp lime-green outline ring. Matches reference screenshot's read.
- Routing: drill outlines remain visible during live DRC and route-focus dimming.
- Bun tests for drill list collection, render-order constraints, and via geometry update (remove black inner disc).
- E2E screenshot diff on a known-good fixture.

### Open questions

1. **Outline thickness**: fixed mm value (zoom-independent — gets visually thin when zoomed out), or screen-space fixed px (constant on-screen regardless of zoom)? Reference image suggests screen-fixed; needs to be confirmed at very low and very high zooms.
2. **Color**: lime-500 (`#84cc16`), lime-400 (`#a3e635`), or different shade for dark vs light themes?
3. **3D board preview**: should the cutout extend through the 3D substrate as well (current 3D preview renders a substrate; would need geometry holes there too), or scope v1 to the 2D canvas only?
4. **Plated vs unplated drills**: visually distinguish (e.g. plated → lime + faint copper inner edge, unplated → lime only), or leave as-is for v1?
5. **Microvias / blind / buried**: out of scope today (no domain support); confirm we don't accidentally break their future rendering.
6. **Print/export rendering**: when Gerber/PDF export lands, cutouts must come from the same drill list — confirm shared selector lives at a layer that export can consume.
7. **Mounting hole interaction**: keep magenta ring overlay on ≥ 1.5 mm holes alongside the new lime outline, or retire the magenta convention in favor of unified lime?

---

## Task F5 — PCB Overlay Primitives + Manual Drop of Holes, Smart Vias, and Free Pads

### What it is

Two related additions to the PCB editor:

**Part A — Overlay primitives (drawn shapes on silkscreen / overlay layers)**

Tools to add free-form **silk text, rectangles, circles, lines, polylines, polygons, arcs, and SVG paths** directly onto the PCB canvas. These primitives are not associated with any footprint or net — they belong to overlay layers (F.SilkS, B.SilkS, F.Fab, B.Fab, F.Comments, Edge.Cuts when used for graphics, plus a generic "Drawing" overlay). They cover the everyday needs of board markings: company logos (SVG import), assembly notes, version strings, fiducial graphics, polarity marks, mechanical reference lines, debug labels, no-route keepouts (when drawn on a constraint layer later).

**Part B — Manual drop of holes, smart vias, free pads**

Tools to **place individual holes, vias, and free-standing pads** that are not part of a footprint — e.g. a single mounting hole, a stitching via to a copper pour, a test point pad, a fiducial pad. Each placed object opens a **floating inspector card on the right side of the canvas** (visually identical to today's component placement card) where the user dials in parameters: position (X/Y in mm), size, drill diameter, pad type (SMD / HOLE / STD / CONN), shape (Rectangle / Circular / Custom), lock toggle, layer assignment, net association (for vias and pads).

The inspector cards in the reference screenshots show: coordinate readout, "Hole Size" / "Size" field, a small color/style swatch dropdown, a shape dropdown (Rectangle / Circular / Custom), a pad-type dropdown (SMD / HOLE / STD / CONN), a lock icon, and a context arrow — this is the target visual language.

### Why it exists

- Every real PCB needs at least some board-level annotation: assembly markings, ref lines, fiducials, logos, version stamps. Today OpenPCB has no way to add them — only footprint-driven silkscreen.
- Free-standing holes/pads/vias are similarly common: mounting holes for standoffs, stitching vias on ground planes, test pads, edge fiducials. Currently the only way to get any of these is to author a custom footprint in the library module, which is heavy ceremony for what should be a single click on the PCB canvas.
- The reference screenshots show this is table-stakes UX in modern PCB editors. The floating inspector card pattern already exists in the codebase for component placement — reusing it keeps the editor consistent.
- The ECS world already has the right shape: PCB entities are JSON blobs in `designer_pcb_entities`, so adding new entity kinds (`pcb_overlay_shape`, `pcb_overlay_text`, `pcb_overlay_svg`, `pcb_free_pad`, `pcb_free_hole`) is a schema-light addition. Vias already exist as `pcb_via` and need only a "manual / not-from-footprint" provenance flag.

### How it should work

#### Part A — Overlay primitives

**Tool modes** (extend the existing PCB tool state machine)

Add tools to the PCB top toolbar (next to the existing Select / Route tools):

- **Text** (`T` key): click to place, then type in the floating inspector. Parameters: text content, font size (mm), thickness (mm), justification (left/center/right), rotation, mirror, layer.
- **Rectangle** (`R` in some-other-mode-resistant binding): drag from corner to corner; parameters: fill (none / solid), stroke width, rotation, layer.
- **Circle**: click center, drag radius; parameters: radius, stroke width, fill, layer.
- **Line / Polyline**: click waypoints, double-click or `Enter` to commit; parameters: stroke width, segment mode (free / Manhattan), layer.
- **Polygon**: closed polyline with fill option.
- **Arc**: three-click (start, midpoint, end) or center+sweep mode.
- **SVG Import**: opens file picker → parse SVG paths → flatten transforms → place on canvas as scalable group; parameters: scale, rotation, layer, stroke / fill override.

**Overlay layer set**

Reuse existing layer infrastructure (`src/shared/frontend/canvas/layers.ts`): F.SilkS, B.SilkS, F.Fab, B.Fab, F.Comments, B.Comments, plus a new generic **"Overlay"** layer if no existing layer fits the semantics. The Layers panel already supports visibility / opacity / solo — overlay primitives respect those toggles automatically.

**Data model**

- New entity kinds in `designer_pcb_entities`:
  - `pcb_overlay_text` (position, content, fontSizeMm, thicknessMm, rotation, mirror, layer, lockedAt)
  - `pcb_overlay_shape` (kind = rect | circle | line | polyline | polygon | arc, geometry blob, strokeWidthMm, fill, layer)
  - `pcb_overlay_svg` (sourceSvg string, parsedPaths, scale, rotation, originXY, layer)
- All overlay entities share `layer`, `lockedAt`, and `groupId` fields so multi-shape SVG imports stay together.

**Commands**

- `add-overlay-text`, `add-overlay-shape`, `add-overlay-svg`, `update-overlay`, `delete-overlay`. All go through the existing command-bus + undo/redo + projection refresh pipeline.

**Rendering**

- New layer mesh in `PcbScene.tsx` per overlay layer, rendered via `LineSegments2` for strokes, `ShapeGeometry` for fills, and the existing R3F text component for text.
- Respects the existing render-order constants — overlay sits between fab/silk and labels.
- Hit-testing: extend `pcb-hit.ts` to recognize overlay entity kinds; bounding-box + path-distance test for lines.

**SVG handling**

- Parse SVG with a minimal subset (paths, polygons, circles, rects, transforms) using an existing lightweight parser or a small custom walker. No filters / gradients / images — only flat geometry.
- Flatten all `transform` attributes to baked coordinates at import time.
- Convert each path to a polyline approximation at a configurable tolerance (similar to STEP→GLB tessellation already in the codebase).
- Store both the original SVG source (for re-tessellation on edit) and the materialized geometry (for rendering).

#### Part B — Manual hole / smart via / free pad placement

**Tool modes**

Add to the PCB top toolbar:

- **Hole** tool: click to place an unplated hole. Inspector parameters: drill diameter (mm), position X/Y, lock.
- **Smart Via** tool: click to place a via not associated with a routed trace. Inspector parameters: diameter, drill, layer span (start layer / end layer for blind/buried later — v1 is through), net assignment (dropdown of existing nets or "no net"), lock.
- **Free Pad** tool: click to place. Inspector parameters:
  - **Pad type** dropdown — `SMD` / `HOLE` / `STD` (through-hole plated) / `CONN` (connector / paddle / multi-pin board edge) — matches reference screenshot.
  - **Shape** dropdown — `Rectangle` / `Circular` / `Custom (polygon)` — matches reference screenshot.
  - Width / height / corner radius (for rect), diameter (for circular), polygon points (for custom).
  - Layer (top copper, bottom copper, both for STD).
  - Drill diameter (if STD or HOLE).
  - Net assignment (dropdown).
  - Solder mask expansion override.
  - Solder paste expansion override.
  - Lock.

**Data model**

- `pcb_free_hole` entity (positionXY, drillMm, lockedAt).
- `pcb_free_pad` entity (positionXY, padType, shape, dimensions, layer, drillMm or null, netId or null, maskExpansion, pasteExpansion, lockedAt).
- Smart vias use the existing `pcb_via` table with a new `provenance` field distinguishing `from_route` vs `manual`.

**Inspector card (floating right card)**

- Visual: the same floating panel pattern already used by component placement. Implementation should reuse the panel container/portal from the existing inspector so positioning, drag, dismiss, and theme are all consistent.
- Layout (matches reference):
  - Top row: coordinate readout (X / Y in mm with editable inputs), "Hole Size" or "Size" field, small style/color swatch dropdown, lock icon, context arrow.
  - Below: type-specific section — pad type dropdown, shape dropdown with previews, dimension inputs, layer selector, net dropdown, mask/paste overrides under a collapsible "Advanced" group.
  - Multi-select: when multiple free-standing primitives are selected, the card shows shared properties only, with mixed-value badges; bulk edit is supported.

**Commands**

- `add-free-hole`, `add-free-pad`, `add-manual-via`, `update-free-entity`, `delete-free-entity`. Same command-bus integration as overlays.

**Net integration**

- Free pads and manual vias with a net assignment participate in the parent net (counted by ratsnest, included in net-pad correlation, hit by DRC trace/pad clearance checks).
- Free holes are non-electrical — invisible to nets, ratsnest, DRC.

**DRC integration**

- Free pads + manual vias enter the existing live DRC checks (trace-pad, trace-trace via clearance via expansion).
- Holes get a clearance check against traces (drill-to-trace).

**Render**

- Free pads render via the existing `PadInstances` infrastructure (already supports multiple shapes including roundrect and polygon).
- Free holes render via the unified `DrillLayer` (already collects all drill positions); lime-green outline from F4 applies automatically.
- Manual vias render via the existing `ViaLayer`; the F4 cutout + lime outline applies.

### Subtasks

**Part A — Overlay primitives**

- [ ] Migration `0009_pcb_overlays.sql` adding overlay entity tables / blob columns + `groupId` index.
- [ ] Schema and SDK types: `PcbOverlayText`, `PcbOverlayShape`, `PcbOverlaySvg` in `src/sdks/designer/types.ts`.
- [ ] Commands: `add-overlay-text`, `add-overlay-shape`, `add-overlay-svg`, `update-overlay`, `delete-overlay` with handlers, patches, and idempotency.
- [ ] Tool state extensions for Text / Rect / Circle / Line / Polyline / Polygon / Arc / SVG tools in the PCB tool-mode machine.
- [ ] Toolbar entries in `PcbTopToolbar.tsx` (or a new "Drawing" sub-toolbar to avoid clutter).
- [ ] Canvas drawing: live preview during placement, snap to grid, layer-aware color.
- [ ] Renderer: per-overlay-layer rendering pass in `PcbScene.tsx`; text via existing R3F text; strokes via `LineSegments2`; fills via `ShapeGeometry`.
- [ ] SVG parser + flattener: minimal subset (path / rect / circle / polyline / polygon / transform); tolerance-controlled polyline tessellation.
- [ ] Hit-testing extension in `pcb-hit.ts` for new overlay entity kinds.
- [ ] Inspector for overlay primitives (font size, stroke width, layer, mirror, justification, color override).
- [ ] Bun tests: overlay round-trip; SVG parsing of a representative path; rotation/mirror correctness on text.
- [ ] E2E: place silkscreen text, draw rect, import a small SVG.

**Part B — Manual hole / smart via / free pad**

- [ ] Migration `0010_pcb_free_entities.sql` for `pcb_free_hole` and `pcb_free_pad`; add `provenance` to `pcb_via`.
- [ ] SDK types: `PcbFreeHole`, `PcbFreePad`, expanded `PcbVia` with provenance.
- [ ] Commands: `add-free-hole`, `add-free-pad`, `add-manual-via`, `update-free-entity`, `delete-free-entity`.
- [ ] Tool modes: Hole / Smart-Via / Free-Pad with snap-to-grid placement and live preview.
- [ ] Toolbar entries in `PcbTopToolbar.tsx`.
- [ ] Floating inspector card: reuse the component-placement card chrome, build new content panels per entity kind matching the reference layout (coordinate readout, size/hole-size fields, dropdowns, lock).
- [ ] Pad type dropdown (`SMD` / `HOLE` / `STD` / `CONN`) drives which fields show (drill only for HOLE/STD, etc.).
- [ ] Shape dropdown (`Rectangle` / `Circular` / `Custom`); custom opens a small polygon editor.
- [ ] Net assignment dropdown sourced from current net list; "no net" allowed for pads and vias intended as isolated test points.
- [ ] Render integration: free pads through `PadInstances`, free holes through `DrillLayer`, manual vias through `ViaLayer` (F4 lime outlines apply automatically).
- [ ] Ratsnest + net-pad correlation: include free pads with net assignment.
- [ ] DRC: include free pads / manual vias / free-hole-to-trace clearance.
- [ ] Hit-test extensions in `pcb-hit.ts`.
- [ ] Multi-select bulk edit in the inspector card (mixed-value badges, batch update).
- [ ] Bun tests: command round-trips, net stitching for free pads, DRC clearance against free holes.
- [ ] E2E: place a mounting hole, a stitching via, a fiducial pad; verify inspector card shows correct fields per type.

### Files / surfaces (forecast)

- `src/modules/designer/backend/migrations/{0009_pcb_overlays.sql,0010_pcb_free_entities.sql}`
- `src/modules/designer/backend/schema.ts`, `pcb/pcb-store.ts`
- `src/modules/designer/backend/commands/{add-overlay-text,add-overlay-shape,add-overlay-svg,update-overlay,delete-overlay,add-free-hole,add-free-pad,add-manual-via,update-free-entity,delete-free-entity}.ts`
- `src/modules/designer/frontend/pcb/PcbTopToolbar.tsx` — new tool entries
- `src/modules/designer/frontend/pcb/tools/{text-tool-state,shape-tool-state,svg-tool-state,hole-tool-state,free-pad-tool-state,manual-via-tool-state}.ts`
- `src/modules/designer/frontend/pcb/layers/OverlayLayer.tsx` (new)
- `src/modules/designer/frontend/pcb/PcbScene.tsx` — wire overlay layer + free pads/holes/manual vias into existing pad / drill / via passes
- `src/modules/designer/frontend/pcb/pcb-hit.ts` — extend
- `src/modules/designer/frontend/pcb/inspector/{OverlayInspectorCard,FreeHoleInspectorCard,FreePadInspectorCard,ManualViaInspectorCard}.tsx` (new — reuse the component-placement card chrome)
- `src/shared/frontend/svg/svg-importer.ts` (new — minimal SVG-to-polyline parser)
- `src/sdks/designer/types.ts` — new entity types
- `src/core/backend/tests/{designer-pcb-overlays,designer-pcb-free-entities}.test.ts`
- `tests/e2e/pcb-overlays-and-free-entities.spec.ts`

### Verification

- Bun tests for every new command (idempotency, undo/redo, patch inversion).
- SVG parser unit tests on representative fixtures.
- DRC tests confirming free pads / manual vias / free holes are checked.
- E2E covering: place text, draw rect, import SVG, drop mounting hole, drop stitching via, drop fiducial pad, verify inspector card content for each.
- Manual: ratsnest correctly includes net-assigned free pads; route-focus dimming respects overlay opacity.

### Open questions

1. **Inspector card chrome reuse**: refactor the current component-placement card into a generic `EntityInspectorCard` that takes a content slot, or duplicate the chrome per entity kind? (Recommend refactor — same pattern as F1's symbol generator vs library card refactor.)
2. **Pad type taxonomy**: confirm the four types — `SMD`, `HOLE` (unplated), `STD` (plated through-hole), `CONN` (paddle / multi-segment) — match the user's mental model and the manufacturing reality. Should there also be `NPTH` (non-plated through-hole) distinct from `HOLE`?
3. **SVG parsing surface**: minimal subset (paths + basic shapes + flat transforms) v1, or aim for a more complete parser including stroke styles, dash patterns, opacity?
4. **Text rendering quality**: SDF-based vector text (sharp at all zooms, heavier dependency) or `Text` from drei (works today, slightly fuzzier when zoomed deep)?
5. **Polygon pad editor**: in-line polygon editor (click-to-add-vertex on canvas while inspector is open) or a separate modal editor opened from "Custom" shape?
6. **Layer for free-standing graphics**: keep within existing F.SilkS / B.SilkS / F.Fab / B.Fab, or add an explicit `Overlay` layer concept? (Probably keep existing — SVG logos historically live on silk.)
7. **Lock semantics**: locked entities can't be moved/edited but can be selected and deleted, or fully read-only until unlocked?
8. **Net dropdown population**: enumerate all current nets, or also allow creating a new isolated net at placement time?
9. **Edge.Cuts authoring**: should the Line / Rect / Polygon tools optionally target Edge.Cuts to author the board outline directly (closing F3's "board outline polygon" follow-up), or keep board outline as a board-settings-only feature?
10. **SVG re-edit**: store original SVG source for re-import on tolerance change, or freeze geometry at import time?

---

## Task F6 — AI Chat Sidebar in Designer (Schematic + PCB Canvas)

### What it is

Embed the existing **Assistant module** chat experience as a **collapsible right-side sidebar inside the Designer** — visible in both the Schematic view and the PCB view. By default the sidebar is **hidden**; a single icon button in the top-right of the editor toolbar toggles it open. When open, the sidebar overlays or pushes the canvas like VS Code's Copilot Chat panel: scoped to the current design, aware of the active editor (schematic vs PCB) and the current selection, with the existing chat / message / provider / tool features available without leaving the editor.

### Why it exists

- The Assistant module already ships a full chat UI (`src/modules/assistant/frontend/Space.tsx`) reachable from the left sidebar as its own module space. Switching modules just to ask a question about the current design is a context-break.
- VS Code's Copilot Chat sidebar pattern is widely understood: in-editor, dockable, dismissible, with context awareness of what's open.
- The Designer is where users spend the most time and where AI help has the highest value (suggesting a missing decoupling cap, explaining a net, proposing a routing strategy, drafting a sub-circuit). Pinning the chat next to the canvas removes friction.
- Strong foundation already exists: AssistantSDK exposes chat, message, provider, and tool APIs; tool registry supports read-only tools today (`library.search_components`, `designer.list_designs`) and a confirm/reject flow for future writes; provider configs (OpenAI, Ollama, LM Studio) and key storage are wired in Settings. F6 reuses all of this — no new backend.

### How it should work

**Layout and toggle**

- A single icon button in the Designer top-right area — likely the existing `PcbTopToolbar.tsx` for PCB view and the equivalent schematic toolbar (or shared `DesignerTopBar` if introduced) — opens / closes the sidebar.
- Keyboard shortcut: `Ctrl/Cmd+\`` (mirror VS Code Copilot Chat) toggles the sidebar. Configurable via the existing keybindings layer.
- Hidden by default for new users; the open/closed state is persisted in a Zustand store keyed per user (not per design), so it stays open across reloads once a user opts in.
- Width: resizable via a left-edge drag handle; defaults to ~360 px, min ~280 px, max ~640 px. Width persisted alongside open/closed state.
- Layout choice: **push** the canvas (canvas viewport shrinks when the sidebar opens) rather than overlay, so the canvas stays fully visible — most PCB users work edge-to-edge and an overlay would hide work. (Confirm in open questions.)

**Sidebar contents**

- Header: title "Assistant" + a model / provider picker (re-uses `AssistantProviderConfig` dropdown from the existing Space) + a "New chat" button + a "History" dropdown (recent chats for _this design_) + an overflow menu (open full Assistant module, clear chat, copy transcript).
- Body: message thread, scrollable, with the same chat rendering as `Space.tsx` — system, user, assistant, and tool messages.
- Composer: textarea with submit on `Cmd/Ctrl+Enter`, attachments dropdown (see "Design context attachments" below), provider/model picker.
- Footer: provider status, model name, settings shortcut.

**Design context attachments (Copilot-style `@` mentions)**

The chat needs to know what the user is looking at. The composer supports a `@` mention picker that attaches structured context to the next user message:

- `@selection` — currently selected entities on the canvas (parts, wires, traces, vias, primitives, footprints). Resolved at send time and embedded as a structured block.
- `@design` — full schematic + PCB projection summary for the current design (counts, nets, layer config). Lighter than the raw projection.
- `@net <name>` — a specific net with its members and connections.
- `@part <refdes>` — a specific schematic part with its symbol + pin map + value.
- `@trace`, `@via`, `@layer <id>` — PCB-specific entity references.
- `@error` — current DRC violations / live ERC issues (when ERC ships).

Implementation: a new SDK method on the Designer SDK that resolves a context handle to a JSON payload at send time — keeps payloads compact and avoids leaking entire ECS worlds into chat history.

**Cross-editor awareness**

- Sidebar state is shared between Schematic and PCB views — switching tabs doesn't reset the conversation.
- Active editor context is passed automatically: each message carries a small header `{ editor: "schematic" | "pcb", designId, sessionId }` so the assistant can disambiguate.
- When the user has a selection, the composer shows a chip "1 trace, 2 pads selected" with a one-click "Attach as @selection" affordance.

**Assistant tool integration (future-friendly)**

- The Assistant module already has a tool registry with confirmation policies (`auto_readonly_confirm_writes`, `confirm_all_writes`, `auto_all`). F6 does not add new write tools, but it lays the surface for future tools (e.g. `designer.execute_command`, `designer.suggest_route`).
- For v1, scope the sidebar to read tools: `designer.get_projection`, `designer.list_selection`, `designer.list_nets`, `library.search_components`. These let the assistant answer questions without modifying anything.
- Write tools (e.g. "place a 100 nF cap near U1 pin 4") arrive later, gated by the existing tool-confirmation flow — already designed to render approval / reject UI per call.

**Chat persistence**

- Chats opened from inside the Designer are tagged with `metadata.designId` so the "History" dropdown can filter to current-design chats. Chats remain visible from the full Assistant Space too.
- The first prompt of a fresh in-Designer chat seeds an autogenerated title that references the design name and editor.

**Visual style**

- Match the existing Assistant Space: slate-950 / slate-900 dark surface, monospace for code blocks, accent for tool calls.
- Distinct from the left-side module sidebar — uses the existing `floating-panel`-style chrome (same as inspector cards in F5) so it reads as an editor panel rather than a global navigation surface.

**Responsiveness**

- On narrow viewports (< 1200 px), opening the sidebar collapses the left module sidebar to icon-only to preserve canvas width.
- On very small viewports (< 900 px), sidebar opens as a full-height overlay with a backdrop instead of pushing the canvas.

### Subtasks

- [ ] New Zustand store `useAssistantSidebarStore` (open/closed, width, current sidebar chatId, design context attachments draft). Persistence via `localStorage`.
- [ ] Toggle button in `PcbTopToolbar.tsx` and the schematic top toolbar (or shared `DesignerTopBar` if it exists/created). Icon: `MessageSquare` or `Sparkles` from Lucide. Active-state styling.
- [ ] Keyboard shortcut `Cmd/Ctrl+\`` wired through the existing shortcut layer (`src/modules/designer/frontend/keyboard-shortcuts.ts` or equivalent).
- [ ] New component `DesignerAssistantSidebar.tsx` — composable from existing primitives in `src/modules/assistant/frontend/`, refactored where needed to be embeddable rather than full-page.
- [ ] Refactor `Space.tsx` to factor out reusable subcomponents (`ChatList`, `MessageThread`, `Composer`, `ProviderPicker`) — already roughly the case, just confirm they accept layout props (height, width) and don't assume full-page sizing.
- [ ] Resizable drag handle on the sidebar left edge with min/max constraints.
- [ ] Push-vs-overlay layout: integrate with the Designer's main layout shell so the canvas viewport reflows when the sidebar opens.
- [ ] Context attachment infra: define `DesignContextAttachment` discriminated union (selection / design / net / part / trace / via / layer / error).
- [ ] Backend SDK additions: `designer.resolveContext(handle): DesignContextSnapshot` that lazily produces JSON for each attachment kind.
- [ ] Composer `@` mention picker UI with filterable list of available context handles based on current view + selection.
- [ ] Selection-aware composer chip: shows live count of selected entities with one-click attach.
- [ ] Chat metadata: when a chat is created from inside the Designer, set `metadata.designId`, `metadata.editor`; History dropdown filters by current designId.
- [ ] Tool surface (read-only v1): register `designer.get_projection`, `designer.list_selection`, `designer.list_nets` in the assistant tool registry. Existing confirmation policy handles UX.
- [ ] Responsive breakpoints: narrow-mode collapses left sidebar; very-narrow-mode renders as overlay with backdrop.
- [ ] Persist open state, width, last-active chat across reloads.
- [ ] Bun tests: SDK `resolveContext` returns expected snapshots for each handle kind.
- [ ] Vitest: store state transitions (toggle, resize, attach context).
- [ ] E2E: open sidebar in PCB view, send a message referencing `@selection`, verify response renders; toggle off; re-open and confirm history preserved.

### Files / surfaces (forecast)

- `src/modules/designer/frontend/components/DesignerAssistantSidebar.tsx` (new — composes Assistant primitives)
- `src/modules/designer/frontend/stores/useAssistantSidebarStore.ts` (new)
- `src/modules/designer/frontend/components/DesignerTopBar.tsx` (new shared bar) **or** edits to `PcbTopToolbar.tsx` + schematic top toolbar
- `src/modules/designer/frontend/keyboard-shortcuts.ts` — add `Cmd/Ctrl+\`` binding
- `src/modules/designer/frontend/Space.tsx` (or whichever component is the Designer layout root) — slot the sidebar into the layout grid, reflow the canvas
- `src/modules/assistant/frontend/components/{ChatList,MessageThread,Composer,ProviderPicker}.tsx` (new — factored from existing `Space.tsx`)
- `src/modules/assistant/frontend/Space.tsx` — refactor to use the new factored primitives so behavior is identical between full Space and sidebar
- `src/modules/designer/backend/routes.ts` + `commands/` — add `resolve-context` query handler
- `src/sdks/designer/types.ts` — `DesignContextAttachment`, `DesignContextSnapshot`, `ResolveContextRequest/Response`
- `src/modules/assistant/backend/tools/` — register `designer.*` read tools
- `src/core/backend/tests/designer-context-resolver.test.ts`
- `src/core/frontend/src/__tests__/assistant-sidebar-store.test.ts`
- `tests/e2e/designer-assistant-sidebar.spec.ts`

### Verification

- Bun tests for `resolveContext` over each attachment kind (selection, design, net, part, trace, via, layer).
- Vitest for sidebar store (open/close, resize bounds, persistence).
- E2E: open Designer, click toggle, send `@selection` message with a part selected, assert provider response renders with attachment block, close sidebar, reopen, confirm chat preserved.
- Manual: switch between Schematic and PCB tabs with sidebar open → state persists, context updates; narrow viewport → left sidebar collapses; very narrow → overlay mode.

### Open questions

1. **Push vs overlay layout**: push the canvas (recommend) or overlay it Copilot-style? Push reads better for full-screen PCB work; overlay is what VS Code Copilot does.
2. **Scope of v1 tools**: read-only only (safe, ships fast), or include one or two carefully gated write tools at launch (e.g. "add net label", "place from library by name")?
3. **Per-design chat default**: should opening the sidebar in a new design start a fresh chat each time, or resume the most recent chat for that design?
4. **Provider key UX**: if no provider is configured, the sidebar shows a "Configure provider" CTA linking to Settings → Assistant. Confirm wording / placement.
5. **Streaming UX**: assistant token streaming already supported in the backend (Tasks SSE). Confirm sidebar uses streaming, with a stop button during generation.
6. **Context payload size**: large designs could produce huge `@design` snapshots. Cap by token-estimate, summarize via projection rollups, or stream context as a tool result the provider can re-query?
7. **Multimodal**: support pasting / dragging an image into the composer (board photo, datasheet snippet)? Requires provider vision capability detection. Defer to v2?
8. **Shortcut conflicts**: `Cmd/Ctrl+\`` is free in the current shortcut table — confirm it stays unbound elsewhere.
9. **Mobile / touch**: low priority for desktop EDA, but the responsive overlay mode at very narrow widths should at least not break.
10. **Tasks module surfacing**: streaming AI responses run as tasks; should the sidebar show inline task progress, or hide the task plumbing entirely behind the chat UX?

## DRC production-hardening program (P0–P12)

> Plan: `DRC_HARDENING_PLAN.md` · Audit: `DRC_AUDIT_REPORT.md` (40 confirmed bugs) · Tracks: [E]ngine / [C]hecks / [I]nfra

- [x] **P0** [I] QA groundwork — determinism test (5), eps boundary matrix (14), parity-harness fixture v2 (+`--verbose`, shared loader `tests/helpers/drc-golden.ts`), 40 audit regression fixtures (`drc-audit-b1..b5`, all `test.todo` w/ post-fix expectations), golden-small-2l (88 primitives, 14 known violations) + `scripts/update-drc-goldens.ts`
- [x] **P1** [E] Epsilon unification — `pcb/tolerance.ts` (`below`/`exceeds`, re-exported via drc-context); clearance/fab-validators/aspect/creation-gates unified; prefilter SHORT_EPS ceiling. Flipped B1-3, B1-4, B2-1
- [x] **P2** [E] Live netclass + stackup 2–32 + layer-model fixes — `sdks/designer/stackup.ts` (helpers + 32-literal unions); `shared/rendering/pad-copper-layers.ts` (side-flip); `PAD_LAYER_MISMATCH`; non-waivable short/span (`DrcViolationDraft.waivable:false`); clamp-with-fallback; VIA_TO_VIA shared layer; live net-class resolution (stored `netClassId` dropped from DRC). Cloud snapshot pinned to 2/4 (`SnapshotCopperLayerId`). Flipped B1-1/2/5/6, B3-2, B5-VIA-MASK/PAD-LAYER/6LAYER
- [x] **P3** [E] Violation-id v2 (layer + 0.1mm location bucket for hot-spot codes; v1 retained for migration) + severity model (`drc/severity.ts` DEFAULT_SEVERITY_BY_CODE; COPPER_TO_BOARD_EDGE + UNCONNECTED_NET → error; `drcSeverityOverrides` on board settings, non-overridable shorts, persisted). +10 tests. Flipped B3-7, B5-WAIVER-DRIFT. *(waiver-comment UI → P12)*
- [ ] **P4** [I] Backend spatial index (rbush) + exhaustive oracle + fuzz + bench
- [x] **P5** [C] Free-win checks — 3 new rule classes (dfm/electrical/signal-integrity); `checks/netclass.ts` (intent-gated enforcement), `checks/outline.ts` (BOARD_OUTLINE_INVALID resurrected), `checks/dangling.ts` (own layer-aware graph), HOLE_TO_BOARD_EDGE (slot-aware `DrcHole.slot`), zone-pour extension (anchor on zone). +16 DFM tests. Flipped B3-8, B4-4, B4-5
- [x] **P6** [E] Scoped priority rule engine — `shared/drc/rule-resolver.ts` (compile-once, priority first-match, can relax, area bitmask); `PcbDrcRule` + `minimums.clearanceMm` floor; `ctx.clearanceFor()` wired into all 6 clearance pair loops; byte-identical when no rules (golden unchanged); persisted. +8 tests incl. BGA-fanout area relaxation
- [ ] **P7** [I] Async DRC (tasks module) + engine→`src/shared/drc/` + live/batch parity
- [x] **P8** [I] Fab profiles refresh — JLC 2026-07 values (trace 0.10/0.09, drill 0.15, via Ø 0.25); via vs PTH annular split; `DrcHole.kind`; FAB_DRILL for all holes; `FAB_HOLE_TO_HOLE` via/pth tier. Flipped B2-2/3/4/8. *(customFabProfile persistence deferred to P12 UI)*
- [ ] **P9** [C] DFM overlay checks (courtyard, silk, mask, copper sliver, acute angle)
- [x] **P10** [C] Electrical checks — `drc/ipc2221-spacing.ts` (Table 6-1 B1/B2 + width formula, audit §8 sources); `checks/electrical.ts` CREEPAGE_DISTANCE (HV-subset pass) + TRACE_CURRENT_WIDTH; `PcbNetClass.voltageV/currentA` + `designRules.electrical`. +11 tests. Cloud contract net class pinned
- [x] **P11** [C] SI diff-pair — `pcb/diff-pair-resolver.ts` (name convention _P/_N,+/- + explicit `diffPairs` table); `checks/signal-integrity.ts` DIFF_PAIR_GAP/SKEW/UNCOUPLED_LENGTH (coupling model w/ proximity gate); `diffPair` anchor; persisted. +8 tests. (length matching already shipped via checks/length.ts)
- [ ] **Review follow-ups** — enforce scalar scoped constraints (trackWidth/via/annular/hole/edge rules; currently clearance-only); apply scoped-rule optional severity; v1→v2 waiver migration; area-scope closest-point precision; cutout crossing-overlap
- [ ] **P12** [I] Rules & severity UI
