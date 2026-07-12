# DRC Production-Hardening Program

Status: **9 of 13 milestones shipped** (P0, P1, P2, P3, P5, P6, P8, P10, P11). Derived from `DRC_AUDIT_REPORT.md` (40 confirmed bugs). Approved 2026-07-12.

## Delivered (all gates green: `bun test` 1067 tests / 1 pre-existing library-baseline fail, `tsc -b` clean, frontend Vitest 253/253)

- **21 of 40 audit bugs fixed** (regression tests flipped live): B1-1/2/3/4/5/6, B2-1/2/3/4/8, B3-2/7/8, B4-3/4/5, B5-VIA-MASK/PAD-LAYER/6LAYER/WAIVER-DRIFT. 19 remain as `test.todo` (owned by P4/P7/P9).
- **Core correctness**: every dead-short / connectivity / layer-model bug closed; unified epsilon policy; live net-class resolution; violation-id v2 (layer + location bucket); KiCad-aligned severities + per-code override; non-waivable shorts.
- **Full multilayer 2–32**: `sdks/designer/stackup.ts`; import/store no longer coerce 6→2/4; cloud snapshot contract pinned to 2/4.
- **Scoped priority rule engine** (`shared/drc/rule-resolver.ts`): first-match, can-relax, board-minimum floor, area/BGA-fanout relaxation; byte-identical when no rules.
- **Fab profiles** refreshed to live JLCPCB 2026-07 (via/PTH annular split, per-hole fab checks).
- **New professional checks** (+~90 tests): DFM free-wins (outline validity, hole-to-board-edge slot-aware, dangling track/via, net-class enforcement, zone-pour); electrical (IPC-2221 creepage, IPC-2221/2152 current-vs-width); SI diff-pair (gap/skew/uncoupled + name/explicit pairing).

## Remaining (large infra + UI — recommended as focused follow-up sessions)

- **P4** [I] Backend spatial index (rbush) — the O(n²) loops are correct + fast enough for current board sizes; this is a perf refactor gated by byte-identity + an exhaustive-mode oracle. Owns B4-1/2/6/7.
- **P7** [I] Async DRC (tasks executor) + engine → `src/shared/drc/` + live/batch parity — high-blast-radius. Owns B5-LIVE-ROT-PAD/TH-PAD-SIDE/PADGEOMS, B5-SYNC, B2-9.
- **P9** [C] DFM overlay checks (courtyard, silk-over-pad, mask sliver/bridge, copper sliver, acute angle) — needs a `drc-context-overlays.ts` extraction module (courtyard assembly, silk stroking, mask apertures). Owns B2-5/6/7, B3-3/4/5/6/9/10.
- **P12** [I] Rules & severity UI (`PcbRulesTableEditor`, severity grid, waiver-comment flow, customFabProfile editor) — the backend contracts (`drcRules`, `drcSeverityOverrides`, `customFabProfile`, `diffPairs`) are all persisted and ready to bind.


## Independent review (Codex CLI, xhigh — o-series + gpt-5.6-sol) and follow-up fixes

Two independent read-only reviews were run and their findings verified in code, then fixed (all gates re-green: bun test 1083 / 1 pre-existing library-baseline fail, tsc -b clean, frontend 253/253; +40 new regression assertions across `drc-review-fixes.test.ts` + persistence round-trips).

**Fixed (blockers + high/medium correctness, safety, determinism):**
- Persistence dropped new DRC fields — `parseDesignRules`/`parseNetClass` now round-trip `minimums.clearanceMm`, `clearance.holeToBoardEdgeMm`, `designRules.electrical`, netclass `voltageV`/`currentA` (was making P5 floor / P10 electrical inert after save).
- 2–32 layers not honored at API/store/import — `routes.ts`, `pcb-store.ts` (`isCopperLayer`/`parseTrace`/`parseVia`), and kicad `insert-pcb.ts` now accept any valid copper layer via the stackup helper (In3+ traces/vias no longer rejected/dropped/coerced).
- Invalid-layer PAD now clamp-checks all valid layers (symmetric with vias) — an off-stack pad can no longer mask a B.Cu short.
- Non-waivable safety codes (shorts, layer-invalid) now survive a class-level ignore AND a per-code `"ignore"` override.
- Scoped-rule persistence hardened — malformed scopes/constraints (e.g. an area with <3 points) drop the rule instead of crashing `pointInPolygon`; repeated same-kind scopes union; area rules beyond the 32-cap drop instead of becoming global.
- Slot-aware HOLE_TO_HOLE (segment-to-segment, not center distance).
- Creepage rewritten as a unified pairwise pass — seeds from HV pads/vias too, uses `|ΔV|` (handles negative voltage), per-pair-kind base clearance, and no HV↔HV double-emit.
- SI coupling angle-wrap fixed (anti-parallel / +179°/−179° no longer misclassified); diff-pair auto order deterministically sorted; duplicate explicit pairs deduped; negative thresholds clamped.
- Dangling connectivity now requires SAME-NET copper (a different-net touch is a short, not a connection).
- Via TYPE topology enforced at DRC (`isValidViaSpan`): blind-spanning-both-outers, reversed spans, non-adjacent microvias flag VIA_LAYER_SPAN.
- Cloud snapshot builder strips `voltageV`/`currentA` (not just `diffPairGapMm`); via-via rules resolve on the shared layer; netclass intent-gate uses a real name-pattern predicate.

