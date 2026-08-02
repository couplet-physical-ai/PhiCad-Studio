# DRC — open findings

This is the defect register for OpenPCB's design-rule checker. It records the 19 bugs that a
full adversarial audit of the DRC engine confirmed and that are **still open**, together with the
durable engineering contracts and constant sets that the surrounding hardening work locked in.

For 18 of the 19 findings this document is the only prose description that exists. The audit
report they came from has been retired; the hardening plan that scheduled the fixes has been
retired. Nothing else in the repository explains *why* these are bugs or what the correct
behaviour is.

## How to use it

- **Before touching a DRC check**, read the finding for that check. Several of them are traps
  where the current behaviour is deliberate-looking (a comment, a passing test) but wrong.
- **Before writing a new check**, read the reference sections. Epsilon policy, determinism,
  net-class resolution, severity precedence and the fab profile are all settled decisions; a new
  check that re-derives them will diverge.
- **Each finding names its subsystem and symbol, not a line number.** The original audit was
  `file.ts:line`-anchored and had already drifted during the audit itself. Grep for the symbol.

## Checking status

Every open finding has a corresponding `test.todo` regression test. The register is live only as
long as that correspondence holds:

```
rg -n "test\.todo" src/core/backend/tests/drc-audit-b*.test.ts
```

Expect **20 lines covering 19 unique bug ids**. When a fix lands, the `test.todo` becomes a real
`test` and the finding leaves this document. If the count drops without a finding being removed
here, the register is stale.

## Evidence standard

The audit's own findings were verified: every bug was re-read against source and, where
expressible through the engine, reproduced by running the real `runDrc`. Those confirmations are
trustworthy.

**The claims about which bugs were subsequently *fixed* are not.** The hardening program reported
21 of the 40 audit bugs as flipped, but those per-bug claims were self-reported by the implementer
and were never independently verified against code. The only verified signal is the `test.todo`
census above. Where this document says something shipped, it means "the test file says it is no
longer pending" — not "someone confirmed the code is correct."

---

# 1. Unowned — needs an owner before anything else

## B3-1 — an unrouted `GND` net reports DRC-clean on a default board

**Severity: HIGH.** This is the finding to escalate. A completely unrouted ground net on a
default board produces no violation of any kind.

**Mechanism.** The ratsnest builder drops GND-named nets *by name*, and it does so **before** any
check for whether a copper pour actually exists. On a default board `copperFillLayers` is empty.
So the two checks that should catch an unrouted ground both miss:

- `UNCONNECTED_NET` (connectivity check) trusts `projection.ratsnest`. GND was suppressed from the
  ratsnest, so there are no airwires, so there is nothing to report.
- `ISOLATED_COPPER_ISLAND` (copper-pour check) only iterates board-wide fill layers. There are
  none, so it never runs.

The name-based suppression is only defensible if a same-net pour is guaranteed to satisfy the net.
The doc comment in the copper-pour check asserts exactly that — **and it is false for this path**,
because nothing verifies that a pour exists. KiCad, by contrast, clears airwires only through real
zone connectivity, and ships `unconnected_items` at Error severity.

**The test codifies the wrong behaviour.** The ratsnest test suite contains an assertion that a
GND net with no routing produces no airwires. It passes. Fixing B3-1 means changing that test,
not just the engine — anyone approaching this from the test suite will conclude the current
behaviour is intended.

**Anchors.** Ratsnest builder (`pcb/ratsnest.ts`), GND name-suppression branch · default
`copperFillLayers` in `pcb-defaults.ts` · `checks/connectivity.ts` · `checks/copper-pour.ts`
doc-comment claim · the ratsnest regression suite `designer-pcb-ratsnest.test.ts`.

**Ownership: none.** B3-1 is tracked as a `test.todo` in `drc-audit-b3.test.ts`, so it is a real,
visible regression test — it was not lost. But it is **assigned to no milestone**: P4, P7 and P9
each list the bugs they own, and B3-1 appears in none of them, nor anywhere in the tracker. It is
the highest-severity item in this register and the only one with no route to being fixed.

**Action required:** assign B3-1 to a milestone, or schedule it standalone. A fix has to decide
what the correct semantics are (suppress GND airwires only when a pour on that net exists on some
enabled layer, versus dropping name-based suppression entirely) and update the ratsnest test to
match.

---

# 2. Open findings by owning milestone

## P4 — backend spatial index

P4 replaces the brute-force pair loops with an rbush-backed index, gated on byte-identity against
an exhaustive-mode oracle. It owns four findings. Three are geometric sampling defects that a
proper index makes cheap to fix; one is pure waste.

### B4-1 — off-board trace detection samples, and a narrow cutout falls between samples

