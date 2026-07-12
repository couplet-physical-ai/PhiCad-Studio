# Handoff — Cloud Copilot → local compiler agent

Session · 2026-07-08 · branch `master` (OpenPCB repo) · **Updated 2026-07-12 (S1):** all work below is now COMMITTED in `31d4caf` "wip: pre-P1 baseline" and pushed; tree is clean.

> This handoff covers ONE effort: reworking the AI copilot from a whole-design-sync
> cloud agent into a **local-first compiler agent**. It is separate from the other
> efforts tracked in this repo's `TODO.md` / `CURRENT_STATE.md` (Release 1.0, Cloud
> Teams, etc.) — my sections in those files are clearly marked and prepended; I
> touched nothing else in them.

## Goal

Make the copilot **work directly against the live local design with no full cloud sync**,
add only genuinely cloud-only tools (datasheets/research/search), and **structurally**
kill the two failure modes a real run exposed (a "5-LED blinker" build picked "LDR
Photoresistor" for plain resistors, and placed parts but never wired them).

## Original plan + all decisions

**`~/.claude/plans/act-as-expert-on-snug-nest.md`** is the source of truth — read it first.
It has the full current-state analysis, the brainstorm, every locked decision, and an
Implementation log. Headline decisions (all locked with the user):

- **Compiler model**: LLM → declarative circuit-spec IR → deterministic expander → ERC.
  IR stays TS-internal; only the expanded `DesignerCommand` batch crosses any boundary.
- **Local-first brain**: keep the desktop `@openpcb/ai-core` loop; cloud = model gateway
  + stateless tools (NOT a cloud orchestrator). Reversible.
- **Hybrid recipes**: primitive blocks in code (stable, on-device); functional/reference
  blocks as cloud-fetched DATA recipes later. Param calc lives in the expander, not the LLM.
- **Apply UX**: auto-apply non-destructive once ERC-clean; gate destructive. **ERC fail**:
  auto self-correct ≤N. **Guardrails**: clarify-first, installed-parts-only, schematic-only.
- **First block library**: digital logic + timer + LED.

## Done so far (and why)

All green: `bun test` on the two test files + `npm run typecheck` (tsc -b) clean.

- **P0 resolver fix** (`src/modules/assistant/backend/tools/library-tools.ts`): tag-based
  category scoring — resistor/capacitor families boost `passive` (+2), penalize
  `sensor`/`photoresistor` (−4); deterministic tie-break (score → builtin → name) replaces
  the alphabetical one that let "LDR" beat "Resistor". Regression tests in
  `src/core/backend/tests/assistant-library-tools.test.ts`. **Why tags not a new column:**
  the library has no category column (`schema.ts:110` = tagsJson only; `cloud-pack-builder.ts:283`
  derives `category: tags[0]`), so the signal is already in tags.
- **P1 compiler pipeline** (new `src/modules/assistant/backend/compiler/`): `ir.ts` (CircuitIr +
  ResolvedNetlist), `units.ts` (deterministic EE math — ceilE12/formatOhms), `blocks.ts`
  (primitive registry + `led_indicator`: LED+series-R sized by Ohm's law; pins from real
  symbols R:1/2, LED:1=K/2=A), `expander.ts` (pure `CircuitIr → ResolvedNetlist`),
  `lowering.ts` (`ResolvedNetlist → CompiledPlan`), `apply.ts` (`applyCompiledPlan`: live
  place → apply-time pin resolution → wire + power ports, revision-threaded, one undo group).
  Golden tests in `src/core/backend/tests/assistant-compiler.test.ts` (11 tests).

## Dead-ends already ruled out (do not repeat)

- **"Provisional post-placement index"** for atomic place+wire (the plan's original P0
  technique) is **infeasible**: `place_part` (`src/sdks/designer/types.ts:1069`) assigns the
  reference + pin ids itself; `create_wire` needs concrete pin ids. Correct approach =
  apply-time deferred resolution (done in `apply.ts`).
- **Word-boundary token matching** in the resolver — breaks `555`⊂`NE555` recall; the
  category boost/penalty is the decisive fix (LDR's *description* literally contains "resistor").
- **Surfacing a `category`/`type` column** — unnecessary (category == tags[0]).
- **ReAct loop-termination patch** — low value: the correction harness (`run-service.ts:589`)
  already re-drives wiring for auto-applied placements; the residual two-phase gap is
  dissolved by the compiler's atomic batch. Don't polish the path we're replacing.

## How to resume

1. Run the `handoff` skill with "resume".
2. Re-read `~/.claude/plans/act-as-expert-on-snug-nest.md` (esp. the Implementation log at top).
3. `cd /Users/andrejvysny/workspace/openpcb/OpenPCB` and verify green:
   - `bun test src/core/backend/tests/assistant-compiler.test.ts src/core/backend/tests/assistant-library-tools.test.ts`
   - `npm run typecheck`
4. **Next task: P1.3 — the `compile_circuit(IR)` AiTool** (the integration capstone). It ties
   the pipeline to the agent loop: Ajv-validate IR → resolve block roles→componentIds via the
   LibrarySDK resolver → `expandCircuit → lowerNetlist → applyCompiledPlan` → run ERC over the
   composed result + report violations → return a model-friendly result; register in
   `openpcb-tool-registry.ts` with clarify-first/installed-only/schematic-only guards.
   - Pattern to copy: `library-tools.ts` `makeLibrarySearchComponentsTool` (AiTool shape +
     how it pulls the SDK from ctx), `designer-tools.ts` `finalizeAndMaybeApply` (write-tool
     proposal + auto-apply gate), `openpcb-tool-registry.ts` (registration).
   - Role resolution: block roles are "resistor"/"led" → search the library, take top hit
     (now correct after the P0 fix). Reuse `searchAndRankComponents` or `library.searchComponents`.
5. After P1.3: live **5-LED smoke** end-to-end (MEMORY: OpenCode/DeepSeek, low token budget) —
   `apply.ts` is only tested against a *fake* DesignerSDK so far; the smoke validates real-
   designer command fidelity.

## Open questions

- None blocking. Deferred: recipe governance/publish flow (P2), greenfield-vs-edit ratio
  (instrument before over-investing reconciliation, P3).

## Pointers

- Tasks → `TODO.md` (compiler section is second; route-tool program is now on top). State → `CURRENT_STATE.md`.
  Full context/decisions → `~/.claude/plans/act-as-expert-on-snug-nest.md`.
- The old "many OTHER uncommitted files" caution no longer applies — everything was
  committed in `31d4caf` (2026-07-10) and the tree is clean/pushed. P1.3 is scheduled
  as session S3 (`docs/sessions/S3-openpcb-compiler-p13.md`).
