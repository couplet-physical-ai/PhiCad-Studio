# OpenPCB Desktop — State Report for Placement/Routing Quality Work

Read-only audit. Consumer context: cloud-auto-layout (`/v1/route` + `/v1/place`, port 3002)
sends a `BoardSnapshot`, desktop stays authoritative for DRC and re-validates on apply.

Legend: **CONFIRMED** = read from code / ran command · **INFERRED** = reasoned from code.
Field buckets: **[P]** persisted today · **[D]** derivable from persisted data · **[A]** absent upstream.

---

## Persistence model (shared context for §1–§6)

CONFIRMED. All PCB objects live in **one table** `designer_pcb_entities` (drizzle `pcbEntities`,
`src/modules/designer/backend/schema.ts`), rows discriminated by a `kind` column with the object
serialized into a `payloadJson` TEXT blob. Kinds (`pcb-store.ts:41-49`): `board_settings`,
`placement`, `trace`, `via`, `free_hole`, `free_pad`, `overlay_text`, `overlay_shape`, `zone`.

- **Board settings** = a single row `kind:"board_settings"`, whole `PcbBoardSettings` JSON-stringified
  (`pcb-store.ts:691-701`, read `parseBoardSettings` `:584-643`). Design rules, net classes,
  `perNetClassAssignments`, `layerCount`, `boardThicknessMm`, `viewState` (incl. `autoLayoutConfig`)
  all live inside this one blob — **additive fields need no migration**.
- **Placements** = `kind:"placement"`, payload is `PcbPlacedPart` incl. the `footprint` snapshot verbatim
  (`upsertPcbPlacement` `pcb-store.ts:1011-1045`; `parsePlacement` `:949-987` reads `record.footprint`
  straight through, `:962,:984`).
- **Library** footprints are a **separate module/DB**: `library_footprints.data_json`
  (`library/backend/schema.ts:60-75`) holds `{provenance, parser, normalized, raw}`; 3D models live in
  `library_footprint_models` (`schema.ts:77-95`).

Nets are **not persisted at all** (no `designer_nets` table) — see §4.

---

## §1 (P0) — Footprint/component persistence & the courtyard question

### The whitelist happens at IMPORT, BEFORE persistence — but there are two import paths

CONFIRMED. `PcbPlacedPart.footprint` is typed `LibraryFootprintPlacementSnapshot`
(`sdks/designer/types.ts:652-662` → `sdks/library/types.ts:145-154`). Its **only** geometry is
`preview: FootprintRenderModel | null`; there is no raw-graphics field on the placement.
`FootprintRenderModel.graphics` are `PreviewGraphic[]`, each carrying an optional `layer?: string`
tag, plus `bounds: BoundsMm | null` (`@openpcb/rendering-core/dist/types.d.ts:154-163`).

Data-flow chain (CONFIRMED, KiCad `.kicad_mod` → stored placement):

1. Parse+normalize: `@openpcb/kicad-import` `normalizeFootprint` builds the preview via
   `buildFootprintPreviewFromParsed` → `buildFootprintRenderModel(source, {includeLayerNames:[...]})`
   (`build-preview-models.ts:619-631`). **This is the whitelist.**
2. The KiCad whitelist is **SilkS + Fab only** (KiCad 7 & 8 spellings), pad layers `*.Cu`
   (`build-preview-models.ts:619-631`). `F.CrtYd`/`B.CrtYd` are **absent** ⇒ courtyard graphics are
   dropped from `preview.graphics`; silkscreen + fab survive. `filterByLayer`
   (`footprint-preview-builder.ts:9-19`) does the dropping.
3. Commit to library: `commit-kicad.ts:243-258` writes `data_json = {normalized:{...preview:filtered},
   raw: rawFootprint}`. **The full all-layer parsed footprint (incl. CrtYd) survives only in
   `data_json.raw`** — nothing downstream reads it into a placement.
4. Resolve for placement: `parseFootprintPlacementSnapshot` (`queries.ts:398-425`) reads **only**
   `normalized.preview` (`:407`); `rederivedFootprintPreview` (`:433-439`) recomputes `bounds` only,
   never re-adds layers. `data.raw` is never touched.
