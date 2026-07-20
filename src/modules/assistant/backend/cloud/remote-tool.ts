// R4.4 remote tools: wrap a cloud-copilot tool-plane entry (GET /v1/tools) as an
// ai-core AiTool the LOCAL agent loop can call. The desktop keeps the only agent
// loop; each tool is a thin metered POST /v1/tools/{name} against the copilot
// service, gated Pro. Input schemas come from the committed vendored map
// (copilot-tool-schemas.generated.ts) so the model gets real arg schemas + Ajv
// validation; the per-run bearer + run id ride each call.

import type {
  AiJsonSchemaObject,
  AiSourceRef,
  AiSourceRefKind,
  AiTool,
  AiToolExecutionContext,
  AiToolResult,
} from "@openpcb/ai-core";
import type { ToolManifestEntry } from "@openpcb/contracts";
import { COPILOT_TOOL_SCHEMAS } from "./copilot-tool-schemas.generated";

/** Tools that mutate cloud state (vs read-only lookups). */
const WRITE_TOOLS = new Set<string>(["datasheet_register", "memory_record"]);

/** Model-facing descriptions (the manifest carries none). */
const TOOL_DESCRIPTIONS: Record<string, string> = {
  component_search:
    "Search the OpenPCB cloud component catalog by keyword. Returns matching parts with specs.",
  datasheet_search:
    "Search indexed component datasheets for a query. Returns relevant excerpts with source citations.",
  datasheet_extract:
    "Extract structured facts (pinout, ratings) from a registered component datasheet.",
  datasheet_register:
    "Register a component datasheet (by MPN or URL) for ingestion so its facts become searchable.",
  memory_get_blocks:
    "Retrieve saved memory blocks (durable notes / preferences) for the current workspace.",
  memory_record:
    "Record a memory block (a durable note or preference) into the current workspace.",
};

/** Map the manifest's coarse duration class to a client-side timeout. */
function durationTimeoutMs(durationClass: "fast" | "slow"): number {
  return durationClass === "slow" ? 90_000 : 30_000;
}

export interface RemoteToolOptions {
  /** Copilot service base URL (…/  — NOT including /v1/…). */
  copilotBase: string;
  /** Returns the current GoTrue bearer for the run. */
  getBearer: () => string;
  /**
   * Caller's workspace id — sent as `x-openpcb-workspace-id`. The workspace-
   * scoped datasheet/memory tools require it (RBAC); component_search
   * (pro-only) ignores it. Undefined only if resolution was unavailable.
   */
  workspaceId?: string;
}

/** Pull an RFC-7807-ish human detail out of an error body. */
function problemDetail(data: unknown): string | null {
  if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    for (const k of ["detail", "title", "message"]) {
      if (typeof o[k] === "string") return o[k] as string;
    }
  }
  return null;
}

const SOURCE_KINDS = new Set<AiSourceRefKind>([
  "design",
  "schematic",
  "pcb",
  "net",
  "part",
  "library-component",
  "symbol",
  "footprint",
  "file",
  "tool",
  "external",
]);

/**
 * Normalize a response's `sources` array (cloud-copilot ships AiSourceRef
 * parity, e.g. datasheet_search citations) into AiSourceRef[] so citations
 * flow into the run's tool events. Malformed entries are dropped.
 */
function extractSources(data: unknown): AiSourceRef[] {
  if (!data || typeof data !== "object") return [];
  const raw = (data as { sources?: unknown }).sources;
  if (!Array.isArray(raw)) return [];
  const out: AiSourceRef[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const o = entry as Record<string, unknown>;
    if (typeof o.id !== "string" || o.id.length === 0) continue;
    const kind = SOURCE_KINDS.has(o.kind as AiSourceRefKind)
      ? (o.kind as AiSourceRefKind)
      : "file";
    out.push({
      id: o.id,
      kind,
      label: typeof o.label === "string" && o.label ? o.label : o.id,
      refId: typeof o.refId === "string" ? o.refId : undefined,
      path: typeof o.path === "string" ? o.path : undefined,
      metadata:
        o.metadata && typeof o.metadata === "object"
          ? (o.metadata as Record<string, unknown>)
          : undefined,
    });
  }
  return out;
}

async function callRemoteTool(
  name: string,
  input: unknown,
  ctx: AiToolExecutionContext,
  opts: RemoteToolOptions,
): Promise<AiToolResult> {
  const toolCallId = String(
    (ctx.metadata as { toolEventId?: string } | undefined)?.toolEventId ??
      ctx.runId,
  );
  const headers: Record<string, string> = {
    authorization: `Bearer ${opts.getBearer()}`,
    "content-type": "application/json",
    "x-openpcb-run-id": ctx.runId,
    "x-tool-call-id": toolCallId,
  };
  if (opts.workspaceId) headers["x-openpcb-workspace-id"] = opts.workspaceId;
  const res = await fetch(`${opts.copilotBase}/v1/tools/${name}`, {
    method: "POST",
    headers,
    body: JSON.stringify(input ?? {}),
    signal: ctx.signal,
  });
  const rawText = await res.text();
  let data: unknown = rawText;
  try {
    data = rawText ? JSON.parse(rawText) : null;
  } catch {
    // leave the raw text as data
  }
  if (!res.ok) {
    const detail = problemDetail(data) ?? `HTTP ${res.status}`;
    return {
      ok: false,
      data,
      sources: [],
      warnings: [detail],
      truncated: false,
      limits: ctx.limits,
      summary: `${name} failed: ${detail}`,
    };
  }
  return {
    ok: true,
    data,
    sources: extractSources(data),
    warnings: [],
    truncated: false,
    limits: ctx.limits,
  };
}

/** Build an AiTool from a manifest entry (D5.2). */
export function remoteTool(
  entry: ToolManifestEntry,
  opts: RemoteToolOptions,
): AiTool {
  return {
    definition: {
      name: entry.name,
      version: String(entry.version),
      effect: WRITE_TOOLS.has(entry.name) ? "write" : "read",
      capability: `cloud.${entry.name}`,
      description:
        TOOL_DESCRIPTIONS[entry.name] ?? `OpenPCB cloud tool ${entry.name}.`,
      inputSchema:
        COPILOT_TOOL_SCHEMAS[entry.inputSchemaRef] ??
        ({ type: "object" } as AiJsonSchemaObject),
      timeoutMs: durationTimeoutMs(entry.durationClass),
    },
    execute: (ctx, input) => callRemoteTool(entry.name, input, ctx, opts),
  };
}

/** Fetch the tool manifest and wrap every entry as a remote AiTool. */
export async function loadRemoteTools(
  opts: RemoteToolOptions,
): Promise<AiTool[]> {
  // Bounded: a hung copilot must not stall run start (caller degrades to []).
  const res = await fetch(`${opts.copilotBase}/v1/tools`, {
    headers: { authorization: `Bearer ${opts.getBearer()}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`GET /v1/tools -> ${res.status}`);
  const body = (await res.json()) as { tools?: ToolManifestEntry[] };
  return (body.tools ?? []).map((entry) => remoteTool(entry, opts));
}
