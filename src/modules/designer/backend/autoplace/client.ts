// Thin HTTP client for the place endpoints of the cloud auto-layout service
// (cloud-auto-layout, /v1/place, :3002 — formerly the standalone cloud-auto-place).
// The desktop backend proxies to it: assemble a BoardSnapshot (with placeOptions),
// submit, poll for the result, forward the user's GoTrue bearer. Mirrors
// autoroute/client.ts. The service URL is a deployment constant (env), not per-request.

import type {
  BoardSnapshot,
  PlaceStatusResponse,
  SubmitPlaceResponse,
} from "../../../../sdks/designer";
import { autoLayoutBaseUrl as baseUrl } from "../autolayout/service-url";

function authHeaders(bearer?: string): Record<string, string> {
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
  return new Error(`auto-place ${res.status}: ${detail}`);
}

/** Submit a snapshot. Returns the job id + status/stream URLs + snapshot hash. */
export async function submitPlace(
  snapshot: BoardSnapshot,
  bearer?: string,
): Promise<SubmitPlaceResponse> {
  const res = await fetch(`${baseUrl()}/v1/place`, {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders(bearer) },
    body: JSON.stringify(snapshot),
  });
  if (!res.ok) throw await asError(res, "place submit failed");
  return (await res.json()) as SubmitPlaceResponse;
}

/** Poll a job's status + (on completion) its PlacementResultEnvelope. */
export async function getPlaceStatus(
  jobId: string,
  bearer?: string,
): Promise<PlaceStatusResponse> {
  const res = await fetch(
    `${baseUrl()}/v1/place/${encodeURIComponent(jobId)}`,
    { headers: authHeaders(bearer) },
  );
  if (!res.ok) throw await asError(res, "place status failed");
  return (await res.json()) as PlaceStatusResponse;
}

/** Request cooperative cancellation of a running job. */
export async function cancelPlace(
  jobId: string,
  bearer?: string,
): Promise<void> {
  const res = await fetch(
    `${baseUrl()}/v1/place/${encodeURIComponent(jobId)}/cancel`,
    { method: "POST", headers: authHeaders(bearer) },
  );
  if (!res.ok) throw await asError(res, "place cancel failed");
}