`COPPER_OFF_BOARD` for traces tests only polyline vertices and segment midpoints for containment
in the board outline. A trace crossing a cutout narrower than the sampling stride passes straight
over it undetected. Worse, the miss is not silent: the geometry still registers as touching the
cutout edge, so it is **demoted to a distance-0 `COPPER_TO_BOARD_EDGE` warning** when the correct
verdict is a `COPPER_OFF_BOARD` error. Reproduced end-to-end with a 4 mm cutout and an 80 mm trace.

*Anchor:* `checks/board.ts`, trace off-board branch and its vertex/midpoint sampler.

### B4-2 — off-board pad detection is vertex-only

The pad branch tests pad-outline vertices only. Two real geometries escape: a slot cutout passing
clean through a pad's interior (all vertices remain on-board), and a concave notch that the pad
spans (all vertices on-board, the middle of the pad over air). Both reproduced.

*Anchor:* `checks/board.ts`, pad off-board branch.

### B4-6 — arc flattening shrinks cutouts, so cutout clearance is over-measured

Outline arcs are flattened to inscribed polygons. For the *outer* outline that errs safe
(the polygon is inside the true boundary). For *cutouts* the same inscription makes the hole
smaller than it really is, so copper-to-cutout-edge distance is over-measured — a false-pass
direction. Bounded at roughly 0.024 mm at a 20 mm radius, so low severity, but it is the wrong
sign of error.

*Anchor:* `outline-geometry.ts`, arc flattening and cutout ring construction.

### B4-7 — `pointInOutline` re-flattens the outline on every sampled point

Each containment test re-flattens the outer outline and every cutout from scratch, inside the
per-point sampling loops of B4-1 and B4-2. The DRC context already precomputes these rings. This
is not a correctness bug; it is the single largest avoidable constant factor in the board checks
and it compounds with the sampling density any B4-1/B4-2 fix will add.

*Anchor:* `outline-geometry.ts`, `pointInOutline`.

## P7 — async DRC, engine move to `shared/drc/`, live/batch parity

P7 moves the engine to `src/shared/drc/` behind re-export shims so live DRC and the batch path
consume the identical code, and moves the batch run off the HTTP request path onto the task
executor. It owns five findings. Four of them are the *reason* the move is necessary: the live
path is a second, weaker reimplementation of the same geometry, and its divergences are P7's
acceptance criteria (see §5.5).

### B2-9 — the creation gate and DRC disagree on identical geometry

The route tool's via-placement gate and the DRC engine apply different comparison semantics to the
same numbers, so a via can be accepted at creation and then flagged by DRC (or the reverse). This
is the fourth of the four epsilon regimes catalogued in §5.1. See §3 — there is an open question
about whether this one is already fixed.

*Anchor:* `command-executor.ts`, route-tool via gate · `checks/clearance.ts` · the shared tolerance
policy in `pcb/tolerance.ts`.

### B5-LIVE-ROT-PAD — live pad boxes never swap dimensions under rotation

Batch DRC uses the exact rotated pad polygon. Live DRC models each pad as an **unrotated
axis-aligned box**, transforming only the pad's centre. A 2.0 × 0.5 mm pad rotated 90° is
therefore checked as if it were still 2.0 wide and 0.5 tall. Result: live-clean, batch-error along
the pad's true long axis — and spurious live errors on circular pads, where the box overstates the
copper. Reproduced.

*Anchor:* `frontend/pcb/drc/live-drc.ts`, pad AABB construction.

### B5-LIVE-TH-PAD-SIDE — live gives every pad exactly one layer

Live DRC assigns each pad a single layer equal to its placement side. Through-hole pads span all
copper layers in the batch model. So while routing B.Cu, every top-placed THT barrel is invisible
to live checking. The code comment immediately above this logic states the opposite intent.

*Anchor:* `frontend/pcb/drc/live-drc.ts`, pad layer assignment.

### B5-LIVE-PADGEOMS — pad geometry is rebuilt per pending segment per cursor move

`computePadGeoms` sits inside the per-pending-segment loop, which itself runs on every cursor
move. All pad geometry for the board is reconstructed on each frame of a drag. This is why the
live path degrades at roughly 1–2k pads, an order of magnitude below the batch path's
interactive-hostile threshold.

*Anchor:* `frontend/pcb/drc/live-drc.ts`, `computePadGeoms` call site inside the segment loop;
driven from `PcbCanvas.tsx`.

### B5-SYNC — the full O(n²) batch run executes synchronously in the HTTP handler

`POST /designs/:designId/drc/run` runs the engine inline on Bun's single thread. At ~10k copper
primitives that is 0.5–5 s (§5.4) during which command dispatch and SSE are blocked. The engine
itself is pure and correct; this is purely a placement problem.

*Anchor:* the `POST /designs/:designId/drc/run` handler in `designer/backend/routes.ts`. Cite the
route, not a line number — the handler has already drifted once.

## P9 — DFM overlay checks

