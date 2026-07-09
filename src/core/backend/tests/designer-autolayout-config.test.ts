// Pure-logic unit tests for the Auto-Layout config → request mapping
// (frontend module, no React/DOM) — run under Bun with the backend suite per
// the repo convention for pure frontend logic.
import { describe, expect, test } from "bun:test";
import {
  DEFAULT_AUTOLAYOUT_CONFIG,
  applyPreset,
  toPlaceRequest,
  toRouteRequest,
} from "../../../modules/designer/frontend/pcb/autolayout/config";

describe("autolayout config → request mapping", () => {
  test("balanced default → engine defaults; serializePours 'auto' omitted", () => {
    const { placeOptions } = toPlaceRequest(DEFAULT_AUTOLAYOUT_CONFIG);
    expect(placeOptions.restarts).toBeUndefined();
    expect(placeOptions.maxMoves).toBeUndefined();
    expect(placeOptions.targetUtilization).toBe(0.7);

    const route = toRouteRequest(DEFAULT_AUTOLAYOUT_CONFIG);
    expect(route.options.portfolio).toBe(4);
    expect("maxExpansions" in route.options).toBe(false);
    // "auto" ⇒ the key is dropped so the backend negotiates the capability.
    expect("serializePours" in route).toBe(false);
    // undefined maxViasPerNet ⇒ omitted (not sent as an explicit null).
    expect("maxViasPerNet" in route.options).toBe(false);
  });

  test("fast preset → portfolio 1 + low place budgets; route budget inherited", () => {
    const { placeOptions } = toPlaceRequest(
      applyPreset(DEFAULT_AUTOLAYOUT_CONFIG, "fast"),
    );
    expect(placeOptions.restarts).toBe(2);
    expect(placeOptions.maxMoves).toBe(3000);

    const route = toRouteRequest(applyPreset(DEFAULT_AUTOLAYOUT_CONFIG, "fast"));
    expect(route.options.portfolio).toBe(1);
    // Route budget fields are never pinned — the server default governs.
    expect("maxExpansions" in route.options).toBe(false);
    expect("budgetMode" in route.options).toBe(false);
  });

  test("quality preset → portfolio 8 + higher place budgets; route budget inherited", () => {
    const q = applyPreset(DEFAULT_AUTOLAYOUT_CONFIG, "quality");
    expect(toPlaceRequest(q).placeOptions.restarts).toBe(8);
    const route = toRouteRequest(q);
    expect(route.options.portfolio).toBe(8);
    expect("maxExpansions" in route.options).toBe(false);
    expect("budgetMode" in route.options).toBe(false);
  });

  test("explicit serializePours + maxViasPerNet are forwarded", () => {
    const cfg = {
      ...DEFAULT_AUTOLAYOUT_CONFIG,
      route: {
        ...DEFAULT_AUTOLAYOUT_CONFIG.route,
        serializePours: true as const,
        maxViasPerNet: 2,
      },
    };
    const route = toRouteRequest(cfg);
    expect(route.serializePours).toBe(true);
    expect(route.options.maxViasPerNet).toBe(2);
  });

  test("curated place knobs map straight through", () => {
    const cfg = {
      ...DEFAULT_AUTOLAYOUT_CONFIG,
      place: {
        allowRotate: false,
        allowFlip: false,
        moveConnectors: true,
        respectExistingTraces: false,
        targetUtilization: 0.9,
      },
    };
    const { placeOptions } = toPlaceRequest(cfg);
    expect(placeOptions.allowRotate).toBe(false);
    expect(placeOptions.allowFlip).toBe(false);
    expect(placeOptions.moveConnectors).toBe(true);
    expect(placeOptions.respectExistingTraces).toBe(false);
    expect(placeOptions.targetUtilization).toBe(0.9);
  });

  test("applyPreset resets knobs to engine defaults but keeps stage toggles", () => {
    const custom = {
      ...DEFAULT_AUTOLAYOUT_CONFIG,
      runPlace: false,
      runRoute: true,
      preset: "custom" as const,
      place: { ...DEFAULT_AUTOLAYOUT_CONFIG.place, targetUtilization: 0.95 },
    };
    const balanced = applyPreset(custom, "balanced");
    expect(balanced.runPlace).toBe(false);
    expect(balanced.runRoute).toBe(true);
    expect(balanced.preset).toBe("balanced");
    expect(balanced.place.targetUtilization).toBe(0.7);
  });
});
