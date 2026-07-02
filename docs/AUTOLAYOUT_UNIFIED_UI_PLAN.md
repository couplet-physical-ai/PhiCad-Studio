# Execution plan — unified "Auto-Layout" button + config modal

> Execution-ready plan for a fresh session. Repo: **OpenPCB/** (Bun backend + React/Vite frontend).
> Service side (`cloud-auto-layout`) needs NO change. All decisions below are final (user-confirmed).
> Grounded by a full end-to-end code sweep — file:line refs are current as of 2026-07-02.

## Context / why

OpenPCB ships **two** separate cloud features against the one merged `cloud-auto-layout` service
(`:3002`, `/v1/place` + `/v1/route`):
- "Auto-place…" floating button → `PcbAutoplaceDialog` → submit/poll → interactive canvas ghost
  preview → accept.
- "Autoroute…" floating button → `PcbAutorouteDialog` → submit/poll → cherry-pick ghost review → apply.

They already share the snapshot producer, API factory, backend clients, service-URL resolution,
per-op-dispatch + DRC apply, and the `/v1/version` capability client — but diverge in two buttons,
two dialogs, two frontend API method sets, two feature flags, two request-body shapes, and **neither
exposes any user config** (place has no options UI; route always sends `{portfolio:4}`).

**Goal:** one **"Auto-Layout…"** button → one small config modal. One-click works with zero config
(Balanced preset). Power users open **Advanced** to tune. User picks which stages run (Place and/or
Route); both on ⇒ sequential. Config persists per-project (durable) with a global default.

## Final decisions (do not re-litigate)

- **Stages:** modal has Place + Route toggles; user picks. Both on ⇒ run sequentially.
- **Both-stages flow:** place → ghost preview → user applies → route runs on the *placed* board →
  route ghost review → apply. Reuse both existing preview UIs verbatim.
- **Modal shape:** progressive disclosure — presets + toggles + Run visible; "Advanced" collapsible.
- **Advanced knobs:** curated subset (below). Reserved/expert weights hidden.
- **Presets:** Fast / Balanced / Quality. Balanced = current engine defaults, default selection.
- **Persistence:** backend `board_settings` per-design (via `pcb_set_view_state`) + `localStorage`
  global default that seeds new designs.
- **Apply UX:** reuse existing ghost-preview + apply-all flows (place interactive bar; route
  cherry-pick with all ops checked = effective apply-all).
- **Button:** floating, replacing the two existing floating buttons (current spot).
- **Flags:** **replace** `cloud.autoroute` + `cloud.autoplace` entirely with one `cloud.autolayout`.

## What already exists (REUSE — do not rebuild)

- Snapshot producer `src/modules/designer/backend/pcb/board-snapshot.ts` — `buildBoardSnapshot` +
  `BuildSnapshotOptions` (`:98-111`) already unify both engines (`routeOptions`,
  `routableNetClassIds`, `excludedNetIds`, `placeOptions`, `serializePours`). **No change.**
- Backend proxy routes `src/modules/designer/backend/routes.ts:2422-2650` — `/autoroute` +
  `/autoplace` submit/status/cancel/apply. Submit bodies already accept `options`/`placeOptions`.
- Frontend API `src/modules/designer/frontend/api.ts:655-780` — `submitAutoroute`/`submitAutoplace`
  already take a `request` param carrying options; status + apply methods exist.
- Backend clients `.../backend/autoroute/client.ts`, `.../autoplace/client.ts`; service URL
  `.../backend/autolayout/service-url.ts` (`AUTO_LAYOUT_URL ?? AUTO_ROUTER_URL ?? AUTO_PLACE_URL ??
  http://localhost:3002`); version/pours client `.../backend/autolayout/client.ts`
  (`getAutoLayoutVersion` 60s TTL + `resolveSerializePours`).
- Place preview infra in `PcbCanvas.tsx` — `usePcbPlacePreview`, `handlePreviewResult` (`:511`),
  `acceptPreview`/`rejectPreview` (`:523-570`), `PcbPlacePreviewBar`.
- Route review + ghost — `PcbAutorouteDialog.tsx` (cherry-pick `:337-359` + `previewFromOps` +
  `applyAutorouteOps`).
- Persistence pattern — `pcb-view-store.ts` `persistPatch`→debounced `pcb_set_view_state` (`:156-192`);
  backend `parseViewState`/`mergeViewState`/`createDefaultPcbViewState`
  (`backend/pcb/pcb-store.ts:362,385`; `backend/pcb/pcb-defaults.ts`).
- Modal to mirror — `src/modules/designer/frontend/components/PcbDesignRulesDialog.tsx` (centered
  blocking modal, header/scroll-body/footer, escape+backdrop close, local `NumberField` `:47-72`).
- Collapsible — `components/CollapsibleSection.tsx`. Feature-flag hook `useFeatureFlag`.

## Service contract reference (what the knobs map to)

Single body = `BoardSnapshot`; per-engine options live *inside* it (`options` = RouteOptions,
`placeOptions` = PlaceOptions). `serializePours` is a **producer-side** toggle (whether to populate
`pours[]`); the desktop negotiates it via `/v1/version` `capabilities.pours.accepted`.

**RouteOptions** (per-request): `seed`, `geometryMode` (`"manhattan-45"` default), `allowVias`(true),
`maxViasPerNet?`, `layerPolicy`("auto"), `epsilonNm?`, `maxExpansions?`(→2_000_000),
`maxRipupPasses?`(→6), `netOrder?`, `progressEveryNNets`(1), `portfolio`(1..8, desktop default 4).
Reserved no-ops (hide): `maxShoveNodes`, `maxShoveDepthTraces`, `maxShoveDepthVias`.

**PlaceOptions** (per-request): `seed`, `restarts?`(→4), `maxMoves?`(→max(8000,1500·movable)),
`mode`("all"|"subset"), `selectedIds`, `lockReferences`, `allowRotate`(true), `allowFlip`(true),
`moveConnectors`(false), `respectExistingTraces`(true), `targetUtilization`(0.7), `gridSnapMm`(0.01),
`weights?`(PlaceWeights). Curated modal exposes: allowRotate, allowFlip, moveConnectors,
respectExistingTraces, targetUtilization (+ effort→restarts/maxMoves). Weights + subset mode: not
exposed. Reserved weights `thermal`/`align`: never.

## Plan (steps)

### 1. Shared config types + presets (new)
`src/modules/designer/frontend/pcb/autolayout/config.ts`
- `AutoLayoutConfig`: `{ runPlace, runRoute, preset:"fast"|"balanced"|"quality"|"custom",
  effort:"fast"|"balanced"|"quality",
  place:{allowRotate,allowFlip,moveConnectors,respectExistingTraces,targetUtilization},
  route:{geometryMode,allowVias,maxViasPerNet?,serializePours?:boolean|"auto"} }`.
- `DEFAULT_AUTOLAYOUT_CONFIG` = Balanced (matches current engine defaults; route `portfolio:4`;
  both stages on; `serializePours:"auto"`).
- `PRESETS`: Fast (portfolio 1, low restarts/maxMoves/maxExpansions), Balanced (defaults /
  portfolio 4), Quality (portfolio 8, higher restarts + maxExpansions). Effort drives place
  `restarts`/`maxMoves` + route `portfolio`/`maxExpansions`.
- `toPlaceRequest(cfg) -> { placeOptions }`, `toRouteRequest(cfg) -> { options, serializePours? }`.
  Feed the existing `submitAutoplace`/`submitAutoroute` request params — no new API surface.
  `serializePours:"auto"` ⇒ omit from request ⇒ backend negotiates (existing path).

### 2. Config modal (new)
`src/modules/designer/frontend/pcb/PcbAutoLayoutDialog.tsx`
- Centered blocking modal mirroring `PcbDesignRulesDialog.tsx`. Reuse `NumberField` pattern + native
  checkbox/select styling; `violet-600` primary button; escape + backdrop close; `open`/`onClose`.
- Body: Preset dropdown (Fast/Balanced/Quality/Custom) · Stage toggles (Place, Route) · **Advanced**
  `<CollapsibleSection>` with curated place + route controls (any edit flips preset → Custom).
- Footer primary **"Run"** (disabled unless ≥1 stage). On Run: persist config, close modal, invoke
  orchestrator (§4). Surface snapshot `warnings` inline (as current dialogs do).

### 3. Persistence (backend-durable + global default)
- Add optional `autoLayoutConfig?: AutoLayoutConfig` to `PcbViewState`
  (`src/sdks/designer/types.ts:364`, additive-optional; old rows hydrate absent). If SDK is
  codegen-backed, run `npm run gen` and commit results.
- Backend whitelist: parse in `parseViewState` + merge in `mergeViewState`
  (`backend/pcb/pcb-store.ts:362,385`) + default `undefined` in `createDefaultPcbViewState`
  (`backend/pcb/pcb-defaults.ts`). **No SQL migration** (stored in existing `board_settings` JSON).
- Frontend: add `autoLayoutConfig` + `setAutoLayoutConfig` to `pcb-view-store.ts` (setter →
  `persistPatch({ autoLayoutConfig })`, same debounce).
- Global default: on save also write `localStorage["openpcb.autolayout.defaultConfig"]`; when a
  design has no persisted config, seed the modal from localStorage else `DEFAULT_AUTOLAYOUT_CONFIG`.

### 4. Orchestrator hook (new)
`src/modules/designer/frontend/pcb/autolayout/useAutoLayoutRun.ts`
- Sequences the run reusing existing api + preview infra:
  - `runPlace` → `submitAutoplace(designId, toPlaceRequest(cfg))` → poll (extract the poll loop from
    `PcbAutoplaceDialog`) → `handlePreviewResult` (existing interactive ghost). After the user
    **applies** (`acceptPreview` → `workspace.refresh()`), continue.
  - `runRoute` → `submitAutoroute(designId, toRouteRequest(cfg))` → poll → open route review (reuse
    `PcbAutorouteDialog` review phase / ghost / `applyAutorouteOps`).
  - Only one stage ⇒ run just that one. Route-only submits immediately.
- Progress: small bottom-right status panel (reuse `PcbAutoplaceDialog` panel styling) so the canvas
  stays interactive. Cancel wired to existing `/autoplace|/autoroute/:jobId/cancel`.
- Chaining is automatic: place-apply mutates the board + refreshes, so the route submit rebuilds the
  snapshot from the placed projection.

### 5. Refactor existing dialogs to be config-driven (minimal)
- Move submit+poll out of `PcbAutoplaceDialog`/`PcbAutorouteDialog` into the orchestrator (or add an
  optional `request` prop + `submitOnOpen=false` mode). Keep `PcbAutorouteDialog`'s review/ghost/apply
  UI as the route review surface; keep `PcbPlacePreviewBar` + `usePcbPlacePreview` as the place review
  surface. Preferred: dialogs become thin review/progress panels driven by the orchestrator.

### 6. Button + wiring
`src/modules/designer/frontend/pcb/PcbCanvas.tsx`
- Replace the two floating buttons (`:3499-3546`) with one **"Auto-Layout…"** floating button
  (`data-testid="pcb-autolayout-button"`), gated by new `autoLayoutEnabled` prop; opens
  `PcbAutoLayoutDialog`. Keep `PcbPlacePreviewBar` + route review render slots (orchestrator-driven).
- Add `autoLayoutConfigOpen` state near `:475-480`; seed config from view-store/localStorage.
`Space.tsx`
- `autoLayoutEnabled = cloudEnabled && Boolean(session) && useFeatureFlag("cloud.autolayout")`
  (mirrors `:340-345`); thread the single prop, **delete** the old `autorouteEnabled`/
  `autoplaceEnabled` props + their flag lookups.

### 7. Feature flag — replace both with one `cloud.autolayout`
`src/core/contracts/feature-flags/registry.ts`
- **Remove** `cloud.autoroute` + `cloud.autoplace` (`:59-67`); add `cloud.autolayout` (availability
  `"dev"`, env suffix `CLOUD_AUTOLAYOUT`).
- Backend: both route-block gates → `isFeatureEnabled("cloud.autolayout")` (`routes.ts:2421`, `:2540`).
- Grep + migrate every reference: `cloud.autoroute`, `cloud.autoplace`, `CLOUD_AUTOROUTE`,
  `CLOUD_AUTOPLACE` (Space.tsx, tests, docs, `.env` examples).

## Files touched (summary)
- **New:** `pcb/autolayout/config.ts`, `pcb/autolayout/useAutoLayoutRun.ts`, `pcb/PcbAutoLayoutDialog.tsx`.
- **Modified:** `pcb/PcbCanvas.tsx`, `Space.tsx`, `pcb/pcb-view-store.ts`, `sdks/designer/types.ts`,
  `backend/pcb/pcb-store.ts`, `backend/pcb/pcb-defaults.ts`, `backend/routes.ts` (2 gate changes),
  `core/contracts/feature-flags/registry.ts`, thin refactors to `pcb/PcbAutoplaceDialog.tsx` /
  `pcb/PcbAutorouteDialog.tsx`.
- **No change:** `board-snapshot.ts`, backend clients, service-url, `api.ts` submit signatures.

## Verification
- `cd OpenPCB && npm run typecheck` (composite `tsc -b`) clean.
- `npm run gen:check` clean (else `npm run gen`, commit) if SDK types are codegen-backed.
- Backend tests: `npm run test:backend` around `designer-pcb-view-state.test.ts` — add a case that
  `autoLayoutConfig` round-trips through `pcb_set_view_state` merge + hydrate, and is absent on old rows.
- Frontend tests (Vitest): unit-test `config.ts` preset→request mapping + `serializePours:"auto"`
  omission; extend/add a modal test (mirror `designer-autolayout-client.test.ts` stubFetch pattern).
- Manual/E2E: `npm run dev` with `CLOUD_AUTOLAYOUT=1` + signed-in cloud session + service reachable
  (`AUTO_LAYOUT_URL`, or `cloud-workspace/cloud-infra/devstack` → `make up`). Verify: one Auto-Layout
  button; Run with defaults executes; Place→apply→Route sequential; Advanced tweaks flip to Custom and
  persist per-design (reopen design → restored); global default seeds a fresh design.

## Working rules (this repo)
- Commit style: concise imperative, Conventional Commits. Do NOT auto-commit/push unless asked.
- OpenPCB consumes `shared/` via GitHub tags; `npm run shared:link` to iterate locally.
- Backend tests = `bun test` (`npm run test:backend`); frontend tests = Vitest (`npm run test:react`).
- Load `.claude/skills/pcb-layout` / `r3f-eda-rendering` before touching EDA/visual code.
