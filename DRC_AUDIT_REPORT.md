# DRC Implementation Audit — OpenPCB

## 0. Verdict

**Not production-ready — internal-beta quality.** The DRC foundation is genuinely strong: a pure, empirically byte-identical-deterministic engine (§3.3), correct edge-to-edge geometry on every clearance pair (§2), KiCad-aligned max-of clearance resolution, disciplined epsilon handling on minimum checks, and 81/81 green tests including two dedicated correctness regression suites. But this audit confirmed **40 of 40 candidate bugs** through adversarial verification (each re-checked against source and, where expressible, reproduced through the real `runDrc`), including **three false-negative dead-short/connectivity paths** — the one failure class a DRC must never have: an SMD pad with an authored `layer` on a flipped placement is checked on the wrong side, silently missing a B.Cu short (§4 B1-1); a layer-invalid via escapes every clearance and short check, leaving only a waivable error behind (§4 B5-VIA-MASK); and a fully unrouted net named `GND` produces no violation at all on a default board (§4 B3-1). The single biggest risk is the **layer model**: pad/via layer-classification bugs disable short detection silently, and the connectivity graph is layer-blind in three places. Phase-6-style constraint work can build on the engine's architecture (pure function, context precompute, violation-id/waiver contract), but the layer model, net-class staleness asymmetry (B3-2), and fab presets (stale + internally inconsistent vs live JLCPCB values) need a hardening pass first.

---

## 1. Scope & method

- **Audit target:** working tree on `master` at `b2b0048` + then-uncommitted DRC changes (`checks/connectivity.ts` doc-comment; `pcb/ratsnest.ts` same-layer T-junction union, `TOUCH_EPS_MM = 0.001`; `net-pad-correlation.ts`; `pcb-projection.ts`; `pad-geometry.ts`), 2026-07-11. **Provenance note:** development continued in parallel during the audit — that exact audited state was committed mid-audit as **`9d94a85`** ("route tool P1 UX"); `src/modules/designer/backend/drc/` has zero diff vs `9d94a85`, so all backend-DRC `file:line` citations resolve against that commit. Post-audit uncommitted edits exist in `frontend/pcb/drc/live-drc.ts` (cited lines re-verified, still accurate), `backend/routes.ts` (DRC run handler drifted to `:2570` — cite by the `POST /designs/:designId/drc/run` anchor, not line number), `command-executor.ts`, `sdks/designer/types.ts`, plus new untracked `frontend/pcb/spatial-index.ts` / `tools/route-layer.ts` — the latter suggest scaling work (§3.4) is already in flight; they are not covered by this audit.
- **Real DRC location (confirmed by reading code, not docs):** backend engine `src/modules/designer/backend/drc/` — `drc-engine.ts` (`runDrc`, pure function, 7 check groups in fixed order at `drc-engine.ts:31-39`), `drc-context.ts` (mm-domain precompute), `violation-id.ts`, `types.ts`, `checks/{constraints,structural,manufacturability,clearance,connectivity,copper-pour,board}.ts`; persistence `src/modules/designer/backend/drc-results.ts`; HTTP route `POST /designs/:designId/drc/run` at `src/modules/designer/backend/routes.ts:2474` (handler body now at `:2538-2552` in the working tree); frontend surfaces under `src/modules/designer/frontend/pcb/drc/` (`live-drc.ts`, `drc-store.ts`, `drc-labels.ts`, `drc-colors.ts`) plus `layers/DrcMarkerLayer.tsx` and `components/DesignerDrcView.tsx`. `OPENPCB_STATE.md:392` names `drc/checks/*` (correct) and `pcb/layers/*` (misleading — frontend DRC logic lives in `pcb/drc/`, not `pcb/layers/`).
- **Method:** 5 web-research passes (KiCad 9.0 docs + 9.0 source, Altium documentation, IPC-2221/2152 and IPC-6012 via corroborated secondary sources, live JLCPCB capabilities page), 5 per-check audit passes with mandatory verbatim source quotes, 2 empirical probe runs against the real engine (determinism, epsilon boundaries — Appendix A), and 2 adversarial verification passes that re-opened every cited line and attempted to refute every candidate bug (10/10 random spot-checks of audit-table rows passed verbatim).
- **Baseline test health:** `bun test` on the five DRC-related files (`drc-engine`, `drc-p0-fixes`, `drc-p1-fixes`, `designer-pcb-ratsnest`, `route-interactions`) = **81 pass / 0 fail** (bun 1.3.6, 183 ms).
- **Zero code edits:** this report is the only file added; the repo was otherwise untouched (probe scripts ran from scratch directories outside the repo).
- **Two prompt corrections:** (1) the JLCPCB capability table in `PCB_ROUTING_RESEARCH.md` is **§7** (`docs/References/PCB_ROUTING_RESEARCH.md:217`), not §12 — §12 is the source list; §11 (`:346-368`) is the 16-item taxonomy. (2) The designer's own "Phase 6" (`TODO.md:106`) is cross-platform smoke & launch; the *constraint* Phase 6 lives in cloud-auto-layout (`cloud-workspace/cloud-auto-layout/CURRENT_STATE_V2.md:129`). The designer-side DRC roadmap is TODO Phase 4 (`TODO.md:517`) plus DRC-trust item 1.7 (`TODO.md:59`). This audit's conclusions hold for both readings: either consumer builds on the same engine.

---

## 2. Check-by-check table

21 rule codes are actually emitted (grep-verified emit sites); 1 declared code is dead. Severity/threshold/eps columns verified in source; standard verdicts cite KiCad 9.0 (docs + `drc_item.cpp` on the 9.0 branch), Altium documentation, IPC secondary sources, or live JLCPCB values (§8).

