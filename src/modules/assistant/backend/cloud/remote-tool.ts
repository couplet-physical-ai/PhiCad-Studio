// R4.4 remote tools: wrap a cloud-copilot tool-plane entry (GET /v1/tools) as an
// ai-core AiTool the LOCAL agent loop can call. The desktop keeps the only agent
// loop; each tool is a thin metered POST /v1/tools/{name} against the copilot
// service, gated Pro. Input schemas come from the committed vendored map
// (copilot-tool-schemas.generated.ts) so the model gets real arg schemas + Ajv
// validation; the per-run bearer + run id ride each call.
//
// B1 — trusted context. The cloud reads the workspace id from the request BODY
// for both RBAC and metering (routes/tools.py), never from the header. But the
// model cannot know a workspace UUID, and the canonical schemas mark that field
// `required`, so advertising them verbatim asks the model to invent one. So per
// tool we: (1) project the canonical schema for ADVERTISEMENT with the trusted
// field removed, (2) build the outgoing body by writing the resolved value at
// the trusted path LAST — overwriting anything the model supplied, since the
// schemas do not set `additionalProperties: false` — and (3) re-validate the
// injected body against the CANONICAL schema before it goes on the wire.
// A tool we have no policy for, whose schema has drifted, or whose trusted
// context is unresolved is NOT advertised: an advertise-and-fail tool burns
// model iterations and teaches it nothing.

import { createHash } from "node:crypto";
import { canonicalize } from "@openpcb/opclib-pack";
import {
  validateToolInput,
  type AiJsonSchemaObject,
  type AiSourceRef,
  type AiSourceRefKind,
  type AiTool,
  type AiToolExecutionContext,
  type AiToolResult,
} from "@openpcb/ai-core";
import type { ToolManifestEntry } from "@openpcb/contracts";
import { COPILOT_TOOL_SCHEMAS } from "./copilot-tool-schemas.generated";

/** Tools that mutate cloud state (vs read-only lookups). */
const WRITE_TOOLS = new Set<string>(["datasheet_register", "memory_record"]);

/**
 * How a tool receives its trusted (desktop-resolved, never model-supplied)
 * context. `workspace` writes the resolved workspace id at a root property;
 * `owner` replaces the whole `owner` ref, because the register route requires
 * `kind`/`id`/`workspaceId` together and rejects a null owner outright.
 */
type TrustedBinding =
  | { readonly kind: "none" }
  | { readonly kind: "workspace"; readonly property: string }
  | { readonly kind: "owner" };

interface RemoteToolPolicy {
  /** The schema this policy was written against; a mismatch means drift. */
  readonly schemaRef: string;
  readonly binding: TrustedBinding;
}

/**
 * Keyed by TOOL NAME, asserting the expected schema ref — not keyed by
 * inputSchemaRef, which is a wire type and says nothing about authorization.
 * Two tools may legitimately share a request model with different trust rules.
 */
const REMOTE_TOOL_POLICY: Record<string, RemoteToolPolicy> = {
  component_search: {
    schemaRef: "ComponentSearchRequest",
    binding: { kind: "none" },
  },
  datasheet_search: {
    schemaRef: "DatasheetSearchRequest",
    binding: { kind: "workspace", property: "workspaceId" },
  },
  datasheet_extract: {
    schemaRef: "DatasheetExtractRequest",
    binding: { kind: "workspace", property: "workspaceId" },
  },
  memory_get_blocks: {
    schemaRef: "MemoryGetBlocksRequest",
    binding: { kind: "workspace", property: "workspaceId" },
  },
  memory_record: {
    schemaRef: "MemoryRecordRequest",
    binding: { kind: "workspace", property: "workspaceId" },
  },
  datasheet_register: {
    schemaRef: "RegisterRequest",
    binding: { kind: "owner" },
  },
};

/** Fields OwnerRef requires together (cloud `$defs.OwnerRef.required`). */
const OWNER_REF_REQUIRED = ["kind", "workspaceId", "id"] as const;

