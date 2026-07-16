import type { DesignerPin } from "../../../../sdks/designer";
import type { PersistedWirePayload } from "../payload-types";
import {
  isManhattanPath,
  pointKey,
  repairToManhattan,
  sanitizePath,
  type Point,
} from "../routing/manhattan";

/**
 * Normalize a caller-supplied wire path into a valid Manhattan polyline with
 * exact endpoints. When no interior points are supplied we fall back to a
 * single L-bend; the obstacle-aware auto-router (Phase 4) replaces this default
 * at the command layer when `pointsNm` is omitted.
 */
export function normalizeWirePath(
  source: Point,
  target: Point,
  pointsNm: Point[] | undefined,
): Point[] {
  if (!pointsNm || pointsNm.length === 0) {
    if (source.x === target.x || source.y === target.y) {
      return sanitizePath([source, target]);
    }
    return sanitizePath([source, { x: target.x, y: source.y }, target]);
  }
  // Force exact endpoints, keep interior verbatim. If that is already a valid
  // orthogonal path (junction-split geometry or a clean caller path), preserve
  // it exactly. Only snap/rebuild when it is genuinely malformed.
  const forced = [...pointsNm];
  forced[0] = source;
  forced[forced.length - 1] = target;
  const sane = sanitizePath(forced);
  if (sane.length >= 2 && isManhattanPath(sane)) {
    return sane;
  }
  return repairToManhattan(pointsNm, source, target);
}

export function validateWirePath(path: Point[]): string | null {
  if (path.length < 2) {
    return "wire path must contain at least 2 points (source and target must differ)";
  }
  // Reject any revisited vertex anywhere in the path (not just consecutive
  // duplicates): a Manhattan path that returns to an earlier point always
  // overlaps itself and inflates junction stub counts.
  const seen = new Set<string>();
  for (const point of path) {
    const key = pointKey(point);
    if (seen.has(key)) {
      return "wire path revisits an earlier point (path doubles back on itself)";
    }
    seen.add(key);
  }
  // Reject a collinear direction reversal between consecutive segments
  // (e.g. A→B→mid(A,B)): no vertex repeats, but the second segment retraces
  // part of the first.
  for (let index = 2; index < path.length; index += 1) {
    const a = path[index - 2]!;
    const b = path[index - 1]!;
    const c = path[index]!;
    const horizontal = a.y === b.y && b.y === c.y;
    const vertical = a.x === b.x && b.x === c.x;
    if (
      (horizontal && Math.sign(b.x - a.x) === -Math.sign(c.x - b.x)) ||
      (vertical && Math.sign(b.y - a.y) === -Math.sign(c.y - b.y))
    ) {
      return "wire path doubles back along its own segment";
    }
  }
  if (!isManhattanPath(path)) {
    return "wire path must be Manhattan (orthogonal segments only)";
  }
  return null;
}

export function buildCreateWirePayload(
  sourcePin: DesignerPin,
  targetPin: DesignerPin,
  pointsNm: Array<{ x: number; y: number }> | undefined,
): { payload: PersistedWirePayload | null; invalidReason: string | null } {
  // Reject self-loops at the backend, not just in the canvas UI: import/sync
  // callers reach this path too, and a pin wired to itself is an invalid net.
  if (sourcePin.id === targetPin.id) {
    return {
      payload: null,
      invalidReason: "source and target pins must be different",
    };
  }
  const source = sourcePin.worldPositionNm;
  const target = targetPin.worldPositionNm;
  if (source.x === target.x && source.y === target.y) {
    return {
      payload: null,
      invalidReason: "source and target pins are at the same point",
    };
  }
  const normalizedPoints = normalizeWirePath(source, target, pointsNm);
  const invalidReason = validateWirePath(normalizedPoints);
  if (invalidReason) {
    return { payload: null, invalidReason };
  }

  return {
    payload: {
      id: crypto.randomUUID(),
      sourcePinId: sourcePin.id,
      targetPinId: targetPin.id,
      pointsNm: normalizedPoints,
    },
    invalidReason: null,
  };
}
