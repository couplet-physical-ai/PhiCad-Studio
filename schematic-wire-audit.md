# Schematic Wire-Connector Audit

**Date:** 2026-07-05 · **Scope:** schematic-view wires/connectors only (creation, path/waypoint
computation, rendering, overlap handling, re-route on component move, net/junction logic).
**Read-only.** No fixes proposed. PCB routing / PcbCanvas / AutoLayout deliberately excluded.
All line numbers are as-read in the current tree.

---

## 1. File map

| Concern | File | Notes |
| --- | --- | --- |
| Manhattan geometry kernel (path build, sanitize, simplify, repair, projection) | `src/modules/designer/backend/routing/manhattan.ts` | "single source of truth" per its own header (line 3–6) |
| Obstacle-aware auto-router (straight→L→Hanan A*) | `src/modules/designer/backend/routing/schematic-autoroute.ts` | used only when no explicit path given |
| Obstacle collection (parts, wires, primitives, corridor cull) | `src/modules/designer/backend/routing/wire-obstacles.ts` | feeds auto-router |
| Wire create payload build/validate | `src/modules/designer/backend/commands/create-wire.ts` | |
| Move re-route + vertex insert + points parse | `src/modules/designer/backend/wire-geometry.ts` | |
| Command handlers (`create_wire`, `create_wire_junction`, `move_part`) | `src/modules/designer/backend/command-executor.ts` | |
| Net + junction derivation (union-find) | `src/modules/designer/backend/projection-world.ts` | `deriveNetsAndJunctions` L503–705 |
| HTTP command parse | `src/modules/designer/backend/routes.ts` | L1100–1146 |
| Interactive draw, hit-test, session, render | `src/modules/designer/frontend/components/SchematicCanvas.tsx` | 2806 lines |
| Wire stroke rendering (LineSegments2) | `SchematicCanvas.tsx` `WireLayer` L534–616 | |
| Wire inspector panel (length/segments/net) | `src/modules/designer/frontend/components/SelectionInspector/WireInspectorPanel.tsx` | |
| Adjacent: re-route all wires after arrange | `src/modules/designer/backend/layout/arrange-schematic.ts` | shares router — see §6 |

---

## 2. Routing algorithm as implemented

### 2.1 Interactive draw (frontend)
- Wire mode click on a pin starts a `WireSession { sourcePinId, waypointsNm: [] }`
  (`SchematicCanvas.tsx:1852-1857`). Source is a real part pin **or** a synthetic
  primitive pin `primitive:<id>` (pin map built at `1151-1178`).
- Each subsequent empty click **appends the grid-snapped cursor** as a waypoint
  (`1845-1848`). Snap = round to `SCHEMATIC_GRID_NM` (`snapNm` `240-245`, `snap` `790`).
- Live preview polyline is `buildManhattanPathThroughAnchors([source, ...waypoints, snap(cursor)])`
  (`wirePreview` memo `2564-2584`), rendered by a `WireLayer` in preview color (`2901-2903`).
- Commit-to-pin: second click on a different pin → `commitWireToPin` builds
  `buildManhattanPathThroughAnchors([sourceWorld, ...waypoints, targetWorld])` and dispatches
  `create_wire` with that explicit `pointsNm` (`1377-1397`, dispatch `1811`).
- Commit-to-wire (T-tap): click landing on an existing wire (not a pin) →
  `commitWireToWireJunction` builds path to the **projected point** on that wire and dispatches
  `create_wire_junction` (`1399-1417`, dispatch `1824-1843`). Pin hit is tested **before** wire hit
  (`1810` then `1824`), so a pin wins ties.
- **`buildManhattanPathThroughAnchors` is duplicated in the frontend** (`SchematicCanvas.tsx:264-287`,
  with `dedupeConsecutive`/`pointKey` `248-262`) — a second copy of the backend kernel
  (`routing/manhattan.ts:51-64`), despite that file claiming to be the single source of truth.
