// B2 — one shared cloud-context resolution path.
//
// The metered proxy requires `x-openpcb-workspace-id` on every /v1/llm call (a
// bare Pro bearer 400s — cloud-copilot app/routes/llm_proxy.py), and the
// workspace-scoped /v1/tools calls need the same id in their body. The desktop
// has no workspace context of its own, so it resolves one from cloud-api.
//
// Two callers need this: the per-run path (RunService) and the Settings provider
// endpoints (models refresh / test / capability probe). Before B2 only the run
// path had it, which is why "Test connection" and "Re-probe capabilities" always
// 401'd for the cloud provider. Keep it in one place so the two cannot drift.

export interface CloudApiCredentials {
  bearer: string;
  apiUrl: string;
}

export interface CloudWorkspaceContext {
  bearer: string;
  workspaceId: string;
}

/**
 * Resolve the caller's personal workspace id.
 * `GET {apiUrl}/v1/workspaces/me/personal` idempotently creates the workspace
 * and makes the caller its owner, which satisfies the proxy's workspace-member
 * RBAC. Throws a user-readable error (never a raw fetch failure).
 *
 * TODO(H10): this is deliberately the PERSONAL workspace. When designs can
 * belong to a team, the workspace must be resolved from the design instead, or
 * cloud RBAC and billing attribute to the wrong tenant.
 */
export async function resolveCloudWorkspace(
  creds: CloudApiCredentials,
): Promise<CloudWorkspaceContext> {
  const { bearer, apiUrl } = creds;
  if (!apiUrl.trim())
    throw new Error(
      "OpenPCB Cloud request is missing the cloud API URL — sign out and back in, then retry.",
    );
  const base = apiUrl.replace(/\/$/, "");
  let res: Response;
  try {
    res = await fetch(`${base}/v1/workspaces/me/personal`, {
      headers: { authorization: `Bearer ${bearer}` },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    throw new Error(
      `OpenPCB Cloud workspace resolution failed (${err instanceof Error ? err.message : String(err)}).`,
    );
  }
  if (!res.ok)
    throw new Error(
      `OpenPCB Cloud workspace resolution failed (HTTP ${res.status}).`,
    );
  const body = (await res.json()) as { id?: string };
  if (!body.id)
    throw new Error("OpenPCB Cloud workspace resolution returned no id.");
  return { bearer, workspaceId: body.id };
}

/**
 * Static headers every metered-proxy call must carry. `runId` is omitted for
 * one-off Settings calls that are not part of a run.
 */
export function cloudProxyHeaders(
  workspaceId: string,
  runId?: string,
): Record<string, string> {
  const headers: Record<string, string> = {
    "x-openpcb-workspace-id": workspaceId,
  };
  if (runId) headers["x-openpcb-run-id"] = runId;
  return headers;
}