P9 adds courtyard, silkscreen, mask and copper-shape checks on top of a new overlay-extraction
context module. It also owns nine pre-existing findings: three geometry-model defects in
manufacturability, and the entire layer-blindness cluster in the connectivity graph.

### B2-5 — slotted drills are modelled as round holes

`drillSlot` is ignored. A slot is treated as a round hole of the slot's *width*, so every check
that consumes hole geometry — annular ring, `HOLE_TO_HOLE`, `DRILL_SIZE_MIN` — measures the wrong
geometry along the slot's long axis. P9's slot-aware `DrcHole.slot` field is the template for the
fix.

*Anchor:* `drc-context.ts` hole construction · the `drillSlot` field on the pad type in
`sdks/designer/types.ts`.

### B2-6 — annular ring uses bounding-box extents for non-rectangular pads

`padOdMm` is computed as `min(width, height)`. That is correct for circle, rect and oval pads.
For `trapezoid` and `custom` pads those are bounding-box extents, and the actual copper is
narrower than the box, so the annular ring is over-estimated — a false pass on exactly the pad
shapes where the ring is most likely to be marginal.

*Anchor:* `checks/manufacturability.ts`, pad annular branch; `padOdMm` derivation in
`drc-context.ts`.

### B2-7 — the blind-via aspect model is wrong twice over

`VIA_ASPECT_RATIO` scales board thickness linearly by the via's layer-span fraction and then
applies the **through-hole** 10:1 limit to that scaled depth. Blind and laser vias are governed by
a depth-to-drill convention closer to 1:1. Compounding it, neither JLCPCB standard preset (2L or
4L) offers blind vias at all. Unmanufacturable blind vias pass by roughly an order of magnitude.

*Anchor:* `checks/manufacturability.ts`, `VIA_ASPECT_RATIO` branch.

### B3-3 — trace endpoint chaining in the ratsnest is layer-agnostic

Two traces whose endpoints share exact integer-nm coordinates are unioned regardless of layer. An
F.Cu trace and a B.Cu trace meeting at a point with **no via** are marked connected, so the net
reports routed while it is electrically open. Reproduced. A comment in the working tree
acknowledges this as "historical layer-agnostic behavior" — it is not a decision anyone should
preserve.

*Anchor:* `pcb/ratsnest.ts`, endpoint-to-endpoint union.

### B3-4 — pad and via unions in the ratsnest are layer-blind

The pad-to-endpoint and via-to-trace unions also ignore layer; `PadRef` carries no layer at all.
A B.Cu trace terminating at the XY of an F.Cu-only SMD pad counts as connected.

*Anchor:* `pcb/ratsnest.ts`, pad-to-endpoint and via-to-trace unions · `PadRef` shape.

### B3-5 — a via on a trace's interior connects nothing

Via unions test trace **endpoints** only. A stitching via placed mid-segment — the normal way to
change layers along a run — unions with neither trace, producing a false airwire and a false
`UNCONNECTED_NET`. The same-layer T-junction pass added later covers trace-to-trace only, not
via-to-trace.

*Anchor:* `pcb/ratsnest.ts`, via union.

### B3-6 — free pads are absent from the connectivity graph

`correlateNetPads` builds the graph from schematic pins only, so free pads (pads not backed by a
schematic pin) do not exist to connectivity. Both error directions follow: a net stitched through
a free pad reports a permanent, unwaivable airwire; a net that exists only on free pads is
invisible. This is the same defect the tracker records as the "free-pad false `UNCONNECTED_NET`"
item under DRC trust.

*Anchor:* `net-pad-correlation.ts`, `correlateNetPads` · `checks/connectivity.ts` doc comment.

### B3-9 — `measuredMm` carries mm² for isolated islands

`ISOLATED_COPPER_ISLAND` writes the island's **area** into `measuredMm`, whose field contract
declares millimetres. Any consumer formatting or comparing that number is wrong by a dimension.

*Anchor:* `checks/copper-pour.ts` emit site · the `measuredMm` field contract in
`sdks/designer/types.ts`.

### B3-10 — `anchored` accepts dead copper, and the message overclaims

An island is considered anchored if it intersects *any* same-net copper — including other dead
copper. The emitted message states the island is connected to a pad, which the check never
verifies.

*Anchor:* `copper-fill-geometry.ts`, anchoring predicate · `checks/copper-pour.ts` message text.

---

# 3. Open question — the B2-9 double-claim

The tracker records that milestone P1 unified the epsilon policy across clearance, fab,
manufacturability **and the creation gates**. Unifying the creation gates is precisely B2-9's fix.

But the hardening plan still lists B2-9 under P7's owned bugs, and B2-9 is still a `test.todo`.
Both cannot be right.

This is cheap to settle: read the route-tool via gate in `command-executor.ts` and check whether
it now goes through `pcb/tolerance.ts` (`below` / `exceeds`, `DRC_EPS_MM`, `SHORT_EPS_MM`) or
still uses its own bare comparisons. If it uses the shared policy, B2-9 is fixed and its
`test.todo` should be flipped; P7 then owns four findings, not five.

