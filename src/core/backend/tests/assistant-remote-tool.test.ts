import { describe, expect, it } from "bun:test";
import { resolveToolLimits, type AiToolExecutionContext } from "@openpcb/ai-core";
import type { ToolManifestEntry } from "@openpcb/contracts";
import {
  loadRemoteTools,
  remoteTool,
} from "../../../modules/assistant/backend/cloud/remote-tool";

function entry(over: Partial<ToolManifestEntry> = {}): ToolManifestEntry {
  return {
    name: "component_search",
    version: "1",
    inputSchemaRef: "ComponentSearchRequest",
    outputSchemaRef: "ComponentSearchResponse",
    pricing: { unit: "call", credits: 0.1 },
    durationClass: "fast",
    authScope: "pro",
    ...over,
  };
}

const ctx: AiToolExecutionContext = {
  runId: "run-1",
  bindings: [],
  limits: resolveToolLimits({ preference: "small" }),
  metadata: { toolEventId: "tc-1" },
};

const opts = { copilotBase: "https://cp", getBearer: () => "tok" };

async function withFetch<T>(
  impl: typeof fetch,
  fn: () => Promise<T>,
): Promise<T> {
  const orig = globalThis.fetch;
  globalThis.fetch = impl;
  try {
    return await fn();
  } finally {
    globalThis.fetch = orig;
  }
}

describe("remoteTool", () => {
  it("maps a manifest entry to a typed AiTool definition with a resolved input schema", () => {
    const tool = remoteTool(entry(), opts);
    expect(tool.definition.name).toBe("component_search");
    expect(tool.definition.effect).toBe("read");
    expect(tool.definition.timeoutMs).toBe(30_000);
    const schema = tool.definition.inputSchema as {
      properties?: Record<string, unknown>;
    };
    expect(schema.properties?.query).toBeDefined();
  });

  it("marks cloud-mutating tools as write with the slow timeout", () => {
    const tool = remoteTool(
      entry({
        name: "datasheet_register",
        inputSchemaRef: "RegisterRequest",
        durationClass: "slow",
      }),
      opts,
    );
    expect(tool.definition.effect).toBe("write");
    expect(tool.definition.timeoutMs).toBe(90_000);
  });

  it("POSTs the tool call with bearer + run headers and returns ok on 2xx", async () => {
    const seen: { url: string; init: RequestInit | undefined }[] = [];
    const res = await withFetch(
      (async (url: string | URL | Request, init?: RequestInit) => {
        seen.push({ url: String(url), init });
        return new Response(JSON.stringify({ results: [] }), { status: 200 });
      }) as unknown as typeof fetch,
      () => remoteTool(entry(), opts).execute(ctx, { query: "555" }),
    );
    expect(res.ok).toBe(true);
    expect(res.data).toEqual({ results: [] });
    const call = seen[0]!;
    expect(call.url).toBe("https://cp/v1/tools/component_search");
    const headers = call.init?.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer tok");
    expect(headers["x-openpcb-run-id"]).toBe("run-1");
    expect(headers["x-tool-call-id"]).toBe("tc-1");
  });

  it("sends x-openpcb-workspace-id when a workspace id is provided", async () => {
    const seen: { init: RequestInit | undefined }[] = [];
    await withFetch(
      (async (_url: string | URL | Request, init?: RequestInit) => {
        seen.push({ init });
        return new Response(JSON.stringify({ results: [] }), { status: 200 });
      }) as unknown as typeof fetch,
      () =>
        remoteTool(entry(), { ...opts, workspaceId: "ws_1" }).execute(ctx, {
          query: "555",
        }),
    );
    const headers = seen[0]!.init?.headers as Record<string, string>;
    expect(headers["x-openpcb-workspace-id"]).toBe("ws_1");
  });

  it("omits x-openpcb-workspace-id when no workspace id is provided", async () => {
    const seen: { init: RequestInit | undefined }[] = [];
    await withFetch(
      (async (_url: string | URL | Request, init?: RequestInit) => {
        seen.push({ init });
        return new Response(JSON.stringify({ results: [] }), { status: 200 });
      }) as unknown as typeof fetch,
      () => remoteTool(entry(), opts).execute(ctx, { query: "555" }),
    );
    const headers = seen[0]!.init?.headers as Record<string, string>;
    expect(headers["x-openpcb-workspace-id"]).toBeUndefined();
  });

  it("returns ok:false with the problem detail on non-2xx", async () => {
    const res = await withFetch(
      (async () =>
        new Response(JSON.stringify({ detail: "nope" }), {
          status: 403,
        })) as unknown as typeof fetch,
      () => remoteTool(entry(), opts).execute(ctx, {}),
    );
    expect(res.ok).toBe(false);
    expect(res.warnings).toContain("nope");
  });

  it("loadRemoteTools wraps every manifest entry", async () => {
    const tools = await withFetch(
      (async () =>
        new Response(
          JSON.stringify({
            pricingVersion: "1",
            tools: [
              entry(),
              entry({
                name: "datasheet_search",
                inputSchemaRef: "DatasheetSearchRequest",
                durationClass: "slow",
              }),
            ],
          }),
          { status: 200 },
        )) as unknown as typeof fetch,
      () => loadRemoteTools(opts),
    );
    expect(tools.map((t) => t.definition.name)).toEqual([
      "component_search",
      "datasheet_search",
    ]);
  });
});