5. Placement snapshot → schematic part (`place-part.ts:155`) → projection (`projection-read.ts:82-83`)
   → PCB placement (`pcb-projection.ts:49` → `syncPcbPlacementsFromSchematic`
   `pcb-store.ts:1248/1270/1283`) → `pcbEntities.payloadJson.footprint` verbatim.

**Important nuance — the generated/drawn path does NOT filter.** IPC-7351B and drawn-editor footprints
call `buildFootprintRenderModel(fpSource)` with **no options** ⇒ `includeLayerNames` undefined ⇒ all
layers pass, **including CrtYd if the source has it** (`commit-generated.ts:116,169`; the drawn editor
lists CrtYd as valid, `footprint-editor/types.ts:83-84`).

**No stored-payload fixture was dumped** — no committed footprint payload / sample DB with real
CrtYd exists to diff (only `contracts/BoardSnapshot.schema.json`, a schema not an instance). Verdict
rests on the code trace above. CONFIRMED via code, not fixture.

### §1 verdicts

| Field | Bucket | Evidence |
|---|---|---|
| `courtyardPolygon` (actual CrtYd) | **[A]** for KiCad-imported parts; **[P]** for generated/drawn parts | KiCad whitelist drops CrtYd before persistence (`build-preview-models.ts:619-631`); generated path keeps all layers (`commit-generated.ts:116`). Raw CrtYd survives in `library_footprints.data_json.raw` for KiCad parts but is **unreachable** from the projection. |
| Fab-outline (fallback courtyard) | **[P]/[D]** | Fab graphics survive in the placement `preview.graphics` tagged `F.Fab`/`B.Fab` (whitelist includes Fab). Derivable into a courtyard polygon. |
| footprint `bounds` (crude fallback) | **[P]** | `FootprintRenderModel.bounds` recomputed + persisted (`queries.ts:433-439`). |
| component **height** (mm) | **[A]** | No body-height field anywhere in `library_footprints`, `library_footprint_models`, snapshot types, or KiCad normalized footprint. Only *pad* `heightMm` exists. INFERRED: derivable only from GLB geometry at render time. |
| 3D model refs | **[P]** | `library_footprint_models` (glbPath/glbSha256/sourceStepSha256, `schema.ts:77-95`); surfaced as `model3d` on the placement snapshot (`queries.ts:420-422`, descriptor `library/types.ts:135-143`). |
| `mountType` | **[P]** | Source = KiCad `footprint.attributes.type`; stored in `data_json.normalized.mountType`; on the placement snapshot at `queries.ts:415-416`. |

**Where snapshot-side courtyard extraction would occur:** the placements mapper in
`board-snapshot.ts:258-273` (reads `p.footprint`). For generated/drawn parts it could filter
`p.footprint.preview.graphics` by `layer ∈ {F.CrtYd,B.CrtYd}`; for KiCad parts the only in-projection
source is the Fab outline (same graphics list) or `bounds`. A *complete* courtyard for KiCad parts
needs either changing the import whitelist to keep CrtYd, or re-querying `library_footprints.data_json.raw`.

---

## §2 (P0) — Field-by-field source map for unserialized snapshot fields

Cross-checked against the drift-guard `board-snapshot.assert.ts`, which enumerates every known gap.

| Field | Bucket | Evidence + effort to source |
|---|---|---|
| `courtyardPolygon` | **[A]** (KiCad) / **[P]** (generated) | See §1. Effort: *trivial mapper change* for generated parts; *needs import-whitelist change or library re-query* for KiCad parts. Assert gap `board-snapshot.assert.ts:88-90`. |
| `connectorEdge` | **[A]** | No connector-edge classification exists in desktop — grep hits only in `board-snapshot.generated.ts` / `.schema.json` / `.assert.ts`. Effort: *needs new derivation logic* (component position vs board edge + connector detection). Assert gap `:88-90`. |
| `heightMm` | **[A]** | No stored body height (§1). Effort: *needs new UI input* or *new derivation* from GLB. Assert gap `:88-90`. |
| `watts` | **[A]** | No power/thermal field anywhere in the component/footprint/placement model. Effort: *needs new UI input*. Assert gap `:88-90`. |
| `constraintGroups` | **[A]** | "isn't sourced anywhere in the desktop projection — no current UI/data path mints them" (`assert.ts:131-134`). Effort: *needs new UI + persistence* (a relational data model — see §4). |
| `PlaceOptions.selectedIds` | **[A]** on the wire; selection state **[D]** exists | Deliberately absent from hand `PlaceOptions` (`assert.ts:111`), never wired to canvas selection. But `selectedPartIds:Set` selection state exists (§4). Effort: *needs `PlaceOptions` type field + dialog wiring* (data source already present). |
| 9 unexposed `PlaceWeights` (displacement, congestion, decap, crystal, thermal, align, sym, zone, orient) | **[A]** | Not even declared on the hand `PlaceWeights` (only 6: hpwl/spread/overlap/edge/connector/side, `autoroute.ts:194-201`). These are engine cost-knobs, not derivable data. Effort: *needs new UI input*. Assert gap `:112-125`. **Refinement vs baseline:** all 6 declared weights are *also* unwired — **0 of 15 weights are exposed in any dialog** (`autolayout/config.ts:87-96` never sets `weights`). |

