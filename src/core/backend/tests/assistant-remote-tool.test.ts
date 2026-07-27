import { describe, expect, it } from "bun:test";
import {
  AiToolRegistry,
  resolveToolLimits,
  type AiToolExecutionContext,
} from "@openpcb/ai-core";
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

/** A workspace-scoped tool: workspaceId is required in the canonical schema. */
const searchEntry = entry({
  name: "datasheet_search",
  inputSchemaRef: "DatasheetSearchRequest",
  outputSchemaRef: "DatasheetSearchResponse",
  durationClass: "slow",
  authScope: "workspace-viewer",
});

/** The owner-bound tool: RegisterRequest.owner is an OwnerRef the model can't know. */
const registerEntry = entry({
  name: "datasheet_register",
  inputSchemaRef: "RegisterRequest",
  outputSchemaRef: "RegisterResponse",
  durationClass: "slow",
  authScope: "workspace-editor",
});

const ctx: AiToolExecutionContext = {
  runId: "run-1",
  bindings: [],
  limits: resolveToolLimits({ preference: "small" }),
  metadata: { toolEventId: "tc-1" },
};

/** No trusted context — only the unscoped tool is advertisable. */
const bareOpts = { copilotBase: "https://cp", getBearer: () => "tok" };
/** Workspace resolved, no design bound. */
const wsOpts = { ...bareOpts, workspaceId: "ws_1" };
/** Workspace + bound design — everything advertisable. */
const fullOpts = { ...wsOpts, designId: "dsn_1" };

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

/** Capture the single request a tool call makes. */
async function captureCall(
  run: () => Promise<unknown>,
  status = 200,
  payload: unknown = { results: [] },
): Promise<{ url: string; headers: Record<string, string>; body: unknown }> {
  const seen: { url: string; init: RequestInit | undefined }[] = [];
  await withFetch(
    (async (url: string | URL | Request, init?: RequestInit) => {
      seen.push({ url: String(url), init });
      return new Response(JSON.stringify(payload), { status });
    }) as unknown as typeof fetch,
    run,
  );
  expect(seen.length).toBe(1);
  const call = seen[0]!;
  return {
    url: call.url,
    headers: (call.init?.headers ?? {}) as Record<string, string>,
    body: JSON.parse(String(call.init?.body ?? "null")),
  };
}

function props(schema: unknown): Record<string, unknown> {
  return (
    ((schema as { properties?: Record<string, unknown> }).properties as
      | Record<string, unknown>
      | undefined) ?? {}
  );
}

function required(schema: unknown): string[] {
  return (schema as { required?: string[] }).required ?? [];
}

describe("remoteTool — advertisement", () => {
  it("maps an unscoped tool to a typed AiTool with its schema untouched", () => {
    const tool = remoteTool(entry(), bareOpts);
    expect(tool).not.toBeNull();
    expect(tool!.definition.name).toBe("component_search");
    expect(tool!.definition.effect).toBe("read");
    expect(tool!.definition.timeoutMs).toBe(30_000);
    expect(props(tool!.definition.inputSchema).query).toBeDefined();
  });

  it("marks cloud-mutating tools as write with the slow timeout", () => {
    const tool = remoteTool(registerEntry, fullOpts);
    expect(tool).not.toBeNull();
    expect(tool!.definition.effect).toBe("write");
    expect(tool!.definition.timeoutMs).toBe(90_000);
  });

  it("hides workspaceId from the model-facing schema", () => {
    const tool = remoteTool(searchEntry, wsOpts);
    const schema = tool!.definition.inputSchema;
    expect(props(schema).workspaceId).toBeUndefined();
    expect(required(schema)).not.toContain("workspaceId");
    // The rest of the contract must survive projection.
    expect(props(schema).query).toBeDefined();
    expect(required(schema)).toContain("query");
  });

  it("hides the whole owner ref from datasheet_register", () => {
    const tool = remoteTool(registerEntry, fullOpts);
    const schema = tool!.definition.inputSchema;
    expect(props(schema).owner).toBeUndefined();
    expect(props(schema).sha256).toBeDefined();
    expect(required(schema)).toContain("sha256");
  });

  it("does not mutate the canonical vendored schema when projecting", () => {
    remoteTool(searchEntry, wsOpts);
    // A second build must still see the canonical shape to strip.
    const again = remoteTool(searchEntry, wsOpts);
    expect(props(again!.definition.inputSchema).workspaceId).toBeUndefined();
    expect(props(again!.definition.inputSchema).query).toBeDefined();
  });

  it("omits a tool with no policy for its name", () => {
    expect(remoteTool(entry({ name: "made_up_tool" }), fullOpts)).toBeNull();
  });

  it("omits a tool whose inputSchemaRef disagrees with the policy", () => {
    expect(
      remoteTool(
        entry({ name: "datasheet_search", inputSchemaRef: "RefRequest" }),
        fullOpts,
      ),
    ).toBeNull();
  });

  it("omits workspace-scoped tools when no workspace is resolved", () => {
    expect(remoteTool(searchEntry, bareOpts)).toBeNull();
    // …but the unscoped tool still works.
    expect(remoteTool(entry(), bareOpts)).not.toBeNull();
  });

  it("omits datasheet_register when no design is bound", () => {
    expect(remoteTool(registerEntry, wsOpts)).toBeNull();
    expect(remoteTool(registerEntry, fullOpts)).not.toBeNull();
  });

  it("every advertised schema compiles in AiToolRegistry", () => {
    const registry = new AiToolRegistry();
    const tools = [
      remoteTool(entry(), fullOpts),
      remoteTool(searchEntry, fullOpts),
      remoteTool(
        entry({
          name: "datasheet_extract",
          inputSchemaRef: "DatasheetExtractRequest",
          outputSchemaRef: "DatasheetExtractResponse",
          durationClass: "slow",
        }),
        fullOpts,
      ),
      remoteTool(
        entry({
          name: "memory_get_blocks",
          inputSchemaRef: "MemoryGetBlocksRequest",
          outputSchemaRef: "MemoryGetBlocksResponse",
        }),
        fullOpts,
      ),
      remoteTool(
        entry({
          name: "memory_record",
          inputSchemaRef: "MemoryRecordRequest",
          outputSchemaRef: "MemoryRecordResponse",
        }),
        fullOpts,
      ),
      remoteTool(registerEntry, fullOpts),
    ];
    expect(tools.every((t) => t !== null)).toBe(true);
    for (const tool of tools) registry.register(tool!);
    expect(registry.listDefinitions().length).toBe(6);
  });
});