- **Interactive draw performs no obstacle avoidance.** The diagonal-splitting builder emits a plain
  H-then-V leg per anchor pair (`manhattan.ts:57-61`); components/pins/other wires are not consulted.

### 2.2 Backend `create_wire` (`command-executor.ts:1233-1251`)
- If `pointsNm` present & non-empty → used verbatim (the interactive path); **only** when omitted does
  it call `autoRouteWirePoints(projection, sourcePin, targetPin)` (`1239-1242`). So the auto-router
  runs for programmatic/AI/import callers, **not** for hand-drawn wires.
- `buildCreateWirePayload` (`commands/create-wire.ts:58-94`): rejects self-loop (same pin id, `65-70`)
  and zero-length (same coords, `73-78`); then `normalizePath`.
- `normalizePath` (`create-wire.ts:17-39`): no interior points → single L-bend
  (`[source,{x:target.x,y:source.y},target]`, `23-26`). With interior points it **forces endpoints,
  keeps interior verbatim** if the result is already orthogonal (`31-37`); only genuinely malformed
  paths go through `repairToManhattan` (`38`).
- `validatePath` (`create-wire.ts:41-56`): ≥2 points, no **consecutive** dupes, all segments orthogonal.

### 2.3 Auto-router (`schematic-autoroute.ts:213-244`) — obstacles omitted, when invoked
- Escalation: identical points → trivial; collinear straight if clean (`221-224`); HV L-bend
  (`226-231`); VH L-bend (`233-238`); Hanan-lattice A* (`hananRoute` `81-205`); else **fallback = HV
  L-bend even if it collides** (`243`).
- A* is over the Hanan grid of endpoint + obstacle-edge coordinates, state = (node, incoming-dir),
  bend penalty `BEND_PENALTY_NM = 1mm` (`69`), caps `MAX_LATTICE_LINES=160`/axis (`67`) and
  `MAX_EXPANSIONS=120_000` (`129`); returns `null` past caps → falls back to colliding HV.
- Obstacles (`wire-obstacles.ts`): part pin-bbox inflated `WIRE_OBSTACLE_MARGIN_NM=1.27mm` (`30,65-80`),
  primitive bodies inflated `1.27mm` (`37,91-106`), each existing wire segment as a thin rect inflated
  `WIRE_WIRE_MARGIN_NM=2mm` (`35,108-127`). Endpoint owners excluded (pin-escape) and wires sharing an
  endpoint pin excluded (`154-199`). Everything corridor-culled to source→target bbox +25mm (`32,166-174`).

### 2.4 Re-route on component move (`command-executor.ts:1350-1393` → `wire-geometry.ts:86-126`)
- `move_part`/`rotate_part`/`mirror_part` recompute pin world positions
  (`updatePartPinsAndConnectedWires` `446-488`), then `updateConnectedWireGeometry`.
- For every wire whose source/target pin moved, `rerouteWireWithUpdatedEndpoints`
  (`wire-geometry.ts:71-84`): ≤2 points → fresh L via `buildManhattanPathThroughAnchors([src,tgt])`;
  otherwise **keeps all interior waypoints verbatim** (`points.slice(1,-1)`) and re-Manhattans through
  `[src, ...interior, tgt]` (`81-83`).
- **Move re-route is NOT obstacle-aware** — it uses the plain kernel, not `autoRouteWirePoints`. Only
  the explicit `auto_arrange_schematic` command re-routes with obstacles (§6).

### 2.5 Junction command (`command-executor.ts:1253-1337`)
- Inserts a vertex on the tapped wire at the nearest-segment projection of the click
  (`insertVertexOnWire` `wire-geometry.ts:35-69`, nearest by exact bigint squared distance
  `orthogonalProjection` `manhattan.ts:128-164`), and rewrites that wire with the vertex (`1325-1331`).
- Because a wire must terminate on **two pin ids**, the new branch cannot end at a bare junction point.
  It is built source→junction, then **extended along the tapped wire's shorter half to that wire's
  nearer endpoint pin** (`1300-1319`), reusing `endpointSourcePin`/`endpointTargetPin`. See failure §4.5.

