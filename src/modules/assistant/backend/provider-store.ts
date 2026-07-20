import { ValidationError } from "../../../core/contracts/errors";
import { isFeatureEnabled } from "../../../core/contracts/feature-flags/backend";
import type { CoreBackendModuleContext } from "../../../core/contracts/modules/backend-module";
import type {
  AssistantProviderConfig,
  AssistantProviderConfigInput,
  AssistantProviderModel,
  AiProviderCapabilities,
  AiProviderKind,
} from "../../../sdks/assistant";
import { AI_PROVIDER_PRESETS, getPresetByKind } from "@openpcb/ai-core";

export interface InternalProviderConfig extends AssistantProviderConfig {
  apiKey: string | null;
  /** Manual tool-calling override: null = auto (probe), true = on, false = off. */
  toolCallingOverride: boolean | null;
}

export type ToolCallingMode = "auto" | "on" | "off";

function overrideToMode(override: boolean | null): ToolCallingMode {
  return override === null ? "auto" : override ? "on" : "off";
}
function modeToOverride(mode: ToolCallingMode): boolean | null {
  return mode === "auto" ? null : mode === "on";
}

/**
 * Apply a manual override on top of probed capabilities. In auto mode the probe
 * result is used verbatim. When forced on/off the `toolCalling` flag is overridden,
 * synthesizing a minimal capabilities object when the provider was never probed.
 */
function applyToolCallingOverride(
  caps: AiProviderCapabilities | null,
  override: boolean | null,
): AiProviderCapabilities | null {
  if (override === null) return caps;
  if (caps) return { ...caps, toolCalling: override };
  return { streaming: true, toolCalling: override, modelList: true };
}

type RawSqlFn = (q: string, p?: unknown[]) => Record<string, unknown>[];

function rawSqlFrom(ctx: CoreBackendModuleContext): RawSqlFn {
  return (
    ctx.db as { rawSql<T = unknown>(q: string, p?: unknown[]): T[] }
  ).rawSql.bind(ctx.db);
}
function now(): string {
  return new Date().toISOString();
}
function id(): string {
  return crypto.randomUUID();
}
function bool(v: unknown): boolean {
  return Number(v) === 1 || v === true;
}
function apiKeyPreview(apiKey: string | null): string | null {
  if (!apiKey) return null;
  if (apiKey.length <= 8) return "••••";
  return `${apiKey.slice(0, 4)}••••${apiKey.slice(-4)}`;
}

function rowToCapabilities(
  row: Record<string, unknown> | undefined,
): AiProviderCapabilities | null {
  if (!row) return null;
  return {
    streaming: bool(row.streaming),
    toolCalling: bool(row.tool_calling),
    modelList: bool(row.model_list),
    vision: row.vision === null ? undefined : bool(row.vision),
    jsonMode: row.json_mode === null ? undefined : bool(row.json_mode),
    maxContextTokens:
      row.max_context_tokens === null
        ? undefined
        : Number(row.max_context_tokens),
    checkedAt: row.checked_at ? String(row.checked_at) : undefined,
    warning: row.warning ? String(row.warning) : undefined,
  };
}

const VALID_KINDS: AiProviderKind[] = [
  "openai",
  "openrouter",
  "openai-compatible",
  "lmstudio",
  "omlx",
  // Auto-seeded for Pro users (D15); never created via "Add provider", but a
  // valid stored kind so the seed + update paths accept it.
  "openpcb-cloud",
];

// Curated built-ins seeded on first run. `openai-compatible` is intentionally
// excluded — it stays a valid kind so users can add their own custom endpoint
// via "Add provider", but we don't ship it as a default preset.
const SEEDED_BUILTIN_KINDS: AiProviderKind[] = [
  "openai",
  "openrouter",
  "lmstudio",
  "omlx",
];

// Cloud providers seeded from env: paste-key flow, enabled only once a key exists.
const CLOUD_ENV: Partial<
  Record<AiProviderKind, { key: string; base: string; model: string }>
> = {
  openai: {
    key: "OPENAI_API_KEY",
    base: "OPENAI_BASE_URL",
    model: "OPENAI_MODEL",
  },
  openrouter: {
    key: "OPENROUTER_API_KEY",
    base: "OPENROUTER_BASE_URL",
    model: "OPENROUTER_MODEL",
  },
};

/** Stable row id for the D15 auto-seeded OpenPCB Cloud provider. */
const CLOUD_PROVIDER_ROW_ID = "openpcb-cloud";

export class ProviderStore {
  private readonly rawSql: RawSqlFn;

