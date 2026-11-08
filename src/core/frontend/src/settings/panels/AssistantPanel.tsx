import { useEffect, useMemo, useState } from "react";
import { Bot, ExternalLink, ShieldCheck } from "lucide-react";
import { useRuntime } from "../../providers/RuntimeProvider";
import { McpSection } from "./McpSection";
import type { AssistantSettings } from "../../../../../sdks/assistant";

async function readJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const body = (await response
      .json()
      .catch(() => ({ detail: response.statusText }))) as {
      detail?: string;
      error?: string;
      title?: string;
    };
    throw new Error(
      body.detail ?? body.error ?? body.title ?? `HTTP ${response.status}`,
    );
  }
  return response.json() as Promise<T>;
}

/**
 * V1 intentionally exposes only the protected MCP bridge here. An external MCP
 * client supplies its own model; Studio neither collects model credentials nor
 * starts an embedded agent. The backend module id and stored provider rows stay
 * untouched for upstream data compatibility, but they are not product UI.
 */
export function AssistantPanel() {
  const { backendURL } = useRuntime();
  const base = useMemo(
    () => (backendURL ? `${backendURL}/api/modules/assistant` : null),
    [backendURL],
  );
  const [settings, setSettings] = useState<AssistantSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!base) return;
    void readJson<AssistantSettings>(`${base}/settings`)
      .then(setSettings)
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : String(reason)),
      );
  }, [base]);

  const saveSettings = async (patch: Partial<AssistantSettings>) => {
    if (!base) return;
    setError(null);
    try {
      const next = await readJson<AssistantSettings>(`${base}/settings`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      setSettings(next);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  return (
    <div className="space-y-5 pb-24 text-text-strong">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Bot className="h-4 w-4" /> MCP client
        </h2>
        <p className="mt-1 text-sm text-text-tertiary">
          Connect your MCP client to Studio through the protected MCP bridge.
          Studio does not request or store model credentials.
        </p>
      </div>

      <section className="rounded-control border border-status-info/30 bg-status-info-soft p-3">
        <div className="flex items-center gap-1.5 text-xs font-semibold">
          <ShieldCheck className="h-3.5 w-3.5 text-status-info" /> MCP connection,
          explicit authority
        </div>
        <p className="mt-1.5 text-xs leading-5 text-text-secondary">
          Your MCP client discovers capabilities over MCP. Native OpenPCB ECS,
          command history, DRC, and export remain authoritative; the tscircuit
          path is read-only preview in V1.
        </p>
        <a
          href="https://github.com/couplet-physical-ai/PhiCad-Studio/blob/master/docs/mcp-setup.md"
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-xs text-text-secondary underline underline-offset-2 hover:text-text-strong"
        >
          Connection guide <ExternalLink className="h-3 w-3" />
        </a>
      </section>

      {error ? (
        <div
          role="alert"
          className="rounded-control border border-status-danger/30 bg-status-danger-soft p-3 text-xs text-status-danger"
        >
          {error}
        </div>
      ) : null}

      <McpSection
        settings={settings}
        onSave={(patch) => void saveSettings(patch)}
      />
    </div>
  );
}