/** Model-facing descriptions (the manifest carries none). */
const TOOL_DESCRIPTIONS: Record<string, string> = {
  component_search:
    "Search the OpenPCB cloud component catalog by keyword. Returns matching parts with specs.",
  datasheet_search:
    "Search indexed component datasheets for a query. Returns relevant excerpts with source citations.",
  datasheet_extract:
    "Extract structured facts (pinout, ratings) from a registered component datasheet.",
  datasheet_register:
    "Register a component datasheet (by MPN or URL) for ingestion so its facts become searchable. It is registered against the design you are working on.",
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
   * Caller's workspace id, resolved once per run by RunService. Required in the
   * BODY of every workspace-scoped tool (RBAC + metering); also still sent as
   * `x-openpcb-workspace-id` because /v1/llm requires that header.
   *
   * TODO(H10): this is the caller's PERSONAL workspace. Once designs can belong
   * to a team, it must be resolved from the design instead — otherwise cloud
   * RBAC and billing are attributed to the wrong workspace, silently.
   */
  workspaceId?: string;
  /**
   * Bound design id, if the chat has an active design binding. Required to
   * advertise `datasheet_register` (it owns the registration).
   */
  designId?: string;
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

/**
 * The vendored schemas carry `$defs`/`$ref`/`anyOf`, which AiJsonSchemaObject
 * does not model (the generated map is cast). Work on a loose runtime view.
 */
type RawSchema = Record<string, unknown>;

function asRaw(schema: AiJsonSchemaObject): RawSchema {
  return schema as unknown as RawSchema;
}

function rootProperties(schema: RawSchema): RawSchema | null {
  const props = schema.properties;
  if (!props || typeof props !== "object" || Array.isArray(props)) return null;
  return props as RawSchema;
}

function requiredList(schema: RawSchema): string[] {
  return Array.isArray(schema.required)
    ? (schema.required as unknown[]).filter(
        (v): v is string => typeof v === "string",
      )
    : [];
}

/**
 * Clone the canonical schema for ADVERTISEMENT with `property` removed from
 * `properties` and `required`. The vendored map stays canonical — the drift
 * guard (`gen:copilot-schemas:check`) compares generated source, not this.
 */
function projectSchema(
  canonical: AiJsonSchemaObject,
  property: string,
): AiJsonSchemaObject {
  const clone = structuredClone(asRaw(canonical));
  const props = rootProperties(clone);
  if (props) delete props[property];
  const required = requiredList(clone).filter((r) => r !== property);
  if (Array.isArray(clone.required)) clone.required = required;
  return clone as unknown as AiJsonSchemaObject;
}

/**
 * Assert the canonical schema still has the shape the policy was written
 * against. Drift ⇒ do not advertise, rather than silently posting an unscoped
 * body the cloud will reject (or worse, accept).
 */
function schemaMatchesBinding(
  canonical: AiJsonSchemaObject,
  binding: TrustedBinding,
): boolean {
  if (binding.kind === "none") return true;
  const raw = asRaw(canonical);
  const props = rootProperties(raw);
  if (!props) return false;

  if (binding.kind === "workspace") {
    // Must exist AND be required — if the cloud made it optional, the trust
    // model changed and this policy needs revisiting.
    return (
      binding.property in props &&
      requiredList(raw).includes(binding.property)
    );
  }

  // owner: the property exists and OwnerRef still requires the same triple.
  if (!("owner" in props)) return false;
  const defs = raw.$defs;
  if (!defs || typeof defs !== "object") return false;
  const ownerRef = (defs as RawSchema).OwnerRef;
  if (!ownerRef || typeof ownerRef !== "object") return false;
  const ownerRequired = requiredList(ownerRef as RawSchema);
  return OWNER_REF_REQUIRED.every((f) => ownerRequired.includes(f));
}

/**
 * Build the outgoing body. The trusted value is written LAST so a model-supplied
 * `workspaceId`/`owner` can never reach cloud RBAC or metering. Never mutates
 * the model's object.
 */
function bindTrustedInput(
  input: unknown,
  binding: TrustedBinding,
  opts: RemoteToolOptions,
): Record<string, unknown> {
  const base: Record<string, unknown> =
    input && typeof input === "object" && !Array.isArray(input)
      ? { ...(input as Record<string, unknown>) }
      : {};
  if (binding.kind === "none") return base;
  if (binding.kind === "workspace") {
    base[binding.property] = opts.workspaceId;
    return base;
  }
  base.owner = {
    kind: "design",
    id: opts.designId,
    workspaceId: opts.workspaceId,
  };
  return base;
}

/** Trusted context this binding needs before the tool can be advertised/called. */
function hasTrustedContext(
  binding: TrustedBinding,
  opts: RemoteToolOptions,
): boolean {
  if (binding.kind === "none") return true;
  if (!opts.workspaceId) return false;
  return binding.kind === "workspace" || Boolean(opts.designId);
}

/**
 * B12 — the cloud's metering idempotency key, derived so it is STABLE per
 * logical tool call.
 *
 * `POST /v1/tools/{name}` keys both metering and retry-safety on
 * `x-tool-call-id`, and its ledger UPSERT is last-write-wins — so exactly-once
 * billing depends entirely on this value repeating. Previously it came from
 * ai-core's `ctx.metadata.toolEventId`, which is minted per ATTEMPT, so a DoD
 * correction pass re-issuing the same search was billed again and re-ran the
 * write tools. (The old `?? ctx.runId` fallback was worse: it collapsed a whole
 * chat's billing onto one overwritten row.)
 *
 * Every desktop retry surface is "model re-decides", so no attempt counter or
 * nonce could ever be stable. The one invariant across a correction pass is
 * (run, tool, arguments) — hence a digest over exactly that.
 *
 * Scope is the RUN: correction passes within a turn dedupe; a user-initiated
 * retry mints a new run and is treated as new work.
 *
 * Hashes the body AFTER trusted-context injection, so the workspace/owner is
 * part of the identity. 64 hex chars satisfies the cloud's
 * `^[A-Za-z0-9_-]{8,128}$`.
 */
function deriveToolCallId(
  runId: string,
  toolName: string,
  body: Record<string, unknown>,
): string {
  return createHash("sha256")
    .update(runId)
    .update("\0")
    .update(toolName)
    .update("\0")
    // canonicalize sorts keys at every depth, so argument order never changes
    // the key.
    .update(canonicalize(body))
    .digest("hex");
}

function localFailure(
  name: string,
  detail: string,
  ctx: AiToolExecutionContext,
): AiToolResult {
  return {
    ok: false,
    data: null,
    sources: [],
    warnings: [detail],
    truncated: false,
    limits: ctx.limits,
    summary: `${name} failed: ${detail}`,
  };
}

async function callRemoteTool(
  name: string,
  input: unknown,
  ctx: AiToolExecutionContext,
  opts: RemoteToolOptions,
  policy: RemoteToolPolicy,
  canonicalSchema: AiJsonSchemaObject,
): Promise<AiToolResult> {
  // Context can go missing between load and call (e.g. the design binding was
  // dropped mid-run) — fail locally and unmetered rather than posting a body
  // the cloud will 422/403.
  if (!hasTrustedContext(policy.binding, opts))
    return localFailure(
      name,
      "OpenPCB Cloud workspace context is unavailable for this run",
      ctx,
    );

  const body = bindTrustedInput(input, policy.binding, opts);

  // The model was validated against the PROJECTED schema; re-validate the
  // injected body against the CANONICAL one so a projection bug surfaces here
  // instead of as an opaque cloud rejection.
  const errors = validateToolInput(canonicalSchema, body);
  if (errors.length > 0)
    return localFailure(
      name,
      `request did not match the cloud schema (${errors
        .map((e) => `${e.path}: ${e.message}`)
        .join("; ")})`,
      ctx,
    );

  const toolCallId = deriveToolCallId(ctx.runId, name, body);
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
    body: JSON.stringify(body),
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

/**
 * Build an AiTool from a manifest entry (D5.2), or `null` when the tool must
 * not be advertised: no policy for this name, an inputSchemaRef that disagrees
 * with the policy, a missing/drifted canonical schema, or trusted context we
 * cannot supply (e.g. `datasheet_register` with no bound design).
 */
export function remoteTool(
  entry: ToolManifestEntry,
  opts: RemoteToolOptions,
): AiTool | null {
  const policy = REMOTE_TOOL_POLICY[entry.name];
  if (!policy) return null;
  if (entry.inputSchemaRef !== policy.schemaRef) return null;
  const canonical = COPILOT_TOOL_SCHEMAS[entry.inputSchemaRef];
  if (!canonical) return null;
  if (!schemaMatchesBinding(canonical, policy.binding)) return null;
  if (!hasTrustedContext(policy.binding, opts)) return null;

  const advertised =
    policy.binding.kind === "none"
      ? canonical
      : projectSchema(
          canonical,
          policy.binding.kind === "workspace"
            ? policy.binding.property
            : "owner",
        );

  return {
    definition: {
      name: entry.name,
      version: String(entry.version),
      effect: WRITE_TOOLS.has(entry.name) ? "write" : "read",
      capability: `cloud.${entry.name}`,
      description:
        TOOL_DESCRIPTIONS[entry.name] ?? `OpenPCB cloud tool ${entry.name}.`,
      inputSchema: advertised,
      timeoutMs: durationTimeoutMs(entry.durationClass),
    },
    execute: (ctx, input) =>
      callRemoteTool(entry.name, input, ctx, opts, policy, canonical),
  };
}

/**
 * Fetch the tool manifest and wrap every advertisable entry as a remote AiTool.
 * Entries we have no policy for (or cannot supply context to) are omitted.
 */
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
  const tools: AiTool[] = [];
  for (const entry of body.tools ?? []) {
    const tool = remoteTool(entry, opts);
    if (tool) tools.push(tool);
  }
  return tools;
}
