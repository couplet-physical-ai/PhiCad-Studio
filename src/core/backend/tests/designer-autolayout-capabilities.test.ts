// Capability negotiation: /v1/version → AutoLayoutServiceCapabilities. Every accessor
// must fail CLOSED — offering a feature the deployment lacks produces a mid-run 404.
import { describe, expect, test } from "bun:test";

import { readCapabilities } from "../../../sdks/designer/cloud-autolayout";
import type { VersionResponse } from "../../../sdks/designer";
import {
  hasFeature,
  supportsLayout,
  supportsPlace,
  supportsRoute,
} from "../../../modules/designer/backend/autolayout/capabilities";

function version(overrides: Record<string, unknown> = {}): VersionResponse {
  return {
    service: "cloud-auto-layout",
    engineVersion: "0.9.6",
    routeEngineVersion: "0.9.6",
    placeEngineVersion: "0.5.0",
    layoutEngineVersion: "0.2.0",
    contractVersion: "1.0",
    schemaMajor: 1,
    schemaMinor: 0,
    schemaVersion: "1.0",
    capabilities: {
      async: true,
      progressStream: "sse",
      cancel: true,
      endpoints: ["/v1/route", "/v1/place", "/v1/layout"],
      viaSpans: ["through"],
      engineImplemented: true,
      schemaMajor: 1,
      schemaMinor: 0,
      schemaVersion: "1.0",
      engines: {
        route: { features: { portfolio: true, ripQuotaMax: 3 } },
        place: { features: { subset: true, courtyard: true } },
        layout: { features: { subset: true, portfolio: true } },
      },
      layout: {
        maxCandidates: 12,
        objectiveVersion: "layout-1",
        budgetModes: ["job"],
      },
      pours: { accepted: true, routeAware: true, producerDefault: "off" },
      ...overrides,
    },
    // Partial engine blocks on purpose: these tests are about how the desktop degrades on
    // a body that is older or thinner than the current contract.
  } as unknown as VersionResponse;
}

describe("readCapabilities", () => {
  test("projects a full version body", () => {
    const caps = readCapabilities(version())!;
    expect(caps.layout).toBe(true);
    expect(caps.route).toBe(true);
    expect(caps.place).toBe(true);
    expect(caps.layoutLimits).toEqual({
      maxCandidates: 12,
      objectiveVersion: "layout-1",
      budgetModes: ["job"],
    });
    expect(caps.poursAccepted).toBe(true);
    expect(caps.layoutEngineVersion).toBe("0.2.0");
  });

  test("layout off: the service drops the engine block AND the endpoint", () => {
    // This is the kill-switch state (LAYOUT_ENABLED=false). Auto Layout must go away;
    // Route Board must survive.
    const caps = readCapabilities(
      version({
        endpoints: ["/v1/route", "/v1/place"],
        engines: { route: {}, place: {} },
        layout: undefined,
      }),
    )!;
    expect(caps.layout).toBe(false);
    expect(caps.layoutLimits).toBeNull();
    expect(caps.route).toBe(true);
    expect(supportsLayout(caps)).toBe(false);
    expect(supportsRoute(caps)).toBe(true);
  });

  test("unreachable service ⇒ null ⇒ nothing is offered", () => {
    expect(readCapabilities(null)).toBeNull();
    expect(supportsLayout(null)).toBe(false);
    expect(supportsRoute(null)).toBe(false);
    expect(supportsPlace(null)).toBe(false);
    expect(hasFeature(null, "place", "subset")).toBe(false);
  });

  test("a truncated body degrades instead of throwing", () => {
    const caps = readCapabilities({
      engineVersion: "0.1.0",
      schemaVersion: "1.0",
      schemaMajor: 1,
    } as unknown as VersionResponse)!;
    expect(caps.layout).toBe(false);
    expect(caps.endpoints).toEqual([]);
    expect(caps.poursAccepted).toBe(false);
    expect(caps.features.route).toEqual({});
  });

  test("features are read as booleans, never inferred from versions", () => {
    const caps = readCapabilities(version())!;
    expect(hasFeature(caps, "place", "subset")).toBe(true);
    expect(hasFeature(caps, "place", "connectorEdge")).toBe(false); // absent ⇒ unsupported
    expect(hasFeature(caps, "route", "portfolio")).toBe(true);
    expect(caps.features.route.ripQuotaMax).toBe(3);
  });
});