### 2.6 Net & junction derivation (`projection-world.ts:503-705`)
- Union-find keyed by **exact integer-nm coordinate string** `pointKey` (`19-21`).
- Unions: consecutive wire vertices (`543`), wire endpoint↔pin at matching coords (`549-552`),
  same-name primitives globally (GND/rail/portal, case-insensitive) (`561-578`).
- **Junction dot** = a coordinate where ≥3 wire segment-ends ("stubs") coincide
  (`incidentCount` `515,544-545`; filter `698-702`). A corner or straight pass-through (exactly 2 stubs)
  is not a junction; collinear redundant vertices never occur because `simplifyCollinearPath` removes them
  (`manhattan.ts:67-81`, comment `510-514`).
- Every pin folds into a net even if isolated (single-endpoint net kept for coloring, `610-622`);
  connectivity consumers must check endpoint count, not "has a net" (`610-617`).
- Junction dots rendered as 0.1mm circles at each junction (`SchematicCanvas.tsx:2964-2981`).

### 2.7 Rendering (`SchematicCanvas.tsx`)
- Wires bucketed by name-classified net (`default`/`gnd`/`power`, regexes `520-532`) into three
  `WireLayer`s (`2863-2883`), plus highlight layer (`2884-2886`), a 3× semi-transparent selection halo
  (`2892-2900`), and the preview layer (`2901-2903`).
- `WireLayer` flattens every wire segment into one `LineSegments2`/`LineMaterial` at world-unit width
  `SCHEMATIC_WIRE_WIDTH_MM=0.18` (`515,534-616`), `depthTest:false` (`585`).

### 2.8 Hit-test
- `hitPin` nearest pin within `PIN_HIT_MM=0.35` (part) / `PRIMITIVE_PIN_HIT_MM=0.7` (primitive)
  (`83-87,1180-1219`).
- `hitWire` nearest segment (Euclidean point-to-segment `distancePointToSegmentMm` `465-489`) within
  `WIRE_HIT_MM=0.3`, returns the projected point (`1221-1260`).
- Marquee: window = polyline fully contained, crossing = polyline intersects rect
  (`1127-1135`).

---

## 3. Coordinate / integer discipline (context)

Geometry is integer-nm and deterministic (no `Math.random`/`Date.now`/`sqrt`); nearest-segment
comparisons use exact `bigint` squared distance (`manhattan.ts:1-11,128-164`). Endpoints may be
off-grid (real pin coords); only interior waypoints are grid-snapped
(`manhattan.ts:100-115`, `repairToManhattan`). This part is solid — flagged only because the frontend
duplicate (`SchematicCanvas.tsx:264-287`) does **not** share these guarantees (it never snaps or
repairs; it trusts click coords).

---

## 4. Overlap / collision failure modes

> Severity = impact on a correct/uncluttered schematic. "Silent" = wrong result with no user signal.

### 4.1 — Connection-by-touch is not detected (silent wrong netlist) · **HIGH**
`projection-world.ts:520-552` unions only on **exact coordinate coincidence of stored vertices**. If a
part is moved so a pin lands on the **interior of a wire segment** (the wire has no vertex there), or a
wire endpoint lands mid-segment on another wire, they are **not unioned and no junction dot appears** —
the two nets stay separate though they visually touch. Only the explicit interactive
`create_wire_junction` flow inserts the vertex needed to connect. Move/import/auto-route/AI paths that
produce a mid-segment touch silently fail to connect.
- Union site: `projection-world.ts:543,549-552`. Junction detection is vertex-only: `544-545,698-702`.
- Move re-route never introduces such vertices: `wire-geometry.ts:110-124`.

### 4.2 — Interactive wires route straight through component bodies & other wires · **HIGH**
Hand-drawn wires bypass the obstacle-aware router entirely: `create_wire` uses the caller's explicit
`pointsNm` verbatim when present (`command-executor.ts:1239-1242`), and the frontend builder is a plain
H/V splitter with no obstacle input (`SchematicCanvas.tsx:264-287`, kernel `manhattan.ts:51-64`). A wire
drawn between two pins with a symbol between them overlaps that symbol's body/pins with no avoidance and
no warning.

