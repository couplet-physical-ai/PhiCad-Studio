// GENERATED FILE — DO NOT EDIT.
//
// Source: src/sdks/designer/contracts/BoardSnapshot.schema.json (vendored from
// cloud-auto-layout's `contracts/BoardSnapshot.schema.json` — see that dir's
// README.md for provenance + sync instructions).
//
// Regenerate with `bun scripts/gen-contract-types.ts` (or `npm run gen:contracts`)
// after re-vendoring the schema. `npm run gen:contracts -- --check` fails CI on drift.
//
// These interfaces are the schema-literal mirror, generated independently of
// the hand-written wire types in ./autoroute.ts — names intentionally collide
// with those (e.g. `Placement`, `Stackup`) since both describe the same
// service contract, so this module is NOT re-exported from ./index.ts. Compare
// the two via ./board-snapshot.assert.ts, importing this file under a namespace.

export interface BoardGeometry {
  outline: PointMm[][];
  cutouts?: PointMm[][];
  copperToEdgeMm: number;
}

export interface ClearanceRules {
  traceToTraceMm: number;
  traceToPadMm: number;
  padToPadMm: number;
  traceToViaMm: number;
  viaToViaMm: number;
  copperToBoardEdgeMm: number;
}

/**
 * A relational/electrical placement constraint (0D). All cost terms it drives default to
 * weight 0 and the engine only activates a positive default when the matching group is present
 * (see ``app/place/engine.py::_weights``) — so a snapshot without ``constraintGroups`` is
 * unaffected.
 * 
 * * ``decap`` — ``members`` are decoupling caps, ``anchorId`` their host IC (cap → IC proximity).
 * * ``crystal`` — ``members`` are the crystal(s), ``anchorId`` the MCU (crystal → MCU proximity).
 * * ``diff_pair`` — ``members`` are the two components carrying the P/N nets (symmetry/proximity).
 * * ``matched`` — components to co-locate / keep symmetric (e.g. matched passives); inferred from
 *   refdes/net-name is FORBIDDEN — matched groups exist ONLY when explicitly supplied here.
 * * ``room`` — a named placement region (reserved; not yet consumed by a cost term).
 * 
 * ``netId``/``padNumber`` are optional power-pin targeting hints (e.g. the IC's VCC pad a decap
 * should hug); v1 targets component origins and treats them as advisory.
 */
export interface ConstraintGroup {
  kind: "decap" | "crystal" | "diff_pair" | "matched" | "room";
  members: string[];
  anchorId?: string | null;
  netId?: string | null;
  padNumber?: string | null;
}

export interface DesignRules {
  clearance: ClearanceRules;
  minimums: MinimumRules;
  fabPresetId?: "jlcpcb_2l" | "jlcpcb_4l" | "pcbway_std" | "pcbway_advanced" | "custom";
}

export interface ExistingTrace {
  id: string;
  netId: string | null;
  netClassId: string;
  layer: "F.Cu" | "In1.Cu" | "In2.Cu" | "B.Cu";
  widthMm: number;
  pointsNm: PointNm[];
  segmentMode: "manhattan-90" | "manhattan-45";
}

export interface FreeHole {
  id: string;
  centerMm: PointMm;
  drillMm: number;
}

export interface MinimumRules {
  traceWidthMm: number;
  drillSizeMm: number;
  annularRingMm: number;
  viaDiameterMm: number;
  viaDrillMm: number;
  holeToHoleMm?: number | null;
}

export interface NetClass {
  id: string;
  name: string;
  traceWidthMm: number;
  clearanceMm: number;
  viaDiameterMm: number;
  viaDrillMm: number;
  color: string;
  defaultViaProtection: "none" | "tented" | "plugged" | "filled" | "capped";
}

/**
 * Pre-polygonized pad copper, one row per spanned copper layer.
 */
export interface PadOutline {
  placementId: string;
  padNumber: string;
  netId: string | null;
  layer: "F.Cu" | "In1.Cu" | "In2.Cu" | "B.Cu";
  ring: PointMm[];
  isConnectable: boolean;
}

export interface PlaceOptions {
  seed?: number;
  restarts?: number | null;
  maxMoves?: number | null;
  mode?: "all" | "subset";
  selectedIds?: string[];
  lockReferences?: string[];
  allowRotate?: boolean;
  allowFlip?: boolean;
  moveConnectors?: boolean;
  respectExistingTraces?: boolean;
  targetUtilization?: number;
  gridSnapMm?: number;
  weights?: PlaceWeights | null;
}

