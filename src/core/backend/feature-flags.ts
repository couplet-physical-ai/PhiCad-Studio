/**
 * Backend feature-flag adapter — re-export of the contracts-level evaluator so
 * core/backend code has a local import path. The implementation lives in
 * `core/contracts/feature-flags/backend` so module backends (which can only
 * reach `core/contracts`) share the exact same logic.
 */
export {
  isFeatureEnabled,
  type FeatureFlagName,
} from "../contracts/feature-flags/backend";
