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

- **P1 complete incl. P1.3 (S3, 2026-07-12).** Pipeline + `compile_circuit` AiTool committed (`31d4caf`); S3 proved the apply path against a REAL backend: live E2E `src/core/backend/tests/assistant-compiler-live.test.ts` (bootstrapped ModuleRuntime + pinned beta.2 CoreLibrary pack — role resolution, expand→lower→apply, nets, ERC, undo, stale-revision, tool execute) + scripted 5-LED smoke on the dev DB ("S3 Smoke — 5 LED indicators (v2)": 10 parts, 15 wires, 10 ports, VCC/GND 5 pins each, ERC clean, UI-undoable).
- **S3 live-path fixes:** `lowering.ts` per-block column layout (one-row grid shorted every LED: straight R→A route through LED.K = pin-on-wire junction); `apply.ts` history session → `designer-ui-session` (compiled circuits were invisible to UI undo); `library-tools.ts` exact-name scoring per candidate query (plain "led" resolved to "IR LED 5 mm" on richer libraries). "Single undoable batch" claim removed — `groupId` is capture-only; batch-undo grouping is backlog.
- **Key decisions (locked):** compiler model (LLM→IR→expand+ERC) · local-first brain, cloud=tools+gateway · hybrid recipes (code primitives + data functional blocks) · IR internal, DesignerCommand batch on wire · param calc in expander · auto-apply non-destructive / gate destructive / ERC auto-correct ≤N · guardrails clarify-first + installed-only + schematic-only.
- **LLM smoke done too (2026-07-12, OpenCode Zen / `deepseek-v4-flash-free`):** happy path + edge cases green; found+fixed (a) additive-recompile grid stacking → `compile_circuit` offsets below existing parts, (b) silent circuit shrink → lowering/tool warn on 1-pin nets + floating block ports and flag `partial`. Full record: `docs/sessions/ROADMAP.md` S3 outcome.
- **Blockers:** none.
- **Next:** more primitive blocks (decoupling, pull-up/down, RC), then P2 data recipes.

## Cloud Teams / Sharing — desktop integration (historic; backlog)

Cloud side (cloud-api teams/grants/shares, cloud-dashboard UI, `@openpcb/cloud-client` + contracts sharing types) shipped and E2E-validated 2026-06-10. **Desktop integration P1.9–P1.11 (authority migration, cloud-authoritative dispatch, read-only/offline gating) remains NOT STARTED** and lives in the workspace backlog — full spec moved to `../docs/TODO-teams-sharing.md` (renamed from `docs/TODO.md` in S1). P2 realtime push + P3 co-editing follow it.