**Deferred with documentation (honest known limitations, not silent):**
- Scalar SCOPED constraints (`trackWidth`/`viaDiameter`/`viaDrill`/`annularRing`/`holeToHole`/`edgeClearance` rules) are persisted + validated but NOT yet enforced — v1 rule enforcement is clearance-only. (Enforcing them means wiring the resolver into manufacturability/board checks — a P6 follow-up.)
- Area-scope relaxation tests each item's representative midpoint, not the exact closest-approach point — conservative but can over-relax a long trace whose offending point lies outside the area.
- Scoped-rule optional `severity` is not yet applied (clearance emits its default severity); v1→v2 waiver auto-migration is not wired (v2 is documented breaking); cutout-overlap uses vertex containment (perpendicular crossing rects missed). All tracked for P12/follow-up.

Decisions (binding): full scope (core + DFM + electrical + SI); **scoped priority rules** (first-match, can relax, board-minimum floor); **full multilayer 2–32**; **breaking changes allowed with migration** (violation-id v2, KiCad-aligned severities, live netclass resolution).

## Cross-cutting architecture

1. **New shared modules**: `src/sdks/designer/stackup.ts` (kills hardcoded STACKUP_ORDER everywhere); `src/shared/drc/rule-resolver.ts` + `rule-synthesis.ts`; `src/modules/designer/backend/pcb/tolerance.ts` (`below`/`exceeds`, DRC_EPS_MM=1e-6, SHORT_EPS_MM=1e-4 — one policy, grace everywhere); `src/shared/rendering/pad-copper-layers.ts` (THE side-flip helper, lifted from copper-fill-geometry.ts:59-82; fixes B1-1/B1-6, shared with DRC context, board-snapshot, overlay extraction); `src/shared/pcb-geometry/spatial-index.ts` (generic rbush wrapper; rbush → root package.json).
2. **Engine stays pure**; later moves to `src/shared/drc/` behind re-export shims so live-DRC/worker consume the identical engine (only net-class-resolver + fab-presets block the move; both pure, both move).
3. **Rule model**: `PcbDrcRule { id, name, enabled, priority, scopes[] (net|netClass|layer|area|pairKind, AND), constraint (clearance|trackWidth|viaDiameter|viaDrill|annularRing|holeToHole|edgeClearance), severity?, comment? }` on `PcbBoardSettings.drcRules`. Resolution: explicit tier priority-desc first-match (CAN relax; area = BOTH items inside) → implicit tier `max(boardRule, classA, classB)` (byte-identical today) → absolute floor `minimums.clearanceMm` (new, 0.1 new boards / 0 absent). Scalars tighten-only. Area bitmask per item (≤32 rules); memoized (pairKind, layer, netA, netB). Persist via extended `pcb_set_design_rules`.
4. **Netclass live resolution**: delete stored-netClassId short-circuit (drc-context.ts:319-323); `netClassId` out of DrcTrace/DrcViaGeom; `ctx.netClassIdOf(netId)`. Fixes B3-2/B1-2.
5. **Stackup 2–32**: `PcbLayerCount` explicit even union; `PcbCopperLayerId` 32-literal union; helpers `copperLayersForCount/copperLayerIndex/isCopperLayerId/parsePcbLayerCount (kill 6→2 & 6→4 coercions)/viaSpanLayers/isValidViaSpan/viaSpanDepthFraction`. Consumers: drc-context, command-executor resolveViaSpan (through=F↔B, blind=one outer, buried=no outer, micro=one adjacent step), routes parsers, pcb-store, kicad commit+insert-pcb, gerber writer (Ln,Inr), board-snapshot, route-layer presets, layer panels/scene (dynamic + hue ramp), copper-fill.
6. **Layer-model fixes**: shared side-flip (B1-1); `PAD_LAYER_MISMATCH` (B5-PAD-LAYER); layer-invalid items clamp-with-fallback = checked on ALL valid layers + `VIA_LAYER_SPAN`/`PAD_LAYER_MISMATCH`/`NET_SHORT_CIRCUIT` non-waivable (`waivable?: false`) (B5-VIA-MASK); VIA_TO_VIA reports first shared layer (B1-5).
7. **Violation-id v2**: `${code}-v2-${fnv1a64("v2|code#sortedAnchors#L:layer#Q:qx,qy")}`; 0.1mm location bucket only for pair/short/fab/hole codes (NOT unconnected/island); layer whenever set (B3-7); measuredMm never hashed. Engine split `computeDrcViolationDrafts` + `finalizeDrcReport`. One-shot v1→v2 waiver remap via new `store.patchPcbViewState` (no revision bump). `viewState.drcWaivers: {id, comment?, waivedAt}[]`.
8. **Severity**: exhaustive `DEFAULT_SEVERITY_BY_CODE` (drc/severity.ts); COPPER_TO_BOARD_EDGE + UNCONNECTED_NET → error. `DrcSeverityOverrides` on **board settings** (not viewState). Precedence: override → rule severity → default; NET_SHORT_CIRCUIT override ignored; `ignoredRuleClasses` kept.
9. **Spatial index (backend)**: rbush static trees (trace/pad/via/hole/edge-segment) in context; ceiling includes SHORT_EPS (B1-4); query + index-sorted candidates preserve (i asc, j asc) emit order ⇒ byte-identical reports (gate); `broadPhase: 'rtree'|'exhaustive'` = permanent oracle; `pointInFlattenedOutline` on precomputed rings (B4-7); `scripts/drc-bench.ts`, kernel-count assertions.
10. **Async DRC**: `'designer.drc'` TaskRuntime executor (scopeId `drc:<designId>`), slice-yield every 256 items + between groups (B5-SYNC), SSE progress, AbortSignal cancel; route ≤2000 primitives sync else 202 {taskId}; `run-helper.ts` dedupes 4 call sites; frontend progress/cancel; worker deferred.
11. **Live/batch convergence**: engine→shared + item builders (`buildDrcTrace/PadsForPlacement/FreePad/Via`) + `clearance-kernels.ts` (+`classifyGap` short|clearance|fab); live-drc rewrite: rotated pad rings (B5-LIVE-ROT-PAD), TH all layers (B5-LIVE-TH-PAD-SIDE), session vias, neighbor netclass, short tier, same numbers; commit-gate uses index. Parity: |measured_live−measured_batch| ≤ 1e-9.
12. **Fab profiles**: `src/shared/pcb/fab-profiles.ts` (typed + zod); {via: {minDiameterMm 0.25, minAnnularPerSideMm 0.05, rec 0.075}, pth: {annular 0.18 2L / 0.15 ML}, holeToHole: {viaVia 0.2, pthPth 0.45}, boardEdge: {routed 0.2, vcut 0.4}, maskDamMm 0.10, trace/space 0.10 2L / 0.09 ML, drill 0.15} = JLCPCB live 2026-07 (audit §7). Fixes B2-1/2/3/4/8. `DrcHole.kind: via|pth|npth`; `customFabProfile` on board settings. PCBWay re-fetch at impl.
13. **New checks** (3 new classes `dfm`/`electrical`/`signal-integrity`; new anchors zone/overlayShape/overlayText/diffPair with anchorKey + label cases; shared prereq `drc-context-overlays.ts` — world-transformed graphics, courtyard loop-chaining w/ bbox+0.25mm fallback, silk strokes at gerber parity (writer.ts:720-767), mask apertures at gerber parity (writer.ts:573-618)):
    - **DFM**: COURTYARD_OVERLAP(err)/MISSING(info)/MALFORMED(err); SILK_OVER_PAD/SILK_OVERLAP(warn)/SILK_TO_BOARD_EDGE(info; `designRules.silkscreen {silkToMaskClearanceMm:0, silkToBoardEdgeMm:0.15}`); SOLDER_MASK_BRIDGE(err)/SLIVER(warn) vs `maskDamMm`; COPPER_SLIVER/CONNECTION_WIDTH_MIN(warn; Clipper opening on `ctx.pourPaths` memo; pours only v1, hatched exempt; sliverWidthMm 0.1); TRACK_ANGLE_ACUTE(warn; <90°, baked); HOLE_TO_BOARD_EDGE (`clearance.holeToBoardEdgeMm` 0.3; slot-aware `DrcHole.slot` = B2-5 template); BOARD_OUTLINE_INVALID resurrected (checks/outline.ts first: area/self-intersection/arc/cutouts); zone-pour extension of ISOLATED_COPPER_ISLAND (B3-8, anchor on zone); TRACK_DANGLING/VIA_DANGLING(warn; own layer-AWARE union — NOT ratsnest; free pads included).
    - **Electrical**: CREEPAGE_DISTANCE(err; `PcbNetClass.voltageV?`; `drc/ipc2221-spacing.ts` Table 6-1 B1/B2 from audit §8 sources AT IMPL TIME; HV-subset pairwise; no-voltage=0V); TRACE_CURRENT_WIDTH(warn; `currentA?`, `designRules.electrical {tempRiseC:10, copperWeightOz:1}`; IPC-2221 k=0.048/0.024,b=0.44,c=0.725 per eda-standards skill); NETCLASS_TRACE_WIDTH/VIA_DIAMETER/VIA_DRILL(warn; fields exist, fresh resolution).
    - **SI**: length matching **already shipped in-flight** as `checks/length.ts` (`NET_LENGTH_OUT_OF_RANGE`, `PcbBoardSettings.lengthMatchGroups`, `pcb.lengthTuning` flag) — adopt as-is; remaining: `pcb/diff-pair-resolver.ts` (name convention _P/_N, +/- + explicit `PcbBoardSettings.diffPairs` table wins), DIFF_PAIR_GAP(err; near-parallel <15°, coupled-span gap vs target±tol), DIFF_PAIR_UNCOUPLED_LENGTH(warn, 15mm), DIFF_PAIR_SKEW(warn, 0.5mm; `ctx.netRoutedLengthMm` — reconcile with checks/length.ts lengthByNet). Rejects TODO-signal-aware-routing signalType/LLM inference.

