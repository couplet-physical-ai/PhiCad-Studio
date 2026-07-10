// Thin HTTP client for the route endpoints of the cloud auto-layout service
// (cloud-auto-layout, /v1/route, :3002 — formerly the standalone cloud-auto-router).
// The desktop backend proxies to it: assemble a BoardSnapshot, submit, poll for
// the result, forward the user's GoTrue bearer. Mirrors the fetch style of
// cloud-sync.ts. The service URL is a deployment constant (env), not per-request.

import type {
  BoardSnapshot,
  RouteStatusResponse,
  SubmitRouteResponse,
} from "../../../../sdks/designer";
import { autoLayoutBaseUrl as baseUrl } from "../autolayout/service-url";

function authHeaders(bearer: string): Record<string, string> {
  return bearer ? { authorization: `Bearer ${bearer}` } : {};
}

async function asError(res: Response, fallback: string): Promise<Error> {
  let detail = fallback;
  try {
    const body = (await res.json()) as { detail?: unknown };
    if (typeof body?.detail === "string") detail = body.detail;
  } catch {
    // non-JSON body — keep the fallback
  }
  return new Error(`auto-router ${res.status}: ${detail}`);
}

/** Submit a snapshot. Returns the job id + status/stream URLs + snapshot hash. */
export async function submitRoute(
  snapshot: BoardSnapshot,
  bearer: string,
): Promise<SubmitRouteResponse> {
  const res = await fetch(`${baseUrl()}/v1/route`, {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders(bearer) },
    body: JSON.stringify(snapshot),
  });
  if (!res.ok) throw await asError(res, "route submit failed");
  return (await res.json()) as SubmitRouteResponse;
}

/** Poll a job's status + (on completion) its RouteResultEnvelope. */
export async function getRouteStatus(
  jobId: string,
  bearer: string,
): Promise<RouteStatusResponse> {
  const res = await fetch(
    `${baseUrl()}/v1/route/${encodeURIComponent(jobId)}`,
    { headers: authHeaders(bearer) },
  );
  if (!res.ok) throw await asError(res, "route status failed");
  return (await res.json()) as RouteStatusResponse;
}

/** Request cooperative cancellation of a running job. */
export async function cancelRoute(
  jobId: string,
  bearer: string,
): Promise<void> {
  const res = await fetch(
    `${baseUrl()}/v1/route/${encodeURIComponent(jobId)}/cancel`,
    { method: "POST", headers: authHeaders(bearer) },
  );
  if (!res.ok) throw await asError(res, "route cancel failed");
}
