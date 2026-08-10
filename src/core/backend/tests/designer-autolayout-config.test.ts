// Pure-logic unit tests for the Auto Layout config → request mapping and the migration off
// the old stage-toggle model (frontend module, no React/DOM — run under Bun with the
// backend suite per the repo convention for pure frontend logic).
import { describe, expect, test } from "bun:test";
import {
  DEFAULT_AUTOLAYOUT_CONFIG,
  applyPreset,
  migrateConfig,
  toLayoutRequest,
  toRouteRequest,
} from "../../../modules/designer/frontend/pcb/autolayout/config";

describe("autolayout config → request mapping", () => {
  test("balanced default → engine defaults; serializePours 'auto' omitted", () => {
    const { placeOptions, routeOptions, serializePours } = toLayoutRequest(
      DEFAULT_AUTOLAYOUT_CONFIG,
    );
    expect(placeOptions.restarts).toBeUndefined();
    expect(placeOptions.maxMoves).toBeUndefined();
    expect(placeOptions.targetUtilization).toBe(0.7);
    expect(routeOptions.portfolio).toBe(4);
    // "auto" ⇒ the key is dropped so the backend negotiates the capability.
    expect(serializePours).toBeUndefined();
    // undefined maxViasPerNet ⇒ omitted (not sent as an explicit null).
    expect("maxViasPerNet" in routeOptions).toBe(false);
  });

  test("route budget fields are NEVER pinned — the server default governs", () => {
    // This is the reason engine improvements reach shipped desktops without a release.
    for (const preset of ["fast", "balanced", "quality"] as const) {
      const { routeOptions } = toLayoutRequest(
        applyPreset(DEFAULT_AUTOLAYOUT_CONFIG, preset),
      );
      expect("maxExpansions" in routeOptions).toBe(false);
      expect("budgetMode" in routeOptions).toBe(false);
      expect("jobBudget" in routeOptions).toBe(false);
    }
  });

  test("effort tiers map to portfolio + place budgets", () => {
    const fast = toLayoutRequest(applyPreset(DEFAULT_AUTOLAYOUT_CONFIG, "fast"));
    expect(fast.routeOptions.portfolio).toBe(1);
    expect(fast.placeOptions.restarts).toBe(2);
    expect(fast.placeOptions.maxMoves).toBe(3000);

    const quality = toLayoutRequest(applyPreset(DEFAULT_AUTOLAYOUT_CONFIG, "quality"));
    expect(quality.routeOptions.portfolio).toBe(8);
    expect(quality.placeOptions.restarts).toBe(8);
  });

  test("priority presets bias only the weights their name promises", () => {
    expect(
      toLayoutRequest(applyPreset(DEFAULT_AUTOLAYOUT_CONFIG, "preserve")).placeOptions
        .weights,
    ).toEqual({ displacement: 1 });
    expect(
      toLayoutRequest(applyPreset(DEFAULT_AUTOLAYOUT_CONFIG, "routability")).placeOptions
        .weights,
    ).toEqual({ congestion: 1 });
    // Balanced defers entirely to the engine — no invented numbers.
    expect(
      toLayoutRequest(applyPreset(DEFAULT_AUTOLAYOUT_CONFIG, "balanced")).placeOptions
        .weights,
    ).toBeUndefined();
  });

  test("subset placement requires an actual selection", () => {
    const scoped = { ...DEFAULT_AUTOLAYOUT_CONFIG, scope: "selected" as const };
    const withSelection = toLayoutRequest(scoped, ["U1", "U2"]);
    expect(withSelection.placeOptions.mode).toBe("subset");
    expect(withSelection.placeOptions.selectedIds).toEqual(["U1", "U2"]);

    // An empty selection must NOT silently become a whole-board re-placement.
    const withoutSelection = toLayoutRequest(scoped, []);
    expect(withoutSelection.placeOptions.mode).toBeUndefined();
    expect(withoutSelection.placeOptions.selectedIds).toBeUndefined();
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
    const { placeOptions } = toLayoutRequest(cfg);
    expect(placeOptions.allowRotate).toBe(false);
    expect(placeOptions.allowFlip).toBe(false);
    expect(placeOptions.moveConnectors).toBe(true);
    expect(placeOptions.respectExistingTraces).toBe(false);
    expect(placeOptions.targetUtilization).toBe(0.9);
  });

  test("Route Board sends routing only — never a placement block", () => {
    const route = toRouteRequest(DEFAULT_AUTOLAYOUT_CONFIG);
    expect(route.options.portfolio).toBe(4);
    expect("placeOptions" in route).toBe(false);
  });
});

describe("config migration off the stage-toggle model", () => {
  test("a legacy both-stages config becomes a normal layout config", () => {
    const { config, routeOnly } = migrateConfig({
      runPlace: true,
      runRoute: true,
      preset: "balanced",
      effort: "balanced",
      place: { targetUtilization: 0.8 },
      route: { allowVias: false },
    });
    expect(routeOnly).toBe(false);
    expect(config.scope).toBe("all");
    expect(config.preset).toBe("balanced");
    expect(config.place.targetUtilization).toBe(0.8);
    expect(config.route.allowVias).toBe(false);
  });

  test("runPlace:false, runRoute:true is a ROUTE BOARD config, not a layout one", () => {
    // Carrying it forward as a layout config would silently start moving components on a
    // board whose owner explicitly asked for routing only.
    const { routeOnly } = migrateConfig({
      runPlace: false,
      runRoute: true,
      preset: "quality",
    });
    expect(routeOnly).toBe(true);
  });

  test("never throws on junk or on an older/partial blob", () => {
    expect(migrateConfig(null).config).toEqual(DEFAULT_AUTOLAYOUT_CONFIG);
    expect(migrateConfig("nonsense").config).toEqual(DEFAULT_AUTOLAYOUT_CONFIG);
    expect(migrateConfig({}).config.preset).toBe("balanced");
    expect(migrateConfig({ preset: "quality" }).config.effort).toBe("quality");
  });
});