describe("remoteTool — trusted-context injection", () => {
  it("injects the resolved workspaceId into the request body", async () => {
    const call = await captureCall(() =>
      remoteTool(searchEntry, wsOpts)!.execute(ctx, { query: "lm358" }),
    );
    expect(call.url).toBe("https://cp/v1/tools/datasheet_search");
    expect(call.body).toEqual({ query: "lm358", workspaceId: "ws_1" });
  });

  it("overwrites a model-supplied workspaceId — the model cannot pick a tenant", async () => {
    const call = await captureCall(() =>
      remoteTool(searchEntry, wsOpts)!.execute(ctx, {
        query: "lm358",
        workspaceId: "ws_ATTACKER",
      }),
    );
    expect((call.body as { workspaceId: string }).workspaceId).toBe("ws_1");
  });

  it("injects a whole owner ref for datasheet_register from the bound design", async () => {
    const call = await captureCall(
      () =>
        remoteTool(registerEntry, fullOpts)!.execute(ctx, {
          sha256: "a".repeat(64),
          byteSize: 1024,
          source: "user-upload",
          visibility: "private",
        }),
      200,
      { sha256: "a".repeat(64), status: "registered" },
    );
    expect((call.body as { owner: unknown }).owner).toEqual({
      kind: "design",
      id: "dsn_1",
      workspaceId: "ws_1",
    });
  });

  it("overwrites a model-supplied owner ref", async () => {
    const call = await captureCall(
      () =>
        remoteTool(registerEntry, fullOpts)!.execute(ctx, {
          sha256: "a".repeat(64),
          byteSize: 1024,
          source: "user-upload",
          visibility: "private",
          owner: { kind: "design", id: "dsn_OTHER", workspaceId: "ws_OTHER" },
        }),
      200,
      { sha256: "a".repeat(64), status: "registered" },
    );
    expect((call.body as { owner: unknown }).owner).toEqual({
      kind: "design",
      id: "dsn_1",
      workspaceId: "ws_1",
    });
  });

  it("leaves an unscoped tool's body exactly as the model produced it", async () => {
    const call = await captureCall(() =>
      remoteTool(entry(), bareOpts)!.execute(ctx, { query: "555", limit: 5 }),
    );
    expect(call.body).toEqual({ query: "555", limit: 5 });
  });

  it("preserves the model's non-trusted fields verbatim", async () => {
    const call = await captureCall(() =>
      remoteTool(searchEntry, wsOpts)!.execute(ctx, {
        query: "lm358",
        count: 7,
        designId: "dsn_from_model",
      }),
    );
    expect(call.body).toEqual({
      query: "lm358",
      count: 7,
      designId: "dsn_from_model",
      workspaceId: "ws_1",
    });
  });

  it("makes NO request and fails locally when the workspace goes missing mid-run", async () => {
    // Build with context, then lose it — mirrors a binding dropped mid-run.
    const mutable: { copilotBase: string; getBearer: () => string; workspaceId?: string } =
      { ...wsOpts };
    const tool = remoteTool(searchEntry, mutable)!;
    mutable.workspaceId = undefined;

    let called = false;
    const res = await withFetch(
      (async () => {
        called = true;
        return new Response("{}", { status: 200 });
      }) as unknown as typeof fetch,
      () => tool.execute(ctx, { query: "lm358" }),
    );
    expect(called).toBe(false);
    expect(res.ok).toBe(false);
    expect(res.warnings.join(" ")).toMatch(/workspace context/i);
  });

  it("makes NO request when the injected body would violate the canonical schema", async () => {
    let called = false;
    const res = await withFetch(
      (async () => {
        called = true;
        return new Response("{}", { status: 200 });
      }) as unknown as typeof fetch,
      // `query` is required by DatasheetSearchRequest and the model omitted it.
      () => remoteTool(searchEntry, wsOpts)!.execute(ctx, {}),
    );
    expect(called).toBe(false);
    expect(res.ok).toBe(false);
    expect(res.warnings.join(" ")).toMatch(/cloud schema/i);
  });
});