**Connector detection today (CONFIRMED):** the only connector signals in desktop are
(a) `footprint.mountType` normalized to `"tht"` (`board-snapshot.ts:84-96`, `normalizeMountType`),
sent as the `mountType` placement hint, and (b) the free-pad `padType:"conn"` enum
(`pcb-store.ts:69-74`). There is **no refdes heuristic and no attribute-based connector flag** in
desktop — the service's own refdes-prefix fallback does the classification (`board-snapshot.ts:82-83`
comment). So `connectorEdge` derivation would be greenfield.

---

## §3 (P1) — Desktop DRC engine extension points

### Architecture (CONFIRMED)
Engine at `src/modules/designer/backend/drc/`. Dispatch is a **hardcoded list, not a registry**:
`runDrc` (`drc-engine.ts:23`) builds one `DrcContext` then spreads seven pure checks into a flat array
(`drc-engine.ts:31-39`): `checkConstraints`, `checkStructural`, `checkManufacturability`,
`checkClearance`, `checkConnectivity`, `checkCopperPour`, `checkBoard`. Each check is
`(ctx: DrcContext) => DrcViolationDraft[]`. The engine then assigns stable ids
(`computeViolationId`, order-independent FNV-1a of code+sorted anchor keys, `violation-id.ts:64-70`)
and applies ignore/waive options.

Violation model (`sdks/designer/types.ts`): `DrcViolation` (`:1784-1809`) = `{id, code, ruleClass,
severity, message, anchors[], locationMm?, layer?, measuredMm?, requiredMm?, waived}`;
`DrcAnchor` (`:1724-1733`) is a union `trace|segment|via|pad|freePad|freeHole|placement|net|boardEdge`.
`DrcRuleClass` has exactly **five** values (`:1741-1746`): `clearance | constraint | connectivity |
manufacturability | structural` (no `copper-pour` class — pour islands report under `structural`,
`checks/copper-pour.ts:55`).

### What DRC actually enforces vs merely stores (CONFIRMED)
- **Board `designRules.clearance`** — ALL enforced: traceToTrace/traceToPad/traceToVia/viaToVia/padToPad
  (`checks/clearance.ts:126/159/187/220/260`), copperToBoardEdge (`checks/board.ts:42`).
- **Board `designRules.minimums`** — ALL enforced: traceWidth/viaDiameter/viaDrill/annularRing/drillSize
  (`checks/manufacturability.ts:19/52/64/77+154/140`), holeToHole (`checks/board.ts:183`).
- **`PcbNetClass`** — **only `clearanceMm` is enforced**, applied as `max(designRule, netA, netB)`
  (net class can only tighten, `drc-context.ts:319-340`, `clearance.ts:125-129`). **`traceWidthMm`,
  `viaDiameterMm`, `viaDrillMm`, `defaultViaProtection`, `color` are STORED-BUT-UNUSED by DRC**
  (grep of `drc/` shows no per-class width/via reference; they feed route-tool defaults, INFERRED).
  → A net class with a wider `traceWidthMm` produces **no** per-net min-width violation.

### Where a new check slots in (CONFIRMED)
Single registration point: add the check to the `drafts` array in `drc-engine.ts:31-39` + a new file
under `drc/checks/`. Engine/context side is cheap (trace/via/pad/net data + anchors already exist).
Cost is the **rules-input schema**, which has no home for per-net policy today:

