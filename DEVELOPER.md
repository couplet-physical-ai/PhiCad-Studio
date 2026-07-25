# OpenPCB — Developer Guide

Architecture, running from source, and internals reference. For PR process/conventions see [`CONTRIBUTING.md`](CONTRIBUTING.md). For the user-facing overview see [`README.md`](README.md).

## Tech stack

| Layer         | Choice                                                                                |
| ------------- | ------------------------------------------------------------------------------------- |
| Desktop       | Electron 41 (embedded backend in main process)                                        |
| Backend       | Bun HTTP server, RFC 7807 problem-details, JSON structured logging                    |
| Database      | SQLite via `better-sqlite3` + Drizzle ORM, per-module table prefixes                  |
| Frontend      | React 19, Vite 7, Tailwind 4, Zustand 5, Radix UI, Lucide icons                       |
| Rendering     | React Three Fiber + three.js, orthographic + demand rendering                         |
| Geometry      | `polygon-clipping`, custom Manhattan / 45° routers, MST ratsnest                      |
| 3D import     | `occt-import-js` (STEP), background ZIP+STEP conversion                               |
| Tests         | Bun Test (backend), Vitest 4 (frontend), Playwright (e2e)                             |
| Observability | Sentry (`@sentry/electron`, `@sentry/react`, `@sentry/node`)                          |
| Packaging     | `electron-builder` → dmg/zip (mac), Setup.exe + nupkg (win), deb/rpm/AppImage (linux) |

## Architecture

OpenPCB enforces strict one-way layer dependencies:

```
electron/  ──spawns──►  core/backend (in-process)
                         │
modules/*  ─────────►  sdks/*  ─────────►  shared/*  ─────────►  core/*
```

| Layer       | Responsibility                                                                                    |
| ----------- | ------------------------------------------------------------------------------------------------- |
| `core/`     | Pure infrastructure: HTTP server, router, module loader, DB factory, errors. Zero business logic. |
| `shared/`   | ECS world, command/patch infrastructure, canvas engine, geometry, UI primitives.                  |
| `sdks/`     | Pure inter-module contracts (`@sdks/library`, `@sdks/designer`, …) — types only.                  |
| `modules/*` | Self-contained vertical slices: manifest + backend + frontend + migrations + domain.              |
| `electron/` | Thin OS shell: windows, IPC, updater, lifecycle.                                                  |

### Active modules

| Module      | Kind  | Depends on | Status                                     |
| ----------- | ----- | ---------- | ------------------------------------------ |
| `library`   | space | —          | symbols, footprints, KiCad import, seeding |
| `designer`  | space | `library`  | schematic ✅, PCB layout 🚧 (phase 4)      |
| `tasks`     | tool  | —          | persisted runtime, SSE, hidden sidebar     |
| `assistant` | space | `tasks`    | dev-only, OpenAI/Ollama/LM Studio          |

### Designer command flow

```
CommandEnvelope
  → idempotency check (command log)
  → load DesignWorld (ECS)
  → validate baseRevision
  → command-bus dispatch
  → handler plans patches
  → apply + persist
  → publish invalidation
  → CommandResult (with inverse patch for undo)
```

Reads go through `SchematicProjection` (`projection-read.ts`, `projection-world.ts`). PCB placements are auto-synced from schematic changes. See [`docs/COMMAND_PATTERN.md`](docs/COMMAND_PATTERN.md), [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md), [`docs/PROPOSED_ARCHITECTURE.md`](docs/PROPOSED_ARCHITECTURE.md).

### Module HTTP routing

- Public URL: `/api/modules/{moduleId}/{subpath}`
- Core routes: `GET /api/health`, `GET /api/diagnostics`, `GET /api/modules/registry`
- Errors use `application/problem+json` (RFC 7807) with `https://openpcb.dev/problems/*` types.

## Repository layout

```
src/
├── core/
│   ├── backend/        Bun HTTP runtime, module loader, router, DB (own workspace)
│   ├── frontend/       React 19 + Vite 7 + Tailwind 4 (own workspace)
│   └── contracts/      app/* + modules/* type contracts
├── modules/
│   ├── library/        components, symbols, footprints, KiCad import
│   ├── designer/       schematic + PCB editor (commands, history, projection, pcb/)
│   ├── tasks/          task tracking + SSE
│   └── assistant/      AI assistant (dev)
├── sdks/               public inter-module contracts
└── shared/             ECS, commands, canvas engine, rendering, UI primitives
electron/               Electron main + preload + embedded backend manager
scripts/                module CLI, codegen, sourcemap upload
docs/                   architecture + command-pattern + data-model
tests/e2e/              Playwright
```

## Running from source

Requirements: **Node 20+**, **npm 10.9+**, **Bun ≥ 1.3** (backend runtime/tests).

```bash
git clone https://github.com/OpenPCB-app/OpenPCB.git
cd OpenPCB
npm install
```

### Run in the browser (dev backend + Vite)

```bash
npm run dev
# backend  → http://127.0.0.1:3000
# frontend → http://127.0.0.1:1420  (proxies /api and /ws → 3000)
```

### Run as a desktop app

```bash
npm run dev:electron     # alias: dev:desktop
```

### Run with sibling CoreLibrary sources

Place `CoreLibrary` beside this checkout, install its Bun deps once, then use
the dev CoreLibrary scripts:

