# DESIGNER MODULE

**Purpose:** Schematic + PCB editor — ECS-based design world, command pattern, undo/redo,
projections, DRC.

Read the root `CLAUDE.md` first (layer rules, command-pattern flow, coordinate contract, SQLite
runtime). This file carries only what is specific to this module: the invariants that will cost you
a rewrite if you learn them late, and the anti-patterns they imply.

There is deliberately **no directory map here.** Trees rot faster than any other kind of
documentation, and the previous one was wrong within a release. Use the table below and read the
code.

## WHERE TO LOOK

| Task                        | Location                              |
| --------------------------- | ------------------------------------- |
| Add a command handler       | `backend/command-executor.ts`         |
| Add an HTTP route           | `backend/routes.ts`                   |
| Change schema               | `backend/schema.ts` + a new migration |
| Net derivation              | `backend/projection-world.ts`         |
| PCB entity CRUD             | `backend/pcb/pcb-store.ts`            |
| PCB read-only snapshot      | `backend/pcb/pcb-projection.ts`       |
| Trace geometry validation   | `backend/pcb/pcb-trace-geometry.ts`   |
| Ratsnest (MST net segments) | `backend/pcb/ratsnest.ts`             |
| DRC engine + checks         | `backend/drc/`, `backend/drc/checks/` |
| Undo / redo                 | `backend/history-*.ts`                |
| Dataset capture             | `backend/capture/`                    |
| Schematic canvas            | `frontend/components/SchematicCanvas.tsx` |
| PCB canvas                  | `frontend/pcb/PcbCanvas.tsx`          |
| Auto Layout (dialog, run state, preview) | `frontend/pcb/autolayout/` |
| Auto Layout backend (client, apply, routes) | `backend/autolayout/` |

## KEY ABSTRACTIONS

- **CommandEnvelope** — `{ commandId, sessionId, aggregateId, baseRevision, issuedAt, command }`.
- **DesignerStore** — design CRUD, command dispatch, history.
- **Projection** — read-only `DesignerSchematicProjection` / `DesignerPcbProjection`.
- **ECS world** — schematic parts, wires and labels as entities + components; patches drive undo.
- **Revision-based OCC** — `baseRevision` on the envelope; `REVISION_CONFLICT` on mismatch.
- Command log provides idempotency: a duplicate `commandId` is rejected.

## IDENTITY — read this before persisting anything

**Net ids are ephemeral and must never be persisted against.** `deriveNetsAndJunctions` in
`projection-world.ts` builds nets with a union-find over coordinate-keyed nodes; `net.id` is
whichever node won the merge. It therefore depends on geometry and merge order, and it **changes**
when a component moves, a pin moves, or a wire is added. Nets are not persisted at all — there is
no `designer_nets` table, and `netNames` is rebuilt on every projection.

Consequences, in the order you will hit them:

- **Key persisted constraints on the stable pad address `` `${placement.id}|${pad.number}` ``** (or
  on the pin id `` `${partId}:${originPinKey}` ``), then resolve to the live `net.id` at projection
  time through `padNets`. Never store a `net.id`.
- **The upper-cased net NAME is the durable cross-edit identifier — and only for named nets.** This
  is why persisted traces and vias re-bind by name (`bindNetName`) after a schematic→PCB re-sync.
  Unnamed nets get regenerated `Net_<n>` labels and carry no identity across edits.
- `placement.id` is a `crypto.randomUUID()` minted once and matched on re-sync by `partId`. It is
  **stable across re-annotation and re-sync** and dies only with its schematic part.
- `pad.number` is library-defined and refdes-independent. The correlation convention is that the
  symbol's `pin.number` equals the footprint's `pad.number` on the same placement.
- Re-annotating a refdes updates only the `reference` column, keyed by an unchanged `partId`. Pin
  ids and geometry are untouched, so `net.id` does not change — but the net **name** can, if a label
  or rail was renamed.

Net-id instability is the single biggest constraint on relational features (constraint groups,
decoupling/crystal groups, diff pairs). Plan for it up front; it is a design constraint, not a bug.

## BOARD SETTINGS — the cheap extension surface

Board settings is **one row, one JSON blob**: `kind: "board_settings"` in the single
`designer_pcb_entities` table, holding the whole `PcbBoardSettings` stringified. Design rules, net
classes, `perNetClassAssignments`, `layerCount`, board thickness and `viewState` (including
`autoLayoutConfig`) all live inside it.

⇒ **Additive fields need no migration.** That makes stackup records, per-net policy fields for new
DRC checks, and constraint groups cheap to persist. It does **not** make them free: each still needs
a command field, a parse-with-default branch in the board-settings parser, and a dialog section.
And a command field with no parser in `routes.ts` is silently dropped over HTTP.

