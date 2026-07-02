// Compile-only type-level drift check: the hand-written `BoardSnapshot` wire
// contract (./autoroute.ts, what the desktop actually serializes) against the
// schema-generated mirror (./board-snapshot.generated.ts, derived straight
// from the service's Pydantic models — see that file's header + this repo's
// `contracts/README.md` for provenance). Nothing here executes; `tsc -b`
// (`npm run typecheck`) is the gate — a broken `Expect<...>` fails the build.
//
// Two check tiers, used per field/type depending on what's actually true:
//
//   EXACT       `Expect<Equal<Hand, Gen>>` — the two types must be identical.
//   COMPATIBLE  `Expect<Assignable<Hand, Gen>>` (one-directional: Hand must
//               be assignable to Gen) — used where the hand mirror is
//               DELIBERATELY stricter than the schema (e.g. the producer
//               always emits an array the schema marks optional-with-default
//               `[]`, or always sets a field the schema allows to be
//               null/absent). Still fails if Hand drifts to something Gen no
//               longer accepts.
//
// KNOWN GAPS (fields the schema defines that the desktop producer does not
// yet emit) are called out explicitly below with `AbsentKeys<...>` — a check
// that FAILS if the field is ever silently added to the hand type without
// updating this file, and FAILS if it's silently removed from the gap list
// while still absent from Hand. Nothing here is swallowed silently.

import type {
  BoardSnapshot as HandBoardSnapshot,
  BoardGeometry as HandBoardGeometry,
  Stackup as HandStackup,
  SnapshotDesignRules as HandDesignRules,
  SnapshotNetClass as HandNetClass,
  SnapshotPlacement as HandPlacement,
  PadOutline as HandPadOutline,
  ViaObstacle as HandViaObstacle,
  ExistingTrace as HandExistingTrace,
  PourIsland as HandPourIsland,
  FreeHole as HandFreeHole,
  RatsnestTarget as HandRatsnestTarget,
  RouteOptions as HandRouteOptions,
  PlaceOptions as HandPlaceOptions,
  PlaceWeights as HandPlaceWeights,
} from "./autoroute";
import type * as Gen from "./board-snapshot.generated";

// ── generic helpers ───────────────────────────────────────────────────────

type Equal<A, B> = (<T>() => T extends A ? 1 : 0) extends <T>() => T extends B ? 1 : 0
  ? true
  : false;
type Expect<T extends true> = T;
/** One-directional: every value of A must be assignable where B is expected. */
type Assignable<A, B> = A extends B ? true : false;
/** True iff none of the (dotted) keys K exist on T — a "known gap" guard. */
type AbsentKeys<T, K extends string> = K extends keyof T ? false : true;

// ── nested shape checks ───────────────────────────────────────────────────

// EXACT: identical field sets/types on both sides.
type _board = Expect<Equal<HandBoardGeometry, Gen.BoardGeometry>>;
type _stackup = Expect<Equal<HandStackup, Gen.Stackup>>;
type _netClassElement = Expect<Equal<HandNetClass, Gen.NetClass>>;
type _padOutline = Expect<Equal<HandPadOutline, Gen.PadOutline>>;
type _trace = Expect<Equal<HandExistingTrace, Gen.ExistingTrace>>;
type _pour = Expect<Equal<HandPourIsland, Gen.PourIsland>>;
type _freeHole = Expect<Equal<HandFreeHole, Gen.FreeHole>>;
type _ratsnest = Expect<Equal<HandRatsnestTarget, Gen.RatsnestTarget>>;
type _routeOptions = Expect<Equal<HandRouteOptions, Gen.RouteOptions>>;

// COMPATIBLE: `designRules.minimums.holeToHoleMm` is `number | undefined` on
// the hand side (never explicitly nulled) vs `number | null | undefined` on
// the schema side; `fabPresetId` is required (hand, always set from
// `board.fabricator`) vs optional-with-default (schema). Both are the
// producer being stricter than the schema allows, which is safe.
type _designRules = Expect<Assignable<HandDesignRules, Gen.DesignRules>>;

// COMPATIBLE: `isHoleOnly` is required on the hand side (always emitted,
// see board-snapshot.ts's vias mapping) vs optional-with-default `false` on
// the schema side.
type _via = Expect<Assignable<HandViaObstacle, Gen.ViaObstacle>>;

// KNOWN GAP: place-engine metadata the desktop projection doesn't source
// yet — component height (`heightMm`), power draw (`watts`), the
// convex-SAT courtyard polygon (`courtyardPolygon`), and connector-edge
// classification (`connectorEdge`). All are metadata-gated / 0-weighted by
// default on the service side (PLACE_RESERVED), so their absence is inert,
// not a correctness bug — but it IS a real feature gap (Waves 1-10 courtyard
// + connector-edge cost terms can't activate without them). Tracked, not a
// Phase 2 WP4/5 task.
type _placementGapKeysAbsent = Expect<
  AbsentKeys<HandPlacement, "heightMm" | "watts" | "courtyardPolygon" | "connectorEdge">
>;
// COMPATIBLE (on top of the known-gap Omit): `positionMm`/`rotationDeg`/`mirrored` are
// required + non-null on the hand side (buildBoardSnapshot always populates them from the
// live projection) vs optional+nullable on the schema side (the service tolerates an
// autorouter-only submit with no placement transform); `mountType` differs by the same
// optional-vs-optional-nullable pattern as elsewhere in this file.
type _placement = Expect<
  Assignable<
    HandPlacement,
    Omit<Gen.Placement, "heightMm" | "watts" | "courtyardPolygon" | "connectorEdge">
  >