| New check | Effort | Why |
|---|---|---|
| Per-net via cap | MODERATE | vias already grouped in ctx; needs new `DrcRuleCode` + a new per-net via-cap field on `PcbNetClass`/`PcbDesignRules` + `pcb_set_design_rules`/dialog wiring. |
| Per-net layer restriction | MODERATE | copy `TRACE_LAYER_MISMATCH` pattern (`checks/constraints.ts:11`); needs new `DrcRuleCode` + new per-net allowed-layers field + dialog. |
| Net-pair spacing class | LARGER | can extend the existing `max(...)` in `checkClearance` (no new violation type); dominant cost is a net-pair→clearance matrix with no home in `PcbDesignRules` + a sibling to `netClassClearanceMm` (`drc-context.ts:319`). |

None is "trivial add-to-list": the dispatch add is trivial, each needs a new rules field on the schema.

### Apply-time re-validation (CONFIRMED)
**Same `runDrc` engine, no separate path.** Both cloud apply handlers (behind `cloud.autolayout`,
404 in release) live in `routes.ts`: autoroute apply `POST /designs/:id/autoroute/apply`
(`routes.ts:2571`) dispatches each cherry-picked op through the normal command path
(`store.dispatchCommand`, per-op failure isolation `:2619-2623`) then one final
`runDrc(projection, {ignoredRuleClasses, waivedIds})` at `:2633`. Autoplace apply
(`routes.ts:2711`) is identical, re-validating at `:2762`. Neither persists the report (unlike
interactive `/drc/run` `:2465`) — apply DRC is a non-blocking backstop; partial apply carries no
overlap guarantee (`:2706-2710`). (A separate *frontend* `pcb/drc/live-drc.ts` exists for
draw-time feedback — not authoritative, not on the apply path.)

### Panel (CONFIRMED)
`frontend/components/DesignerDrcView.tsx:45` consumes a `DrcReport` from `useDrcStore`
(`pcb/drc/drc-store.ts`); groups violations by `code`, sorts by severity; row click centers canvas via
`requestCenter(locationMm)`; waive toggles persist into `PcbViewState.drcWaivedViolationIds`. Canvas
markers via `pcb/layers/DrcMarkerLayer.tsx` + `DrcSelectionHighlight.tsx`.

---

## §4 (P1) — Net identity & selection machinery

### Net identity — ephemeral, geometry-derived, NOT persisted (CONFIRMED)
`deriveNetsAndJunctions` (`projection-world.ts:504`) builds nets with a union-find over nodes keyed
`pt:${x}:${y}` (pin/label/primitive coords, `:522`, `pointKey` `:118`) and `w:${wireId}:${idx}`
(wire vertices, `:523`). The returned `net.id = root` where `root = unionFind.find(...)`
(`:800`) — i.e. **whichever node won the merge**, dependent on geometry + iteration order.
There is **no `designer_nets` table**; `netNames` is rebuilt each projection
(`pcb-projection.ts:60-64`).

ID lifecycle (INFERRED from the above, high confidence):
- **Move a component / pin / add a wire:** coordinates change → node keys + merge order change →
  `net.id` changes. **A per-net constraint keyed by `net.id` would NOT survive.**
- **Re-annotate (refdes change):** `update_part_properties` updates only the `reference` column keyed
  by unchanged `partId` (`command-executor.ts:1459-1508`); pin ids are `${partId}:${originPinKey}`
  (`place-part.ts:19-21`), independent of reference → geometry unchanged → `net.id` unchanged, but the
  net **name** can change if a label/rail was renamed.
- **Schematic→PCB re-sync:** nets recomputed; persisted traces/vias re-bind by **name** via
  `bindNetName` (`pcb-projection.ts:76-93`) — the tell that **net NAME (upper-cased) is the durable
  cross-edit identifier**, and only for *named* nets (unnamed get regenerated `Net_<n>`,
  `projection-world.ts:759/781/797`).