```bash
cd ../CoreLibrary && bun install && bun run validate
cd ../OpenPCB
npm run dev:corelib          # browser dev, packs ../CoreLibrary first
npm run dev:electron:corelib # desktop dev, packs ../CoreLibrary first
```

The local package is built as `999.0.0-dev` in `../CoreLibrary/dist` and is
preferred only in development. Release/package builds still use fetched/bundled
`.opclib` resources.

### Build installers

```bash
npm run build            # frontend bundle + electron-builder make for current OS
# Per-OS in electron workspace:
npm run make:mac --workspace electron
npm run make:win --workspace electron
npm run make:linux --workspace electron
```

CI builds and publishes artifacts (dmg/zip, Setup.exe/nupkg/RELEASES, deb/rpm/AppImage) on `v*` tags via `.github/workflows/release-electron.yml`.

## Commands reference

| Command                        | What it does                                                  |
| ------------------------------ | --------------------------------------------------------------|
| `npm run dev`                  | Backend + Vite (browser mode)                                 |
| `npm run dev:electron`         | Vite + Electron shell with embedded backend                   |
| `npm run dev:corelib`          | Pack `../CoreLibrary`, then run browser dev                   |
| `npm run dev:electron:corelib` | Pack `../CoreLibrary`, then run Electron dev                  |
| `npm run dev:backend`          | Bun backend only (`--watch`, port 3000)                       |
| `npm run dev:frontend`         | Vite dev server only (port 1420)                              |
| `npm run dev:browser`          | Backend + Playwright UI runner                                |
| `npm run build`                | Frontend bundle + electron-builder make                       |
| `npm run typecheck`            | Composite `tsc -b` over backend/frontend/modules              |
| `npm run test:backend`         | Bun test suite (`src/core/backend`)                           |
| `npm run test:react`           | Vitest (`src/core/frontend`)                                  |
| `npm run test:e2e`             | Playwright e2e                                                |
| `npm run module`               | Interactive module CLI                                        |
| `npm run module:create`        | Scaffold a new module                                         |
| `npm run module:validate`      | Validate all module manifests                                 |
| `npm run modules:generate`     | Codegen module registry → `frontend/src/generated/modules.ts` |
| `npm run sdk:generate`         | Codegen SDK barrels → `frontend/src/generated/sdk/`           |
| `npm run gen` / `gen:check`    | Run codegen / fail if generated files are dirty               |
| `npm run db:generate`          | `drizzle-kit generate`                                        |
| `npm run db:studio`            | `drizzle-kit studio`                                          |
| `npm run release:sourcemaps`   | Upload sourcemaps post-release                                |

Single-file test runs:

```bash
cd src/core/backend && bun test tests/<file>.test.ts
cd src/core/frontend && npx vitest run path/to/file.test.tsx
```

## Environment variables

| Variable                    | Default                         | Purpose                                         |
| --------------------------- | -------------------------------- | ----------------------------------------------- |
| `PORT`                      | `3000`                          | Backend port                                    |
| `HOST`                      | `127.0.0.1`                     | Backend bind address                            |
| `OPENPCB_DB_PATH`           | `dev-data/openpcb.sqlite` (dev) | SQLite path (prod: `~/.openpcb/data.sqlite`)    |
| `OPENPCB_WORKSPACE_ROOT`    | derived                         | Module discovery root (defaults to repo `src/`) |
| `OPENPCB_ALLOWED_ORIGINS`   | localhost:1420, :3000, tauri    | Comma-separated CORS origins                    |
| `OPENPCB_DEBUG_DIAGNOSTICS` | `false`                         | Enables `/api/diagnostics/debug/modules`        |
| `NODE_ENV`                  | —                               | `development` / `test`                          |

## Creating a new module

```bash
npm run module:create        # interactive scaffolder
npm run modules:validate     # validates all manifests
npm run gen                  # regenerate module + sdk indexes
```

Each module needs:

```
src/modules/<id>/
├── manifest.json            # id, namespace, apiVersion: 2, sidebar, dependsOn
├── module.backend.ts        # exports ModuleDefinition (default|definition|backendModule)
├── module.frontend.ts       # exports { manifest, Space }
├── backend/
│   ├── migrations/0000_*.sql   # auto-applied on boot, transactional, tracked in openpcb_migrations
│   └── routes.ts
└── frontend/Space.tsx
```

Module routes are mounted under `/api/modules/{id}/...`. SDKs are registered against tokens in `src/sdks/index.ts` and consumed via the `RuntimeSdkRegistry`.

## TypeScript path aliases

- `@modules/*` → `src/modules/*`
- `@sdks/*` → `src/sdks/*`
- `@shared/*` → `src/shared/*`
- `@/*` → `src/core/frontend/src/*` (frontend only)

## Troubleshooting

- **Backend won't boot** — check `OPENPCB_DB_PATH` is writable; module SQL migrations run transactionally on startup. See `/api/diagnostics`.
- **Module not appearing** — re-run `npm run gen`; confirm `manifest.json` `apiVersion: 2` and unique `id`; check topological order in logs.
- **Stuck STEP/3D conversion** — import commits first, conversion runs in background; use the Library 3D preview retry control.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for setup, conventions, and the pre-PR checklist.