>;

// KNOWN GAP: `PlaceOptions.mode` on the hand side is narrower ("all" only —
// no "subset" minimal-displacement re-placement UI yet) and `selectedIds`
// (the subset-mode target list) is entirely absent. `PlaceWeights` on the
// hand side exposes only 6 of the service's 15 cost-term knobs — the other 9
// (displacement, congestion, decap, crystal, thermal, align, sym, zone,
// orient) are all opt-in / 0-weighted-by-default service-side terms with no
// desktop UI yet. None of this blocks routing/placement (defaults are inert)
// but it IS real, tracked follow-up work — not a Phase 2 WP4/5 task.
type _placeOptionsSelectedIdsAbsent = Expect<AbsentKeys<HandPlaceOptions, "selectedIds">>;
type _placeWeightsGapKeysAbsent = Expect<
  AbsentKeys<
    HandPlaceWeights,
    | "displacement"
    | "congestion"
    | "decap"
    | "crystal"
    | "thermal"
    | "align"
    | "sym"
    | "zone"
    | "orient"
  >
>;
type _placeOptionsModeIsSubsetOfGen = Expect<
  Assignable<HandPlaceOptions["mode"], Gen.PlaceOptions["mode"]>
>;
type _placeOptions = Expect<Assignable<HandPlaceOptions, Gen.PlaceOptions>>;

// KNOWN GAP: `constraintGroups` (decap/crystal/diff_pair/matched/room
// placement hints) isn't sourced anywhere in the desktop projection — no
// current UI/data path mints them. Defaults to `[]` service-side (inert).
type _constraintGroupsAbsent = Expect<AbsentKeys<HandBoardSnapshot, "constraintGroups">>;

// ── top-level BoardSnapshot, field by field ──────────────────────────────
// EXACT unless noted. Three fields (`netClasses`, `routableNetClassIds`,
// `ratsnest`) are REQUIRED on the hand side but optional-with-default `[]`
// on the schema side — buildBoardSnapshot always populates them, so the hand
// mirror is intentionally stricter; checked one-directionally.

type _f_schemaVersion = Expect<
  Equal<HandBoardSnapshot["schemaVersion"], Gen.BoardSnapshot["schemaVersion"]>
>;
type _f_designId = Expect<Equal<HandBoardSnapshot["designId"], Gen.BoardSnapshot["designId"]>>;
type _f_baseRevision = Expect<
  Equal<HandBoardSnapshot["baseRevision"], Gen.BoardSnapshot["baseRevision"]>
>;
type _f_sessionId = Expect<
  Equal<HandBoardSnapshot["sessionId"], Gen.BoardSnapshot["sessionId"]>
>;
type _f_board = Expect<Equal<HandBoardSnapshot["board"], Gen.BoardSnapshot["board"]>>;
type _f_stackup = Expect<Equal<HandBoardSnapshot["stackup"], Gen.BoardSnapshot["stackup"]>>;
type _f_designRules = Expect<
  Assignable<HandBoardSnapshot["designRules"], Gen.BoardSnapshot["designRules"]>
>;
type _f_netClasses = Expect<
  Assignable<HandBoardSnapshot["netClasses"], Gen.BoardSnapshot["netClasses"]>
>;
type _f_netAssignments = Expect<
  Equal<HandBoardSnapshot["netAssignments"], Gen.BoardSnapshot["netAssignments"]>
>;
type _f_routableNetClassIds = Expect<
  Assignable<HandBoardSnapshot["routableNetClassIds"], Gen.BoardSnapshot["routableNetClassIds"]>
>;
type _f_excludedNetIds = Expect<
  Equal<HandBoardSnapshot["excludedNetIds"], Gen.BoardSnapshot["excludedNetIds"]>
>;
// COMPATIBLE — see `_placement` above for the per-element rationale.
type _f_placements = Expect<
  Assignable<
    HandBoardSnapshot["placements"],
    | Omit<Gen.Placement, "heightMm" | "watts" | "courtyardPolygon" | "connectorEdge">[]
    | undefined
  >
>;
type _f_padOutlines = Expect<
  Equal<HandBoardSnapshot["padOutlines"], Gen.BoardSnapshot["padOutlines"]>
>;
type _f_vias = Expect<Assignable<HandBoardSnapshot["vias"], Gen.BoardSnapshot["vias"]>>;
type _f_traces = Expect<Equal<HandBoardSnapshot["traces"], Gen.BoardSnapshot["traces"]>>;
type _f_pours = Expect<Equal<HandBoardSnapshot["pours"], Gen.BoardSnapshot["pours"]>>;
type _f_freeHoles = Expect<
  Equal<HandBoardSnapshot["freeHoles"], Gen.BoardSnapshot["freeHoles"]>
>;
type _f_ratsnest = Expect<
  Assignable<HandBoardSnapshot["ratsnest"], Gen.BoardSnapshot["ratsnest"]>
>;
type _f_netNames = Expect<Equal<HandBoardSnapshot["netNames"], Gen.BoardSnapshot["netNames"]>>;
type _f_options = Expect<Equal<HandBoardSnapshot["options"], Gen.BoardSnapshot["options"]>>;
type _f_placeOptions = Expect<
  Assignable<HandBoardSnapshot["placeOptions"], Gen.BoardSnapshot["placeOptions"]>
>;