| Code | Impl | Status | Evidence / notes |
|---|---|---|---|
| TRACE_TO_TRACE_CLEARANCE | `checks/clearance.ts:132` (emit :138) | **Correct** (edge-to-edge: `closest.distance − (a.halfWidthMm + b.halfWidthMm)`; same-layer, diff-net only) | Matches KiCad clearance semantics incl. max-of resolution ("if two clearance values are in conflict, the larger clearance value will be used" — docs.kicad.org/9.0). Eps: bare `<` (no grace — §3.1). Tests: drc-engine.test.ts:172/191 |
| TRACE_TO_PAD_CLEARANCE | `checks/clearance.ts:165` | **Correct w/ caveat** (polyline→pad-ring minus half-width; pad ring = circumscribed polygon, deliberate conservatism `pad-outline.ts:43-47`) | Layer gate `pad.layers.includes(t.layer)` is where bug B1-1 bites. Tests: drc-engine.test.ts:298-337, :764 |
| TRACE_TO_VIA_CLEARANCE | `checks/clearance.ts:193` | **Correct** (point→polyline minus halfwidth+radius; via span layer gate) | Layer-invalid via escapes (B5-VIA-MASK). Tests: drc-engine.test.ts:340-370 |
| VIA_TO_VIA_CLEARANCE | `checks/clearance.ts:225` | **Correct** (center distance − radii; `layersOverlap`) | Reported `layer` = via A's topmost layer, possibly not shared (B1-5, metadata only). Tests: drc-engine.test.ts:599-620 |
| PAD_TO_PAD_CLEARANCE | `checks/clearance.ts:265` | **Correct** (polygon-to-polygon; same-footprint pairs skipped) | Intra-footprint exemption matches Altium's documented toggle; KiCad has no such exemption (partial match). Tests: drc-engine.test.ts:621-656 |
| PAD_TO_VIA_CLEARANCE | `checks/clearance.ts:294` | **Correct** (exact circle-to-polygon; reuses `traceToViaMm` floor — no dedicated rule) | Tests: drc-p0-fixes.test.ts:195-236 |
| NET_SHORT_CIRCUIT | `checks/clearance.ts:73-88` | **Correct as designed** (`differentKnownNet && gap ≤ 1e-4`, fires independent of configured clearance; ruleClass `connectivity`, so ignoring `clearance` class does not drop shorts) | KiCad separates `shorting_items` from `clearance` similarly. Null-net overlap is NOT a short (only clearance) — differs from KiCad, which checks unconnected copper. AABB prefilter can starve the short tier in a zero-rule config (B1-4, low). Empirical tier ladder: Appendix A P-B1–B4. Tests: drc-engine.test.ts:247-265; drc-p0-fixes.test.ts:146-166 |
| FAB_CLEARANCE | `checks/clearance.ts:101` | **Correct concept, zero tests** (warning band between rule and fab minimum) | KiCad has no separate fab tier (its board minimums ARE the fab values); this design is defensible. **No test exercises it.** |
| TRACE_WIDTH_MIN | `checks/manufacturability.ts:19` (emit :21) | **Correct** (`below()` w/ 1e-6 eps; stored width vs `minimums.traceWidthMm`) | Default 0.2 mm above every current JLCPCB floor (0.10 2L / 0.09 ML). Tests: drc-engine.test.ts:372-390 |
| VIA_DIAMETER_MIN | `checks/manufacturability.ts:52-54` | **Correct, negative-only tests** | No test ever triggers it (only `.not.toContain`, drc-engine.test.ts:397) |
| VIA_DRILL_MIN | `checks/manufacturability.ts:64-66` | **Correct, negative-only tests** | Same gap (drc-engine.test.ts:398, :712) |
| ANNULAR_RING_MIN | `checks/manufacturability.ts:76-79` (via), `:153-156` (pad) | **Partial** — `(OD − drill)/2` center-symmetric NOMINAL model | IPC-6012 acceptance is worst-case remaining ring after drill wander, measured hole-wall→land edge (Class 2 allows 90° breakout, Class 3 requires ≥0.05 mm external / 0.025 mm internal — §8). A nominal design-side check is the industry-normal proxy (KiCad `annular_width` is also nominal), but it is only meaningful if the threshold embeds a registration allowance; the default 0.2 mm does, JLC-preset 0.15 does for vias but is the *component-hole* value (B2-4). `padOdMm = min(w,h)` is correct for circle/rect/oval, wrong (over-permissive) for `trapezoid`/`custom` bbox fallback (B2-6). Slot drills modeled as round holes → thin slot-end rings missed (B2-5). Tests: drc-engine.test.ts:391-399; drc-p0-fixes.test.ts:263-292 (exact-threshold float); drc-p1-fixes.test.ts:331-351 |
| DRILL_SIZE_MIN | `checks/manufacturability.ts:140-142` | **Correct** (`below()`; all holes: vias, TH pads, free std/NPTH, free holes) | Tests: drc-p1-fixes.test.ts:317-329 (incl. exact-min pass) |
| VIA_ASPECT_RATIO | `checks/manufacturability.ts:115-131` | **Buggy for blind vias** (linear span-fraction thickness model, through-via 10:1 limit applied to scaled depth; bare `>` no eps) | JLCPCB's ≤10:1 is board-thickness/drill for THROUGH holes; blind/laser-via convention is depth/drill ≈ ≤1:1, and JLC standard 2L/4L (the only presets) doesn't offer blind vias at all (B2-7). Tests: drc-engine.test.ts:703-713; drc-p1-fixes.test.ts:353-378 |
| FAB_TRACE_WIDTH | `manufacturability.ts:32-47` → `fab-presets.ts:130` | **Stale threshold** (2L 0.127 vs current JLC 0.10; 4L 0.0889 still current) | Bare `<` no eps (benign on direct compare). Tests: drc-engine.test.ts:408-451 |
| FAB_DRILL | `manufacturability.ts:89-98` → `fab-presets.ts:94` | **Stale + zero DRC-level tests** | Current JLC min drill 0.15 for 2L and ML; presets 0.3/0.2. Vias only — TH/free holes get no fab check (B2-8) |
| FAB_PAD | `manufacturability.ts:96` → `fab-presets.ts:102` | **Stale + internally inconsistent + zero DRC-level tests** | Current JLC min via diameter 0.25 (2L and ML); presets 0.6/0.45. jlcpcb_4l's own minimum-compliant via (0.45/0.2) always self-flags on annular (B2-2) |
| FAB_ANNULAR_RING | `manufacturability.ts:98` → `fab-presets.ts:110-111` | **Wrong semantics + FP false positive + zero DRC-level tests** | 0.15/side is JLC's ML PTH *component-hole* row; current via requirement is OD ≥ hole + 0.1 mm (0.05/side) → every 0.05–0.15 via over-warns incl. JLC's own published minimum (B2-4). Bare `<` on a derived float: `(0.7−0.4)/2 = 0.14999999999999997 < 0.15` → spurious warning reading "0.150 mm < min 0.150 mm" (B2-1, empirically reproduced) |
| UNCONNECTED_NET | `checks/connectivity.ts:16-40` (emit :28) | **Buggy via upstream graph** (trusts `projection.ratsnest`) | Graph false negatives: GND name-suppression (B3-1), layer-blind endpoint chaining (B3-3), layer-blind pad/via unions (B3-4), via-on-interior missed (B3-5); false positives + negatives from free pads absent (B3-6, = TODO 1.7). Severity `warning` vs KiCad `unconnected_items` default Error. Tests: drc-engine.test.ts:499-519; ratsnest suite |
| ISOLATED_COPPER_ISLAND | `checks/copper-pour.ts:17-64` (emit :53) | **Partial + zero tests through runDrc** | Only board-wide `viewState.copperFillLayers` pours; explicit zones rendered/exported but never checked (B3-8). `anchored` = intersects ANY same-net copper, incl. dead copper — message claims pad connectivity it doesn't verify (B3-10). Reports only largest island; `measuredMm` receives mm² (B3-9). Cross-layer violation-id collision (B3-7). KiCad analog `isolated_copper` (DFM group) |
| COPPER_TO_BOARD_EDGE | `checks/board.ts:64/98/128` (trace/via/pad) | **Correct geometry, wrong severity, stale default** (ring-edge distance minus halfwidth/radius, `below()` eps) | Hardcoded `warning`; KiCad `copper_edge_clearance` defaults Error. Default rule 0.5 mm vs current JLC routed ≥0.2 / V-cut ≥0.4 (conservative — fine). Cutout arc polygonization under-measures (B4-6, low). Tests: trace branch only (drc-engine.test.ts:657-682); **via/pad branches untested** |
| COPPER_OFF_BOARD | `checks/board.ts:81/112/148` | **Buggy** (sampling-based) | Trace: vertices+midpoints only → a segment crossing a narrow cutout between samples escapes the error and is demoted to a distance-0 edge warning (B4-1, empirically reproduced). Pad: vertex-only tests miss slot cutouts through pad interior and concave-notch spans (B4-2, empirically reproduced). No KiCad analog (KiCad has no off-board-copper type; nearest is `invalid_outline` + edge clearance). Tests: via (drc-engine.test.ts:684-689), pad (drc-p0-fixes.test.ts:238-260); **trace branch untested** |
| HOLE_TO_HOLE | `checks/board.ts:163-199` (emit :185) | **Partial** (drill edge-to-edge, `below()` eps, coincident same-net exception 1e-3) | Unconditional same-footprint skip at ANY distance → overlapping drills inside one footprint pass (B4-3, empirically reproduced). No AABB prefilter (O(H²) exact). Current JLC: via hole-to-hole 0.2, PTH hole-to-hole 0.45 — single 0.25 default can't express both. Tests: drc-engine.test.ts:691-701; drc-p1-fixes.test.ts:289-313 |
| BOARD_OUTLINE_INVALID | declared `src/sdks/designer/types.ts:1794`; label `drc-labels.ts:35` | **Dead code — emitted nowhere** (full-repo grep: 2 hits, both declarations) | No outline closure/self-intersection validation exists anywhere; degenerate outlines silently produce nonsense edge results (B4-5). KiCad ships `invalid_outline` ("Board has malformed outline") |
| TRACE_LAYER_MISMATCH | `checks/constraints.ts:9-13` | **Correct but traces-only** | KiCad analog `item_on_disabled_layer` covers ALL items; OpenPCB pads/vias with illegal layers are not flagged (B5-PAD-LAYER-UNCHECKED) — worse, they then evade clearance checks. Tests: drc-engine.test.ts:453-490 |
| VIA_LAYER_SPAN | `checks/constraints.ts:23-27` | **Correct check, dangerous interaction** (`vg.layers.length < 2`) | The flagged via is simultaneously invisible to all clearance/short loops, and this sole error is waivable (B5-VIA-MASK). KiCad analog `padstack`/`padstack_invalid`; KiCad keeps invalid items in the collision tree. Tests: drc-engine.test.ts:715-722 |
| PLACED_PART_MISSING_FOOTPRINT | `checks/structural.ts:9-13` | **Correct, OpenPCB-specific** | No KiCad analog (KiCad's `missing_footprint` is schematic-parity, different semantics); justified here because pads are required for net correlation. Tests: drc-engine.test.ts:492-497 |

**Net-class resolution (supporting, feeds clearance):** `pcb/net-class-resolver.ts:21-48` + `drc-context.ts:319-340` + `clearance.ts:125-129` — two-level precedence + tighten-only max-of; see §3.2. Only `clearanceMm` is DRC-enforced from net classes; per-class `traceWidthMm`/`viaDiameterMm`/`viaDrillMm` are creation-time hints, never DRC-checked — KiCad enforces netclass track width via `track_width`; Altium via the Width rule (gap).

---

## 3. Cross-cutting findings

### 3.1 Three (four) inconsistent epsilon regimes — empirically demonstrated

1. **`below(v, limit)` = `v < limit − 1e-6`** (`drc-context.ts:45-50`) — manufacturability minimums (`manufacturability.ts:19,52,64,77,140,154`) and board checks (`board.ts:183`). Exact-spec geometry passes; sub-1 nm float noise forgiven. Probe P-A3a/b: width deficit 5e-7 mm → no violation; deficit 2e-6 mm → fires (Appendix A).
2. **Bare `gap < required`** (`clearance.ts:89`; also FAB tier `:101`) — all clearance pairs. Exact-equality passes (probe P-A1) but a **1 nm deficit errors** (probe P-A2) — no grace, asymmetric with regime 1. Since trace coordinates are integer nanometers, the practical exposure is derived-float gaps (diagonal geometry, halfwidth subtraction); bug B1-3.
3. **`gap <= SHORT_EPS_MM` (1e-4, inclusive)** (`clearance.ts:26,73`) — short tier. Probe ladder P-B1–B4: gap 0 → short; exactly 1e-4 → short (inclusive); 1.5e-4 → clearance; overlap → short.
4. **Bare `<`/`>` with no eps in fab validators** (`fab-presets.ts:94,102,111,130`; aspect `manufacturability.ts:119`) — produces a real false positive on the derived annular float: `(0.7−0.4)/2 < 0.15` → true (B2-1, empirically reproduced through runDrc).

Also: creation-gate vs DRC contradiction — the route-tool via gate at `command-executor.ts:341-343` and DRC use different comparisons on identical geometry (B2-9).

### 3.2 Net-class precedence — worked example (verified conclusively)

Resolution chain in `resolveNetClassId` (`net-class-resolver.ts:33-48`): **explicit `perNetClassAssignments[netId]` (if the class still exists) → name regex (`GND_NAMES` → `POWER_NAMES` → `POWER_VOLTAGE`, all fully anchored) → first class in `board.netClasses` array** (`available[0]?.id ?? "default"`, `net-class-resolver.ts:30`).

Worked example — net `net7` named `GND_SENSE`, classes `[default, power, gnd, hispeed]`:
- With `perNetClassAssignments = { net7: "hispeed" }` → **`hispeed`** (explicit assignment wins; `net-class-resolver.ts:37-42`).
- Without assignment → `GND_SENSE` does **not** match `/^(GND|GROUND|AGND|DGND|EARTH|VSS|VEE)$/i` (anchored) → falls to **first class in array** = `default`. This fallback is array-order-fragile and untested.
- Net literally named `GND` → **`gnd`** via regex.

**The asymmetry (bug B3-2, high):** `drc-context.ts:319-323` short-circuits on a primitive's *stored* `netClassId` before ever consulting assignments — traces/vias pass stored ids (`clearance.ts:127-128,160,188,221-222,291`), pads resolve fresh (`clearance.ts:161,290`). Reassign net `n1` to class `wide` (2.0 mm) after routing: an existing trace (stored `default`, 0.25) at 0.4 mm gap passes; a pad on the same net at the same gap fires TRACE_TO_PAD_CLEARANCE. Same net, contradictory verdicts; class upgrades silently don't tighten routed copper. `drc-engine.test.ts:725-769` tests only the pad side.

**Model comparison:** OpenPCB = tighten-only `max(boardRule, classA, classB)` (`clearance.ts:125-129`). KiCad = same larger-wins for implicit values, board minimum as absolute floor, plus priority-ordered custom rules (last matching rule in file wins) that can *relax* above the floor. Altium = pure priority-ordered first-match — one rule wins, and a specific-scope rule **may be less strict** than the general rule (their own BGA-fanout guide relaxes clearance in a room). OpenPCB's tighten-only model cannot express the BGA-fanout relaxation at all — a functional gap for dense designs, defensible for MVP (KiCad's board-minimum floor has the same property; its custom-rule layer is what adds the flexibility).

