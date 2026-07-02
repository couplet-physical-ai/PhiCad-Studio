/**
 * Backend (Bun) feature-flag evaluator.
 *
 * Lives in `core/contracts` (not `core/backend`) so module backends — which
 * compile under `tsconfig.modules` and may only reach `core/contracts` — can
 * import it for route guards. It reads `process.env` and is never imported by
 * the frontend, so it is excluded from the renderer bundle.
 *
 * Gate = not a production build, unless overridden by
 * `OPENPCB_FEATURE_<SUFFIX>` (e.g. `OPENPCB_FEATURE_CLOUD_AUTOLAYOUT=1`).
 * `NODE_ENV` is "production" only in packaged Electron builds, so dev and test
 * runtimes keep gated features on.
 */

import {
  FEATURE_FLAGS,
  evaluateFeatureFlag,
  featureFlagEnvSuffix,
  parseOverride,
  type FeatureFlagName,
} from "./registry";

export type { FeatureFlagName };

export function isFeatureEnabled(name: FeatureFlagName): boolean {
  const override = parseOverride(
    process.env[`OPENPCB_FEATURE_${featureFlagEnvSuffix(name)}`],
  );
  return evaluateFeatureFlag(FEATURE_FLAGS[name], {
    isDev: process.env.NODE_ENV !== "production",
    override,
  });
}
