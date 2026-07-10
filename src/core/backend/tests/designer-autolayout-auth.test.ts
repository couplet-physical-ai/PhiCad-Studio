// R0.4: cloud auto-layout proxy routes require x-cloud-bearer — a bearer-less
// call is rejected 401 BEFORE any upstream fetch; with a bearer, the outgoing
// request carries the authorization header. Apply routes are exempt (they never
// contact the service; the bearer only feeds the optional cloud-sync mirror).

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import os from "node:os";
import path from "node:path";
import type { DesignerSDK } from "../../../sdks";
import { MODULE_SDK_TOKENS } from "../../../sdks";
import { resetSharedSqliteForTesting } from "../db/sqlite-client";
import { DiagnosticsStore } from "../diagnostics/diagnostics-store";
import { createHttpServer } from "../http/create-http-server";
import { MentionRegistry } from "../mentions";
import { ModuleRuntime } from "../modules/module-loader";
import { ModuleRouterRegistry } from "../router/module-registry";

function isolateTestDb(testLabel: string): void {
  resetSharedSqliteForTesting();
  const dbFile = path.join(
    os.tmpdir(),
    `${testLabel}-${Date.now()}-${crypto.randomUUID()}.sqlite`,
  );
  process.env.OPENPCB_DB_PATH = dbFile;
}

async function createRuntimeAndServer() {
  const repoRoot = path.resolve(import.meta.dir, "../../..");
  const moduleRegistry = new ModuleRouterRegistry();
  const moduleRuntime = new ModuleRuntime({
    moduleRegistry,
    workspaceRoot: repoRoot,
  });
  await moduleRuntime.bootstrap();
  const server = createHttpServer({
    diagnosticsStore: new DiagnosticsStore(),
    moduleRegistry,
    moduleRuntime,
  });
  return { moduleRuntime, server };
}

interface FetchCall {
  url: string;
  init?: RequestInit;
  body?: unknown;
}