/**
 * Cost-term weights (scale-normalized terms; see ``app/place/cost.py``).
 */
export interface PlaceWeights {
  hpwl?: number;
  spread?: number;
  overlap?: number;
  edge?: number;
  connector?: number;
  displacement?: number;
  congestion?: number;
  decap?: number;
  crystal?: number;
  thermal?: number;
  align?: number;
  sym?: number;
  zone?: number;
  orient?: number;
  side?: number;
}

/**
 * A component instance to (potentially) place. The base fields (id/reference/layer) are
 * all the autorouter consumes; the rest are the auto-place EXTENSION (optional-with-fallback)
 * so the engine can seed + diff + emit faithful commands. The router ignores them.
 */
export interface Placement {
  id: string;
  reference: string;
  layer: "F.Cu" | "In1.Cu" | "In2.Cu" | "B.Cu";
  positionMm?: PointMm | null;
  rotationDeg?: number;
  mirrored?: boolean;
  mountType?: "smd" | "tht" | null;
  heightMm?: number | null;
  watts?: number | null;
  courtyardPolygon?: PointMm[] | null;
  connectorEdge?: "left" | "right" | "top" | "bottom" | null;
}

export interface PointMm {
  x: number;
  y: number;
}

export interface PointNm {
  x: number;
  y: number;
}

/**
 * One ZoneFiller copper-fill island. Same ``pourNetId`` as the routed net →
 * a connection target (via/stub into the correct island closes the ratsnest);
 * otherwise an inflated obstacle.
 */
export interface PourIsland {
  islandId: string;
  layer: "F.Cu" | "In1.Cu" | "In2.Cu" | "B.Cu";
  pourNetId: string | null;
  rings: PointMm[][];
}

/**
 * An unrouted pad-pair to connect (mirrors TS ``RatsnestSegment``).
 */
export interface RatsnestTarget {
  netId: string;
  netClassId: string;
  fromMm: PointMm;
  toMm: PointMm;
  fromPlacementId: string;
  fromPadNumber: string;
  toPlacementId: string;
  toPadNumber: string;
}

export interface RouteOptions {
  seed?: number;
  geometryMode?: "manhattan-90" | "manhattan-45";
  allowVias?: boolean;
  maxViasPerNet?: number | null;
  layerPolicy?: "auto" | Record<string, "h" | "v" | "any">;
  epsilonNm?: number | null;
  maxExpansions?: number | null;
  maxRipupPasses?: number | null;
  maxShoveNodes?: number | null;
  maxShoveDepthTraces?: number;
  maxShoveDepthVias?: number;
  netOrder?: string[] | null;
  progressEveryNNets?: number;
  portfolio?: number;
  budgetMode?: "legacy" | "job" | null;
  jobBudget?: number | null;
}

export interface Stackup {
  layerCount: 2 | 4;
  copperLayers: ("F.Cu" | "In1.Cu" | "In2.Cu" | "B.Cu")[];
  boardThicknessMm?: number;
}

/**
 * An existing via or a drilled hole.
 */
export interface ViaObstacle {
  id: string;
  netId: string | null;
  centerMm: PointMm;
  diameterMm: number;
  drillMm: number;
  fromLayer: "F.Cu" | "In1.Cu" | "In2.Cu" | "B.Cu";
  toLayer: "F.Cu" | "In1.Cu" | "In2.Cu" | "B.Cu";
  isHoleOnly?: boolean;
}

export interface BoardSnapshot {
  schemaVersion?: string;
  designId: string;
  baseRevision?: number | null;
  sessionId?: string | null;
  board: BoardGeometry;
  stackup: Stackup;
  designRules: DesignRules;
  netClasses?: NetClass[];
  netAssignments?: Record<string, string>;
  routableNetClassIds?: string[];
  excludedNetIds?: string[];
  placements?: Placement[];
  padOutlines?: PadOutline[];
  vias?: ViaObstacle[];
  traces?: ExistingTrace[];
  pours?: PourIsland[];
  freeHoles?: FreeHole[];
  ratsnest?: RatsnestTarget[];
  netNames?: Record<string, string>;
  options?: RouteOptions;
  constraintGroups?: ConstraintGroup[];
  placeOptions?: PlaceOptions;
}
