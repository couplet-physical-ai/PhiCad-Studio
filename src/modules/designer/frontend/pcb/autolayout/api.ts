// Typed client for the local Auto Layout endpoints.
//
// Separate from the general designer api client for one reason: this surface's errors are
// machine-readable. The shared `fetchData` flattens an RFC 7807 problem into
// `new Error(detail)`, which is fine for "something went wrong" UI but useless here — the
// dialog has to distinguish "sign in" from "another job is running" from "your service is
// too old" from "the board changed", and it must never do that by matching English.

import type {
  JobStatusResponse,
  LayoutResultEnvelope,
  SubmitJobResponse,
} from "../../../../../sdks/designer/cloud-autolayout";
import type {
  DrcReport,
  PlaceOptions,
  RouteOptions,
} from "../../../../../sdks/designer";

export type AutoLayoutErrorCode =
  | "AUTO_LAYOUT_AUTH_REQUIRED"
  | "AUTO_LAYOUT_FORBIDDEN"
  | "AUTO_LAYOUT_QUOTA_EXCEEDED"
  | "AUTO_LAYOUT_SNAPSHOT_INVALID"
  | "AUTO_LAYOUT_SERVICE_UNSUPPORTED"
  | "AUTO_LAYOUT_RESULT_EXPIRED"
  | "AUTO_LAYOUT_STALE"
  | "AUTO_LAYOUT_INVALID_CANDIDATE"
  | "AUTO_LAYOUT_CANDIDATE_NOT_APPLICABLE"
  | "AUTO_LAYOUT_OPERATION_INVALID"
  | "AUTO_LAYOUT_REVISION_CONFLICT"
  | "AUTO_LAYOUT_CONTRACT_MISMATCH"
  | "AUTO_LAYOUT_SERVICE_ERROR"
  | "AUTO_LAYOUT_UNKNOWN";

export class AutoLayoutClientError extends Error {
  readonly code: AutoLayoutErrorCode;
  readonly detail: unknown;

  constructor(code: AutoLayoutErrorCode, message: string, detail?: unknown) {
    super(message);
    this.name = "AutoLayoutClientError";
    this.code = code;
    this.detail = detail;
  }
}

export interface SubmitLayoutResponse extends SubmitJobResponse {
  warnings: string[];
  /** Staleness key to hand back at apply time (NOT the revision — view state bumps that). */
  snapshotDigest: string;
  baseRevision: number;
  maxCandidates: number | null;
}

export interface ApplyCandidateResponse {
  applied: true;
  revision: number;
  jobId: string;
  candidateId: string;
  placementOperationCount: number;
  routeOperationCount: number;
  drc: DrcReport | null;
  warnings: string[];
}

export interface AutoLayoutApiOptions {
  backendURL: string | null | undefined;
  moduleId: string;
  designId: string;
  /** Same zero-arg provider the rest of the designer api uses (cloud bearer + api url). */
  cloudHeaders?: () => Record<string, string | undefined>;
}

function baseUrl(options: AutoLayoutApiOptions): string {
  const root = options.backendURL ?? "";
  return `${root}/api/modules/${options.moduleId}/designs/${encodeURIComponent(
    options.designId,
  )}/autolayout`;
}

function headers(
  options: AutoLayoutApiOptions,
  init: Record<string, string> = {},
): HeadersInit {
  const cloud = options.cloudHeaders?.() ?? {};
  const merged: Record<string, string> = { ...init };
  for (const [key, value] of Object.entries(cloud)) {
    if (typeof value === "string") merged[key] = value;
  }
  return merged;
}

async function request<T>(
  url: string,
  options: AutoLayoutApiOptions,
  init: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (cause) {
    throw new AutoLayoutClientError(
      "AUTO_LAYOUT_SERVICE_ERROR",
      "OpenPCB could not reach its backend.",
      cause,
    );
  }
  if (!response.ok) {
    // The backend answers typed failures as problem+json carrying `code`; anything else
    // (an unexpected 500, a proxy page) collapses to UNKNOWN rather than being guessed at.
    let code: AutoLayoutErrorCode = "AUTO_LAYOUT_UNKNOWN";
    let message = `Request failed (${response.status})`;
    let detail: unknown;
    try {
      const problem = (await response.json()) as {
        code?: string;
        title?: string;
        detail?: unknown;
      };
      if (typeof problem.code === "string") code = problem.code as AutoLayoutErrorCode;
      if (typeof problem.title === "string") message = problem.title;
      detail = problem.detail;
    } catch {
      // non-JSON body
    }
    throw new AutoLayoutClientError(code, message, detail);
  }
  const payload = (await response.json()) as { data?: T };
  if (payload.data === undefined) {
    throw new AutoLayoutClientError(
      "AUTO_LAYOUT_CONTRACT_MISMATCH",
      "The backend returned an empty response.",
    );
  }
  return payload.data;
}

export interface SubmitLayoutRequest {
  routeOptions?: RouteOptions;
  placeOptions?: PlaceOptions;
  routableNetClassIds?: string[];
  excludedNetIds?: string[];
  serializePours?: boolean;
}

export function createAutoLayoutApi(options: AutoLayoutApiOptions) {
  const root = baseUrl(options);
  return {
    submit(body: SubmitLayoutRequest): Promise<SubmitLayoutResponse> {
      return request<SubmitLayoutResponse>(root, options, {
        method: "POST",
        headers: headers(options, { "content-type": "application/json" }),
        body: JSON.stringify(body),
      });
    },

    status(jobId: string): Promise<JobStatusResponse & { result?: LayoutResultEnvelope }> {
      return request(`${root}/${encodeURIComponent(jobId)}`, options, {
        headers: headers(options),
      });
    },

    cancel(jobId: string): Promise<{ jobId: string; cancelRequested: boolean }> {
      return request(`${root}/${encodeURIComponent(jobId)}/cancel`, options, {
        method: "POST",
        headers: headers(options),
      });
    },

    apply(body: {
      jobId: string;
      candidateId: string;
      snapshotDigest: string;
      applyRequestId: string;
      sessionId: string;
    }): Promise<ApplyCandidateResponse> {
      return request<ApplyCandidateResponse>(`${root}/apply`, options, {
        method: "POST",
        headers: headers(options, { "content-type": "application/json" }),
        body: JSON.stringify(body),
      });
    },

    /** URL of the local SSE proxy. EventSource cannot carry headers — see useAutoLayoutJob. */
    streamUrl(jobId: string): string {
      return `${root}/${encodeURIComponent(jobId)}/stream`;
    },
  };
}

export type AutoLayoutApi = ReturnType<typeof createAutoLayoutApi>;
