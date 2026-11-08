import { useEffect, useState } from "react";
import { Check, Copy, Plug } from "lucide-react";
import type { AssistantSettings } from "../../../../../sdks/assistant";

/**
 * MCP server controls.
 *
 * Two independent switches, both default off: the server itself, and whether
 * write tools are advertised to it. They are separate because enabling the
 * server is about reachability (let an external MCP client discover Studio)
 * while enabling writes hands that process a scripted path to mutate designs.
 *
 * `settings-store.ts` also forces writes off whenever the server is off, so the
 * disabled state here matches what the backend will actually persist.
 */

interface Props {
  settings: AssistantSettings | null;
  onSave: (patch: Partial<AssistantSettings>) => void;
}

type Snippet = { id: string; label: string; hint: string; value: string };

function buildSnippets(config: McpConfig | null): Snippet[] {
  if (!config) return [];
  const snippets: Snippet[] = [];

  if (config.shimAvailable && config.shimPath) {
    snippets.push({
      id: "mcp-stdio",
      label: "MCP client (stdio)",
      hint: "Add this server to your MCP client configuration, then restart the client if needed.",
      value: JSON.stringify(
        {
          mcpServers: {
            "phicad-studio": {
              command: config.shimPath,
            },
          },
        },
        null,
        2,
      ),
    });
  }

  return snippets;
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => setCopied(true));
      }}
      className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-control border border-border px-2 py-1 text-[11px] text-text-secondary hover:bg-surface-hover"
    >
      {copied ? (
        <>
          <Check className="h-3 w-3" /> Copied
        </>
      ) : (
        <>
          <Copy className="h-3 w-3" /> Copy
        </>
      )}
    </button>
  );
}

export function McpSection({ settings, onSave }: Props) {
  const [config, setConfig] = useState<McpConfig | null>(null);
  const enabled = settings?.mcpEnabled ?? false;
  const allowWrites = settings?.mcpAllowWrites ?? false;

  useEffect(() => {
    if (!enabled) return;
    const api = window.electronAPI?.getMcpConfig;
    if (!api) return;
    // Re-read whenever the server is switched on: the URL carries the backend's
    // ephemeral port, which is new on every app launch.
    void api()
      .then(setConfig)
      .catch(() => setConfig(null));
  }, [enabled]);

  const snippets = buildSnippets(config);

  return (
    <section>
      <div className="mb-2.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-text-caps">
        <Plug className="h-3 w-3" /> MCP server
      </div>

      <p className="mb-2 text-xs text-text-tertiary">
        Lets an external MCP client discover Studio and inspect the design you
        have open. Studio must be running.
      </p>

      <label className="flex items-center gap-2 text-xs text-text-secondary">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onSave({ mcpEnabled: e.target.checked })}
          className="h-3.5 w-3.5"
        />
        Enable MCP server
      </label>

      <label
        className={`mt-2 flex items-center gap-2 text-xs ${
          enabled ? "text-text-secondary" : "text-text-disabled"
        }`}
      >
        <input
          type="checkbox"
          disabled={!enabled}
          checked={allowWrites}
          onChange={(e) => onSave({ mcpAllowWrites: e.target.checked })}
          className="h-3.5 w-3.5"
        />
        Allow writes from connected MCP clients
        <span className="rounded bg-amber-100 px-1.5 text-[9px] text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
          Caution
        </span>
      </label>

      {enabled && (
        <p className="mt-1.5 text-[11px] text-text-tertiary">
          {allowWrites
            ? "Native place, wire and edit tools are advertised. Successful edits use Studio's command history and remain undoable; protected destructive operations keep their approval contract."
            : "Read-only. Connected MCP clients can inspect designs, authority and preview capabilities, run ERC/DRC, and read the BOM, but cannot change anything."}
        </p>
      )}

      {enabled && snippets.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          {snippets.map((snippet) => (
            <div
              key={snippet.id}
              className="rounded-card border border-border p-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[11px] font-medium text-text-secondary">
                    {snippet.label}
                  </div>
                  <div className="text-[10px] text-text-tertiary">
                    {snippet.hint}
                  </div>
                </div>
                <CopyButton value={snippet.value} />
              </div>
              <pre className="mt-1.5 overflow-x-auto rounded bg-surface-panel p-1.5 text-[10px] text-text-secondary">
                {snippet.value}
              </pre>
            </div>
          ))}
        </div>
      )}

      {enabled && config && !config.shimAvailable && (
        <p className="mt-2 text-[11px] text-text-tertiary">
          The protected stdio bridge ships with packaged builds only. In a
          development build, use the authenticated loopback endpoint for smoke
          testing; never persist its per-launch token.
        </p>
      )}
    </section>
  );
}
