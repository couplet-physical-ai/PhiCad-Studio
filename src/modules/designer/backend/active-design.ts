/**
 * Which design the user currently has focused in the designer UI.
 *
 * The designer backend is otherwise stateless about UI focus — every route
 * takes an explicit `:designId`, and the open-tab set lives in a frontend
 * Zustand store (`frontend/stores/designer-tabs-store.ts`). External drivers
 * (the MCP server) have no tab state to read, so the frontend pushes its
 * active tab here and they can default to "whatever the user is looking at".
 *
 * Deliberately in-memory: this mirrors on-screen state, so a value that
 * outlived the process would be a lie the next time the app starts with no
 * design open. Callers must treat `null` as normal, not as an error.
 */

interface ActiveDesignState {
  designId: string | null;
  updatedAt: number;
}

const state: ActiveDesignState = { designId: null, updatedAt: 0 };

export function setActiveDesignId(designId: string | null): ActiveDesignState {
  state.designId = designId;
  state.updatedAt = Date.now();
  return { ...state };
}

export function getActiveDesignId(): string | null {
  return state.designId;
}

export function getActiveDesignState(): ActiveDesignState {
  return { ...state };
}

/**
 * Clear the pointer when the design it names is deleted, so a later reader
 * cannot resolve a dangling id.
 */
export function clearActiveDesignIfMatches(designId: string): void {
  if (state.designId === designId) setActiveDesignId(null);
}