Until someone checks, treat B2-9 as open. That is the conservative reading and it matches the only
verified evidence — the `test.todo` census.

---

# 4. Nomenclature trap — `drc-p0-fixes.test.ts` is not P0

There are two unrelated numbering schemes in the test suite and they collide.

`src/core/backend/tests/drc-p0-fixes.test.ts` and `drc-p1-fixes.test.ts` **predate this audit
entirely**. They belong to an earlier route-tool hardening round and have nothing to do with the
DRC hardening program's milestones P0 and P1.

The DRC hardening program's P0 artifacts are:

| Artifact | Purpose |
|---|---|
| `drc-audit-b1.test.ts` … `drc-audit-b5.test.ts` | The 40 audit regression fixtures; open ones are `test.todo` |
| `drc-golden.test.ts` | Golden-board full-report snapshots |
| `drc-determinism.test.ts` | Byte-identity across runs and processes |
| `drc-epsilon-matrix.test.ts` | Encodes the boundary semantics of §5.1 |

If you are looking for the status of an audit bug, only the `drc-audit-b*` files answer that
question. The `drc-p*-fixes` files are historical and their names should be read as
"route-tool phase 0/1", never as milestone names.

---

# 5. Reference — engineering contracts

Durable content extracted from the audit. These are properties of the engine as it stands, not
proposals.

## 5.1 Epsilon policy

Four distinct comparison regimes existed at audit time. The hardening program's P1 milestone
unified them into `src/modules/designer/backend/pcb/tolerance.ts` (`below` / `exceeds`,
`DRC_EPS_MM = 1e-6`, `SHORT_EPS_MM = 1e-4`) — one policy, grace everywhere — with the exception
tracked as B2-9. The *semantics chosen* are the part that must survive:

| Regime | Form | Applies to | Boundary behaviour |
|---|---|---|---|
| Minimums | `below(v, limit)` = `v < limit − 1e-6` | Manufacturability minimums, board checks | Exact-spec geometry passes; sub-nanometre float noise forgiven |
| Clearance | bare `gap < required` | All clearance pairs, FAB tier | Exact equality passes; a 1 nm deficit errors — zero grace |
| Short | `gap <= SHORT_EPS_MM` (1e-4), **inclusive** | Short tier | A gap of exactly 1e-4 mm is a short |
| Fab validators | bare `<` / `>`, no epsilon | Fab preset comparisons | Produced a real false positive on a derived float |

The asymmetry between regimes 1 and 2 is deliberate but was undocumented: trace coordinates are
integer nanometres, so exact-equality clearance cases are exactly representable and the bare `<`
is safe for authored geometry. The exposure is *derived* floats — diagonal geometry and
half-width subtraction — which is where B1-3 lived.

**The probe ladder.** These were run against the real engine through the parity harness with
integer-nm coordinates, where 1 nm equals `DRC_EPS_MM` exactly. They are the only record of the
chosen boundary semantics and are the specification an epsilon-matrix test must encode:

| Probe | Setup | Result |
|---|---|---|
| P-A0 | Different nets, rule 0.127 override, gap 0.200, default net class 0.25 | Clearance violation fires — proves the `max(rule, class)` floor |
| P-A1 | Null nets / unknown class (defeats the floor), gap exactly 0.127 = rule | Clean — bare `<` passes at equality |
| P-A2 | Gap = 0.127 − 1 nm | Violation fires — zero grace |
| P-A3a | Width 0.1999995 vs min 0.2 (deficit 5e-7, below eps) | Clean — `below()` grace |
| P-A3b | Width 0.199998 (deficit 2e-6, above eps) | `TRACE_WIDTH_MIN` fires |
| P-B1 | Different-net edges exactly touching (gap 0) | `NET_SHORT_CIRCUIT` |
| P-B2 | Gap 150 nm (above `SHORT_EPS`) | Clearance violation, not a short |
| P-B3 | Overlap (gap −0.1) | `NET_SHORT_CIRCUIT` |
| P-B4 | Gap exactly 100 nm | `NET_SHORT_CIRCUIT` — inclusive `<=` |
| P-C1 | Coincident vias, same net | Clean — coincident same-net exception |
| P-C2 | Coincident vias, different nets | `NET_SHORT_CIRCUIT` (error) plus `HOLE_TO_HOLE` (warning); via-to-via clearance is preempted by the short branch |

## 5.2 Determinism contract

The engine is a pure function. Grep-verified: no `Date`, no `Math.random`, no I/O anywhere under
`drc/`. The persistence timestamp is injected *outside* the engine, at the store's DRC-result
write.

Violation ids are FNV-1a-64 over the rule code plus the **sorted** anchor keys, which makes them
order-independent by construction rather than by convention.

