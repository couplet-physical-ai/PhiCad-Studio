// Version/capabilities client for the cloud auto-layout service.
// Shared by the autoroute + autoplace submit paths (one merged `/v1/version`
// reports both engines — see service-url.ts). Currently used to let the
// autoroute submit path negotiate `serializePours` against the deployed
// service's advertised `capabilities.pours.accepted` (see routes.ts) instead
// of hardcoding a producer-side default that could drift from what's
// actually deployed.

import type { VersionResponse } from "../../../../sdks/designer";
import { autoLayoutBaseUrl as baseUrl } from "./service-url";

// Capabilities change only on service deploy; this backend calls
// getAutoLayoutVersion() on every autoroute submit, so a short in-process TTL
// cache avoids adding a network round-trip to that path on the common case.
const CACHE_TTL_MS = 60_000;
const FETCH_TIMEOUT_MS = 2_000;

let cached: { at: number; value: VersionResponse } | null = null;

/**
 * Fetches `GET /v1/version`. Returns `null` (never throws) if the service is
 * unreachable, slow, or returns a non-2xx — callers must have a safe
 * fallback for "capabilities unknown" (see routes.ts's autoroute handler).
 * Serves a stale cached value on a transient failure rather than treating it
 * as "capabilities unknown", so a momentary blip doesn't flip behavior.
 */
export async function getAutoLayoutVersion(): Promise<VersionResponse | null> {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;
  try {
    const res = await fetch(`${baseUrl()}/v1/version`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return cached?.value ?? null;
    const value = (await res.json()) as VersionResponse;
    cached = { at: Date.now(), value };
    return value;
  } catch {
    return cached?.value ?? null;
  }
}

/** Test-only: clears the in-process version cache. Not part of the public API surface. */
export function __resetAutoLayoutVersionCacheForTests(): void {
  cached = null;
}

/**
 * Decides `serializePours` for an autoroute submit. An explicit `true`/`false` request
 * always wins (caller intent). Otherwise, defers to the service's advertised
 * `capabilities.pours.accepted` (`version` should be `null` when unknown/unreachable,
 * which resolves to `false` — identical to pre-capability-negotiation behavior).
 * Pure + synchronous so it's unit-testable without mocking `fetch`; the network call
 * itself is `getAutoLayoutVersion()`, kept as a separate step by callers.
 */
export function resolveSerializePours(
  requested: unknown,
  version: VersionResponse | null,
): boolean {
  if (requested === true || requested === false) return requested;
  return version?.capabilities?.pours?.accepted === true;
}