## Milestones (each shippable; gate = bun test green + `npx tsc -b`)

Tracks: [E]ngine, [C]hecks, [I]nfra. Branch `feat/drc-p<N>-<slug>`. Never auto-commit.

| # | Milestone | Track | Depends |
|---|---|---|---|
| P0 | QA groundwork: determinism test, eps matrix (encodes CURRENT regimes), harness fixture v2, 40 audit regression fixtures (test.todo where pending), golden-small + update script | I | — |
| P1 | Epsilon unification (`pcb/tolerance.ts`; clearance/fab/manufacturability/creation gates; flips eps matrix consciously) | E | P0 |
| P2 | Live netclass + stackup 2–32 + layer-model fixes | E | P1; route-tool branch landed |
| P3 | Violation-id v2 + waivers/comments + severity model | E | P2 |
| P4 | Backend spatial index + exhaustive oracle + fuzz + bench + golden-mid | I | P2 (∥ P3) |
| P5 | Free-win checks: netclass enforcement, hole-to-edge (slot-aware), outline validity, zone-pour, dangling | C | P1 (∥ P3/P4) |
| P6 | Scoped rule engine (byte-equality gate rules-absent) | E | P3 |
| P7 | Async DRC + engine→shared + live/batch parity | I | P4 (P6 for live rules) |
| P8 | Fab profiles (JLC 2026-07, via/PTH split, customFabProfile) | I | P0 (∥ from P1) |
| P9 | DFM overlay checks (overlays context, courtyard, silk, mask, copper-shape, angle) | C | P2 (P8 for maskDam) |
| P10 | Electrical checks (ipc2221-spacing, creepage, current-width) | C | P2 (∥ P9) |
| P11 | SI remainder: diff-pair checks (length matching already shipped in-flight) | C | P5, P10; reconcile w/ bundle-tool diff-pair work |
| P12 | Rules & severity UI (PcbRulesTableEditor, severity grid, progress/cancel polish) | I | P3, P6, P7 |

## Verification

Per milestone: `npm run test:backend` + `npx tsc -b` (+ affected Vitest). P4: rtree ≡ exhaustive byte-equality (fuzz + goldens), kernel-count budget, 10k < 300ms bench. P6: rules-absent byte-equality vs P3 snapshot. P7: live/batch parity ≤ 1e-9; cancel leaves no partial persistence. Program end: all 40 audit regressions live (zero test.todo), golden boards match, 6-layer board routes+checks end-to-end.

## Coordination

- In-flight route-tool/length-tuning stream owns: `command-executor.ts`, `route-layer.ts`, `checks/length.ts`, `lengthMatchGroups`, dialog match-groups editor, bundle/diff-pair tooling. Land/rebase before P2; P11 adopts its naming.
- Sub-plan details (per-file change tables, algorithms, fixtures per check) recorded in the planning session; each milestone PR carries its slice.
