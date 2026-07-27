// B9 — turn an opaque cloud run failure into something the user can act on.
//
// ai-core sets `errorCode` to the stringified HTTP status only
// (providers/openai-compatible.ts), and the cloud's RFC-7807 body arrives
// concatenated into `errorMessage` as free text. So classification sniffs both,
// exactly as the existing 401 recovery path already does.
//
// Scope is deliberately 402 + 403. On the `/v1/llm` path the desktop actually
// uses, those are the only reachable typed failures: quota and concurrency
// (429) live on `/v1/copilot/runs`, which the local agent loop never calls.

export type CloudFailureKind = "out-of-credits" | "not-pro";

export interface CloudFailure {
  kind: CloudFailureKind;
  title: string;
  detail: string;
  /** Label for the call-to-action, when one is available. */
  actionLabel?: string;
}

/**
 * Classify a `run.failed` event for an `openpcb-cloud` run.
 *
 * Callers MUST gate on `provider.kind === "openpcb-cloud"` before calling —
 * a 403 from a BYO endpoint means something else entirely, and telling the user
 * to upgrade their OpenPCB plan would be wrong.
 *
 * Returns null for anything unrecognised so the generic error path still runs.
 */
export function classifyCloudFailure(
  errorCode: string | undefined,
  errorMessage: string | undefined,
): CloudFailure | null {
  const message = errorMessage ?? "";

  // 402: the one fully typed case — cloud-copilot emits code "wallet-denied"
  // (app/routes/llm_proxy.py). Match either signal.
  if (errorCode === "402" || /wallet-denied/i.test(message)) {
    return {
      kind: "out-of-credits",
      title: "Out of AI credits",
      detail:
        "This workspace has no cloud AI credits left. Top up to keep using the cloud assistant, or switch to a local provider in Settings.",
      actionLabel: "Manage billing",
    };
  }

  // 403: `require_pro` raises a bare string detail, so there is no `code` to
  // match on — the status is all we get.
  if (errorCode === "403" || /pro tier required/i.test(message)) {
    return {
      kind: "not-pro",
      title: "Pro plan required",
      detail:
        "The cloud assistant is available on the Pro plan. You can keep using a local provider in the meantime.",
      actionLabel: "See plans",
    };
  }

  return null;
}

/** Where the call-to-action points, when the cloud web URL is configured. */
export function cloudFailureActionUrl(
  failure: CloudFailure,
  webUrl: string,
): string | null {
  if (!webUrl) return null;
  const base = webUrl.replace(/\/$/, "");
  return failure.kind === "out-of-credits"
    ? `${base}/billing`
    : `${base}/pricing`;
}