### Pad/pin addressing — stable (CONFIRMED)
Persistent pad address = `` `${placement.id}|${pad.number}` ``. `padNets` maps that key → netId,
built in `pcb-projection.ts:110-115` from `correlateNetPads` (`net-pad-correlation.ts:23-108`,
convention: symbol `pin.number` === footprint `pad.number` on the same placement). Consumed with the
identical key in `board-snapshot.ts:150` and `drc-context.ts:211`.
- `placement.id` = `crypto.randomUUID()` minted once (`pcb-store.ts:1276`), matched on re-sync by
  `partId` (`:1212/1238`) — **stable across re-annotation & re-sync; dies only with its schematic part.**
- `pad.number` = library-defined, refdes-independent.

**Implication for future relational constraints:** key persisted constraints on the stable
`${placement.id}|${pad.number}` (or pin id `${partId}:${originPinKey}`), and resolve to the live
(ephemeral) `net.id` at projection time via `padNets`. **Never key on `net.id`.**

### Selection / grouping UI (reuse surface, CONFIRMED)
- Workspace store `useDesignerWorkspace.ts:34-38` holds `selectedPartIds: Set<string>`
  (+ `selectedParts` derived `:91-95`).
- Schematic `SelectionState {partIds,wireIds,labelIds,primitiveIds}` (`SchematicCanvas.tsx:132-137`)
  and PCB `PcbSelection {placementIds,traceIds,viaIds,...}` (`pcb/pcb-selection.ts:7-13`), both on the
  shared `useMarqueeSelection` (`shared/frontend/canvas/selection`).
- Context menus via shared `openContextMenu` / `ContextMenuGroup` (`SchematicCanvas.tsx:2720`,
  `PcbCanvas.tsx:2429`) — right-click promotes the item into selection first.
- Properties panel `SelectionInspector.tsx` already has a `{kind:"multi"; parts[]}` →
  `MultiPartInspectorPanel` — the natural host for a "create constraint group from selection" action.

---

## §5 (P1) — Auto-route/Auto-place integration surfaces (state)

### Dialog (CONFIRMED)
`frontend/pcb/PcbAutoLayoutDialog.tsx:108` is the **only** knob-editing UI; it emits an
`AutoLayoutConfig` (`sdks/designer/types.ts:383`), a **curated subset** mapped to service options by
`pcb/autolayout/config.ts` (`toPlaceRequest:83`, `toRouteRequest:104`). Config persists per-design in
`board_settings.viewState.autoLayoutConfig` + a localStorage global default.

- **Placement exposed** (Advanced § collapsed by default): `allowRotate`, `allowFlip`,
  `moveConnectors`, `respectExistingTraces`, `targetUtilization` (`PcbAutoLayoutDialog.tsx:240-260`).
  Effort-derived: `restarts`, `maxMoves` (`config.ts:24,94-95`).
- **Placement hardcoded / unset:** `seed`, `mode`(="all" only), `lockReferences`, `gridSnapMm`, and
  **all `weights`** (0 of 15 exposed, `config.ts:87-96`).
- **`selectedIds`: ABSENT** and not wired to selection (`assert.ts:111`) — no subset/minimal-displacement mode.
- **Routing exposed:** `geometryMode` (45°/90°), `allowVias`, `maxViasPerNet` (0=∞), `serializePours`
  (auto/on/off), `effort` (`PcbAutoLayoutDialog.tsx:280-328`; effort → `portfolio`/`maxExpansions`/budgets).
- **Routing hardcoded / unset:** `seed`, `layerPolicy`, `epsilonNm`, `maxRipupPasses`, `maxShoveNodes/Depth*`,
  `netOrder`, `progressEveryNNets`, all P5 budget knobs, `escapePrecheck` (`config.ts:104-124`).

### Envelope apply + cherry-pick (CONFIRMED)
- **Route = per-op cherry-pick.** `PcbAutorouteDialog.tsx` renders a checkbox per `RouteOperation`
  (`:357-379`, all selected by default), applies the selected subset via `api.applyAutorouteOps`
  → backend loop (`routes.ts:2596-2624`). Partial routing normal; `completion.routedNets/totalNets`
  + `unroutedNets[]` + `diagnostics[]` surfaced *after* completion (`:312-355`).
- **Place = all-or-nothing batch.** `PcbPlacePreviewBar.tsx:23` has a single Accept/Reject
  ("Replaces the old per-op cherry-pick dialog", `:20-22`). User can drag/rotate/flip parts in the
  interactive preview; Accept diffs poses→ops and applies the **whole batch** (`PcbCanvas.tsx:549-564`).
