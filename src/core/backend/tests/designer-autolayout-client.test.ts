// autolayout/client.ts: GET /v1/version fetch (cache + failure fallback) and the
// serializePours capability-negotiation decision (Phase 2 WP7).
import { describe, expect, test, afterEach, beforeEach } from "bun:test";
import {
  __resetAutoLayoutVersionCacheForTests,
  getAutoLayoutVersion,
  resolveSerializePours,
} from "../../../modules/designer/backend/autolayout/client";
import type { VersionResponse } from "../../../sdks/designer";

function versionWithPours(accepted: boolean | undefined): VersionResponse {
  return {
    service: "cloud-auto-layout",
    engineVersion: "v0.8.0",
    routeEngineVersion: "v0.8.0",
    placeEngineVersion: "v0.5.0",
    contractVersion: "1.0",
    schemaMajor: 1,
    schemaMinor: 0,
    schemaVersion: "1.0",
    capabilities: {
      async: true,
      progressStream: "sse",
      cancel: true,
      endpoints: ["/v1/route", "/v1/place"],
      viaSpans: ["through"],
      engineImplemented: true,
      schemaMajor: 1,
      schemaMinor: 0,
      schemaVersion: "1.0",
      engines: {},
      // A deployment predating the pours capability omits the block entirely — the
      // generated type marks it required because current services always send it, so
      // the "unknown" case is modelled with a cast rather than a fictional shape.
      ...(accepted === undefined
        ? {}
        : { pours: { accepted, routeAware: accepted, producerDefault: "off" } }),
    } as VersionResponse["capabilities"],
  };
}

describe("resolveSerializePours", () => {
  test("explicit true always wins, even with no capability info", () => {
    expect(resolveSerializePours(true, null)).toBe(true);
    expect(resolveSerializePours(true, versionWithPours(false))).toBe(true);
  });

  test("explicit false always wins, even when the service accepts pours", () => {
    expect(resolveSerializePours(false, versionWithPours(true))).toBe(false);
  });

  test("unset + capabilities.pours.accepted true -> true", () => {
    expect(resolveSerializePours(undefined, versionWithPours(true))).toBe(true);
  });

  test("unset + capabilities.pours.accepted false -> false", () => {
    expect(resolveSerializePours(undefined, versionWithPours(false))).toBe(false);
  });

  test("unset + capabilities.pours absent -> false (older deployment)", () => {
    expect(resolveSerializePours(undefined, versionWithPours(undefined))).toBe(false);
  });

  test("unset + version unknown (unreachable service) -> false", () => {
    expect(resolveSerializePours(undefined, null)).toBe(false);
  });

  test("a non-boolean request value is treated as unset", () => {
    expect(resolveSerializePours("yes", versionWithPours(true))).toBe(true);
    expect(resolveSerializePours("yes", null)).toBe(false);
  });
});

describe("getAutoLayoutVersion", () => {
  const original = globalThis.fetch;
  beforeEach(() => {
    __resetAutoLayoutVersionCacheForTests();
  });
  afterEach(() => {
    globalThis.fetch = original;
    __resetAutoLayoutVersionCacheForTests();
  });

  function stubFetch(
    responses: Array<{ status: number; body: unknown } | Error>,
  ): { calls: number } {
    const state = { calls: 0 };
    let i = 0;
    globalThis.fetch = (async (_input: RequestInfo | URL, _init?: RequestInit) => {
      state.calls += 1;
      const next = responses[i++];
      if (next instanceof Error) throw next;
      if (!next) throw new Error("no stubbed response");
      return new Response(JSON.stringify(next.body), {
        status: next.status,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
    return state;
  }

  test("returns the parsed version on a 200", async () => {
    stubFetch([{ status: 200, body: versionWithPours(true) }]);
    const v = await getAutoLayoutVersion();
    expect(v?.capabilities.pours?.accepted).toBe(true);
  });

  test("returns null (not throws) on a network error, with no cache to fall back to", async () => {
    stubFetch([new Error("ECONNREFUSED")]);
    const v = await getAutoLayoutVersion();
    expect(v).toBeNull();
  });

  test("returns null (not throws) on a non-2xx response", async () => {
    stubFetch([{ status: 503, body: { detail: "unavailable" } }]);
    const v = await getAutoLayoutVersion();
    expect(v).toBeNull();
  });
});
