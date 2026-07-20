import { ValidationError } from "../../../../core/contracts/errors";
import {
  OpenAiCompatibleClient,
  getPresetByKind,
  type AiProviderClient,
} from "@openpcb/ai-core";
import type { InternalProviderConfig } from "../provider-store";

/**
 * Build an AiProviderClient from a stored OpenPCB provider config.
 * All four supported kinds (openai, openai-compatible, lmstudio, omlx) share the OpenAI-compatible transport.
 */
export function buildAiProviderClient(
  provider: InternalProviderConfig,
  opts?: { extraHeaders?: Record<string, string> },
): AiProviderClient {
  if (!provider.baseUrl.trim()) {
    throw new ValidationError(
      `Provider ${provider.label} has no base URL configured.`,
    );
  }
  return new OpenAiCompatibleClient({
    id: provider.id,
    kind: provider.kind,
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey ?? undefined,
    // The OpenPCB Cloud metered proxy requires x-openpcb-workspace-id and
    // stitches usage via x-openpcb-run-id; run-service resolves + passes them.
    extraHeaders: opts?.extraHeaders,
  });
}

/**
 * Determine whether a provider needs an API key to run.
 * Cloud presets (OpenAI, OpenRouter) require one; LM Studio / oMLX / custom
 * OpenAI-compatible endpoints do not. Driven by the preset's `requiresApiKey`.
 */
export function providerRequiresApiKey(
  provider: InternalProviderConfig,
): boolean {
  return getPresetByKind(provider.kind)?.requiresApiKey ?? false;
}