- **`PerNetOutcome` is export-time analytics, NOT apply-time cherry-pick.** Derived by
  `derivePerNetOutcomes` (`capture/outcomes.ts:29`) from the `AutoCopperRegistry` at export, classifying
  `accepted|modified|ripped|rerouted`. Only the **route** apply registers capture copper
  (`routes.ts:2583,2625`); place apply does not.

### Streaming / progress (CONFIRMED)
**Polling only.** Both dialogs poll status every 700 ms up to ~7 min
(`PcbAutorouteDialog.tsx:64-67,146-190`; `PcbAutoplaceDialog.tsx:31-33,98-140`). `SubmitRouteResponse`/
`SubmitPlaceResponse` carry a `streamUrl` and the SDK defines rich progress-frame types, but a repo
grep shows **`streamUrl`/`progressStream` are never consumed** — received and discarded. Status
responses carry only `{jobId,status,error,result}` (no percent), so the UI shows static "Routing…" /
"Optimizing placement…"; numeric metrics appear only from the completed result envelope.

---

## §6 (P2) — 4-layer authoring reality

### Verdict: PARTIAL — inner-layer editing works, but a 4-layer board cannot be CREATED in the app

- **No UI/command sets `layerCount`.** `PcbLayerCount = 2|4` (`types.ts:331`), default 2
  (`pcb-defaults.ts:104`). `pcb_set_board_settings` carries only width/height/center
  (`types.ts:1210-1217`); `pcb_set_design_rules` carries rules/netClasses/thickness/assignments only
  (`types.ts:1338-1345`). **The sole writer of `layerCount=4` is the KiCad project importer**
  (`import/kicad-project/commit.ts:328`, `pickLayerCount`). The board panel even hardcodes a static
  `<Pill>2-layer</Pill>` (`PcbBoardPanel.tsx:325`) — not bound to `board.layerCount`.
- **Once a 4-layer board exists, inner-layer authoring largely works (CONFIRMED):**
  - Active layer: number keys `3`→In1.Cu, `4`→In2.Cu, gated on `layerCount===4`
    (`PcbCanvas.tsx:2752-2775`); layer panel exposes In1/In2 rows (`requiresLayerCount:4`).
  - Routing on In1/In2: backend doesn't restrict layer (`command-executor.ts:274-304`); DRC treats
    In1/In2 as valid on 4-layer (`drc/checks/constraints.ts:8-19`, `copperLayersForCount`).
  - Pours: whole-layer copper fill toggles on In1/In2 (`PcbLayersPanel.tsx:308-441`;
    `board-snapshot-pours.ts:91-118`).
  - Rendering + export: all four copper layers mapped for traces/pours/pads/labels
    (`PcbScene.tsx:1531/1607/1732/1803`); export honors inner layers (`export/index.ts:54,134-140`).
- **Gaps (CONFIRMED):** (1) no way to create a 4-layer board in-app; (2) no blind/buried/micro vias —
  every via is hardcoded `F.Cu→B.Cu through` (`command-executor.ts:351-353`); (3) the V-key via-toggle
  only flips F↔B (`PcbCanvas.tsx:2671-2673`) — inner-layer changes need the number keys/panel;
  (4) no native zone-drawing tool — bounded `PcbZone`s are **KiCad-import-only** (no `pcb_add_zone`
  command / zone tool mode); only whole-layer board fill is native.

