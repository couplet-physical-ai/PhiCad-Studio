// HTTP client for the composite `/v1/layout` endpoints of cloud-auto-layout.
//
// Same proxy shape as the route/place clients — assemble a BoardSnapshot, submit, follow
// progress, fetch the result, forward the user's GoTrue bearer — with two differences:
// every failure is normalized into a typed AutoLayoutError (see ./errors.ts) rather than a
// stringly-typed Error, and the SSE stream is proxied rather than exposed, so the renderer
// never holds a cloud URL or token.

import type { BoardSnapshot } from "../../../../sdks/designer";
import type {
  CancelJobResponse,
  JobStatusResponse,
  LayoutResultEnvelope,
  SelectionResponse,
  SubmitJobResponse,
} from "../../../../sdks/designer/cloud-autolayout";
import { AutoLayoutError, errorFromNetwork, errorFromResponse } from "./errors";
import { parseLayoutResult } from "./parsers";
import { autoLayoutBaseUrl as baseUrl } from "./service-url";

function authHeaders(bearer: string): Record<string, string> {
  return bearer ? { authorization: `Bearer ${bearer}` } : {};
}

async function request(
  path: string,
  init: RequestInit,
  context: string,
): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl()}${path}`, init);
  } catch (cause) {
    throw errorFromNetwork(cause, context);
  }
  if (!res.ok) {
    // A deployment with LAYOUT_ENABLED=false does not mount /v1/layout at all, so a submit
    // 404s. Distinguish that from "this job id is unknown", which is also a 404 but only
    // reachable on a per-job path.
    if (res.status === 404 && !path.includes("/v1/layout/")) {
      throw new AutoLayoutError(
        "AUTO_LAYOUT_SERVICE_UNSUPPORTED",
        "The deployed OpenPCB Cloud service does not support Auto Layout.",
      );
    }
    throw await errorFromResponse(res, context);
  }
  return res;
}

/** Submit a board snapshot for composite layout. 202 → job id + status/stream URLs. */
export async function submitLayout(
  snapshot: BoardSnapshot,
  bearer: string,
): Promise<SubmitJobResponse> {
  const res = await request(
    "/v1/layout",
    {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders(bearer) },
      body: JSON.stringify(snapshot),
    },
    "layout submit",
  );
  return (await res.json()) as SubmitJobResponse;
}

/** Job status; `result` is present once terminal (a cancelled job may carry a partial). */
export async function getLayoutStatus(
  jobId: string,
  bearer: string,
): Promise<JobStatusResponse> {
  const res = await request(
    `/v1/layout/${encodeURIComponent(jobId)}`,
    { headers: authHeaders(bearer) },
    "layout status",
  );
  return (await res.json()) as JobStatusResponse;
}

/**
 * The validated result envelope for a finished job.
 *
 * Throws `AUTO_LAYOUT_RESULT_EXPIRED` when the job outlived its TTL or has not produced a
 * result — the apply path must never fall back to renderer-supplied operations.
 */
export async function getLayoutResult(
  jobId: string,
  bearer: string,
): Promise<LayoutResultEnvelope> {
  const status = await getLayoutStatus(jobId, bearer);
  if (!status.result) {
    throw new AutoLayoutError(
      "AUTO_LAYOUT_RESULT_EXPIRED",
      status.status === "running" || status.status === "queued"
        ? "This Auto Layout job has not finished yet."
        : "This Auto Layout result is no longer available — run it again.",
      { detail: { status: status.status, error: status.error } },
    );
  }
  return parseLayoutResult(status.result);
}

/** Cooperative cancellation; the job keeps running until it notices. */
export async function cancelLayout(
  jobId: string,
  bearer: string,
): Promise<CancelJobResponse> {
  const res = await request(
    `/v1/layout/${encodeURIComponent(jobId)}/cancel`,
    { method: "POST", headers: authHeaders(bearer) },
    "layout cancel",
  );
  return (await res.json()) as CancelJobResponse;
}

/**
 * Record which candidate the user applied — the supervision label for future ML.
 *
 * Best-effort by contract: callers fire it AFTER a successful commit and ignore failures.
 * A telemetry write must never be able to undo a board change.
 */
export async function selectLayoutCandidate(
  jobId: string,
  candidateId: string,
  bearer: string,
): Promise<SelectionResponse> {
  const res = await request(
    `/v1/layout/${encodeURIComponent(jobId)}/selection`,
    {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders(bearer) },
      body: JSON.stringify({ candidateId }),
    },
    "layout selection",
  );
  return (await res.json()) as SelectionResponse;
}

/**
 * Open the job's SSE stream for proxying. Returns the raw upstream response so the caller
 * can pipe the body through unchanged (preserving frame ids, which are what `Last-Event-ID`
 * resumes from).
 */
export async function openLayoutStream(
  jobId: string,
  bearer: string,
  lastEventId: string | null,
): Promise<Response> {
  return request(
    `/v1/layout/${encodeURIComponent(jobId)}/stream`,
    {
      headers: {
        accept: "text/event-stream",
        ...authHeaders(bearer),
        ...(lastEventId ? { "last-event-id": lastEventId } : {}),
      },
    },
    "layout stream",
  );
}