Empirically: a non-trivial projection (3 nets, 2 layers, vias, placement pads, 7 violations across
5 codes) produced byte-identical full reports across two `structuredClone` copies and across
separate Bun processes. With the `traces[]` and `vias[]` arrays reversed, the violation-id
multiset, per-code counts, messages and locations were all identical.

**The caveat that must survive:** reordering the *input* arrays changes presentation order — the
order of `violations[]`, the key order of `countsByCode`, and anchor order within pairwise
violations. Consumers that need canonical bytes across input reorderings must **sort by violation
id** first. The in-repo determinism test proves only sorted-id stability; it does not prove
full-report byte-identity.

## 5.3 Net-class resolution chain

`resolveNetClassId` resolves in this order:

1. Explicit `perNetClassAssignments[netId]`, if that class still exists.
2. Anchored name regexes, tried in order: `GND_NAMES`, then `POWER_NAMES`, then `POWER_VOLTAGE`.
   All are fully anchored — `GND_SENSE` does **not** match the GND pattern.
3. **The first class in the `board.netClasses` array** (`available[0]?.id ?? "default"`).

Step 3 is the fragile one: it is array-order-dependent, it is untested, and it silently decides
the class for every net that neither has an explicit assignment nor matches a name pattern —
which, given the anchoring in step 2, is most nets on a real board. Any change to how
`board.netClasses` is ordered changes DRC results.

Only `clearanceMm` is DRC-enforced from a net class. `traceWidthMm`, `viaDiameterMm`, `viaDrillMm`,
`defaultViaProtection` and `color` are stored and feed route-tool defaults, but no check reads
them (P5 added `NETCLASS_*` checks; treat per-class width enforcement as new behaviour, not as a
long-standing guarantee).

**Model comparison** — worth keeping because it explains a functional gap:

| Tool | Model | Can a scoped rule relax? |
|---|---|---|
| OpenPCB | Tighten-only `max(boardRule, classA, classB)` | No (before the scoped rule engine) |
| KiCad | Larger-wins for implicit values, board minimum as absolute floor, plus priority-ordered custom rules (last matching rule wins) | Yes, above the floor, via custom rules |
| Altium | Pure priority-ordered first-match; one rule wins | Yes — a specific-scope rule may be *less* strict |

A pure tighten-only model cannot express the BGA-fanout relaxation that Altium's own documentation
uses as its worked example. That is why the hardening program's scoped rule engine explicitly
allows relaxation above a board-minimum floor (§6.1).

## 5.4 Scaling arithmetic

There is no R-tree, quadtree or grid in the DRC path (grep-verified at audit time; P4 adds one).
Clearance is six pair loops — T²/2, T·P, T·V, V²/2, P²/2, P·V — behind a linear AABB gap
prefilter which is itself O(n²). The exact kernel `polylineToPolylineClosestPoints` is
O(segA · segB), which is a 25–400× multiplier on close 45°-routed pairs. `HOLE_TO_HOLE` has no
prefilter at all. Board checks are O(primitives × outline vertices) and re-flatten the outline per
sampled point (B4-7).

| Copper primitives | Pair visits | Wall time | Verdict |
|---|---|---|---|
| 1k | ~5 × 10⁵ | Tens of ms | Fine |
| 10k | ~5 × 10⁷ | 0.5–5 s | Batch-tolerable, event-loop-hostile (B5-SYNC) |
| 100k | ~5 × 10⁹ | Minutes | Unusable |

Concrete thresholds: **batch becomes interactive-hostile at roughly 5–10k primitives**; the **live
path degrades at roughly 1–2k pads**, an order of magnitude sooner, because of B5-LIVE-PADGEOMS.
For contrast, KiCad's `DRC_RTREE` gives approximately O(n log n) queries.

The conclusion the audit reached and that still holds: this is a scaling problem, not a
correctness problem. A spatial index is a prerequisite for large boards, not for correct results.

## 5.5 Live-versus-batch divergence inventory

This inventory *is* P7's acceptance criteria. Live DRC implements only trace-to-trace (with
correct edge maths) and trace-to-pad. Everything else is batch-only. The user-facing pattern is
**live-clean, commit, batch-error**.

| Aspect | Batch | Live |
|---|---|---|
| Short tier | Yes | Absent |
| FAB tier | Yes | Absent |
| Vias | Checked | Never checked — a via placed mid-route gets zero live checking |
| Board edge / off-board / width / manufacturability | Yes | Absent |
| Pad geometry | Exact rotated polygon (`padOutlineWorldMm`) | Unrotated AABB (B5-LIVE-ROT-PAD) |
| THT pad layers | All copper layers | Placement side only (B5-LIVE-TH-PAD-SIDE) |
| Neighbour net class | Resolved | Ignored |
| Reported number | Edge gap vs rule | Centreline distance vs required + half-widths |
| Tests | Extensive | **Zero** |