function stubFetch(
  responses: Array<{ status: number; body: unknown } | Error>,
): { calls: FetchCall[]; restore: () => void } {
  const calls: FetchCall[] = [];
  const original = globalThis.fetch;
  let i = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const bodyText = init?.body ? String(init.body) : undefined;
    let parsed: unknown;
    try {
      parsed = bodyText ? JSON.parse(bodyText) : undefined;
    } catch {
      parsed = bodyText;
    }
    calls.push({ url, init, body: parsed });
    const next = responses[i++];
    if (next instanceof Error) throw next;
    if (!next) throw new Error("no stubbed response");
    return new Response(
      typeof next.body === "string" ? next.body : JSON.stringify(next.body),
      { status: next.status, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;
  return { calls, restore: () => (globalThis.fetch = original) };
}

const BASE = "http://localhost/api/modules/designer";

const BEARERLESS_ROUTES: ReadonlyArray<readonly [string, string]> = [
  ["POST", "/designs/d-x/autoroute"],
  ["GET", "/designs/d-x/autoroute/j1"],
  ["POST", "/designs/d-x/autoroute/j1/cancel"],
  ["POST", "/designs/d-x/autoplace"],
  ["GET", "/designs/d-x/autoplace/j1"],
  ["POST", "/designs/d-x/autoplace/j1/cancel"],
];

describe("cloud auto-layout mandatory bearer (R0.4)", () => {
  let runtime: Awaited<ReturnType<typeof createRuntimeAndServer>>;
  let stub: ReturnType<typeof stubFetch> | null = null;

  beforeEach(async () => {
    // Library/knowledge modules resolve mention providers during load;
    // prod inits this in runtime.ts (same pattern as designer-capture tests).
    MentionRegistry.init();
    isolateTestDb("designer-autolayout-auth");
    runtime = await createRuntimeAndServer();
  });
  afterEach(() => {
    stub?.restore();
    stub = null;
  });

  test("bearer-less call → 401 problem+json before any fetch (all 6 proxy routes)", async () => {
    stub = stubFetch([]);
    for (const [method, route] of BEARERLESS_ROUTES) {
      const res = await runtime.server.fetch(
        new Request(`${BASE}${route}`, {
          method,
          headers: { "content-type": "application/json" },
          body: method === "POST" ? "{}" : undefined,
        }),
      );
      // 401 (not 404) even for a nonexistent design — the guard runs first.
      expect(`${method} ${route} → ${res.status}`).toBe(
        `${method} ${route} → 401`,
      );
      expect(res.headers.get("content-type")).toContain(
        "application/problem+json",
      );
      const problem = (await res.json()) as { type?: string; detail?: string };
      expect(problem.type).toBe("https://openpcb.dev/problems/unauthorized");
      expect(problem.detail).toContain("x-cloud-bearer");
    }
    expect(stub.calls.length).toBe(0);
  });

  test("with bearer → upstream request carries authorization header", async () => {
    const sdk = runtime.moduleRuntime
      .getSdkRegistry()
      .resolve<DesignerSDK>(MODULE_SDK_TOKENS.DESIGNER);
    const design = await sdk.createDesign({ name: "AutoLayout Auth" });

    // autoroute submit — explicit serializePours skips the /v1/version probe,
    // so exactly one fetch (the submit) goes out.
    stub = stubFetch([
      { status: 200, body: { jobId: "j1", snapshotHash: "h1" } },
    ]);
    let res = await runtime.server.fetch(
      new Request(`${BASE}/designs/${design.id}/autoroute`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-cloud-bearer": "tok-123",
        },
        body: JSON.stringify({ serializePours: false }),
      }),
    );
    expect(res.status).toBe(200);
    expect(stub.calls.length).toBe(1);
    expect(stub.calls[0]?.url.endsWith("/v1/route")).toBe(true);
    expect(
      new Headers(stub.calls[0]?.init?.headers).get("authorization"),
    ).toBe("Bearer tok-123");
    stub.restore();

    // autoplace submit (no version probe exists on this path).
    stub = stubFetch([
      { status: 200, body: { jobId: "p1", snapshotHash: "h2" } },
    ]);
    res = await runtime.server.fetch(
      new Request(`${BASE}/designs/${design.id}/autoplace`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-cloud-bearer": "tok-123",
        },
        body: "{}",
      }),
    );
    expect(res.status).toBe(200);
    expect(stub.calls.length).toBe(1);
    expect(stub.calls[0]?.url.endsWith("/v1/place")).toBe(true);
    expect(
      new Headers(stub.calls[0]?.init?.headers).get("authorization"),
    ).toBe("Bearer tok-123");
    stub.restore();

    // status poll forwards the bearer too.
    stub = stubFetch([{ status: 200, body: { jobId: "j1", state: "queued" } }]);
    res = await runtime.server.fetch(
      new Request(`${BASE}/designs/${design.id}/autoroute/j1`, {
        headers: { "x-cloud-bearer": "tok-123" },
      }),
    );
    expect(res.status).toBe(200);
    expect(stub.calls.length).toBe(1);
    expect(stub.calls[0]?.url.endsWith("/v1/route/j1")).toBe(true);
    expect(
      new Headers(stub.calls[0]?.init?.headers).get("authorization"),
    ).toBe("Bearer tok-123");
  });

  test("apply routes stay exempt — no 401 without bearer, no upstream fetch", async () => {
    const sdk = runtime.moduleRuntime
      .getSdkRegistry()
      .resolve<DesignerSDK>(MODULE_SDK_TOKENS.DESIGNER);
    const design = await sdk.createDesign({ name: "AutoLayout Apply" });

    stub = stubFetch([]);
    for (const surface of ["autoroute", "autoplace"]) {
      const res = await runtime.server.fetch(
        new Request(`${BASE}/designs/${design.id}/${surface}/apply`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId: "s1", operations: [] }),
        }),
      );
      expect(res.status).not.toBe(401);
    }
    expect(stub.calls.length).toBe(0);
  });
});
