// D15 zero-config: auto-seed (or disable) the `openpcb-cloud` provider so a Pro
// user gets a working cloud AI provider with no settings visit. The backend
// upsert is idempotent; this effect just fires the POST when the effective
// Pro-session state changes. Best-effort — a failed seed never blocks the UI.

import { useEffect, useRef } from "react";
import { useAuth } from "../../../../core/frontend/src/cloud/AuthProvider";
import { readCloudConfig } from "../../../../core/frontend/src/cloud/config";
import { useFeatureFlag } from "../../../../core/frontend/src/feature-flags";

export function useCloudProviderSeed(
  backendURL: string | null | undefined,
): void {
  const cloudCopilotFlag = useFeatureFlag("cloud.copilot");
  const { session, tier } = useAuth();
  // Seed once per signed-in user + config (the session OBJECT changes on every
  // token refresh — re-seeding then would spam the backend and re-enable a
  // provider the user disabled mid-session). Non-null also gates `disable` to
  // sessions that actually seeded, avoiding a spurious POST on every cold start
  // for logged-out / free users.
  const seededKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!backendURL) return;
    const cfg = readCloudConfig();
    const base = `${backendURL}/api/modules/assistant/providers/cloud`;
    const isPro =
      cloudCopilotFlag &&
      Boolean(cfg.copilotUrl) &&
      Boolean(session) &&
      tier === "pro";

    if (isPro && session) {
      const key = `${session.user.id}|${cfg.copilotUrl}|${backendURL}`;
      if (seededKeyRef.current === key) return;
      seededKeyRef.current = key;
      void fetch(`${base}/seed`, {
        method: "POST",
        headers: {
          "x-cloud-bearer": session.access_token,
          "x-cloud-copilot-url": cfg.copilotUrl,
          ...(cfg.apiUrl ? { "x-cloud-api-url": cfg.apiUrl } : {}),
        },
      }).catch(() => {
        // best-effort — the provider list still works without the seed
      });
      return;
    }

    if (seededKeyRef.current !== null) {
      seededKeyRef.current = null;
      void fetch(`${base}/disable`, { method: "POST" }).catch(() => {});
    }
  }, [backendURL, cloudCopilotFlag, session, tier]);
}
