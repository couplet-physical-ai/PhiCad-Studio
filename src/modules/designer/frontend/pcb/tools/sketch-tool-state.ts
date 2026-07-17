import type { PcbPointMm } from "../../../../../sdks";

/**
 * In-progress state for the Board Shape draw tool. Mirrors the route tool's
 * reducer shape: only *committed* vertices live in the session — the canvas
 * renders a rubber-band from the last vertex to the live (snapped) cursor and
 * commits it on the next click. Nothing touches the backend until the loop
 * closes, at which point the whole polygon commits as one `pcb_set_board_outline`
 * (one revision, one undo).
 *
 * Coordinates are millimetres (board-outline space), not the nanometres the
 * trace router uses.
 */
export interface SketchSession {
  /** Committed polygon vertices, in click order. `verticesMm[0]` is the start. */
  verticesMm: PcbPointMm[];
}

export type SketchToolState =
  | { kind: "idle" }
  | { kind: "drawing"; session: SketchSession };

export type SketchToolEvent =
  | { kind: "start"; pointMm: PcbPointMm }
  | { kind: "commit-vertex"; pointMm: PcbPointMm }
  | { kind: "undo-vertex" }
  | { kind: "cancel" };

/** Minimum vertices before the outline can be closed into a valid contour. */
export const MIN_SKETCH_VERTICES = 3;

export const initialSketchToolState: SketchToolState = { kind: "idle" };

function samePoint(a: PcbPointMm, b: PcbPointMm): boolean {
  return a.x === b.x && a.y === b.y;
}

export function sketchToolReducer(
  state: SketchToolState,
  event: SketchToolEvent,
): SketchToolState {
  switch (event.kind) {
    case "start":
      return { kind: "drawing", session: { verticesMm: [event.pointMm] } };
    case "cancel":
      return { kind: "idle" };
    default:
      break;
  }
  if (state.kind !== "drawing") return state;
  switch (event.kind) {
    case "commit-vertex": {
      const verts = state.session.verticesMm;
      const last = verts[verts.length - 1]!;
      // Ignore a click on the exact same spot as the previous vertex.
      if (samePoint(last, event.pointMm)) return state;
      return {
        kind: "drawing",
        session: { verticesMm: [...verts, event.pointMm] },
      };
    }
    case "undo-vertex": {
      const verts = state.session.verticesMm.slice(0, -1);
      if (verts.length === 0) return { kind: "idle" };
      return { kind: "drawing", session: { verticesMm: verts } };
    }
    default:
      return state;
  }
}

/** True once the session has enough vertices to close into a valid polygon. */
export function canCloseSketch(state: SketchToolState): boolean {
  return (
    state.kind === "drawing" &&
    state.session.verticesMm.length >= MIN_SKETCH_VERTICES
  );
}