### Per-layer stackup record — LOW–MEDIUM effort (types + UI slot only)
Board settings is a single JSON blob (`pcb-store.ts:685/696/939`) ⇒ **additive, no migration**.
Slots: add `PcbStackupLayer` + optional `stackup?: PcbStackupLayer[]` to `PcbBoardSettings`
(`types.ts:613-619`, mirroring the `boardThicknessMm?`/`cutouts?` back-compat pattern); optional field
on `DesignerPcbSetDesignRulesCommand` (`types.ts:1338`); parse-with-default in `parseBoardSettings`
(`pcb-store.ts:625`); thread through `updatePcbDesignRules` (`:889-939`). UI slot: a new `<section>`
in `PcbDesignRulesDialog.tsx` beside the existing "Board thickness" (`:168-185`), added to its
`onSave` payload. (A real stackup editor would also want a `layerCount` control, which doesn't exist yet.)

---

## §7 (P2) — Headless snapshot emission

### Verdict: YES — a headless, app-free path already exists (CONFIRMED)
`scripts/board-snapshot-parity-harness.ts` — a standalone Bun CLI (`#!/usr/bin/env bun`) that
constructs synthetic `DesignerPcbProjection`s **entirely in memory (no DB, no app)** via a local
`projection()` factory (`:40`), calls the real `buildBoardSnapshot` (`:20` import), and prints
`[{name,snapshot,warnings},...]` JSON to stdout (`:225-231`). Run: `bun run
scripts/board-snapshot-parity-harness.ts`. It was purpose-built for exactly a cross-repo parity check
(header `:2-9`); a sibling `scripts/drc-parity-harness.ts` mirrors it for DRC. No `package.json` alias
references them (run directly).

Also usable as builders: `tests/designer-board-snapshot.test.ts:32` (`projection()` factory, ~24
`buildBoardSnapshot` call sites) and `tests/designer-export.test.ts:26` (`fixtureProjection()`, a
single self-contained "555 blinker" literal). No golden `BoardSnapshot` JSON instance is committed
(only the schema).

Runtime (DB-backed) path, if a real design is needed: `loadPcbProjection`
(`pcb-projection.ts:24`) requires a live `DbClient` + `designId` + `revision` + timestamp; nothing in
`scripts/` wires that up — the harness deliberately bypasses it.

For an `OPENPCB_DIR`-gated parity test: invoke the harness and parse its stdout JSON array.

---

## §8 — Engineer's notes

**Reality vs the Known-baseline block:**
- Baseline cited `pcb-store.ts:41` for the `board_settings` kind — CONFIRMED (`BOARD_SETTINGS_KIND`,
  `pcb-store.ts:41`). `buildBoardSnapshot` is at `board-snapshot.ts:123-331` — CONFIRMED.
- **"9/15 weights not exposed" is optimistic — 0 of 15 are exposed.** The 6 declared hand-side weights
  are also unwired (`config.ts:87-96` never sets `weights`); the other 9 aren't even declared. See §2/§5.
- **Courtyard is not uniformly absent.** KiCad-imported footprints drop CrtYd at import; **generated/
  drawn footprints retain all layers incl. CrtYd** in the persisted placement preview. The baseline's
  "buildFootprintRenderModel whitelists SilkS+Fab only" is true **only for the KiCad import path** —
  the generated/drawn path calls it with no whitelist. This bifurcation prices the courtyard work
  differently per footprint provenance.
- The raw all-layer footprint DOES survive in `library_footprints.data_json.raw`, but **no placement
  path reads it** — so it's inert for snapshot enrichment without a library re-query.

**Things that block / cheapen / reorder the work:**
- **Net-id instability is the single biggest constraint on relational features** (decap/crystal groups,
  diff pairs). Net ids are recomputed union-find roots; any persisted per-net constraint must key on the
  stable pad address `${placement.id}|${pad.number}` (or pin id / net name for named nets) and resolve
  through `padNets`. This is a real design constraint, not a bug — plan for it up front.
- **The board-settings JSON blob is the cheap surface.** stackup, per-net policy fields for new DRC
  checks, and constraint groups can all be additive fields with no migration — but each still needs a
  command field + parse function + dialog section.
- **DRC net-class fields are mostly decorative today** (only `clearanceMm` enforced). Any "quality"
  work that assumes per-net width/via-diameter is validated will find it isn't — that gap is a
  low-cost, high-value early win (checks + wiring already have templates).
- **Apply-time re-validation is a non-blocking backstop, not a gate** — it reports DRC but does not
  reject a bad envelope. If cloud results must be DRC-clean on apply, that enforcement doesn't exist yet.
- **`selectedIds` + place-subset mode is the cheapest auto-place UX win** — the selection state
  (`selectedPartIds`) already exists; only the `PlaceOptions` field + dialog wiring are missing.
- **4-layer is import-only** — any 4-layer quality testing needs a KiCad-imported fixture; you cannot
  author one natively. Adding a `layerCount` control is a prerequisite for native 4-layer work.