describe("remoteTool — transport", () => {
  it("sends bearer, run id and tool-call id headers", async () => {
    const call = await captureCall(() =>
      remoteTool(entry(), bareOpts)!.execute(ctx, { query: "555" }),
    );
    expect(call.headers.authorization).toBe("Bearer tok");
    expect(call.headers["x-openpcb-run-id"]).toBe("run-1");
    // B12: the tool-call id is DERIVED, no longer ai-core's per-attempt
    // metadata.toolEventId ("tc-1"). See the dedicated block below.
    expect(call.headers["x-tool-call-id"]).toMatch(/^[0-9a-f]{64}$/);
  });

  it("still sends x-openpcb-workspace-id alongside the body field", async () => {
    const call = await captureCall(() =>
      remoteTool(searchEntry, wsOpts)!.execute(ctx, { query: "lm358" }),
    );
    expect(call.headers["x-openpcb-workspace-id"]).toBe("ws_1");
    expect((call.body as { workspaceId: string }).workspaceId).toBe("ws_1");
  });

  it("omits x-openpcb-workspace-id when there is no workspace", async () => {
    const call = await captureCall(() =>
      remoteTool(entry(), bareOpts)!.execute(ctx, { query: "555" }),
    );
    expect(call.headers["x-openpcb-workspace-id"]).toBeUndefined();
  });

  it("returns ok:false with the problem detail on non-2xx", async () => {
    const res = await withFetch(
      (async () =>
        new Response(JSON.stringify({ detail: "nope" }), {
          status: 403,
        })) as unknown as typeof fetch,
      () => remoteTool(entry(), bareOpts)!.execute(ctx, { query: "x" }),
    );
    expect(res.ok).toBe(false);
    expect(res.warnings).toContain("nope");
  });
});

describe("loadRemoteTools", () => {
  it("wraps every advertisable entry and omits the rest", async () => {
    const tools = await withFetch(
      (async () =>
        new Response(
          JSON.stringify({
            pricingVersion: "1",
            tools: [
              entry(),
              searchEntry,
              registerEntry,
              entry({ name: "tool_from_the_future" }),
            ],
          }),
          { status: 200 },
        )) as unknown as typeof fetch,
      () => loadRemoteTools(fullOpts),
    );
    // The unknown tool is dropped rather than advertised-and-failed.
    expect(tools.map((t) => t.definition.name)).toEqual([
      "component_search",
      "datasheet_search",
      "datasheet_register",
    ]);
  });

  it("drops workspace-scoped and owner-bound tools when context is missing", async () => {
    const manifest = JSON.stringify({
      pricingVersion: "1",
      tools: [entry(), searchEntry, registerEntry],
    });
    const noContext = await withFetch(
      (async () => new Response(manifest, { status: 200 })) as unknown as typeof fetch,
      () => loadRemoteTools(bareOpts),
    );
    expect(noContext.map((t) => t.definition.name)).toEqual([
      "component_search",
    ]);

    const noDesign = await withFetch(
      (async () => new Response(manifest, { status: 200 })) as unknown as typeof fetch,
      () => loadRemoteTools(wsOpts),
    );
    expect(noDesign.map((t) => t.definition.name)).toEqual([
      "component_search",
      "datasheet_search",
    ]);
  });

  it("throws on a manifest fetch failure so the caller can degrade to local tools", async () => {
    await withFetch(
      (async () => new Response("nope", { status: 500 })) as unknown as typeof fetch,
      async () => {
        await expect(loadRemoteTools(fullOpts)).rejects.toThrow(/500/);
      },
    );
  });
});

