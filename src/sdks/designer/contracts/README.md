# Vendored contract schema

`BoardSnapshot.schema.json` in this directory is a **vendored copy**, not a
generated artifact — it is not derived from anything in this repo.

- **Source repo:** `OpenPCB-app/cloud-auto-layout` (locally:
  `cloud-workspace/cloud-auto-layout`)
- **Source path:** `contracts/BoardSnapshot.schema.json`
- **Vendored at commit:** `e892985`
- **Emitted by:** `uv run python -m scripts.emit_contracts` (service repo) —
  regenerated there after any `app/contracts/*` Pydantic model change.

## Sync command

From the service repo root:

```bash
uv run python -m scripts.emit_contracts
```

Then, from this repo (`OpenPCB/`):

```bash
cp ../cloud-workspace/cloud-auto-layout/contracts/BoardSnapshot.schema.json \
   src/sdks/designer/contracts/BoardSnapshot.schema.json
bun scripts/gen-contract-types.ts
npm run typecheck
```

Update the "Vendored at commit" line above to the service repo's `HEAD` at
copy time. `npm run gen:contracts -- --check` (wired into CI) fails if
`board-snapshot.generated.ts` drifts from this schema file; the type-level
checks in `../board-snapshot.assert.ts` fail `npm run typecheck` if the
hand-written `BoardSnapshot` (`../autoroute.ts`) structurally drifts from the
schema beyond the documented, tracked gaps.

Cross-repo parity is additionally checked at the value level (not just
types) by the service repo's `tests/parity/test_schema_sync.py` (byte-equal
schema, skipped unless this checkout is present) and
`tests/parity/test_snapshot_parity.py` (real `buildBoardSnapshot()` output
validates against the service's Pydantic model + `validate_snapshot`).
