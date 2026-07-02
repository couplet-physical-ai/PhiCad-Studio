/**
 * Frontend feature-flag adapter.
 *
 * Evaluates the shared registry against the Vite build mode
 * (`import.meta.env.DEV`) with an optional per-flag env override
 * `VITE_FEATURE_<SUFFIX>` (e.g. `VITE_FEATURE_CLOUD_AUTOLAYOUT=1`).
 *
 * Values are static per build/runtime — `useFeatureFlag` is a thin wrapper so
 * callers read it like any other gate (mirrors `useAuth().enabled`).
 */

import {
  FEATURE_FLAGS,
  evaluateFeatureFlag,
  featureFlagEnvSuffix,
  parseOverride,
  type FeatureFlagName,
} from "../../../contracts/feature-flags/registry";

export type { FeatureFlagName };

function readOverride(name: FeatureFlagName): boolean | undefined {
  const env = import.meta.env as unknown as Record<string, string | undefined>;
  return parseOverride(env[`VITE_FEATURE_${featureFlagEnvSuffix(name)}`]);
}

export function isFeatureEnabled(name: FeatureFlagName): boolean {
  return evaluateFeatureFlag(FEATURE_FLAGS[name], {
    isDev: import.meta.env.DEV,
    override: readOverride(name),
  });
}

export function useFeatureFlag(name: FeatureFlagName): boolean {
  return isFeatureEnabled(name);
}
