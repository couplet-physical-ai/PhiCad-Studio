# Schematic wire routing — reference

The rules that govern schematic wires: how nets are derived from geometry, what counts as a
junction, what the coordinate discipline guarantees, and which surprising behaviours are
deliberate.

Scope is schematic wires and connectors only. PCB trace routing is a separate stack with its own
geometry kernel and shares no code with this one.

For where the code lives, see the designer module's `AGENTS.md`. This document describes
behaviour, not layout.

---

## 1. Net derivation

Nets are built by union-find over wire and pin geometry. The key is the **exact integer-nanometre
coordinate string**. There is no tolerance, no snapping at union time, and no proximity test:
two things connect if and only if their stored coordinates are identical.

Three kinds of union are performed:

- Consecutive vertices within one wire.
- A wire endpoint and a pin whose world coordinates match exactly.
- Same-named primitives globally, case-insensitively — this is how GND symbols, rails and portals
  merge across the sheet without any wire between them.

### The junction rule

A **junction dot is a coordinate where three or more wire segment-ends coincide.** Segment-ends
are counted per wire: a wire passing through a coordinate contributes two stubs (one incoming,
one outgoing), a wire terminating there contributes one.

The consequences follow directly from the count:

| Situation | Stubs at the coordinate | Junction? |
|---|---|---|
| A corner in a single wire | 2 | No |
| A straight pass-through vertex | 2 | No |
| One wire ending on another's vertex | 3 | Yes |
| Two wires sharing a vertex (4-way crossover) | 4 | Yes — see §5 |

A straight pass-through cannot produce a spurious junction because collinear redundant vertices
are removed by the path simplifier before storage; a stored vertex on a straight run does not
occur.

### "Has a net" is not "is connected"

Every pin folds into a net, including pins with nothing attached. Isolated single-endpoint nets
are kept deliberately, because net identity drives wire and pin colouring and a pin with no net
would render wrong.

**This means a consumer that asks "does this pin have a net?" always gets yes.** Connectivity
consumers — ERC, netlist export, anything that reasons about whether a signal actually goes
somewhere — must check the net's endpoint count, not the existence of a net. This trap has been
hit before; the design note in the projection code exists because of it.

---

## 2. Coordinate discipline

Schematic geometry is integer nanometres end to end, and the routing kernel is deterministic:
no `Math.random`, no `Date.now`, no `sqrt`.

- **Nearest-segment comparisons use exact `bigint` squared distance.** No floating point enters
  the decision of which segment a click landed on, so the result is reproducible and
  platform-independent.
- **Endpoints may be off-grid.** They are real pin coordinates, and a symbol's pins are wherever
  the library puts them. Forcing endpoints to the grid would move them off their pins.
- **Only interior waypoints are grid-snapped.** The snap happens during path repair, on the
  vertices the router or the user introduced — never on the two ends.

Anything that reimplements path construction must preserve all three properties. A copy of the
kernel that trusts raw click coordinates without snapping or repairing will drift from the stored
geometry and, because unions are exact-coordinate, will silently fail to connect.

---

## 3. Tuning constants

These are knobs with reasons. Changing one without reading its reason will produce a plausible
looking change and a worse schematic.

| Constant | Value | Why this value |
|---|---|---|
| `WIRE_OBSTACLE_MARGIN_NM` | 1.27 mm | Inflation applied to part pin bounding boxes and primitive bodies when collecting obstacles. Roughly one grid step of breathing room around a symbol. |
| `WIRE_WIRE_MARGIN_NM` | 2 mm | Inflation applied to each existing wire segment as a thin obstacle rectangle. **Deliberately small** — kept tight "so parallel buses can pack one grid apart rather than detour wildly". Raising it makes bus routing scatter. |
| `BEND_PENALTY_NM` | 1 mm | A* cost added per direction change, so the router prefers straight runs over equal-length staircases. |
| `MAX_LATTICE_LINES` | 160 per axis | Bounds the Hanan grid to a tractable size. Already raised once, for the denser lattice that resulted from treating wires and primitives as obstacles. |
| `MAX_EXPANSIONS` | 120 000 | Hard cap on A* node expansions. Hitting it returns no route, which triggers the fallback in §4. |
| Corridor cull | source→target bbox + 25 mm | Obstacles outside this box are not considered at all. Bounds obstacle collection on large sheets. |
| `PIN_HIT_MM` | 0.35 | Hit radius for a part pin. |
| `PRIMITIVE_PIN_HIT_MM` | 0.7 | Hit radius for a primitive pin — larger because primitives (GND, rails, portals) are small targets. |
| `WIRE_HIT_MM` | 0.3 | Hit radius for landing on a wire (the T-tap path). Pin hit is tested first, so a pin wins ties. |
| `SCHEMATIC_WIRE_WIDTH_MM` | 0.18 | Rendered stroke width, in world units. |