// H10 tripwire: the injected workspace is the caller's PERSONAL workspace.
// When team-owned designs land, this assumption must be revisited — resolving
// the workspace from the design instead. If this test starts looking wrong,
// that is the signal, not a nuisance.
describe("remoteTool — workspace scope assumption (H10)", () => {
  it("injects exactly the workspace the caller passed, with no design-derived override", async () => {
    const call = await captureCall(
      () =>
        remoteTool(registerEntry, {
          ...bareOpts,
          workspaceId: "ws_personal",
          designId: "dsn_owned_by_a_team",
        })!.execute(ctx, {
          sha256: "b".repeat(64),
          byteSize: 10,
          source: "vendor-fetch",
          visibility: "global",
        }),
      200,
      { sha256: "b".repeat(64), status: "registered" },
    );
    expect((call.body as { owner: { workspaceId: string } }).owner.workspaceId).toBe(
      "ws_personal",
    );
  });
});

// B12: the cloud keys metering AND retry-safety on x-tool-call-id, and its
// ledger UPSERT is last-write-wins — so exactly-once billing depends entirely
// on this value repeating for the same logical call. It used to be ai-core's
// per-ATTEMPT metadata.toolEventId, so a DoD correction pass re-issuing the
// same search was billed again and re-ran the write tools.
describe("remoteTool — derived tool-call id (B12)", () => {
  const callId = async (
    toolEntry: ToolManifestEntry,
    opts: Parameters<typeof remoteTool>[1],
    input: Record<string, unknown>,
    execCtx: AiToolExecutionContext = ctx,
  ): Promise<string> => {
    const call = await captureCall(() =>
      remoteTool(toolEntry, opts)!.execute(execCtx, input),
    );
    return call.headers["x-tool-call-id"]!;
  };

  it("is a sha256 hex digest that satisfies the cloud's id regex", async () => {
    const id = await callId(entry(), bareOpts, { query: "555" });
    expect(id).toMatch(/^[0-9a-f]{64}$/);
    // cloud-copilot app/routes/tools.py:37
    expect(id).toMatch(/^[A-Za-z0-9_-]{8,128}$/);
  });

  it("is IDENTICAL for the same (runId, tool, args) — the correction-pass case", async () => {
    const a = await callId(searchEntry, wsOpts, { query: "lm358" });
    const b = await callId(searchEntry, wsOpts, { query: "lm358" });
    expect(b).toBe(a);
  });

  it("ignores argument key order", async () => {
    const a = await callId(searchEntry, wsOpts, { query: "lm358", count: 3 });
    const b = await callId(searchEntry, wsOpts, { count: 3, query: "lm358" });
    expect(b).toBe(a);
  });

  it("differs when the arguments differ", async () => {
    const a = await callId(searchEntry, wsOpts, { query: "lm358" });
    const b = await callId(searchEntry, wsOpts, { query: "ne555" });
    expect(b).not.toBe(a);
  });

  it("differs when the tool differs", async () => {
    const a = await callId(searchEntry, wsOpts, { query: "lm358" });
    const b = await callId(
      entry({
        name: "datasheet_extract",
        inputSchemaRef: "DatasheetExtractRequest",
        outputSchemaRef: "DatasheetExtractResponse",
        durationClass: "slow",
      }),
      wsOpts,
      { query: "lm358", kind: "pins" },
    );
    expect(b).not.toBe(a);
  });

  it("differs across runs — a user-initiated retry is new work", async () => {
    const a = await callId(searchEntry, wsOpts, { query: "lm358" });
    const b = await callId(searchEntry, wsOpts, { query: "lm358" }, {
      ...ctx,
      runId: "run-2",
    });
    expect(b).not.toBe(a);
  });

  it("covers the injected workspace, not just the model's arguments", async () => {
    const a = await callId(searchEntry, wsOpts, { query: "lm358" });
    const b = await callId(
      searchEntry,
      { ...bareOpts, workspaceId: "ws_OTHER" },
      { query: "lm358" },
    );
    expect(b).not.toBe(a);
  });

  it("no longer reads ai-core's per-attempt toolEventId", async () => {
    const withMeta = await callId(searchEntry, wsOpts, { query: "lm358" });
    const withDifferentMeta = await callId(searchEntry, wsOpts, { query: "lm358" }, {
      ...ctx,
      metadata: { toolEventId: "tev_completely_different" },
    });
    const withNoMeta = await callId(searchEntry, wsOpts, { query: "lm358" }, {
      ...ctx,
      metadata: undefined,
    });
    expect(withDifferentMeta).toBe(withMeta);
    expect(withNoMeta).toBe(withMeta);
  });
});