### 3.3 Determinism — verified empirically, tier 1

Probe (Appendix A): non-trivial projection (3 nets, 2 layers, vias, placement pads; 7 violations across 5 codes), `runDrc` on two `structuredClone` copies → **byte-identical full reports** (2893 bytes, `Buffer.compare === 0`), and byte-identical across separate Bun processes. With `traces[]`/`vias[]` reversed: violation-id multiset, per-code counts, messages, locations all identical; only presentation order changes (violations[] order, `countsByCode` key order, anchor order within pairwise violations). Engine purity confirmed by grep: no `Date.*`, `Math.random`, I/O in `drc/` — the persistence timestamp is injected outside the engine (`store.ts:526`). Violation ids are FNV-1a-64 over code + sorted anchor keys (`violation-id.ts:64-70`), order-independent by construction. Caveat: consumers wanting canonical bytes across input *reorderings* must sort by id. The pre-existing test (`drc-engine.test.ts:536`) proves only sorted-id equality; this probe closes the gap.

### 3.4 Scaling — brute-force O(n²), no spatial index

No R-tree/quadtree/grid anywhere in the DRC path (grep-verified). Clearance = six pair loops (T²/2, T·P, T·V, V²/2, P²/2, P·V) with a linear AABB gap prefilter (`aabbGap`, `drc-context.ts:345-349`) — the broad phase itself is O(n²); the exact kernel `polylineToPolylineClosestPoints` is O(segA·segB) (25–400× on close 45°-routed pairs). `HOLE_TO_HOLE` has **no** prefilter (`board.ts:163-199`). Board checks are O(primitives × outline vertices), and `pointInOutline` re-flattens outline+cutouts per sampled point (B4-7). Order-of-magnitude: 1k copper primitives ≈ 5×10⁵ pair visits → tens of ms (fine); 10k ≈ 5×10⁷ → 0.5–5 s (batch-tolerable, event-loop-hostile — the run route executes synchronously on Bun's single thread, `routes.ts:2538-2552`, B5-SYNC); 100k ≈ 5×10⁹ → minutes (unusable). Interactive-hostile threshold ≈ 5–10k primitives batch; the live path degrades at ~1–2k pads because it rebuilds all pad geometry per pending segment per cursor move (B5-LIVE-PADGEOMS). Contrast: KiCad's `DRC_RTREE` — "Implement an R-tree for fast spatial and layer indexing of connectable items" (gitlab.com/kicad/code/kicad, 9.0 branch) — gives ~O(n log n) queries. Verdict: acceptable for MVP board sizes; a spatial index (plus moving the run off the request path) is a prerequisite for large boards, not for correctness.

### 3.5 Batch vs live-DRC divergence (route-tool `live-drc.ts`)

Live implements only trace↔trace (correct edge math) and trace↔pad with pads as **unrotated AABBs on a single side**. Everything else is batch-only. User-facing pattern: live-clean → commit → batch-error. Divergences: no short tier; no FAB tier; vias never checked live (a via placed mid-route gets zero live checking); no board-edge/off-board/width/manufacturability; pads: exact rotated polygon (batch, `padOutlineWorldMm`) vs unrotated AABB (live) → false negatives along a rotated pad's true long axis (B5-LIVE-ROT-PAD, empirically reproduced) and false positives on circular pads; TH pads span all copper layers in batch but only the placement side live — top-side THT barrels invisible while routing B.Cu, directly contradicting the adjacent comment (B5-LIVE-TH-PAD-SIDE); live ignores the *neighbor's* net class (`live-drc.ts:140-148`); displayed numbers differ (live = centerline distance vs required+halfwidths; batch = edge gap vs rule). Live-drc has **zero tests**.

### 3.6 Waivers vs professional exclusions

`DrcOptions` (`drc/types.ts:7-12`): whole-ruleClass ignores (coarser than KiCad's per-check severity remapping) + id-based waivers, persisted per-design in `viewState` (`routes.ts:2481-2484`) — matching KiCad's "excluded violations are remembered between runs". Gaps: no exclusion comment/audit trail, no per-code severity remap, and **waiver drift** — the id hashes code + anchors only (no location/measured value), so a waiver granted at a marginal 0.24 mm gap keeps suppressing the same pair as it degrades to 0.01 mm (B5-WAIVER-DRIFT, demonstrated at 24× degradation), and two distinct hotspots between the same pair are one id (only the first is reported/waivable).

---

## 4. Confirmed bugs (40/40 adversarially verified)

Every bug below was re-verified against source (verbatim quote check) and, where expressible with traces/vias, reproduced through the real engine. Grouping: severity from the audit, confirmed by the verifiers.

### High (3)

**B1-1 — SMD pad with authored `layer` not side-flipped on B.Cu placement → missed dead short.** `drc-context.ts:203`. KiCad-imported SMD pads carry `layer:"F.Cu"`; flip the placement to B.Cu — physical copper is B.Cu (zone fill flips it, `copper-fill-geometry.ts:72-75`; rendering remaps), but DRC keeps `layers=["F.Cu"]`. A B.Cu foreign-net trace through the pad: gate `!pad.layers.includes(t.layer)` (`clearance.ts:156`) skips → **zero violations for a dead short** (empirically reproduced end-to-end). Mirror-image false positive on F.Cu. The existing mirror test (drc-engine.test.ts:290-336) passes only because its helper omits `layer`, exercising the `?? placement.layer` fallback. Same unflipped pattern in the autoroute snapshot (`board-snapshot.ts:148`).

**B3-1 — unrouted GND net reports clean on a default board.** `ratsnest.ts:394`. GND-named nets are dropped from the ratsnest by name *before* any pour-existence check; with `copperFillLayers: []` (the default, `pcb-defaults.ts:23`) an entirely unrouted `GND` net yields no airwires → no UNCONNECTED_NET, and no pour → no ISOLATED_COPPER_ISLAND. The `copper-pour.ts:13-15` doc claim ("a same-net pour satisfies the net") is false for this path; `designer-pcb-ratsnest.test.ts:73` codifies the wrong behavior. KiCad clears airwires only via real zone connectivity and ships `unconnected_items` at Error.

**B3-2 — net-class reassignment produces contradictory verdicts on one net.** `drc-context.ts:320-322`. Stored `netClassId` on traces/vias beats `perNetClassAssignments`; pads resolve fresh. Full worked repro in §3.2. The `perNetClassAssignments` doc (`sdks/designer/types.ts:590-593`) says assignments apply "to new traces/vias at creation"; nothing re-syncs existing copper (`command-executor.ts:259-272` upgrades only default-class inserts). Neither KiCad (net-time resolution) nor Altium (scope re-evaluation) has stored-stale class semantics.

### Medium (19)

- **B5-VIA-MASK** — layer-invalid via (`layers=[]`, e.g. In1→In2 on 2-layer) escapes trace↔via, via↔via, pad↔via *and the short tier* (`clearance.ts:184,217,285`); only VIA_LAYER_SPAN fires, and it is id-waivable (`drc-engine.ts:50-52`) → waive one violation, ship a dead short. Reachable via KiCad import (`insert-pcb.ts:190+`); route-tool vias are hardcoded F.Cu/B.Cu.
- **B5-PAD-LAYER-UNCHECKED** — no pad/via analog of TRACE_LAYER_MISMATCH: an In1.Cu SMD pad on a 2-layer board is accepted (`copperLayerOf` checks `STACKUP_ORDER` membership, not `validCopperLayers`, `drc-context.ts:126-130,203`) and then shares no layer with anything → escapes all pair checks.
- **B1-2** — trace/via stored-class staleness (the mechanism half of B3-2; empirically confirmed).
- **B1-3** — bare-`<` clearance regime: exact-spec geometry can false-positive on derived-float gaps (probe P-A2 demonstrates zero grace; a real via-diameter case reproduced end-to-end by the verifier).
- **B2-2** — `jlcpcb_4l` internally inconsistent: its own minimum-compliant via (pad 0.45/drill 0.2 → annular 0.125 < its 0.15 floor) always warns; `minPadMm 0.45` unreachable (`fab-presets.ts:37-46`).
- **B2-4** — FAB_ANNULAR_RING applies JLC's PTH *component-hole* threshold (0.15; 2L is actually 0.18) to **vias**, whose current JLC requirement is 0.05/side → every 0.05–0.15 via over-warns, including JLC's published minimum via; meanwhile PTH pads get no fab annular check at all (enforced on the wrong entity class in both directions).
- **B2-5** — `drillSlot` ignored (`drc-context.ts:244`; type at `sdks/designer/types.ts:887-888`): slotted holes modeled as round holes of slot *width* → annular/HOLE_TO_HOLE/DRILL_SIZE all measure the wrong geometry along the slot axis.
- **B2-6** — `padOdMm = min(w,h)` uses bounding-box extents for `trapezoid`/`custom` pads → annular ring over-estimated (false pass) where actual copper is narrower than the bbox.
- **B2-7** — blind-via aspect model doubly wrong (through-limit on scaled linear depth; JLC 2L/4L doesn't offer blind vias) — unmanufacturable blind vias pass by ~an order of magnitude.
- **B3-3** — endpoint↔endpoint trace chaining is layer-agnostic (`ratsnest.ts:160`): F.Cu and B.Cu traces sharing exact nm endpoints union with no via → net marked routed while electrically open (empirically reproduced). Working-tree comment acknowledges keeping "historical layer-agnostic behavior".
- **B3-4** — pad↔endpoint and via↔trace unions are layer-blind (`ratsnest.ts:126-127,205`; `PadRef` carries no layer): a B.Cu trace ending at an F.Cu-only SMD pad's XY counts as connected.
- **B3-5** — via on a trace's *interior* connects nothing (via union tests endpoints only, `ratsnest.ts:198-201`) → false airwire/UNCONNECTED_NET for mid-segment stitching vias; the new T-junction pass covers trace↔trace only.
- **B3-6** — free pads absent from the connectivity graph (`connectivity.ts:14` doc; `correlateNetPads` builds from schematic pins only, `net-pad-correlation.ts:32+`) — confirms TODO 1.7 is live: permanent unwaivable airwires through free-pad stitching (false positive) and free-pad-only nets invisible (false negative).
- **B3-7** — ISOLATED_COPPER_ISLAND ids collide across layers (anchor = net only, `copper-pour.ts:57`; layer not hashed, `violation-id.ts:68`; every enabled fill layer shares `pourNetId`, `pcb-projection.ts:129-131`) → waiving F.Cu's island also waives B.Cu's.
- **B3-8** — explicit copper zones (rendered, Gerber-exported, ratsnest-feeding) are never pour-checked (`copper-pour.ts:19,25` iterates only `viewState.copperFillLayers`) — a floating island inside a user zone ships silently.
- **B4-1** — off-board trace sampling (vertices+midpoints, `board.ts:17-30,76`) misses a segment crossing a narrow cutout between samples; the miss is demoted to a distance-0 COPPER_TO_BOARD_EDGE *warning* while the correct verdict is a COPPER_OFF_BOARD *error* (empirically reproduced: 4 mm cutout, 80 mm trace).
- **B4-2** — pad off-board vertex-only test (`board.ts:142-144`): slot cutout clean through a pad interior and concave-notch spans both escape (empirically reproduced).
- **B4-3** — HOLE_TO_HOLE same-footprint skip is unconditional at any distance (`board.ts:167-173`) → physically overlapping drills within one footprint pass board DRC (empirically reproduced; drill files are board-level artifacts — JLC's 0.45 PTH hole-to-hole doesn't exempt same-footprint).
- **B4-4** — no hole-to-board-edge check anywhere (`ctx.holes` consumed only by hole-to-hole + drill-size): an NPTH free hole physically crossing the routed board edge → zero violations (empirically reproduced). Edge clearance uses via *copper* radius, never the drill.
- **B4-5** — BOARD_OUTLINE_INVALID dead declaration + zero outline validation (open/self-intersecting outlines silently accepted; `flattenOutline` passes polygons through unchecked, `outline-geometry.ts:203-204`).
- **B5-WAIVER-DRIFT** — waiver survives arbitrary geometric worsening; two hotspots between one pair = one id (§3.6).
- **B5-LIVE-ROT-PAD** — live pad AABBs never swap dimensions for 90°/270° rotation (`live-drc.ts:82`; only the center is transformed) → live-clean/batch-error on rotated non-square pads (empirically reproduced: 2.0×0.5 pad at 90°).
- **B5-LIVE-TH-PAD-SIDE** — live assigns every pad exactly one layer = placement side (`live-drc.ts:95,193`) → THT barrels invisible while routing the opposite side; contradicts its own comment (`live-drc.ts:93-94`).

### Low (18)

- **B1-4** — AABB prefilter omits SHORT_EPS: in a zero-rule config (custom fab, no classes, rule 0 — exactly what the `emit()` comment promises to protect) tangency-band shorts (0 < gap ≤ 1e-4) are pruned before the short check (`clearance.ts:130`; empirically confirmed).
- **B1-5** — VIA_TO_VIA violation `layer` = via A's topmost layer, possibly unshared (metadata only; `clearance.ts:237`).
- **B1-6** — pad `layer:"*.Cu"` without drill collapses to one copper layer (`drc-context.ts:199-203`); zone fill handles `*.Cu` as all-layers, DRC doesn't.
- **B2-1** — FAB_ANNULAR_RING bare-`<` float false positive ("0.150 mm < min 0.150 mm"; `fab-presets.ts:111`).
- **B2-3** — JLC preset floors stale vs live capability page (details §7; over-warning direction, safe but noisy).
- **B2-8** — fab checks run for vias only; TH/free-hole drills and PTH annulars below fab floors produce no fab warning (`manufacturability.ts:89-92,139-167`).
- **B2-9** — four eps regimes incl. creation-gate/DRC mismatch (§3.1; gate at `command-executor.ts:341-343`).
- **B3-9** — `measuredMm` receives mm² for islands (`copper-pour.ts:60` vs the field contract "(mm)" at `sdks/designer/types.ts:1813`).
- **B3-10** — `anchored` accepts dead same-net copper as an anchor; message overclaims pad connectivity (`copper-fill-geometry.ts:645-659`).
- **B4-6** — inscribed-polygon arc flattening shrinks *cutouts* → copper-to-cutout-edge over-measured by up to ~0.024 mm at r=20 mm (false-pass direction; outer outline errs safe) (`outline-geometry.ts:51,63-68`).
- **B4-7** — `pointInOutline` re-flattens outline+all cutouts per sampled point (`outline-geometry.ts:276-286`) — pure waste; context already precomputes the rings.
- **B5-LIVE-PADGEOMS** — `computePadGeoms` re-executed per pending segment per cursor move (`live-drc.ts:191` inside the loop at `:153`; `PcbCanvas.tsx:3092-3107`).
- **B5-6LAYER** — stackup ternary treats everything ≠4 as 2-layer (`drc-context.ts:162`); contained by `PcbLayerCount = 2|4`, but the two coercion chokepoints disagree (store 6→2 `pcb-store.ts:140`; KiCad import 6→4 `commit.ts:347`) — silent degradation, never reported.
- **B5-SYNC** — full O(n²) DRC runs synchronously in the HTTP handler (`routes.ts:2538-2552`) — blocks command dispatch/SSE for seconds on large boards.
- Plus the four test-anchored items folded above: FAB family/ISOLATED zero coverage (§5), null-net short semantics (§2 NET_SHORT_CIRCUIT row), UNCONNECTED severity-vs-KiCad, ratsnest eps split (strict `<` in `pointsTouch` vs `<=` in T-junction — 1 µm-exact touches behave differently per path).

---

## 5. Test-coverage gaps

Suite baseline: 81 pass / 0 fail; all DRC tests construct `DesignerPcbProjection` directly (no command bus); `assistant-pcb-batch-proposal.test.ts:106-108` mocks `runDrc` (orchestration only).

**Checks/branches with ZERO tests:**
1. `ISOLATED_COPPER_ISLAND` — never exercised through `runDrc` (geometry-layer tests only: `copper-fill-geometry.test.ts`).
2. `FAB_CLEARANCE` (`clearance.ts:101`).
3. `FAB_DRILL` / `FAB_PAD` / `FAB_ANNULAR_RING` (`manufacturability.ts:89-109`) — only FAB_TRACE_WIDTH is DRC-level tested; the others only via `designer-pcb-via-hydrator.test.ts` validator tests.
4. `VIA_DIAMETER_MIN` / `VIA_DRILL_MIN` — negative-only (`drc-engine.test.ts:397-398,712`); nothing ever triggers them.
5. `COPPER_TO_BOARD_EDGE` via (`board.ts:92-107`) and pad (`:122-137`) branches; `COPPER_OFF_BOARD` trace branch (`:75-89`).
6. Frontend: `live-drc.ts`, `drc-store.ts`, `DrcMarkerLayer`, `DesignerDrcView`, `PcbDesignRulesDialog` — zero Vitest tests (no test references `runLiveDrc` anywhere).

**Missing edge-case fixtures:**
- Arcs/curved traces — no arc fixture in any DRC test (all polylines).
- Exact-at-threshold clearance pair (only below/above exist, `drc-engine.test.ts:172/191`) — the bare-`<` boundary is untested in-repo (now probed, Appendix A).
- Empty-board zero-violation assertion; pad/via at exact edge-clearance threshold; 6-layer (or any ≠2/4) stackup input; rotated-pad **live**-DRC case; slotted drills; explicit zones through the pour check; a full-output determinism test (only sorted-id stability, `drc-engine.test.ts:536-542` — see §3.3).
- Regression fixtures for each §4 bug — notably B1-1 (authored pad layer + flipped placement), B3-1 (unrouted GND), B4-3 (same-footprint overlapping drills), B4-4 (hole at board edge).

---

## 6. Gap analysis vs professional tools + §11 taxonomy cross-map

### §11 constraint taxonomy (16 items, `docs/References/PCB_ROUTING_RESEARCH.md:346-368`)

| # | Item | Doc phase | Status |
|---|---|---|---|
| 1 | Min trace width | MVP | **Implemented** (TRACE_WIDTH_MIN + FAB_TRACE_WIDTH) |
| 2 | Min clearance | MVP | **Implemented** (6 pair codes + short tier + FAB_CLEARANCE) |
| 3 | Min annular ring | MVP | **Implemented** (nominal model; IPC-6012 caveats §2) |
| 4 | Min drill / via size | MVP | **Implemented** (DRILL_SIZE_MIN, VIA_DRILL_MIN, VIA_DIAMETER_MIN) |
| 5 | Board-edge clearance | MVP | **Implemented** (warning severity; holes not covered — B4-4) |
| 6 | Copper-to-edge / silkscreen-on-pad | MVP | **Partial** — copper-to-edge yes; **silkscreen checks entirely absent** (no silk layer in the DRC model) |
| 7 | Trace width vs current (IPC-2152) | Near-term | **Missing** (no current/temperature model on nets) |
| 8 | Acid trap / acute angle | Near-term | **Missing** (Altium ships Acute Angle; KiCad 9 ships `track_angle`) |
| 9 | Sliver / min feature | Near-term | **Missing** (KiCad: `copper_sliver`, `connection_width`) |
| 10 | Isolated copper island | Near-term | **Implemented** (ahead of phasing; board-wide fills only — B3-8) |
| 11 | Teardrop presence (Class 3) | Near-term | **Missing** |
| 12 | HV clearance/creepage by voltage | Near-term | **Missing** (KiCad 9 ships a `creepage` constraint; Altium ships Creepage Distance — the taxonomy's "Phase-2-ish" framing is outdated: both mainstream tools now check creepage natively) |
| 13 | Diff-pair gap & skew | Phase 2 | **Missing** (planned: `docs/TODO-signal-aware-routing.md` — KiCad: `diff_pair_gap_out_of_range`, `diff_pair_uncoupled_length_too_long`; Altium: Differential Pairs Routing) |
| 14 | SE/diff impedance | Phase 2 | **Missing** |
| 15 | Reference-plane gap crossing | Phase 2 | **Missing** (KiCad 9 has no native check either; Altium: Return Path rule — partially contradicts the taxonomy's implication that this is standard) |
| 16 | Aspect ratio | Phase 2 | **Implemented** (ahead of phasing; blind-via model wrong — B2-7) |

Tally: **7 implemented, 1 partial, 8 missing.** Items 10 and 16 shipped ahead of the doc's phasing. Taxonomy entries contradicted/dated by research: #12 (creepage is now a first-class check in KiCad 9 and Altium — should move earlier), #15 (not a mainstream DRC check; Altium-only Return Path), and the §7-referenced JLCPCB values underlying #1–#5 have drifted (§7 below).

### Professional checks OpenPCB lacks (prioritized)

KiCad 9's full catalog (63 violation types, `drc_item.cpp`, 9.0 branch) and Altium's 10 rule categories were compared; OpenPCB implements ~21 codes. Priority mapping to the MVP / near-term / Phase-2 phasing:

**MVP-blocking (professional tables stakes, cheap on existing geometry):**
1. **Courtyard overlap + malformed/missing courtyard** — KiCad `courtyards_overlap`/`missing_courtyard`/`malformed_courtyard`; Altium Component Clearance. No courtyard concept in OpenPCB at all; placement overlap is currently uncheckable.
2. **Silkscreen over pad / silk clearance** — KiCad `silk_over_copper`, `silk_overlap`, `silk_edge_clearance`; Altium Silk To Solder Mask / Silk To Silk; JLC publishes silk minimums (0.15 mm). §11 item 6 marks this MVP; it's absent.
3. **Hole-to-board-edge** (B4-4) and **outline validity** (B4-5) — KiCad `invalid_outline`; both are silent-failure holes today.
4. **Dangling via / dangling track (stub) detection** — KiCad `via_dangling`, `track_dangling`; Altium Net Antennae. OpenPCB has nothing (route tool can leave dangling ends by design, `route-interactions.test.ts:111`).

**Near-term:**
5. **Solder-mask sliver / mask bridge** — KiCad `solder_mask_bridge`; Altium Minimum Solder Mask Sliver; JLC dam 0.10 mm (1oz). No mask model in DRC yet.
6. **Copper sliver / minimum connection width** — KiCad `copper_sliver`, `connection_width` (§11 item 9).
7. **Acute-angle / track-angle** (§11 item 8) — KiCad 9 `track_angle`.
8. **Starved thermal / thermal-relief check** — KiCad `starved_thermal`; Altium Power Plane Connect Style. Note TODO 1.7 says *remove* the broken thermal-relief implementation first.
9. **Creepage by voltage** (§11 item 12, upgraded urgency — see contradiction note above).
10. **Per-netclass track-width/via enforcement** — classes carry `traceWidthMm`/`viaDiameterMm`/`viaDrillMm` that DRC never checks; KiCad enforces both (`track_width`, `via_diameter`).

**Phase-2 (matches existing phasing):** diff-pair gap/skew + uncoupled length, length/skew matching (KiCad `length_out_of_range`/`skew_out_of_range`; Altium Matched Lengths), impedance, via-count (`too_many_vias`), back-drill stubs, Z-axis clearance (Altium), schematic-parity checks (KiCad `net_conflict`/`duplicate_footprints`/`footprint_symbol_mismatch` — OpenPCB's auto-sync architecture makes some structurally impossible, worth an explicit claim in docs).

**Rule-model gaps (orthogonal to individual checks):** no custom-rule layer (KiCad `.kicad_dru` condition grammar; Altium scope queries) — everything is board-global + per-net class; no relaxation mechanism (§3.2); no per-code severity remap; no exclusion comments (§3.6).

---

## 7. Documentation drift

1. **`src/sdks/designer/types.ts:1748-1782` stale P1/P2 comment** — marks VIA_TO_VIA/PAD_TO_PAD/PAD_TO_VIA/COPPER_TO_BOARD_EDGE/HOLE_TO_HOLE/VIA_LAYER_SPAN/VIA_ASPECT_RATIO/COPPER_OFF_BOARD/ISOLATED_COPPER_ISLAND as "declared, not yet implemented"; all are implemented and (mostly) tested. Only BOARD_OUTLINE_INVALID is genuinely unimplemented.
2. **`OPENPCB_STATE.md:392`** — `pcb/layers/*` mislabels the frontend DRC home (`frontend/pcb/drc/`).
3. **`PCB_ROUTING_RESEARCH.md` §-numbering** — JLCPCB table is §7, not §12 (§1 above); the file's own "20 vs 32 layer" flag is resolved: current JLC standard ordering goes to 32 layers.
4. **Three-way JLCPCB conflict, resolved against the live capabilities page (2026-07-11, fetched 3×, consistent):**

| Parameter | `fab-presets.ts` (code) | RESEARCH §7 | eda-standards skill | **JLCPCB live 2026-07-11** | Verdict on code |
|---|---|---|---|---|---|
| 2L trace/space | 0.127 | 0.127 | 0.127 | **0.10/0.10 mm** | Stale (conservative) |
| ML trace/space | 0.0889 | 0.09 | — | **0.09/0.09 mm** | Current ✓ |
| Min mech drill | 0.3 (2L) / 0.2 (4L) | 0.15 | 0.3 | **0.15 mm (both)** | Stale (conservative) |
| Min via diameter | 0.6 (2L) / 0.45 (4L) | 0.25 | 0.56 | **0.25 mm (hole 0.15, both)** | Stale (conservative); 4L 0.45 internally unreachable (B2-2) |
| Via annular /side | 0.15 (all presets) | — | 0.13 | **0.05 min / 0.075 rec** | Wrong row: 0.15 is the ML PTH *component-hole* value (2L PTH = 0.18) (B2-4) |
| Hole-to-hole | rule default 0.25 | — | — | **via 0.2 / PTH 0.45** | Single default can't express both |
| Board-edge | rule default 0.5 | — | 0.3 | **routed ≥0.2 / V-cut ≥0.4** | Conservative ✓ |
| Mask dam | — | ≥0.2 | 0.1 | **0.10 (1oz) / 0.20 (2oz)** | §7 stale for 1oz |
| Silk min line | — | 0.15 | 0.15 | **0.15 mm** | Current ✓ |
| Max layers | — | 1–20 (32 flagged) | — | **1–32** | §7 stale |
| Aspect ratio | 10 | — | — | **≤10:1 (through)** | Current ✓ (via JLC blog; not on capabilities page) |

All code drift is in the over-warning (safe) direction except the annular-ring semantics (B2-4, over-warns on legal vias while under-checking 2L PTH) and the internal 4L inconsistency (B2-2). The eda-standards skill's JLCPCB preset (drill 0.3, via 0.56, annular 0.13) matches neither the live page nor §7 — treat the live page as the only threshold source of truth going forward.

---

## 8. Sources

**Primary (fetched 2026-07-11):**
- KiCad 9.0 manual — DRC checks, board-setup constraints, custom-rule syntax, exclusions: https://docs.kicad.org/9.0/en/pcbnew/pcbnew.html (single-page manual; quotes extracted from downloaded HTML, whitespace-normalized)
- KiCad 9.0 source — full DRC violation catalog + spatial index: https://gitlab.com/kicad/code/kicad/-/raw/9.0/pcbnew/drc/drc_item.cpp , .../drc_engine.cpp , .../drc_rtree.h
- Altium Designer documentation — rule categories, priority/first-match precedence, relaxation: https://www.altium.com/documentation/altium-designer/pcb/design-rule-types (+ per-category pages), https://www.altium.com/documentation/altium-designer/pcb/defining-scoping-managing-design-rules , BGA-fanout relaxation example: https://resources.altium.com/p/design-rules-to-fanout-a-large-bga (note: the old `pcb-dsn-rules` URL is 404; docs moved)
- JLCPCB live capabilities: https://jlcpcb.com/capabilities/pcb-capabilities (fetched 3×, consistent; archive.org unreachable from this environment) + corroborating JLC blogs: https://jlcpcb.com/blog/how-to-avoid-pitfalls-in-pcb-design , https://jlcpcb.com/blog/pcb-via-design-best-practices , https://jlcpcb.com/blog/via-aspect-ratio-critical-pcb-reliability

**Secondary (IPC standards are paywalled; every numeric corroborated by ≥2 sources unless noted):**
- IPC-2221 Table 6-1 spacing (B1/B2/B4 columns, 0–500 V + formulas): https://www.smpspowersupply.com/ipc2221pcbclearance.html , https://www.sfcircuits.com/pcb-school/pcb-line-spacing-clearance-creepage , https://www.ema-eda.com/ema-resources/blog/pcb-clearance-and-creepage-distance-table/ , https://resources.altium.com/p/using-an-ipc-2221-calculator-for-high-voltage-design
- IPC-2221C currency (Dec 2023): https://webstore.ansi.org/standards/ipc/ipc2221c2023
- IPC-2152 purpose/supersession: https://www.protoexpress.com/blog/how-to-optimize-your-pcb-trace-using-ipc-2152-standard/ , https://www.smps.us/pcb-calculator.html
- IPC-6012 class definitions, annular-ring breakout/minima, positional measurement: IPC APEX 2011 paper (hosted on IPC's own site): https://www.electronics.org/system/files/technical_resource/E6%26S34_01.pdf , https://summitinterconnect.com/blog/article/differences-between-annular-ring-classes/ , https://resources.altium.com/p/meeting-standards-ipc-6012-class-3-annular-ring , https://www.protoexpress.com/blog/ipc-class-2-vs-class-3-different-design-rules/
- Single-source (marked low-confidence where used): JLC drill-to-copper (0.2 via / 0.28 PTH), hole-to-hole (0.2 via / 0.45 PTH), edge clearance (0.2/0.4), slots, mask expansion — capabilities-page extractions.

**Repo documents:** `docs/References/PCB_ROUTING_RESEARCH.md` (§7 :217-239, §11 :346-368), `docs/OPENPCB_STATE.md` (:95, :392, :416), `OpenPCB/TODO.md` (:59, :106, :517-524), `docs/TODO-signal-aware-routing.md`, `.claude/skills/eda-standards/references/design-rules.md`, `cloud-workspace/cloud-auto-layout/CURRENT_STATE_V2.md` (:129-141).

---

## Appendix A — empirical probe record

**Determinism probe** (script + raw outputs: `/tmp/openpcb-drc-determinism/`): imports `runDrc` by absolute path; fixture = 3 nets (VCC/GND/SIG), traces on F.Cu+B.Cu incl. a deliberate short pair, 2 vias at 0.1 mm gap, placement with 2 pads; 7 violations across 5 codes. Results: run1 vs run2 (structuredClone) byte-identical (2893 bytes, `Buffer.compare===0`); rerun in a fresh Bun process byte-identical; reversed `traces[]`/`vias[]` → identical sorted id-multiset + counts + messages + locations, array order/presentation differs (documented caveat, §3.3).

**Epsilon probes** (fixtures + verbatim outputs: `/tmp/drc-epsilon-probe/`, run through `scripts/drc-parity-harness.ts` — real `runDrc`, integer-nm coordinates, 1 nm = exactly `DRC_EPS_MM`):

| Probe | Setup | Result |
|---|---|---|
| P-A0 | diff nets, rule 0.127 override, gap 0.200, default net class 0.25 | TRACE_TO_TRACE_CLEARANCE fires — proves `max(rule, class)` floor |
| P-A1 | null nets/unknown class (defeats floor), gap exactly 0.127 = rule | clean — bare `<` passes at equality |
| P-A2 | gap = 0.127 − 1 nm | TRACE_TO_TRACE_CLEARANCE fires — zero grace |
| P-A3a | width 0.1999995 vs min 0.2 (deficit 5e-7 < eps) | clean — `below()` grace |
| P-A3b | width 0.199998 (deficit 2e-6 > eps) | TRACE_WIDTH_MIN fires |
| P-B1 | diff-net edges exactly touching (gap 0) | NET_SHORT_CIRCUIT |
| P-B2 | gap 150 nm (> SHORT_EPS 100 nm) | TRACE_TO_TRACE_CLEARANCE, not short |
| P-B3 | overlap (gap −0.1) | NET_SHORT_CIRCUIT |
| P-B4 | gap exactly 100 nm | NET_SHORT_CIRCUIT (inclusive `<=`) |
| P-C1 | coincident vias, same net | clean (coincident same-net exception) |
| P-C2 | coincident vias, diff nets | NET_SHORT_CIRCUIT (error) + HOLE_TO_HOLE (warning); VIA_TO_VIA_CLEARANCE preempted by short branch |

Already-test-proven boundary cases (not re-probed): exact-threshold annular float `(0.3−0.1)/2` (drc-p0-fixes.test.ts:263-292), 45° rotation (:294-312), zero-rule short (:146-166), via-on-same-net-TH-pad (drc-p1-fixes.test.ts:289-313), exact-min drill (:324-329).

**Adversarial verification:** 40/40 candidate bugs confirmed (none refuted, none unverifiable); 3 line-number corrections applied during verification (types.ts:1794 for B4-5; routes.ts:2549 for B5-SYNC; command-executor.ts:341-343 for B2-9); 10/10 cross-slice audit-table spot-checks matched verbatim.

---

*Audit produced 2026-07-11 against working tree at `b2b0048`. No repository files were modified; this report is the only addition.*
