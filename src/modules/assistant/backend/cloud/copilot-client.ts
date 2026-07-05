// Cloud Copilot HTTP/SSE client (S5). Talks to the cloud-copilot FastAPI service
// (`/v1/copilot/...`) — NOT the cloud-api Hono backend. Follows the designer
// cloud-sync convention: the renderer passes the bearer per request
// (`x-cloud-bearer`); this backend never stores tokens.
//
// Streaming is fetch-based (Bun backend — no EventSource): the copilot stream
// endpoint emits `id:` (frame seq) + `event:` + `data:` (full CopilotStreamFrame
// JSON) and replays durably after `Last-Event-ID` on reconnect.

import type {
  CopilotPlanMutationResponse,
  CopilotPlanView,
  CopilotProposalView,
  CopilotStreamFrame,
  CreateCopilotRunRequest,
  CreateCopilotRunResponse,
  PatchCopilotPlanRequest,
  ResumeCopilotRunRequest,
} from "@openpcb/contracts";

export interface CopilotClientContext {
  /** Base URL of the cloud-copilot service, e.g. `http://localhost:3001`. */
  copilotUrl: string;
  /** GoTrue access token from the renderer's `x-cloud-bearer` header. */
  bearer: string;
}

export class CopilotHttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
    message?: string,
  ) {
    super(message ?? `copilot request failed: ${status} ${body.slice(0, 200)}`);
    this.name = "CopilotHttpError";
  }
}

function headers(ctx: CopilotClientContext, json = true): HeadersInit {
  return {
    authorization: `Bearer ${ctx.bearer}`,
    ...(json ? { "content-type": "application/json" } : {}),
  };
}

