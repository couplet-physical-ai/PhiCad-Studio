# OpenPCB Desktop — CURRENT STATE

Last verified: **2026-07-12** (S1 docs reconciliation) · effort narratives: `HANDOFF.md` (compiler agent), `TODO.md` (all programs)

## Repo state

- **Branch:** `master` — **clean, fully pushed** (S0 sync 2026-07-12). HEAD `7d1311d`.
- The working tree that older notes called "dirty/uncommitted" was committed in **`31d4caf` "wip: pre-P1 baseline"** (assistant compiler, knowledge editor, autoroute sdk state), followed by 6 commits: `72725f0` cloud-proxy bearer [R0.4] · `d2fbe89` MentionRegistry [P2.0] · `b2b0048` pack metadata (P7) · `9d94a85` route tool P1 UX · `02758e8` DRC hardening P0–P11 · `7d1311d` route review fixes.
- **Unmerged local branch:** `integ/trace-drag` — 6 commits (~1.9k lines: trace segment drag editing, vertex handles, 555-blinker fab fixture + tests). Unpushed; kept pending integration. Do not delete.
- **Known CI red (S0 finding, out of repo scope until fixed):** master CI fails on (a) `@openpcb/contracts` v0.2.6 lacking `WalletBalance`/`CopilotUsageFrameData` — needs the `contracts-v0.3.0` cut + repin, and (b) stale `package-lock.json` SHA for `opclib-pack-v0.3.0` — needs a lockfile refresh now that the tag is on origin. See `docs/sessions/ROADMAP.md` backlog.

## Active program 1 — Route Tool Evolution + DRC hardening (top of `TODO.md`, active 2026-07-11)

- Route tool P1–P5 done; P5 Tune + P6 Bundle/diff-pairs **pending manual QA**; 2026-07-12 review-fix batch landed (`7d1311d`).
- DRC production-hardening program P0–P11 committed (`02758e8`).

## Active program 2 — Cloud Copilot → local compiler agent (see `HANDOFF.md`)

- **Committed** in `31d4caf`: P0 resolver category-scoring fix + P1 compiler pipeline (`src/modules/assistant/backend/compiler/{ir,units,blocks,expander,lowering,apply}.ts`) + 11 golden tests + LDR regression tests. `bun test` on both test files + `npm run typecheck` green at commit time.
- **Key decisions (locked):** compiler model (LLM→IR→expand+ERC) · local-first brain, cloud=tools+gateway · hybrid recipes (code primitives + data functional blocks) · IR internal, DesignerCommand batch on wire · param calc in expander · auto-apply non-destructive / gate destructive / ERC auto-correct ≤N · guardrails clarify-first + installed-only + schematic-only.
- **Blockers:** none. `apply.ts` validated only vs a fake DesignerSDK — needs a live 5-LED smoke.
- **Next:** P1.3 `compile_circuit(IR)` AiTool — scheduled as session **S3** (`docs/sessions/S3-openpcb-compiler-p13.md`).

## Cloud Teams / Sharing — desktop integration (historic; backlog)

Cloud side (cloud-api teams/grants/shares, cloud-dashboard UI, `@openpcb/cloud-client` + contracts sharing types) shipped and E2E-validated 2026-06-10. **Desktop integration P1.9–P1.11 (authority migration, cloud-authoritative dispatch, read-only/offline gating) remains NOT STARTED** and lives in the workspace backlog — full spec moved to `../docs/TODO-teams-sharing.md` (renamed from `docs/TODO.md` in S1). P2 realtime push + P3 co-editing follow it.
