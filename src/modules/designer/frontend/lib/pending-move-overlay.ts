/**
 * Optimistic move overlay for the schematic canvas.
 *
 * While move commands are in flight the raw projection is stale: parts sit at
 * their pre-move positions and wires at their pre-move geometry until the
 * refetch lands. Every consumer that reads positions during that window (hit
 * tests, drag seeding, live re-route, rendering) must see the SAME optimistic
 * state, or drags started mid-flight teleport parts and stretch wires between
 * stale and new endpoints. `applyPendingMoveToProjection` produces that single
 * source of truth.
 *
 * Pure and framework-free so it is unit-testable under Bun (same precedent as
 * route-tool-state).
 */
import type { DesignerSchematicProjection } from "../../../../sdks";

export interface PendingMovePoint {
  x: number;
  y: number;
}

/** Optimistic post-drop state: final positions + re-routed wire geometry kept
 *  on screen until the move commands land and the projection refreshes. */
export interface PendingMoveState {
  partPositionsNm: Map<string, PendingMovePoint>;
  primitivePositionsNm: Map<string, PendingMovePoint>;
  wirePointsNm: Map<string, PendingMovePoint[]>;
}

/**
 * Overlay a pending move onto a projection: parts and primitives take their
 * committed-but-not-yet-refetched positions (part pins shift by the part's
 * delta), wires take their re-routed geometry. Untouched entities are reused
 * by reference. Derived junction dots are left as-is (server-derived; they
 * catch up on refetch).
 */
export function applyPendingMoveToProjection(
  projection: DesignerSchematicProjection,
  pendingMove: PendingMoveState | null,
): DesignerSchematicProjection {
  if (
    !pendingMove ||
    (pendingMove.partPositionsNm.size === 0 &&
      pendingMove.primitivePositionsNm.size === 0 &&
      pendingMove.wirePointsNm.size === 0)
  ) {
    return projection;
  }

  const parts = projection.parts.map((part) => {
    const next = pendingMove.partPositionsNm.get(part.id);
    if (!next) return part;
    const deltaX = next.x - part.positionNm.x;
    const deltaY = next.y - part.positionNm.y;
    if (deltaX === 0 && deltaY === 0) return part;
    return {
      ...part,
      positionNm: { x: next.x, y: next.y },
      pins: part.pins.map((pin) => ({
        ...pin,
        worldPositionNm: {
          x: pin.worldPositionNm.x + deltaX,
          y: pin.worldPositionNm.y + deltaY,
        },
      })),
    };
  });

  const primitives = projection.primitives.map((primitive) => {
    const next = pendingMove.primitivePositionsNm.get(primitive.id);
    if (!next) return primitive;
    if (next.x === primitive.positionNm.x && next.y === primitive.positionNm.y) {
      return primitive;
    }
    return { ...primitive, positionNm: { x: next.x, y: next.y } };
  });

  const wires = projection.wires.map((wire) => {
    const pointsNm = pendingMove.wirePointsNm.get(wire.id);
    return pointsNm ? { ...wire, pointsNm } : wire;
  });

  return { ...projection, parts, primitives, wires };
}

/**
 * Merge a newer drop's overlay over an existing one (drops can stack while
 * earlier commits are still in flight). Later entries win per entity; the
 * result is a fresh state (inputs are not mutated).
 */
export function mergePendingMoves(
  base: PendingMoveState | null,
  next: PendingMoveState,
): PendingMoveState {
  if (!base) {
    return {
      partPositionsNm: new Map(next.partPositionsNm),
      primitivePositionsNm: new Map(next.primitivePositionsNm),
      wirePointsNm: new Map(next.wirePointsNm),
    };
  }
  return {
    partPositionsNm: new Map([
      ...base.partPositionsNm,
      ...next.partPositionsNm,
    ]),
    primitivePositionsNm: new Map([
      ...base.primitivePositionsNm,
      ...next.primitivePositionsNm,
    ]),
    wirePointsNm: new Map([...base.wirePointsNm, ...next.wirePointsNm]),
  };
}