### 4.3 — Move re-route is non-obstacle-aware and preserves stale interior waypoints · **MEDIUM**
`rerouteWireWithUpdatedEndpoints` keeps the old interior points (`wire-geometry.ts:81-83`) and re-Manhattans
with the plain kernel. Dragging a part drags its wires through whatever now lies in the path; a wire that
had a hand-placed jog keeps that jog at its old absolute position, which can leave interior vertices
sitting on top of other symbols or produce a long dog-leg. No collision check on the result.

### 4.4 — Auto-router fallback returns a **known-colliding** path · **MEDIUM**
When straight/HV/VH all collide and A* returns `null` (lattice/expansion caps hit, or genuinely no clean
route), `routeSchematicWire` returns the HV L-bend anyway (`schematic-autoroute.ts:240-243`). The wire is
committed overlapping obstacles with no diagnostic. Caps that can trigger this: `MAX_LATTICE_LINES=160`
(`67,96-97`), `MAX_EXPANSIONS=120_000` (`129,132`).

### 4.5 — `create_wire_junction` creates an overlapping duplicate segment · **MEDIUM**
Because the branch wire must end on a real pin, it is extended along the tapped wire's shorter half to
that wire's nearer endpoint pin (`command-executor.ts:1300-1319`). The tapped wire still owns its full
path (`1325-1331`). The segment **junction→nearest-endpoint is therefore covered by two wires**
(double-drawn geometry, redundant `wireIds` in the net, extra segment-ends at intermediate coords).
Electrically consistent, but visually/structurally redundant.

### 4.6 — Duplicate full-overlap wires between the same two pins are allowed · **MEDIUM**
Nothing dedupes wires by endpoint pair. Drawing (or dispatching) a second wire between the same two pins
produces two fully overlapping polylines; both persist. `create_wire` only rejects same-pin/zero-length
(`create-wire.ts:65-78`), not "a wire already connects these pins".

### 4.7 — Self-doubling-back paths pass validation · **LOW/MEDIUM**
`validatePath` rejects only **consecutive** duplicate points and non-orthogonal segments
(`create-wire.ts:41-56`); `dedupeConsecutive`/`sanitizePath` only collapse consecutive dupes
(`SchematicCanvas.tsx:252-262`, `manhattan.ts:24-33`). A path A→B→A (waypoint then back) is stored as a
zero-area spur overlapping itself. It inflates `incidentCount` at the revisited coord (`projection-world.ts:544-545`)
and can create a spurious junction dot or a hidden overlap.

### 4.8 — Crossing wires are visually ambiguous (no hop / no gap) · **MEDIUM**
Two independent wires whose segments **cross** without a shared vertex are correctly left unconnected
(no union — §4.1 mechanics), but `WireLayer` draws every segment as a flat opaque line with
`depthTest:false` (`SchematicCanvas.tsx:534-616`); there is no crossover hop, dashed break, or gap.
The user cannot distinguish "crossing, not connected" from "connected" without adding a junction. Inverse
of 4.9.

### 4.9 — Coincident-vertex 4-way crossings auto-connect + auto-dot with no user intent · **MEDIUM**
If two independent wires happen to share a vertex coordinate (each contributing 2 stubs → 4 ≥ 3), they are
**unioned into one net and marked with a junction dot** automatically (`projection-world.ts:543,698-702`).
Grid snapping of waypoints makes coincident vertices easy to hit. Unlike KiCad (which requires an explicit
junction for a 4-way), any coincident crossover here silently merges nets.

### 4.10 — Marquee window-select can drop a wire whose vertices straddle the box · **LOW**
Window mode requires the whole polyline inside the rect (`polylineContainedInAabb`,
`SchematicCanvas.tsx:1130-1133`); a wire fully spanning the box but with both endpoints outside is not
selected in window mode. Standard KiCad-ish behavior, but combined with delete-selection it can surprise.
(Crossing mode `1133` behaves normally.)

