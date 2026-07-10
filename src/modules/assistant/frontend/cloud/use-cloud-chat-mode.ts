// Shared cloud-chat-mode state for the assistant UIs (dock + full-page Space +
// settings). Encapsulates: whether Cloud Copilot is available (flag + copilot URL
// + signed-in Pro session), the persisted local/cloud choice (Pro users default
// to cloud), the per-request cloud credential headers, and the bound design's
// cloud-link status + link action (for the "sync to use Cloud Copilot" prompt).
//
// Cloud Copilot is surfaced as a selectable provider in the model picker; picking
// it flips `mode` to "cloud". The service enforces tier=pro server-side (the real
// boundary) — `available` just gates the dead UI for non-pro/logged-out users.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../../../core/frontend/src/cloud/AuthProvider";
import { readCloudConfig } from "../../../../core/frontend/src/cloud/config";
import { useFeatureFlag } from "../../../../core/frontend/src/feature-flags";

export type ChatMode = "local" | "cloud";

/** Synthetic provider id used in the model picker to represent Cloud Copilot. */
export const CLOUD_PROVIDER_ID = "__openpcb_cloud__";
export const CLOUD_PROVIDER_LABEL = "OpenPCB Cloud Copilot";

// Persisted choice records an *explicit* override only. Absent ⇒ follow the
// default (cloud when available), so a Pro user who switches to Local keeps it.
const CHAT_MODE_STORAGE_KEY = "openpcb.assistant.chatMode";

function readStoredChatMode(): ChatMode | null {
  try {
    const value = window.localStorage.getItem(CHAT_MODE_STORAGE_KEY);
    return value === "local" || value === "cloud" ? value : null;
  } catch {
    return null;
  }
}

export interface CloudChatMode {
  /** Cloud Copilot offered (flag + copilot URL + signed-in Pro session). */
  available: boolean;
  /** Effective mode — "cloud" only when available and not explicitly set to local. */
  mode: ChatMode;
  selectCloud: () => void;
  selectLocal: () => void;
  session: ReturnType<typeof useAuth>["session"];
  copilotUrl: string;
  apiUrl: string;
  /** x-cloud-* headers for cloud calls (bearer + urls); null when unavailable. */
  actionHeaders: Record<string, string> | null;
  /** Bound design cloud-link state: null = unknown/not applicable, false = show sync prompt. */
  linked: boolean | null;
  linking: boolean;
  linkError: string | null;
  /** Link (+ sync) the bound design to the cloud so cloud runs can read it. */
  link: () => Promise<void>;
}

export function useCloudChatMode(opts: {
  backendURL: string | null | undefined;
  designId?: string | null;
  designRevision?: number | null;
}): CloudChatMode {
  const { backendURL, designId, designRevision } = opts;
  const cloudCopilotFlag = useFeatureFlag("cloud.copilot");
  const { session, tier } = useAuth();
  const cloudCfg = useMemo(() => readCloudConfig(), []);

  const available =
    cloudCopilotFlag &&
    Boolean(cloudCfg.copilotUrl) &&
    Boolean(session) &&
    tier === "pro";

  const [override, setOverride] = useState<ChatMode | null>(() =>
    readStoredChatMode(),
  );
  const choose = useCallback((next: ChatMode) => {
    setOverride(next);
    try {
      window.localStorage.setItem(CHAT_MODE_STORAGE_KEY, next);
    } catch {
      // ignore persistence failures (storage disabled)
    }
  }, []);

  const mode: ChatMode =
    available && (override ?? "cloud") === "cloud" ? "cloud" : "local";

  const actionHeaders = useMemo(() => {
    if (!session || !cloudCfg.copilotUrl) return null;
    const headers: Record<string, string> = {
      "x-cloud-bearer": session.access_token,
      "x-cloud-copilot-url": cloudCfg.copilotUrl,
    };
    if (cloudCfg.apiUrl) headers["x-cloud-api-url"] = cloudCfg.apiUrl;
    return headers;
  }, [session, cloudCfg]);

  const designerBase = useMemo(
    () => (backendURL ? `${backendURL}/api/modules/designer` : null),
    [backendURL],
  );

  const [linked, setLinked] = useState<boolean | null>(null);
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== "cloud" || !designerBase || !designId) {
      setLinked(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `${designerBase}/designs/${encodeURIComponent(designId)}/cloud-link`,
        );
        if (cancelled) return;
        if (!res.ok) {
          setLinked(null);
          return;
        }
        const body = (await res.json()) as {
          data?: { link?: unknown } | null;
          link?: unknown;
        };
        const link = body.data?.link ?? body.link ?? null;
        if (!cancelled) setLinked(Boolean(link));
      } catch {
        if (!cancelled) setLinked(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, designerBase, designId, designRevision]);

  const link = useCallback(async () => {
    if (!designerBase || !designId || !actionHeaders) return;
    setLinking(true);
    setLinkError(null);
    try {
      const res = await fetch(
        `${designerBase}/designs/${encodeURIComponent(designId)}/cloud-link`,
        {
          method: "POST",
          headers: { ...actionHeaders, "content-type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      if (!res.ok) {
        const detail = await res
          .json()
          .then((b: { detail?: string; title?: string }) => b.detail ?? b.title)
          .catch(() => null);
        throw new Error(detail ?? `Sync failed (HTTP ${res.status})`);
      }
      setLinked(true);
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : String(err));
    } finally {
      setLinking(false);
    }
  }, [designerBase, designId, actionHeaders]);

  return {
    available,
    mode,
    selectCloud: () => choose("cloud"),
    selectLocal: () => choose("local"),
    session,
    copilotUrl: cloudCfg.copilotUrl,
    apiUrl: cloudCfg.apiUrl,
    actionHeaders,
    linked,
    linking,
    linkError,
    link,
  };
}
