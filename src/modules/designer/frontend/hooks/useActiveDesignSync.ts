import { useEffect, useRef } from "react";

/**
 * Mirror the focused designer tab to the backend.
 *
 * The backend is stateless about UI focus, so external drivers (the MCP
 * server) have no way to know which design the user is looking at. This pushes
 * it. Fire-and-forget by design: a failed push must never disturb tab
 * switching, and a stale pointer only means an external client has to name its
 * design explicitly.
 */
export function useActiveDesignSync(
  api: { setActiveDesign(designId: string | null): Promise<void> },
  activeDesignId: string | null,
): void {
  const lastPushed = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (lastPushed.current === activeDesignId) return;
    lastPushed.current = activeDesignId;
    void api.setActiveDesign(activeDesignId).catch(() => {
      // Re-push on the next change rather than retrying: the newest value is
      // the only one that matters.
      lastPushed.current = undefined;
    });
  }, [api, activeDesignId]);

  // The pointer describes on-screen state, so drop it when the designer space
  // unmounts (user navigated to another module).
  useEffect(() => {
    return () => {
      lastPushed.current = undefined;
      void api.setActiveDesign(null).catch(() => {});
    };
  }, [api]);
}