## DRC

- **Only `clearanceMm` from `PcbNetClass` is enforced.** `traceWidthMm`, `viaDiameterMm`,
  `viaDrillMm`, `defaultViaProtection` and `color` are **stored but unused by DRC** — they feed
  route-tool defaults. A net class with a wider `traceWidthMm` produces **no** per-net min-width
  violation. Do not assume per-net width or via geometry is validated anywhere.
- **Net class can only tighten.** Clearance resolves as `max(designRule, netA, netB)`. There is no
  mechanism for a net class to relax a board rule.
- **Dispatch is a hardcoded array, not a registry.** The engine builds one `DrcContext` and spreads
  seven pure `(ctx: DrcContext) => DrcViolationDraft[]` checks into a flat list. Adding a check is
  trivial — a new file under `drc/checks/` plus one array entry. The real cost is always the
  **rules-input schema**: a new rule has no home on `PcbDesignRules` / `PcbNetClass` until you add
  one, wire the corresponding command field, and add a dialog section.
- **`DrcRuleClass` has exactly five values:** `clearance | constraint | connectivity |
  manufacturability | structural`. There is **no `copper-pour` class** — pour islands report under
  `structural`. Do not add a sixth without checking every consumer that switches on the union.
- Violation ids are order-independent by construction (a hash over code plus **sorted** anchor keys),
  which is what makes waivers survive re-runs.
- **Apply-time re-validation is a non-blocking backstop, not a gate.** Both cloud apply handlers run
  the same `runDrc` and report the result, but they do **not** reject a bad envelope and do **not**
  persist the report (unlike the interactive DRC run). Partial apply therefore carries no overlap
  guarantee. If cloud results must be DRC-clean on apply, that enforcement does not exist yet.

## FOOTPRINTS AND COURTYARDS — bifurcated by provenance

Courtyard availability depends on **how the footprint entered the library**:

- **KiCad import whitelists SilkS + Fab only.** `F.CrtYd` / `B.CrtYd` are dropped from the preview
  **before persistence**, so a KiCad-imported placement has no courtyard geometry. The Fab outline
  survives and is the only in-projection fallback.
- **The generated / drawn path does not filter.** IPC-7351B preset and drawn-editor footprints call
  the render-model builder with no options, so **all layers survive, including CrtYd**.
- The full all-layer parsed footprint does survive for KiCad parts, in
  `library_footprints.data_json.raw` — but **no placement path reads it.** It is inert for snapshot
  enrichment without an explicit library re-query.

Price courtyard work per provenance. A mapper change covers generated parts; KiCad parts need either
an import-whitelist change or a library re-query.

## PCB CAPABILITY BOUNDARIES

- **4-layer is import-only.** `PcbLayerCount` is `2 | 4`, and the **sole writer of `layerCount = 4`
  is the KiCad project importer** — no UI and no command sets it. The board panel renders a static
  `2-layer` pill that is not bound to `board.layerCount`. Any 4-layer testing needs a KiCad-imported
  fixture; a `layerCount` control is a prerequisite for native 4-layer work.
- **Bounded `PcbZone`s are KiCad-import-only.** There is no `pcb_add_zone` command and no zone tool
  mode. Only whole-layer board fill is native.

## AUTO-LAYOUT INTEGRATION

- **Three workflows, not one.** *Auto Layout* is one composite cloud job (`/v1/layout`) that
  returns complete candidates; *Route Board* (`/v1/route`) routes the board as placed; *Auto Place*
  (`/v1/place`) optimizes placement only. The old desktop-sequenced place→apply→route flow is gone
  — it committed the placement before routing began, so a failure left a half-laid-out board.
- **Apply semantics differ by workflow, deliberately.** A layout candidate applies ATOMICALLY
  (`pcb_apply_autolayout_candidate`: plan everything, write nothing until all of it validates, one
  revision, one undo). Route Board stays per-op cherry-pick; Auto Place stays an all-or-nothing
  diff over its interactive ghost.
- **Never validate through the mutating placement helpers.** `movePcbPlacement` / `rotate` / `flip`
  upsert on call, and executor branches return error RESULTS rather than throwing — so validating
  by calling them commits earlier writes when a later op fails. The pure planner
  (`backend/pcb/autolayout-candidate-plan.ts`) exists for exactly this reason.
- **Staleness is a content digest, not the revision.** `pcb_set_view_state` bumps the revision, so
  revision equality would invalidate a candidate on a pan or a layer toggle. See
  `backend/pcb/board-content-digest.ts` — and add new persisted board data to its projection.
