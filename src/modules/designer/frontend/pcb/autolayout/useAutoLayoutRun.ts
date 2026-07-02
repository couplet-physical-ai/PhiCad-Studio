// Orchestrates a unified Auto-Layout run across the two cloud stages, reusing
// the existing autoplace/autoroute dialogs + place-preview infra as review
// surfaces. This hook owns ONLY the stage state machine + the memoized submit
// bodies; the canvas wires them to the dialogs and reports back the two
// transition events (place applied, run finished).
//
// Flow:  start(cfg)
//   both stages   → place → (canvas ghost preview) → placeApplied() → route → finish()
//   place only    → place → placeApplied()/finish()  (no route)
//   route only    → route → finish()
// Chaining is automatic because place-apply mutates + refreshes the board, so
// the route submit rebuilds the snapshot from the placed projection.

import { useCallback, useMemo, useState } from "react";
import type { AutoLayoutConfig } from "../../../../../sdks/designer";
import { toPlaceRequest, toRouteRequest } from "./config";

export type AutoLayoutStage = "idle" | "place" | "route";

export interface AutoLayoutRun {
  stage: AutoLayoutStage;
  /** Memoized `submitAutoplace` body — defined only while the place stage runs. */
  placeRequest: ReturnType<typeof toPlaceRequest> | undefined;
  /** Memoized `submitAutoroute` body — defined only while the route stage runs. */
  routeRequest: ReturnType<typeof toRouteRequest> | undefined;
  /** Begin a run; picks the first enabled stage from the config. */
  start(cfg: AutoLayoutConfig): void;
  /** The place ghost was applied — advance to route (if enabled) or end. */
  placeApplied(): void;
  /** End the run (place rejected, a dialog cancelled, or route closed). */
  finish(): void;
}

export function useAutoLayoutRun(): AutoLayoutRun {
  const [cfg, setCfg] = useState<AutoLayoutConfig | null>(null);
  const [stage, setStage] = useState<AutoLayoutStage>("idle");

  const start = useCallback((c: AutoLayoutConfig) => {
    setCfg(c);
    setStage(c.runPlace ? "place" : c.runRoute ? "route" : "idle");
  }, []);

  const placeApplied = useCallback(() => {
    setStage(cfg?.runRoute ? "route" : "idle");
  }, [cfg]);

  const finish = useCallback(() => setStage("idle"), []);

  // Memoized so the dialogs' submit effects (which depend on `request`) don't
  // re-fire on unrelated canvas re-renders — only when the stage actually flips.
  const placeRequest = useMemo(
    () => (cfg && stage === "place" ? toPlaceRequest(cfg) : undefined),
    [cfg, stage],
  );
  const routeRequest = useMemo(
    () => (cfg && stage === "route" ? toRouteRequest(cfg) : undefined),
    [cfg, stage],
  );

  return { stage, placeRequest, routeRequest, start, placeApplied, finish };
}