---

## 5. TODO / FIXME / known-limitation comments (wire routing)

- `commands/create-wire.ts:13-15` — "…we fall back to a single L-bend; the obstacle-aware auto-router
  **(Phase 4)** replaces this default at the command layer when `pointsNm` is omitted." Confirms the
  hand-drawn path intentionally has no obstacle avoidance (relates §4.2).
- `schematic-autoroute.ts:207-212` — documents the guaranteed **fallback to the HV L-bend** "so it is
  never worse than the naive router" — i.e. it may return a colliding path by design (relates §4.4).
- `schematic-autoroute.ts:67-68` — `MAX_LATTICE_LINES` cap comment ("bounds A* to a tractable grid …
  raised for the denser lattice once wires + primitives are obstacles") — a deliberate tractability cap
  (relates §4.4).
- `projection-world.ts:510-514` and `610-617` — design notes: junction = ≥3 stubs; isolated pins still
  get a net and "has a net" must not be read as "connected" (relates §4.1).
- `wire-obstacles.ts:33-35` — `WIRE_WIRE_MARGIN_NM` kept "small so parallel buses can pack one grid apart
  rather than detour wildly" — intentional tightness, tuning knob.
- No literal `TODO`/`FIXME`/`HACK` tokens exist in the wire-routing files (grep clean); the limitations
  are phrased as prose in headers/comments above.

---

## 6. Shared code (schematic-only; flagged, not analyzed)

- **`routing/manhattan.ts`** is shared **within the schematic wire stack** only: consumed by
  `commands/create-wire.ts`, `wire-geometry.ts`, and `routing/schematic-autoroute.ts`. It is **not** used
  by PCB trace code (PCB has its own `pcb/pcb-trace-geometry.ts`, `pcb/tools/route-preview-geometry.ts`,
  `pcb/snap.ts`). No PCB crossover in the wire kernel.
- **Frontend duplicate of the kernel:** `SchematicCanvas.tsx:248-287` reimplements
  `buildManhattanPathThroughAnchors`/`dedupeConsecutive`/`pointKey` instead of importing
  `routing/manhattan.ts`. Drift risk (the backend copy snaps/repairs; the frontend copy does not). Both are
  schematic-only.
- **`autoRouteWirePoints` (`routing/wire-obstacles.ts`) is shared between two schematic callers:**
  `command-executor.ts` `create_wire` (`1242`) and `layout/arrange-schematic.ts` (`216`). `arrange-schematic`
  is the deterministic **schematic auto-arrange** command (re-routes ALL wires sequentially against each
  other's fresh geometry, `arrange-schematic.ts:174-221`). This is a schematic-wiring re-route path and is
  in scope as "re-routing", but it is a separate explicit feature — flagged here, not deeply analyzed. It is
  **unrelated to the excluded PCB "AutoLayout"** (cloud auto-place/auto-route), which lives under
  `pcb/autolayout/` + `backend/autoroute|autoplace|autolayout/` and is not touched by this audit.

---

## 7. Summary of severities

| # | Failure mode | Severity |
| --- | --- | --- |
| 4.1 | Connection-by-touch not detected (mid-segment) | HIGH |
| 4.2 | Interactive wires ignore obstacles | HIGH |
| 4.3 | Move re-route non-obstacle-aware + stale waypoints | MEDIUM |
| 4.4 | Auto-router fallback returns colliding path | MEDIUM |
| 4.5 | Junction command duplicates a segment (overlap) | MEDIUM |
| 4.6 | Duplicate wires between same pins allowed | MEDIUM |
| 4.7 | Self-doubling-back paths pass validation | LOW/MEDIUM |
| 4.8 | Crossing wires visually ambiguous (no hop) | MEDIUM |
| 4.9 | Coincident-vertex crossings auto-merge nets | MEDIUM |
| 4.10 | Window marquee drops straddling wire | LOW |

_End of audit. No fixes proposed per scope._
