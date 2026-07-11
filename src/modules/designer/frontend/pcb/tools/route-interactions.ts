/**
 * Pure decision logic for route-mode pointer clicks. Extracted from the
 * PcbCanvas onPointerDown route branch so the click semantics are unit-testable
 * and PcbCanvas only wires events (see route-tool-state.ts for the session
 * reducer this drives).
 */

/**
 * Minimal view of a resolved route anchor (PcbCanvas `resolveRouteAnchor`,
 * optionally enriched with a same-layer trace-interior hit) that the click
 * decision needs. A non-null `netId` with `onPad: false` means the anchor sits
 * on copper (trace endpoint/interior or via) of that net.
 */
export interface RouteClickAnchor {
  /** Cursor landed on a footprint pad. */
  onPad: boolean;
  /** Net of the snapped object (pad/trace/via), null for free space. */
  netId: string | null;
}

export type RouteClickAction =
  /** No active session — begin a new one at the anchor. */
  | "start"
  /** Extend the session with an intermediate waypoint. */
  | "waypoint"
  /** Commit the session path through the anchor and end the session. */
  | "finish";

/**
 * A route may finish on a pad only when doing so cannot create a short:
 * either side is net-less, or the nets match. A different-net pad click is
 * treated as a waypoint — live DRC flags the crossing instead of silently
 * connecting two nets.
 */
function padFinishAllowed(
  sessionNetId: string | null,
  padNetId: string | null,
): boolean {
  return (
    sessionNetId === null || padNetId === null || sessionNetId === padNetId
  );
}

/**
 * Decide what a route-mode click does.
 *
 * - idle → start a session at the anchor
 * - click on a compatible-net pad → finish (classic pad-to-pad route)
 * - click on same-net copper (trace endpoint/interior, via) → finish in a
 *   T-junction; requires a strict non-null net match — a net-less session
 *   never auto-finishes on arbitrary copper
 * - double-click (clickCount ≥ 2) → finish anywhere, leaving a dangling end;
 *   the first click of the pair has already landed as a waypoint at the same
 *   point, which the reducer/preview dedupe collapse
 * - anything else → waypoint
 */
export function resolveRouteClickAction(input: {
  routing: boolean;
  anchor: RouteClickAnchor;
  sessionNetId: string | null;
  clickCount: number;
}): RouteClickAction {
  if (!input.routing) return "start";
  if (
    input.anchor.onPad &&
    padFinishAllowed(input.sessionNetId, input.anchor.netId)
  ) {
    return "finish";
  }
  if (
    !input.anchor.onPad &&
    input.anchor.netId !== null &&
    input.anchor.netId === input.sessionNetId
  ) {
    return "finish";
  }
  if (input.clickCount >= 2) return "finish";
  return "waypoint";
}
