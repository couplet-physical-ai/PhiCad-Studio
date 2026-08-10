// Compile-only guard that the desktop's `BoardSnapshot` wire contract IS the generated
// mirror of the service schema — not a hand-written copy that resembles it.
//
// History: this file used to type-check a hand-written `BoardSnapshot` (./autoroute.ts)
// against the schema-generated one, tolerating a documented list of KNOWN GAPS — fields
// the schema defined that the desktop had never mirrored (`constraintGroups`, the
// placement metadata block, subset placement, 9 of 15 place weights). That list only ever
// grew: every service release added shapes the desktop had to re-type by hand.
//
// ./autoroute.ts now ALIASES the generated types, so structural drift is impossible by
// construction and the gap list is gone. What remains worth pinning is that fact: if
// anyone reintroduces a hand-written mirror under one of these names, `Equal<...>` goes
// `false` and `tsc -b` (`npm run typecheck`) fails.
//
// Nothing here executes.

import type {
  BoardSnapshot as SdkBoardSnapshot,
  BoardGeometry as SdkBoardGeometry,
  ExistingTrace as SdkExistingTrace,
  FreeHole as SdkFreeHole,
  PadOutline as SdkPadOutline,
  PlaceOptions as SdkPlaceOptions,
  PlaceWeights as SdkPlaceWeights,
  PourIsland as SdkPourIsland,
  RatsnestTarget as SdkRatsnestTarget,
  RouteOptions as SdkRouteOptions,
  SnapshotDesignRules as SdkDesignRules,
  SnapshotNetClass as SdkNetClass,
  SnapshotPlacement as SdkPlacement,
  Stackup as SdkStackup,
  ViaObstacle as SdkViaObstacle,
} from "./autoroute";
import type * as Gen from "./board-snapshot.generated";

type Equal<A, B> = (<T>() => T extends A ? 1 : 0) extends <T>() => T extends B ? 1 : 0
  ? true
  : false;
type Expect<T extends true> = T;

type _snapshot = Expect<Equal<SdkBoardSnapshot, Gen.BoardSnapshot>>;
type _board = Expect<Equal<SdkBoardGeometry, Gen.BoardGeometry>>;
type _stackup = Expect<Equal<SdkStackup, Gen.Stackup>>;
type _designRules = Expect<Equal<SdkDesignRules, Gen.DesignRules>>;
type _netClass = Expect<Equal<SdkNetClass, Gen.NetClass>>;
type _placement = Expect<Equal<SdkPlacement, Gen.Placement>>;
type _padOutline = Expect<Equal<SdkPadOutline, Gen.PadOutline>>;
type _via = Expect<Equal<SdkViaObstacle, Gen.ViaObstacle>>;
type _trace = Expect<Equal<SdkExistingTrace, Gen.ExistingTrace>>;
type _pour = Expect<Equal<SdkPourIsland, Gen.PourIsland>>;
type _freeHole = Expect<Equal<SdkFreeHole, Gen.FreeHole>>;
type _ratsnest = Expect<Equal<SdkRatsnestTarget, Gen.RatsnestTarget>>;
type _routeOptions = Expect<Equal<SdkRouteOptions, Gen.RouteOptions>>;
type _placeOptions = Expect<Equal<SdkPlaceOptions, Gen.PlaceOptions>>;
type _placeWeights = Expect<Equal<SdkPlaceWeights, Gen.PlaceWeights>>;

// The three metadata fields the desktop producer now has a path for (courtyardPolygon,
// connectorEdge, mountType) and the two the service still lists as reserved (heightMm,
// watts) are all part of `Gen.Placement` above — no separate gap tracking needed.
export type {};
