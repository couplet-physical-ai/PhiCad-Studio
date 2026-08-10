# Vendored contract schemas

The `*.schema.json` files in this directory are **vendored copies**, not generated
artifacts — nothing in this repo derives them.

- **Source repo:** `OpenPCB-app/cloud-auto-layout` (locally:
  `cloud-workspace/cloud-auto-layout`)
- **Source path:** `contracts/*.schema.json`
- **Vendored at commit:** `780d3d2`
- **Emitted by:** `uv run python -m scripts.emit_contracts` (service repo) —
  regenerated there after any `app/contracts/*` Pydantic model change.

| Schema                          | Role     | Generated into                                            |
| ------------------------------- | -------- | --------------------------------------------------------- |
| `BoardSnapshot.schema.json`     | request  | `../board-snapshot.generated.ts`                           |
| `RouteResultEnvelope`           | response | `../cloud-autolayout/generated/route-result.generated.ts`   |
| `PlacementResultEnvelope`       | response | `…/place-result.generated.ts`                              |
| `LayoutResultEnvelope`          | response | `…/layout-result.generated.ts`                             |
| `ProgressFrame{Route,Place,Layout}` | response | `…/progress-{route,place,layout}.generated.ts`         |
| `Diagnostic`                    | response | `…/diagnostic.generated.ts`                                |
| `SubmitJobResponse`             | response | `…/submit-job-response.generated.ts`                       |
| `JobStatusResponse`             | response | `…/job-status-response.generated.ts`                       |
| `CancelJobResponse`             | response | `…/cancel-job-response.generated.ts`                       |
| `SelectionResponse`             | response | `…/selection-response.generated.ts`                        |
| `VersionResponse`               | response | `…/version-response.generated.ts`                          |

**Role matters.** `request` schemas (only `BoardSnapshot`) keep defaulted fields optional —
the desktop is the producer, and omitting a field means "use the service's current
default", which is how engine improvements reach already-shipped desktops. `response`
schemas render non-null-defaulted fields as required, because the service dumps them every
time. See `scripts/gen-contract-types.ts`.

## Sync command

From the service repo root:

```bash
uv run python -m scripts.emit_contracts
```

Then, from this repo (`OpenPCB/`):

```bash
cp ../cloud-workspace/cloud-auto-layout/contracts/*.schema.json \
   src/sdks/designer/contracts/
npm run gen:contracts
npm run typecheck
```

Update the "Vendored at commit" line above to the service repo's `HEAD` at copy time.

## Guards

- `npm run gen:contracts -- --check` (also reached via `npm run gen:check`, and run as its
  own CI step) fails when any generated file drifts from its vendored schema.
- `src/sdks/designer/autoroute.ts` / `autoplace.ts` **alias** the generated types rather
  than mirroring them, so a service shape cannot silently diverge from the desktop's copy;
  `../board-snapshot.assert.ts` pins that arrangement at the type level (`npm run typecheck`).
- The service repo checks the other direction at the value level:
  `tests/parity/test_schema_sync.py` (every vendored schema byte-equal, skipped unless this
  checkout is present) and `tests/parity/test_snapshot_parity.py` (real
  `buildBoardSnapshot()` output validates against the Pydantic model + `validate_snapshot`).
  The harness behind the latter is `npm run parity:snapshot`.
