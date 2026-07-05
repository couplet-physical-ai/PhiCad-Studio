# DESIGNER MODULE

**Purpose:** Schematic + PCB editor — ECS-based design world, command pattern, undo/redo, projections.

## STRUCTURE

```
src/modules/designer/
├── manifest.json              # id: "designer", depends on library
├── module.backend.ts          # Barrel export
├── module.frontend.ts         # Frontend entry
├── backend/
│   ├── index.ts               # ModuleDefinition
│   ├── schema.ts              # Drizzle tables
│   ├── routes.ts              # HTTP routes + parse helpers (~1713 lines)
│   ├── store.ts               # Design CRUD + command dispatch (~701 lines)
│   ├── command-executor.ts    # All 25+ command handlers (~1464 lines)
│   ├── projection-world.ts    # ECS bridge, net derivation (~818 lines)
│   ├── wire-geometry.ts       # Wire point parsing, vertex insertion
│   ├── history-*.ts           # Persistence, state, patches
│   ├── pcb/
│   │   ├── pcb-store.ts       # PCB entity persistence (~1715 lines)
│   │   ├── pcb-projection.ts  # PCB read-only snapshot
│   │   ├── pcb-trace-geometry.ts  # Trace validation (~437 lines)
│   │   ├── ratsnest.ts        # MST net segments (~239 lines)
│   │   └── migrations/        # 0000…0004_pcb_foundation.sql
│   └── migrations/            # Designer schema migrations
└── frontend/
    ├── components/
    │   ├── SchematicCanvas.tsx    # Main schematic canvas (~2806 lines)
    │   └── LibrarySymbolPalette.tsx
    └── pcb/
        ├── PcbCanvas.tsx          # PCB canvas (~2194 lines)
        ├── layers/                # Layer visibility, rendering
        └── tools/                 # PCB-specific tools
```

## WHERE TO LOOK

| Task                | Location                                  |
| ------------------- | ----------------------------------------- |
| Add command handler | `backend/command-executor.ts`             |
| Add HTTP route      | `backend/routes.ts`                       |
| Change schema       | `backend/schema.ts` + migration           |
| Schematic canvas    | `frontend/components/SchematicCanvas.tsx` |
| PCB canvas          | `frontend/pcb/PcbCanvas.tsx`              |
| PCB entity CRUD     | `backend/pcb/pcb-store.ts`                |
| Net derivation      | `backend/projection-world.ts`             |
| Trace geometry      | `backend/pcb/pcb-trace-geometry.ts`       |
| Ratsnest            | `backend/pcb/ratsnest.ts`                 |
| Undo/redo           | `backend/history-*.ts`                    |

## KEY ABSTRACTIONS

- **CommandEnvelope**: `{ commandId, sessionId, aggregateId, baseRevision, issuedAt, command }`
- **DesignerStore**: design CRUD + command dispatch + history (undo/redo)
- **Projection**: read-only `DesignerSchematicProjection` / `DesignerPcbProjection`
- **ECS World**: schematic parts/wires/labels as entities+components; patches for undo
- **Revision-based OCC**: `baseRevision` in envelope; `REVISION_CONFLICT` on mismatch

## ANTI-PATTERNS

- Never put business logic in `core/backend/*`
- Never import `core/backend/*` or `core/frontend/*` from here
- Never invent manufacturing constants — use `/eda-standards`
- Schematic canvas is 2806 lines — split interactions into hooks, don't grow further

## NOTES

- Depends on `library` module; resolves symbols/footprints via `LibrarySDK`
- PCB tab renders in dark mode regardless of app theme (single token set)
- Trace modes: `manhattan-90` | `manhattan-45`
- Copper layers: `F.Cu` | `B.Cu`
- Command log provides idempotency (duplicate `commandId` rejected)

## DATASET CAPTURE (WP-D4, `backend/capture/`)

- Gated by the `dataset.capture` feature flag: default OFF in dev/test, ON in packaged
  builds, override `OPENPCB_FEATURE_DATASET_CAPTURE`. When off every hook is a no-op.
- One `CaptureRuntime` singleton (`resolveCaptureRuntime`) — TWO DesignerStore instances
  exist (sdk.ts + routes.ts); registry state lives in SQLite for the same reason.
- Session log: per (process, design) session, JSONL segments under
  `OPENPCB_CAPTURE_DIR ?? <db-dir>/capture`, zstd on rotation, 200 MB/session cap →
  `capture_truncated` marker then stop (never drop-oldest; `seq` continuity matters).
  Appends are buffered and flushed on a 250 ms timer — a hard crash may lose the tail
  (acceptable for telemetry).
- There is NO CommandBatch type: entries are per-envelope; apply loops share a `groupId`.
  Actor attribution is the optional `capture` param on `dispatchCommand` (envelope has no
  actor field and AI shares the UI session id). Import bypasses dispatch → its own hook.
- AutoCopperRegistry: geometry ids come from history forward/inverse patches (NOT
  `createdEntityId` — `pcb_add_trace_via` drops the trace id). Undo of a creating command
  ⇒ `undone`; redo restores (ids are stable across undo→redo). Touches are per-command
  and removed/re-added by history replay — never reconstructed by diffing.
- PerNetOutcome at export: accepted (explicit) | modified | ripped | rerouted, from
  registry + live projection copper vs preexisting-at-apply ids.
- Upload queue mirrors the comment-outbox pattern; endpoint/token via
  `OPENPCB_DATASET_INGEST_URL` / `OPENPCB_DATASET_INGEST_TOKEN`; at-least-once with
  ULID idempotency. Milestone snapshot hashes are LOCAL dedup only — canonical board
  identity is computed at ingest (M3), never here.
- M5 acceptance follow-up: measure real session-log sizes once beta users exist
  (rotation caps were sized from estimates).