P7's parity gate is `|measured_live − measured_batch| ≤ 1e-9`, achieved by making both paths call
the same item builders and clearance kernels rather than by fixing the live path in place.

## 5.6 Waiver semantics and drift

Waivers are id-based and persisted per design in `viewState`, alongside whole-rule-class ignores.
This matches KiCad's behaviour of remembering excluded violations between runs, and is coarser
than KiCad's per-check severity remapping.

**The drift mechanism.** A violation id hashes the rule code and the anchors — *not* the location
and *not* the measured value. Two consequences follow directly:

1. A waiver granted against a marginal 0.24 mm gap keeps suppressing that same pair as the
   geometry degrades. Demonstrated at 24× degradation: the pair reached 0.01 mm and stayed
   silent.
2. Two distinct hotspots between the same pair of objects collapse to one id. Only the first is
   reported, and waiving it hides both.

Violation-id v2 (§6.3) mitigates this with a 0.1 mm location bucket, but the reasoning above is
why the bucket exists and why it is applied to pairwise codes only.

## 5.7 JLCPCB threshold conflict and its resolution rule

Three sources in the repository gave three different sets of JLCPCB thresholds. The live
capabilities page was fetched three times and was consistent.

| Parameter | Code (`fab-presets.ts`) | Research doc §7 | `eda-standards` skill | JLCPCB live, 2026-07 |
|---|---|---|---|---|
| 2L trace / space | 0.127 | 0.127 | 0.127 | **0.10 / 0.10 mm** |
| ML trace / space | 0.0889 | 0.09 | — | **0.09 / 0.09 mm** |
| Min mechanical drill | 0.3 (2L) / 0.2 (4L) | 0.15 | 0.3 | **0.15 mm (both)** |
| Min via diameter | 0.6 (2L) / 0.45 (4L) | 0.25 | 0.56 | **0.25 mm** (hole 0.15, both) |
| Via annular per side | 0.15 (all presets) | — | 0.13 | **0.05 min / 0.075 recommended** |
| Hole-to-hole | rule default 0.25 | — | — | **via 0.2 / PTH 0.45** |
| Board edge | rule default 0.5 | — | 0.3 | **routed ≥0.2 / V-cut ≥0.4** |
| Mask dam | — | ≥0.2 | 0.1 | **0.10 (1 oz) / 0.20 (2 oz)** |
| Silk min line | — | 0.15 | 0.15 | **0.15 mm** |
| Max layers | — | 1–20 | — | **1–32** |
| Aspect ratio | 10 | — | — | **≤10:1 (through-hole)** |

**Resolution rule: treat the live capabilities page as the only threshold source of truth.**

All of the code's drift was in the over-warning (safe) direction except two cases: the annular-ring
row applied the ML PTH *component-hole* value (0.15; 2L is actually 0.18) to **vias**, whose
requirement is 0.05 per side — over-warning on legal vias while under-checking 2L PTH; and the 4L
preset's own minimum-compliant via always self-flagged.

**Still unfixed:** the `eda-standards` skill's JLCPCB preset (drill 0.3, via 0.56, annular 0.13)
matches neither the live page nor the research doc. The fab profile in code was refreshed
(§6.4); the skill was not.

## 5.8 Constraint gap map

Scored against a 16-item constraint taxonomy: **7 implemented, 1 partial, 8 missing** at audit
time.

| # | Constraint | Status at audit |
|---|---|---|
| 1 | Min trace width | Implemented |
| 2 | Min clearance | Implemented |
| 3 | Min annular ring | Implemented (nominal model) |
| 4 | Min drill / via size | Implemented |
| 5 | Board-edge clearance | Implemented (warning severity; holes not covered) |
| 6 | Copper-to-edge / silkscreen-on-pad | **Partial** — copper-to-edge yes, silkscreen checks entirely absent |
| 7 | Trace width vs current (IPC-2152) | Missing |
| 8 | Acid trap / acute angle | Missing |
| 9 | Sliver / min feature | Missing |
| 10 | Isolated copper island | Implemented (board-wide fills only) |
| 11 | Teardrop presence (Class 3) | Missing |
| 12 | HV clearance / creepage by voltage | Missing |
| 13 | Diff-pair gap and skew | Missing |
| 14 | Single-ended / differential impedance | Missing |
| 15 | Reference-plane gap crossing | Missing |
| 16 | Aspect ratio | Implemented (blind-via model wrong — B2-7) |

**Two corrections to the taxonomy itself**, which is otherwise the planning input everyone reaches
for:

- **#12 creepage is understated.** The taxonomy frames it as a later-phase concern. It is now a
  first-class native check in **both** KiCad 9 and Altium. Its priority should be raised, not
  deferred. (P10 subsequently implemented it.)
- **#15 reference-plane gap crossing is overstated.** It is not a mainstream DRC check. KiCad 9
  has no native equivalent; only Altium's Return Path rule covers it. The taxonomy implies it is
  standard; it is not.

