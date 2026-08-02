# Contributing to OpenPCB

Thanks for your interest. OpenPCB is in public beta (`0.1.1-beta`) — expect rough edges and rapid
change, and expect a review to care more about whether a change fits the layer model than about how
big it is.

[`DEVELOPER.md`](DEVELOPER.md) is the architecture reference: layer model, module system, the full
command and environment-variable reference, and troubleshooting. Read it before your first PR.
[`ROADMAP.md`](ROADMAP.md) says what is planned, and [`TODO.md`](TODO.md) is the live tracker of
open work if you are looking for something to pick up.

## Quick start

```bash
git clone https://github.com/OpenPCB-app/OpenPCB.git
cd OpenPCB
npm install
npm run dev          # browser mode: Bun backend + Vite
npm run dev:electron # desktop shell
```

Requirements: **Node 20+** (an active LTS is recommended), **npm 10+**, **Bun ≥ 1.3**.

Install at the root only. The root uses npm workspaces; `shared/` and `CoreLibrary/` are sibling
repositories consumed through published GitHub tags, not workspace members.

## Before opening a PR

Run all six from the repo root. CI runs the same set and blocks merge on failure.

```bash
npm run typecheck                   # composite tsc -b (note: excludes electron/)
npm run gen:check                   # module registry + SDK stubs must be committed
npm run gen:contracts -- --check    # generated contract types must be committed
npm run test:backend                # Bun
npm run test:react                  # Vitest
npm run test:e2e                    # Playwright, Chromium
```

If `gen:check` or `gen:contracts -- --check` fails, run `npm run gen` and `npm run gen:contracts`
and commit whatever they change — generated files are checked in on purpose, and a PR that leaves
them stale will fail for the next person rather than for you.

`npm run typecheck` does not cover the `electron/` workspace. If you touched anything under
`electron/`, build it explicitly before pushing.

## Conventions

**Layers.** `modules/* → sdks/ + shared/ → core/`, one direction only. Modules never import
`src/core/backend/*` or `src/core/frontend/*`, and never import each other — cross-module access
goes through an SDK token. Nothing enforces this at build time yet, so it is caught in review. The
full layer model is in [`DEVELOPER.md`](DEVELOPER.md#layer-model). There are five modules —
`assistant`, `designer`, `knowledge`, `library`, `tasks` — and adding a sixth is a design
discussion, not a scaffold command.

**Commands.** Every designer mutation flows through a `CommandEnvelope` with idempotency and an
inverse patch; that inverse is what makes undo work. A new command needs an entry in the
`DesignerCommand` union in `src/sdks/designer/types.ts` *and* a parser entry in the module's
`routes.ts` — a field with no parser is silently dropped over HTTP. See
[`DEVELOPER.md`](DEVELOPER.md#designer-internals) for the flow and
`src/modules/designer/AGENTS.md` for the persistence invariants.

**Rendering.** React Three Fiber only, demand rendering via `invalidate()`. Never `Canvas2D`, never
`frameloop="always"`, never imperative three.js mutation. The coordinate pipeline is nanometres in
the store, millimetres in the scene, pixels on screen — do not introduce a floating-point storage
unit. See `.claude/skills/r3f-eda-rendering/`.

**Manufacturing values.** Never invent a clearance, trace width, annular ring or drill minimum.
They come from the standards references in `.claude/skills/eda-standards/`, and a wrong number here
ships a broken board.

**Codegen.** Any module manifest change requires `npm run gen` and committing the generated files
under `src/core/frontend/src/generated/`.

**Style.** Match what exists. No new abstractions unless a feature requires them. Functions under
50 lines, files under 500.

## Commit and PR

- Branches: `type/short-description` — `feat/router-snap`, `fix/via-clearance`.
- Commit messages: imperative and concise.
- One concern per PR. Reference issues with `Fixes #N`.
- Squash-merge is the default.
- For architecture-shaping changes, open an issue first. A PR that moves a layer boundary or adds a
  dependency is a discussion before it is a diff.

## Reporting bugs

Open a GitHub issue using the bug report template. Include your OS, the app version (`Help →
About`), reproduction steps, and any console or log output. Logs are written under the app's
user-data directory — `~/.config/OpenPCB/logs/` (Linux), `%APPDATA%\OpenPCB\logs\` (Windows), and
the OpenPCB folder under `~/Library/Logs/` (macOS).

A design file that reproduces the bug is worth more than a description of it.

## Security

Do not file security issues publicly. See [`SECURITY.md`](SECURITY.md).

Note that OpenPCB is a single-user desktop app whose security boundary is loopback: the backend
binds `127.0.0.1` and most endpoints are unauthenticated by design. A change that widens that
boundary — binding another interface, adding a remote backend, exposing a module route to a browser
extension — is a security-relevant change and must say so in the PR.

## License

OpenPCB is dual-licensed: **AGPL-3.0-or-later** for community use, with a commercial license
available separately. By contributing you agree that your contributions are licensed under
AGPL-3.0-or-later, and you grant OpenPCB the right to relicense them under the commercial license.
See [`LICENSE`](LICENSE); for commercial terms, contact `licensing@openpcb.app`.
