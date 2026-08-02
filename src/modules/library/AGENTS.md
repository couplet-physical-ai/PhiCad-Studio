# LIBRARY MODULE

**Purpose:** Component catalog — symbols, footprints, components, KiCad import, built-in seeding.
Consumed by `designer` through `LibrarySDK`.

Read the root `CLAUDE.md` first (layer rules, module system, SQLite runtime, the `@openpcb/*`
re-export shims — several of this module's import and sync files are shims, and editing them changes
nothing). This file carries conventions only.

**There is no schema mirror here, on purpose.** A hand-maintained copy of the table layout was wrong
on a column name, on the table count and on two shipped features within a single release. Read
`backend/schema.ts` and the files under `backend/migrations/` — they are the only accurate
description, and they cost one grep.

## WHERE TO LOOK

| Task                          | Location                                                               |
| ----------------------------- | ---------------------------------------------------------------------- |
| Add an HTTP route             | `backend/routes.ts`                                                    |
| Add an SDK method             | `backend/queries.ts` + update `src/sdks/library/types.ts`               |
| Add a built-in component      | `backend/builtins/seed.ts` (**bump `sourceHash`**)                     |
| Schema change                 | `backend/schema.ts` + a new file in `backend/migrations/`              |
| KiCad parsers                 | `backend/infrastructure/parsers/kicad/`                                |
| Add or change an import path  | `backend/import/commit-*.ts`                                           |
| Pack install / sync           | `backend/sync/`                                                        |
| Import wizard step            | `frontend/import-wizard/ImportWizardPage.tsx`                          |
| Footprint editor tool         | `frontend/import-wizard/footprint-editor/use-footprint-editor-tool.ts` |
| Component detail UI           | `frontend/ComponentDetailPage.tsx`                                     |

## BUILT-IN SEEDING

- Seeding is idempotent and runs from `backend/builtins/seed.ts`.
- **Adding or changing a built-in component means bumping `sourceHash`.** Without the bump the
  seeder considers the existing rows current and your change never lands — silently, with no error.
- `is_builtin = 1` rows are **protected from delete and update by route guards**. That protection
  lives in the routes, not in the database. If you add a new mutating route that touches components,
  symbols or footprints, you must add the guard yourself — nothing else will stop a built-in row
  from being overwritten.

## IMPORT PATHS

Every import branch commits through its own module under `backend/import/`. Know which one you are
changing before you change shared code — they do **not** behave identically:

| Branch              | Entry                  | Source                             |
| ------------------- | ---------------------- | ---------------------------------- |
| KiCad files         | `commit-kicad.ts`      | parsed `.kicad_sym` / `.kicad_mod` |
| Generated preset    | `commit-generated.ts`  | IPC-7351B generator                |
| Drawn footprint     | `commit-drawn.ts`      | footprint-editor output            |

The KiCad branch applies a **layer whitelist before persistence** (courtyard layers do not survive
it); the generated and drawn branches build the render model with no options, so all layers survive.
This bifurcation is load-bearing downstream — see `src/modules/designer/AGENTS.md` for what it costs
the PCB side. Do not "unify" the three commit paths without accounting for it.

Inspection (`inspect-kicad.ts`), preview-model building and pad validation are shared across
branches and are partly `@openpcb/kicad-import` re-export shims — change the published package, not
the shim.

## SDK SURFACE

`LibrarySDK` is published in the module's `registerSdk()` hook against
`MODULE_SDK_TOKENS.LIBRARY`, and consumed by `designer` as `ctx.sdk.get<LibrarySDK>(...)`. The
interface lives in `src/sdks/library/types.ts` — read it there rather than from a copy. Adding a
method means editing that file **and** `backend/queries.ts`, then re-running codegen so the
generated frontend stubs pick it up.

## TESTS

- Fixtures live under `backend/infrastructure/parsers/kicad/__fixtures__/`.
- **Resolve fixture paths via `path.resolve(import.meta.dir, ...)`, never a hard-coded `data/...`.**
  A relative path works from one cwd and fails from every other, which is how a test passes locally
  and fails in CI.

## NOTES

- Layering: import only from `core/contracts/*`, `sdks/*`, `shared/*`. Never `core/backend/*` or
  `core/frontend/*`.
- See `.claude/skills/library/SKILL.md` for the longer-form domain reference — component wizard,
  symbol/footprint editors, KiCad import details, library↔designer linking, palette and detail UI.

## ANTI-PATTERNS

- Do **NOT** re-add a data-model or schema table listing to this file. It rots within a release.
  Point at `backend/schema.ts`.
- Do **NOT** add a mutating route without an `is_builtin` guard.
- Do **NOT** edit a built-in component without bumping `sourceHash`.
- Do **NOT** edit the `@openpcb/*` re-export shims under `backend/import/` and `backend/sync/` and
  expect a behaviour change — the code lives in the published package.
- Do **NOT** hard-code fixture paths.