  constructor(ctx: CoreBackendModuleContext) {
    this.rawSql = rawSqlFrom(ctx);
  }

  ensureDefaults(): void {
    const timestamp = now();
    // Seed curated presets as builtins (disabled by default for those that need user setup).
    for (const preset of AI_PROVIDER_PRESETS) {
      if (!SEEDED_BUILTIN_KINDS.includes(preset.kind)) continue;
      const presetId = preset.kind; // stable id == kind for builtins
      const existing = this.rawSql(
        "SELECT id FROM assistant_provider_config WHERE id=?",
        [presetId],
      )[0];
      if (existing) continue;
      const env = CLOUD_ENV[preset.kind];
      // Cloud provider presets (OpenAI / OpenRouter) are gated dev-only; local
      // providers (LM Studio / oMLX / Ollama) always seed. Skip only the
      // cloud-backed presets when the flag is off.
      if (env && !isFeatureEnabled("cloud.assistantProviders")) continue;
      const apiKey = env ? (process.env[env.key] ?? null) : null;
      const baseUrl = env
        ? (process.env[env.base] ?? preset.defaultBaseUrl)
        : preset.defaultBaseUrl;
      const defaultModel = env
        ? (process.env[env.model] ?? preset.defaultModel)
        : preset.defaultModel;
      // Cloud providers activate once a key exists; local providers stay disabled until configured.
      const enabled = env ? (apiKey ? 1 : 0) : 0;
      this.rawSql(
        "INSERT INTO assistant_provider_config (id,label,kind,base_url,api_key,default_model,enabled,is_builtin,created_at,updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          presetId,
          preset.label,
          preset.kind,
          baseUrl,
          apiKey,
          defaultModel,
          enabled,
          1,
          timestamp,
          timestamp,
        ],
      );
    }
  }

  /**
   * D15 zero-config seed: idempotently upsert the openpcb-cloud provider row for
   * a signed-in Pro session. `baseUrl` targets the metered LLM proxy; the bearer
   * is supplied per run (never stored). Re-enables an existing row and refreshes
   * its baseUrl/model. Returns the public config.
   */
  seedCloudProvider(input: {
    baseUrl: string;
    defaultModel?: string;
  }): AssistantProviderConfig {
    const timestamp = now();
    const existing = this.rawSql(
      "SELECT default_model FROM assistant_provider_config WHERE id=?",
      [CLOUD_PROVIDER_ROW_ID],
    )[0];
    if (existing) {
      // Keep any model already resolved unless a fresh one is supplied. Also
      // default a missing tool-calling override to "on" (COALESCE keeps an
      // explicit user on/off) — see the INSERT note below.
      const model =
        input.defaultModel?.trim() || String(existing.default_model ?? "");
      this.rawSql(
        "UPDATE assistant_provider_config SET base_url=?, default_model=?, enabled=1, tool_calling_override=COALESCE(tool_calling_override, 1), updated_at=? WHERE id=?",
        [input.baseUrl, model, timestamp, CLOUD_PROVIDER_ROW_ID],
      );
    } else {
      const preset = getPresetByKind("openpcb-cloud");
      // tool_calling_override=1: the capability probe runs WITHOUT the per-run
      // bearer (it is never stored), so a user-triggered probe would record
      // toolCalling=false and silently strip every tool from cloud runs. The
      // proxy definitively supports tool calling — force it on; the user can
      // still set the override off explicitly.
      this.rawSql(
        "INSERT INTO assistant_provider_config (id,label,kind,base_url,api_key,default_model,enabled,is_builtin,tool_calling_override,created_at,updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          CLOUD_PROVIDER_ROW_ID,
          preset?.label ?? "OpenPCB Cloud",
          "openpcb-cloud",
          input.baseUrl,
          null,
          input.defaultModel?.trim() ?? "",
          1,
          1,
          1,
          timestamp,
          timestamp,
        ],
      );
    }
    const provider = this.getProvider(CLOUD_PROVIDER_ROW_ID);
    if (!provider) throw new Error("Cloud provider seed failed");
    return provider;
  }

  /** D15: disable (never delete) the cloud provider on tier loss. */
  disableCloudProvider(): void {
    this.rawSql(
      "UPDATE assistant_provider_config SET enabled=0, updated_at=? WHERE id=?",
      [now(), CLOUD_PROVIDER_ROW_ID],
    );
  }

  listProviders(): AssistantProviderConfig[] {
    this.ensureDefaults();
    return this.rawSql(
      "SELECT * FROM assistant_provider_config ORDER BY is_builtin DESC, label ASC",
    ).map((row) => this.rowToPublic(row));
  }

  getProvider(idValue: string): AssistantProviderConfig | null {
    const internal = this.getProviderInternal(idValue);
    return internal ? this.publicView(internal) : null;
  }

  getProviderInternal(idValue: string): InternalProviderConfig | null {
    this.ensureDefaults();
    const row = this.rawSql(
      "SELECT * FROM assistant_provider_config WHERE id=?",
      [idValue],
    )[0];
    return row ? this.rowToInternal(row) : null;
  }

  createProvider(input: AssistantProviderConfigInput): AssistantProviderConfig {
    const timestamp = now();
    const providerId = id();
    this.assertProviderInput(input, true);
    this.rawSql(
      "INSERT INTO assistant_provider_config (id,label,kind,base_url,api_key,default_model,enabled,is_builtin,created_at,updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        providerId,
        input.label,
        input.kind ?? "openai-compatible",
        input.baseUrl,
        input.apiKey?.trim() || null,
        input.defaultModel,
        input.enabled === false ? 0 : 1,
        0,
        timestamp,
        timestamp,
      ],
    );
    const provider = this.getProvider(providerId);
    if (!provider) throw new Error("Provider insert failed");
    return provider;
  }

  updateProvider(
    idValue: string,
    input: AssistantProviderConfigInput,
  ): AssistantProviderConfig {
    const current = this.getProviderInternal(idValue);
    if (!current) throw new ValidationError(`Provider not found: ${idValue}`);
    const next = {
      label: input.label ?? current.label,
      kind: input.kind ?? current.kind,
      baseUrl: input.baseUrl ?? current.baseUrl,
      apiKey: input.clearApiKey
        ? null
        : input.apiKey && input.apiKey.trim().length > 0
          ? input.apiKey.trim()
          : current.apiKey,
      defaultModel: input.defaultModel ?? current.defaultModel,
      enabled: input.enabled ?? current.enabled,
    };
    this.assertProviderInput(
      { ...next, apiKey: next.apiKey ?? undefined },
      true,
    );
    this.rawSql(
      "UPDATE assistant_provider_config SET label=?, kind=?, base_url=?, api_key=?, default_model=?, enabled=?, updated_at=? WHERE id=?",
      [
        next.label,
        next.kind,
        next.baseUrl,
        next.apiKey,
        next.defaultModel,
        next.enabled ? 1 : 0,
        now(),
        idValue,
      ],
    );
    const provider = this.getProvider(idValue);
    if (!provider) throw new Error("Provider update failed");
    return provider;
  }

  deleteProvider(idValue: string): void {
    const provider = this.getProviderInternal(idValue);
    if (!provider) throw new ValidationError(`Provider not found: ${idValue}`);
    if (provider.isBuiltin)
      throw new ValidationError("Builtin providers cannot be deleted");
    this.rawSql("DELETE FROM assistant_provider_config WHERE id=?", [idValue]);
  }

  listModels(providerId: string): AssistantProviderModel[] {
    return this.rawSql(
      "SELECT * FROM assistant_provider_model_cache WHERE provider_id=? ORDER BY model_id ASC",
      [providerId],
    ).map((row) => ({
      providerId: String(row.provider_id),
      modelId: String(row.model_id),
      displayName: row.display_name ? String(row.display_name) : null,
      fetchedAt: String(row.fetched_at),
    }));
  }

  replaceModels(
    providerId: string,
    modelIds: string[],
  ): AssistantProviderModel[] {
    const timestamp = now();
    this.rawSql(
      "DELETE FROM assistant_provider_model_cache WHERE provider_id=?",
      [providerId],
    );
    for (const modelId of [...new Set(modelIds)].sort()) {
      this.rawSql(
        "INSERT INTO assistant_provider_model_cache (provider_id,model_id,display_name,fetched_at) VALUES (?, ?, ?, ?)",
        [providerId, modelId, modelId, timestamp],
      );
    }
    return this.listModels(providerId);
  }

  getCapabilities(providerId: string): AiProviderCapabilities | null {
    const row = this.rawSql(
      "SELECT * FROM assistant_provider_capability WHERE provider_id=?",
      [providerId],
    )[0];
    return rowToCapabilities(row);
  }

  /** Current manual tool-calling override mode for a provider. */
  getToolCallingMode(providerId: string): ToolCallingMode {
    const provider = this.getProviderInternal(providerId);
    if (!provider)
      throw new ValidationError(`Provider not found: ${providerId}`);
    return overrideToMode(provider.toolCallingOverride);
  }

  /** Set the manual tool-calling override. "auto" clears the override. */
  setToolCallingMode(providerId: string, mode: ToolCallingMode): void {
    const exists = this.rawSql(
      "SELECT id FROM assistant_provider_config WHERE id=?",
      [providerId],
    )[0];
    if (!exists) throw new ValidationError(`Provider not found: ${providerId}`);
    const override = modeToOverride(mode);
    this.rawSql(
      "UPDATE assistant_provider_config SET tool_calling_override=?, updated_at=? WHERE id=?",
      [override === null ? null : override ? 1 : 0, now(), providerId],
    );
  }

  saveCapabilities(
    providerId: string,
    capabilities: AiProviderCapabilities,
  ): void {
    const timestamp = now();
    const existing = this.rawSql(
      "SELECT provider_id FROM assistant_provider_capability WHERE provider_id=?",
      [providerId],
    )[0];
    const params = [
      capabilities.streaming ? 1 : 0,
      capabilities.toolCalling ? 1 : 0,
      capabilities.modelList ? 1 : 0,
      capabilities.vision === undefined ? null : capabilities.vision ? 1 : 0,
      capabilities.jsonMode === undefined
        ? null
        : capabilities.jsonMode
          ? 1
          : 0,
      capabilities.maxContextTokens ?? null,
      capabilities.checkedAt ?? timestamp,
      capabilities.warning ?? null,
      timestamp,
    ];
    if (existing) {
      this.rawSql(
        "UPDATE assistant_provider_capability SET streaming=?, tool_calling=?, model_list=?, vision=?, json_mode=?, max_context_tokens=?, checked_at=?, warning=?, updated_at=? WHERE provider_id=?",
        [...params, providerId],
      );
    } else {
      this.rawSql(
        "INSERT INTO assistant_provider_capability (provider_id,streaming,tool_calling,model_list,vision,json_mode,max_context_tokens,checked_at,warning,updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [providerId, ...params],
      );
    }
  }

  private rowToInternal(row: Record<string, unknown>): InternalProviderConfig {
    const apiKey = row.api_key ? String(row.api_key) : null;
    const override =
      row.tool_calling_override === null ||
      row.tool_calling_override === undefined
        ? null
        : Number(row.tool_calling_override) === 1;
    // Bake the override into `capabilities.toolCalling` so both the run service and
    // the frontend DTO see the effective value without touching the published contract.
    const caps = applyToolCallingOverride(
      this.getCapabilities(String(row.id)),
      override,
    );
    return {
      id: String(row.id),
      label: String(row.label),
      kind: String(row.kind) as AiProviderKind,
      baseUrl: String(row.base_url),
      apiKey,
      toolCallingOverride: override,
      defaultModel: String(row.default_model),
      enabled: bool(row.enabled),
      isBuiltin: bool(row.is_builtin),
      hasApiKey: Boolean(apiKey),
      apiKeyPreview: apiKeyPreview(apiKey),
      capabilities: caps,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private rowToPublic(row: Record<string, unknown>): AssistantProviderConfig {
    return this.publicView(this.rowToInternal(row));
  }

  private publicView(
    internal: InternalProviderConfig,
  ): AssistantProviderConfig {
    return {
      id: internal.id,
      label: internal.label,
      kind: internal.kind,
      baseUrl: internal.baseUrl,
      defaultModel: internal.defaultModel,
      enabled: internal.enabled,
      isBuiltin: internal.isBuiltin,
      hasApiKey: internal.hasApiKey,
      apiKeyPreview: internal.apiKeyPreview,
      capabilities: internal.capabilities,
      createdAt: internal.createdAt,
      updatedAt: internal.updatedAt,
    };
  }

  private assertProviderInput(
    input: AssistantProviderConfigInput,
    requireAll: boolean,
  ): void {
    if (requireAll && !input.label?.trim())
      throw new ValidationError("Provider label is required");
    if (input.kind && !VALID_KINDS.includes(input.kind))
      throw new ValidationError(`Invalid provider type: ${input.kind}`);
    if (requireAll && !input.baseUrl?.trim())
      throw new ValidationError("Provider base URL is required");
    if (input.baseUrl) {
      try {
        new URL(input.baseUrl);
      } catch {
        throw new ValidationError("Provider base URL must be a valid URL");
      }
    }
    if (requireAll && !input.defaultModel?.trim()) {
      // Allow an empty default model where it's filled in later: omlx (user
      // enters it) and openpcb-cloud (resolved from GET /v1/llm/models).
      const preset = input.kind ? getPresetByKind(input.kind) : undefined;
      if (preset?.kind !== "omlx" && preset?.kind !== "openpcb-cloud") {
        throw new ValidationError("Default model is required");
      }
    }
  }
}