## 5.9 `BOARD_OUTLINE_INVALID` — an anti-regression note

`BOARD_OUTLINE_INVALID` was declared in `sdks/designer/types.ts` and had a label in
`drc-labels.ts`, but for months it was **emitted nowhere**. A full-repo grep found exactly two
hits, both declarations. No outline closure or self-intersection validation existed anywhere, so
degenerate outlines silently produced nonsense edge-clearance results.

P5 resurrected it as `checks/outline.ts` (area, self-intersection, arcs, cutouts).

Record this because the failure mode is recurrent and invisible: a declared rule code with a
label and no emit site looks implemented from every direction except a grep for its emit. When
adding a code, add the emit and a test in the same change.

---

# 6. Reference — binding decisions and specifications

These are the specifications the hardening program locked in. They were recorded only in the plan
document, which has been retired; an implementer needs them.

## 6.1 Binding decisions

Approved and binding:

- **Full scope**: core plus DFM plus electrical plus signal-integrity checks.
- **Scoped priority rules**: first-match, **can relax**, with a board-minimum absolute floor.
- **Full multilayer 2–32** copper layers.
- **Breaking changes allowed with migration** — specifically violation-id v2, KiCad-aligned
  severities, and live net-class resolution.

## 6.2 Rule model

```
PcbDrcRule {
  id, name, enabled, priority,
  scopes[]      // net | netClass | layer | area | pairKind, combined with AND
  constraint,   // clearance | trackWidth | viaDiameter | viaDrill
                // | annularRing | holeToHole | edgeClearance
  severity?,
  comment?
}
```

Stored on `PcbBoardSettings.drcRules`, persisted through an extended `pcb_set_design_rules`.

**Resolution order:**

1. Explicit tier — priority-descending first match. **May relax.** An `area` scope requires
   **both** items to be inside the area.
2. Implicit tier — `max(boardRule, classA, classB)`, byte-identical to pre-rule behaviour.
3. Absolute floor — `minimums.clearanceMm` (0.1 mm on new boards, 0 when absent).

**Constraints:**

- Scalar constraints are **tighten-only**; only clearance may relax.
- Area scopes use a per-item bitmask, capping area rules at **32**. Rules beyond the cap are
  dropped rather than silently becoming global.
- Resolution is memoized on `(pairKind, layer, netA, netB)`.

**Known limitation, documented not silent:** scalar scoped constraints (`trackWidth`,
`viaDiameter`, `viaDrill`, `annularRing`, `holeToHole`, `edgeClearance`) are persisted and
validated but **not enforced** — v1 rule enforcement is clearance-only. Enforcing them means
wiring the resolver into the manufacturability and board checks. Related deferrals: area-scope
relaxation tests each item's representative midpoint rather than its exact closest-approach point
(conservative, but can over-relax a long trace whose offending point lies outside the area);
scoped-rule optional `severity` is not applied; v1-to-v2 waiver auto-migration is not wired;
cutout-overlap uses vertex containment, so perpendicular crossing rectangles are missed.

## 6.3 Violation id v2

```
${code}-v2-${fnv1a64("v2|code#sortedAnchors#L:layer#Q:qx,qy")}
```

| Element | Rule |
|---|---|
| Location bucket `Q:qx,qy` | **0.1 mm**, applied to pair / short / fab / hole codes **only** — never to `UNCONNECTED_NET` or `ISOLATED_COPPER_ISLAND` |
| Layer `L:` | Hashed whenever set (this is what fixes cross-layer island id collisions) |
| `measuredMm` | **Never** hashed |

The engine splits into `computeDrcViolationDrafts` and `finalizeDrcReport`. Waivers live at
`viewState.drcWaivers: { id, comment?, waivedAt }[]`, with a one-shot v1-to-v2 remap through
`store.patchPcbViewState` that does not bump the design revision.

## 6.4 Severity model

An exhaustive `DEFAULT_SEVERITY_BY_CODE` map lives in `drc/severity.ts`. Overrides
(`DrcSeverityOverrides`) live on **board settings**, not on `viewState`.

**Precedence: override → rule severity → default.**

| Decision | Value |
|---|---|
| `NET_SHORT_CIRCUIT` override | **Ignored** — cannot be downgraded |
| `COPPER_TO_BOARD_EDGE` | Promoted to error (was hardcoded warning) |
| `UNCONNECTED_NET` | Promoted to error (KiCad alignment) |
| Non-waivable set (`waivable: false`) | Shorts and layer-invalid codes: `NET_SHORT_CIRCUIT`, `VIA_LAYER_SPAN`, `PAD_LAYER_MISMATCH` |
| `ignoredRuleClasses` | Retained |

Non-waivable codes survive both a class-level ignore and a per-code `"ignore"` override.

## 6.5 Fab profile — JLCPCB live capabilities, 2026-07