---

## 4. Documented-intentional behaviours

Each of these looks like a bug from the outside. They are not. Do not "fix" them without
replacing the reasoning.

**The auto-router guarantees a fallback path, even a colliding one.** When the straight,
horizontal-first and vertical-first candidates all collide and the A* search returns nothing —
whether because it genuinely could not route or because it hit `MAX_LATTICE_LINES` or
`MAX_EXPANSIONS` — the router returns the horizontal-first L-bend anyway. The stated rationale is
that it is then "never worse than the naive router". The wire is committed overlapping obstacles
with no diagnostic. If you want a diagnostic, add one; do not remove the fallback, because the
alternative is a command that fails.

**The junction command duplicates a segment on purpose.** A wire must terminate on two pin ids, so
a branch tapped onto the middle of an existing wire cannot end at a bare junction point. It is
built from the source pin to the junction, then extended along the tapped wire's shorter half to
that wire's nearer endpoint pin. The tapped wire still owns its full path, so the stretch from the
junction to that endpoint is covered by two wires. This is electrically consistent and
structurally redundant — double-drawn geometry, redundant wire ids in the net, extra segment-ends
at intermediate coordinates. It is a consequence of the pin-to-pin wire model, not an oversight.

**The interactive draw path deliberately skips the obstacle-aware router.** The command layer uses
the caller's explicit points verbatim when they are present, and only auto-routes when they are
omitted. So the auto-router runs for programmatic, AI and import callers, and never for hand-drawn
wires. This is recorded as intentional in the command's own comment. See §6 for why it is also a
problem.

**Isolated pins keep their net.** See §1.

---

## 5. Divergence from KiCad — 4-way crossovers

If two independent wires happen to share a vertex coordinate, each contributes two stubs, the
count reaches four, and OpenPCB **unions them into one net and draws a junction dot** — with no
explicit user action.

KiCad requires an explicit junction for a 4-way crossing; a crossover without one stays
unconnected.

Grid snapping of interior waypoints makes coincident vertices easy to hit by accident, so this is
reachable in normal use, not a corner case.

**Record this as a decision, either way.** It is currently unclear whether it was chosen or fell
out of the stub-counting rule. The two options are:

- Keep it, and document it as a product difference — coincident vertices mean connection, which
  is arguably more predictable than KiCad's rule for users who did not come from KiCad.
- Match KiCad, which means the 4-stub case must distinguish "two wires crossing" from "one wire
  branching", and requires an explicit junction entity rather than a derived dot.

The inverse problem exists too: two wires whose segments genuinely *cross* without sharing a
vertex are correctly left unconnected, but every segment renders as a flat opaque line with no
crossover hop, dashed break or gap. A user cannot distinguish "crossing, not connected" from
"connected" by looking. Whichever way the crossover decision goes, the rendering needs to make the
distinction visible.

---

## 6. Open findings

Two HIGH-severity findings from the wire audit show no sign of having been fixed. Both are in the
**silent wrong netlist** class: the schematic looks right and the derived connectivity is wrong,
with no user-facing signal.

> **Anchors in the original audit are near-certainly stale.** The routing kernel has moved to
> `src/shared/schematic-routing/`. Every `file.ts:line` reference in the source audit predates
> that move and should be treated as invalid. Re-verify both findings against current code before
> acting on either — including whether they still reproduce at all.

### Mid-segment connection is not detected

Unions happen only on exact coordinate coincidence of **stored vertices**. If a part is moved so
that one of its pins lands on the *interior* of a wire segment — a place where the wire has no
vertex — the pin and the wire are not unioned and no junction dot appears. The same applies to a
wire endpoint landing mid-segment on another wire.

The two nets stay separate while visually touching. The only path that creates the vertex needed
to connect is the explicit interactive junction command. Every other path that can produce a
mid-segment touch — component move, import, auto-route, AI-generated commands — silently fails to
connect. Move re-routing in particular never introduces such a vertex.

A fix has to decide between two models: detect pin-on-segment incidence at derivation time (which
makes net derivation no longer a pure exact-coordinate union), or insert a vertex at commit time
on any command that can produce the incidence (which spreads the responsibility across every
command).

### Interactive wires are obstacle-blind

Hand-drawn wires bypass the obstacle-aware router entirely (§4), and the frontend path builder is
a plain horizontal-then-vertical splitter with no obstacle input at all. A wire drawn between two
pins with a symbol between them runs straight through that symbol's body and pins, with no
avoidance and no warning.

The severity is not aesthetic. A wire crossing a symbol's pins can produce a coincident-coordinate
union (§5) and silently merge nets that were never meant to touch — which is why this is filed as
a netlist correctness finding rather than a rendering one.

The command comment records that the obstacle-aware router was intended to replace this default at
the command layer. That replacement is what is missing.