async function request<T>(
  ctx: CopilotClientContext,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${ctx.copilotUrl}${path}`, {
    method,
    headers: headers(ctx),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    throw new CopilotHttpError(res.status, await res.text());
  }
  return (await res.json()) as T;
}

export function createRun(
  ctx: CopilotClientContext,
  req: CreateCopilotRunRequest,
): Promise<CreateCopilotRunResponse> {
  return request(ctx, "POST", "/v1/copilot/runs", req);
}

export function getPlan(
  ctx: CopilotClientContext,
  runId: string,
): Promise<CopilotPlanView> {
  return request(ctx, "GET", `/v1/copilot/runs/${runId}/plan`);
}

export function patchPlan(
  ctx: CopilotClientContext,
  runId: string,
  req: PatchCopilotPlanRequest,
): Promise<CopilotPlanMutationResponse> {
  return request(ctx, "PATCH", `/v1/copilot/runs/${runId}/plan`, req);
}

export function approvePlan(
  ctx: CopilotClientContext,
  runId: string,
): Promise<{ status: string }> {
  return request(ctx, "POST", `/v1/copilot/runs/${runId}/plan/approve`, {});
}

/** S8: push the desktop-built BoardSnapshot before an agent run (layout tools
 * read the last-synced snapshot; `PUT /v1/copilot/designs/:id/board-snapshot`). */
export function putBoardSnapshot(
  ctx: CopilotClientContext,
  cloudDesignId: string,
  body: { revision: number; snapshot: unknown },
): Promise<{ designId: string; revision: number; snapshotHash: string }> {
  return request(
    ctx,
    "PUT",
    `/v1/copilot/designs/${cloudDesignId}/board-snapshot`,
    body,
  );
}

/** Release a run parked at a plan checkpoint (S7, `awaiting_input`). */
export function resumeRun(
  ctx: CopilotClientContext,
  runId: string,
  req: ResumeCopilotRunRequest = {},
): Promise<{ status: string }> {
  return request(ctx, "POST", `/v1/copilot/runs/${runId}/resume`, req);
}

export function listProposals(
  ctx: CopilotClientContext,
  runId: string,
): Promise<{ proposals: CopilotProposalView[] }> {
  return request(ctx, "GET", `/v1/copilot/runs/${runId}/proposals`);
}

export function stopRun(
  ctx: CopilotClientContext,
  runId: string,
): Promise<{ status: string }> {
  return request(ctx, "POST", `/v1/copilot/runs/${runId}/stop`, {});
}

export function rejectProposal(
  ctx: CopilotClientContext,
  runId: string,
  proposalId: string,
): Promise<{ status: string }> {
  return request(
    ctx,
    "POST",
    `/v1/copilot/runs/${runId}/proposals/${proposalId}/reject`,
    {},
  );
}

/** Idempotent applied-callback after a local proposal apply (S6 approve path). */
export function postApplied(
  ctx: CopilotClientContext,
  runId: string,
  proposalId: string,
  body: { revisionAfter?: number | null; retried?: boolean } = {},
): Promise<{ status: string }> {
  return request(
    ctx,
    "POST",
    `/v1/copilot/runs/${runId}/proposals/${proposalId}/applied`,
    body,
  );
}

// ── SSE ───────────────────────────────────────────────────────────────────────

export interface SseEvent {
  id: string | null;
  event: string | null;
  data: string;
}

/**
 * Incremental SSE parser (spec-subset: `id:`/`event:`/`data:`/comments; LF or
 * CRLF). Feed raw chunks, get complete events. Exported for unit tests.
 */
export class SseParser {
  private buffer = "";
  private id: string | null = null;
  private event: string | null = null;
  private data: string[] = [];

  feed(chunk: string): SseEvent[] {
    this.buffer += chunk;
    const events: SseEvent[] = [];
    for (;;) {
      const nl = this.buffer.indexOf("\n");
      if (nl === -1) break;
      let line = this.buffer.slice(0, nl);
      this.buffer = this.buffer.slice(nl + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);

      if (line === "") {
        if (this.data.length > 0) {
          events.push({
            id: this.id,
            event: this.event,
            data: this.data.join("\n"),
          });
        }
        this.event = null;
        this.data = [];
        continue;
      }
      if (line.startsWith(":")) continue; // comment / keep-alive ping

      const colon = line.indexOf(":");
      const field = colon === -1 ? line : line.slice(0, colon);
      let value = colon === -1 ? "" : line.slice(colon + 1);
      if (value.startsWith(" ")) value = value.slice(1);

      if (field === "id") this.id = value;
      else if (field === "event") this.event = value;
      else if (field === "data") this.data.push(value);
    }
    return events;
  }
}

const TERMINAL_FRAMES = new Set(["run.completed", "run.failed", "run.cancelled"]);

export interface StreamRunOptions {
  /** Resume point: replay durable frames after this SSE id (frame seq). */
  lastEventId?: string | null;
  signal?: AbortSignal;
  onFrame: (frame: CopilotStreamFrame) => void | Promise<void>;
}

export interface StreamRunResult {
  /** SSE id of the last frame consumed — pass back as `lastEventId` to resume. */
  lastEventId: string | null;
  /** True when a terminal frame (`run.completed|failed|cancelled`) was seen. */
  terminal: boolean;
}

/**
 * Consume one SSE connection for a run. Returns when the server ends the stream
 * (terminal frame) or the connection drops; the caller reconnects with
 * `lastEventId` until `terminal` is true.
 */
export async function streamRun(
  ctx: CopilotClientContext,
  runId: string,
  opts: StreamRunOptions,
): Promise<StreamRunResult> {
  const res = await fetch(`${ctx.copilotUrl}/v1/copilot/runs/${runId}/stream`, {
    headers: {
      ...headers(ctx, false),
      accept: "text/event-stream",
      ...(opts.lastEventId ? { "last-event-id": opts.lastEventId } : {}),
    },
    signal: opts.signal,
  });
  if (!res.ok || res.body === null) {
    throw new CopilotHttpError(res.status, await res.text());
  }

  const parser = new SseParser();
  const decoder = new TextDecoder();
  let lastEventId: string | null = opts.lastEventId ?? null;
  let terminal = false;

  const reader = res.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const ev of parser.feed(decoder.decode(value, { stream: true }))) {
        if (ev.id) lastEventId = ev.id;
        let frame: CopilotStreamFrame;
        try {
          frame = JSON.parse(ev.data) as CopilotStreamFrame;
        } catch {
          continue; // tolerate malformed keep-alives / partial writes
        }
        await opts.onFrame(frame);
        if (TERMINAL_FRAMES.has(frame.type)) terminal = true;
      }
      if (terminal) break;
    }
  } finally {
    reader.releaseLock();
    try {
      await res.body.cancel();
    } catch {
      // already closed
    }
  }
  return { lastEventId, terminal };
}