- **The renderer never sends candidate operations.** Apply carries `{jobId, candidateId,
  snapshotDigest, applyRequestId}`; the backend re-fetches the candidate from the service.
- **Transport types are GENERATED** from the service's emitted schemas
  (`src/sdks/designer/cloud-autolayout`); `autoroute.ts` / `autoplace.ts` are aliases. Do not
  hand-write a cloud shape — that is what produced the six-gap drift this replaced.
- **Capabilities are negotiated as booleans.** Read `/v1/version` `engines.*.features`; never
  compare engine version strings.

## HEADLESS PATHS

A headless, app-free snapshot path already exists: `scripts/board-snapshot-parity-harness.ts` is a
standalone Bun CLI that builds synthetic projections **entirely in memory** — no DB, no app — calls
the real snapshot builder, and prints JSON to stdout. A sibling `scripts/drc-parity-harness.ts` does
the same for DRC. **Neither has a `package.json` alias — run them directly.** Use them for
cross-repo parity checks instead of standing up a runtime.

## DATASET CAPTURE (WP-D4, `backend/capture/`)

- Gated by the `dataset.capture` feature flag: default OFF in dev/test, ON in packaged builds,
  override with `OPENPCB_FEATURE_DATASET_CAPTURE`. When off, every hook is a no-op.
- One `CaptureRuntime` singleton (`resolveCaptureRuntime`) — **two `DesignerStore` instances exist**
  (one from the SDK entry, one from routes); registry state lives in SQLite for the same reason.
- Session log: per (process, design) session, JSONL segments under
  `OPENPCB_CAPTURE_DIR ?? <db-dir>/capture`, zstd on rotation, 200 MB/session cap →
  `capture_truncated` marker then stop. **Never drop-oldest** — `seq` continuity matters. Appends
  are buffered and flushed on a 250 ms timer, so a hard crash may lose the tail (acceptable for
  telemetry).
- **There is no `CommandBatch` type.** Entries are per-envelope; apply loops share a `groupId`.
  Actor attribution is the optional `capture` parameter on `dispatchCommand` — the envelope has no
  actor field, and AI shares the UI session id. Import bypasses dispatch entirely and has its own
  hook.
- `AutoCopperRegistry`: geometry ids come from history forward/inverse patches, **not**
  `createdEntityId` — `pcb_add_trace_via` drops the trace id. Undoing a creating command marks
  `undone`; redo restores it (ids are stable across undo→redo). Touches are per-command and are
  removed and re-added by history replay — **never reconstructed by diffing**.
- `PerNetOutcome` at export is `accepted | modified | ripped | rerouted`, derived from the registry
  plus live-projection copper against the ids that pre-existed at apply. It is **export-time
  analytics, not apply-time cherry-pick**.
- Upload queue mirrors the comment-outbox pattern; endpoint and token come from
  `OPENPCB_DATASET_INGEST_URL` / `OPENPCB_DATASET_INGEST_TOKEN`; delivery is at-least-once with ULID
  idempotency. Milestone snapshot hashes are **local dedup only** — canonical board identity is
  computed at ingest, never here.

## NOTES

- Depends on `library`; resolves symbols and footprints through `LibrarySDK`, never by importing the
  module.
- The PCB tab renders in dark mode regardless of app theme (single token set).
- Trace modes: `manhattan-90` | `manhattan-45`. Copper layers on a 2-layer board: `F.Cu` | `B.Cu`.
- Every via is currently a through via, `F.Cu → B.Cu`. There are no blind, buried or micro vias.

## ANTI-PATTERNS

- Do **NOT** persist anything keyed on `net.id`. Use `` `${placement.id}|${pad.number}` `` or the
  upper-cased net name.
- Do **NOT** assume a `PcbNetClass` width or via field is enforced — only `clearanceMm` is.
- Do **NOT** treat apply-time DRC as a gate. It reports; it does not reject.
- Do **NOT** add a `DrcRuleClass` value without auditing every consumer of the five-value union.
- Do **NOT** add a command field without adding its parser in `routes.ts` — unparsed fields are
  silently dropped over HTTP, with no error.
- Do **NOT** add a designer command without extending the `DesignerCommand` union in
  `src/sdks/designer/types.ts`.
- Do **NOT** import `core/backend/*` or `core/frontend/*` from here, and do not put business logic
  in `core/`.
- Do **NOT** invent manufacturing constants — use `/eda-standards`.
- Do **NOT** cite `file.ts:line` in this file. Line anchors are what made the previous state report
  unmaintainable within weeks. Name the subsystem and the symbol; let the reader grep.
- The schematic canvas is already oversized — split interactions into hooks rather than growing it.