Typed and zod-validated in `src/shared/pcb/fab-profiles.ts`. `customFabProfile` on board settings
overrides. `DrcHole.kind` is `via | pth | npth` so per-hole fab checks can select the right row.

| Parameter | Value |
|---|---|
| Via min diameter | 0.25 mm |
| Via min annular per side | 0.05 mm (0.075 mm recommended) |
| PTH annular per side | 0.18 mm (2 layer) / 0.15 mm (multilayer) |
| Hole-to-hole, via to via | 0.2 mm |
| Hole-to-hole, PTH to PTH | 0.45 mm |
| Board edge, routed | 0.2 mm |
| Board edge, V-cut | 0.4 mm |
| Mask dam | 0.10 mm |
| Trace / space | 0.10 mm (2 layer) / 0.09 mm (multilayer) |
| Min drill | 0.15 mm |
| Aspect ratio | ≤10:1, through-hole |

PCBWay values were deferred to a re-fetch at implementation time and are not recorded here.

## 6.6 Electrical constants

IPC-2221 Table 6-1, columns B1 and B2, sourced at implementation time. Current-versus-width uses
the IPC-2221 formulation:

| Constant | Value |
|---|---|
| `k`, external layer | 0.048 |
| `k`, internal layer | 0.024 |
| `b` | 0.44 |
| `c` | 0.725 |
| `designRules.electrical.tempRiseC` | 10 |
| `designRules.electrical.copperWeightOz` | 1 |

Nets carrying no voltage are treated as 0 V. Creepage seeds from HV pads and vias as well as
traces, uses `|ΔV|` so negative rails behave, applies a per-pair-kind base clearance, and does not
double-emit on HV-to-HV pairs.

## 6.7 Signal-integrity thresholds

| Threshold | Value |
|---|---|
| Diff-pair near-parallel gate | < 15° |
| Uncoupled length | 15 mm |
| Skew | 0.5 mm |

Pair naming convention: `_P` / `_N` suffixes and trailing `+` / `-`. An explicit
`PcbBoardSettings.diffPairs` table **wins over inference**.

This design **explicitly rejects** the LLM-based and `signalType`-based inference proposed in
`TODO-signal-aware-routing.md`. Auto-detected pair order is deterministically sorted, duplicate
explicit pairs are deduped, negative thresholds are clamped, and the coupling angle calculation
handles wrap-around so anti-parallel segments and ±179° are not misclassified.

Length matching shipped separately and in-flight as `checks/length.ts`
(`NET_LENGTH_OUT_OF_RANGE`, `PcbBoardSettings.lengthMatchGroups`, behind the `pcb.lengthTuning`
flag) and was adopted as-is; diff-pair skew reconciles against its `lengthByNet`.

## 6.8 DFM parameters

| Parameter | Value |
|---|---|
| Courtyard fallback when none authored | Footprint bbox + **0.25 mm** |
| `designRules.silkscreen.silkToMaskClearanceMm` | 0 |
| `designRules.silkscreen.silkToBoardEdgeMm` | 0.15 |
| `sliverWidthMm` | 0.1 |
| `clearance.holeToBoardEdgeMm` | 0.3 |
| Acute-angle threshold | < 90° |

**Parity requirement:** silk strokes and mask apertures consumed by DFM checks must be built at
**Gerber parity** — the same geometry the Gerber writer emits, from the writer's own stroke and
aperture paths. A check that models silk differently from the exported artwork will disagree with
the fab.

Copper sliver and connection-width checks run a Clipper opening over memoized pour paths, cover
pours only in v1, and exempt hatched fills.

## 6.9 Via-span topology

Enforced at DRC by `isValidViaSpan`; `VIA_LAYER_SPAN` fires on any violation.

| Via type | Valid span |
|---|---|
| Through | Front to back (outer to outer) |
| Blind | Exactly one outer layer |
| Buried | No outer layer |
| Microvia | One adjacent layer step |

Explicitly flagged: a blind via spanning both outers, a reversed span, and a non-adjacent
microvia.

Note the interaction that made this urgent: a layer-invalid via used to escape trace-to-via,
via-to-via, pad-to-via **and the short tier**, leaving only a single waivable `VIA_LAYER_SPAN`
error. Waive that one violation and you ship a dead short. Layer-invalid items are now
clamp-checked against all valid layers, and the span code is non-waivable.

## 6.10 Cloud contract boundary

The desktop engine supports 2–32 copper layers. The cloud snapshot contract does not follow it:

- The snapshot builder **strips** `voltageV`, `currentA` and `diffPairGapMm` before sending.
- `SnapshotCopperLayerId` pins snapshot copper layers to **2 or 4**.

So cloud-side DRC cannot reproduce electrical or SI results, and cannot represent a 6+ layer
board. This is a deliberate contract boundary, not an oversight — but any feature that assumes
cloud and desktop DRC agree needs to account for it.
