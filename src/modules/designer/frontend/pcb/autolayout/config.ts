// Shared config types + presets for the unified Auto-Layout modal. Maps the
// curated user-facing config onto the existing `submitAutoplace` /
// `submitAutoroute` request bodies — no new API surface. The persisted
// `AutoLayoutConfig` shape itself lives in the SDK (crosses frontend↔backend
// via the view-state JSON); this module owns the presets + request mapping.

import type {
  AutoLayoutConfig,
  PlaceOptions,
  RouteOptions,
} from "../../../../../sdks/designer";

export type AutoLayoutEffort = AutoLayoutConfig["effort"];
export type AutoLayoutPreset = AutoLayoutConfig["preset"];

/** localStorage key holding the global default config seeded into new designs. */
export const AUTOLAYOUT_DEFAULT_STORAGE_KEY = "openpcb.autolayout.defaultConfig";

/**
 * Effort tier → engine budgets. Balanced leaves place `restarts`/`maxMoves` and
 * route `maxExpansions` undefined so the service applies its own defaults
 * (restarts→4, maxMoves→max(8000,1500·movable), maxExpansions→2_000_000).
 */
const EFFORT_TUNING: Record<
  AutoLayoutEffort,
  {
    restarts?: number;
    maxMoves?: number;
    portfolio: number;
    maxExpansions?: number;
  }
> = {
  fast: { restarts: 2, maxMoves: 3000, portfolio: 1, maxExpansions: 500_000 },
  balanced: { portfolio: 4 },
  quality: { restarts: 8, portfolio: 8, maxExpansions: 4_000_000 },
};

/** Balanced curated knobs — match the current engine defaults. */
const BALANCED_PLACE: AutoLayoutConfig["place"] = {
  allowRotate: true,
  allowFlip: true,
  moveConnectors: false,
  respectExistingTraces: true,
  targetUtilization: 0.7,
};

const BALANCED_ROUTE: AutoLayoutConfig["route"] = {
  geometryMode: "manhattan-45",
  allowVias: true,
  maxViasPerNet: undefined,
  serializePours: "auto",
};

/** Default (Balanced) config: both stages on, engine defaults, pours negotiated. */
export const DEFAULT_AUTOLAYOUT_CONFIG: AutoLayoutConfig = {
  runPlace: true,
  runRoute: true,
  preset: "balanced",
  effort: "balanced",
  place: { ...BALANCED_PLACE },
  route: { ...BALANCED_ROUTE },
};

/**
 * A named preset applied over the current stage toggles. Presets differ only by
 * effort tier (which drives the engine budgets); the curated knobs stay at the
 * engine defaults, so switching presets is non-destructive to stage selection.
 */
export function applyPreset(
  cfg: AutoLayoutConfig,
  preset: Exclude<AutoLayoutPreset, "custom">,
): AutoLayoutConfig {
  return {
    ...cfg,
    preset,
    effort: preset,
    place: { ...BALANCED_PLACE },
    route: { ...BALANCED_ROUTE },
  };
}

/** Build the `submitAutoplace` request body from the config. */
export function toPlaceRequest(cfg: AutoLayoutConfig): {
  placeOptions: PlaceOptions;
} {
  const tuning = EFFORT_TUNING[cfg.effort];
  const placeOptions: PlaceOptions = {
    allowRotate: cfg.place.allowRotate,
    allowFlip: cfg.place.allowFlip,
    moveConnectors: cfg.place.moveConnectors,
    respectExistingTraces: cfg.place.respectExistingTraces,
    targetUtilization: cfg.place.targetUtilization,
  };
  if (tuning.restarts !== undefined) placeOptions.restarts = tuning.restarts;
  if (tuning.maxMoves !== undefined) placeOptions.maxMoves = tuning.maxMoves;
  return { placeOptions };
}

/**
 * Build the `submitAutoroute` request body from the config.
 * `serializePours: "auto"` ⇒ omit the flag so the backend negotiates it against
 * the deployed service capability (existing path).
 */
export function toRouteRequest(cfg: AutoLayoutConfig): {
  options: RouteOptions;
  serializePours?: boolean;
} {
  const tuning = EFFORT_TUNING[cfg.effort];
  const options: RouteOptions = {
    geometryMode: cfg.route.geometryMode,
    allowVias: cfg.route.allowVias,
    portfolio: tuning.portfolio,
  };
  if (cfg.route.maxViasPerNet !== undefined) {
    options.maxViasPerNet = cfg.route.maxViasPerNet;
  }
  if (tuning.maxExpansions !== undefined) {
    options.maxExpansions = tuning.maxExpansions;
  }
  const pours = cfg.route.serializePours;
  return pours === true || pours === false
    ? { options, serializePours: pours }
    : { options };
}

/** Read the localStorage global default; falls back to Balanced. */
export function readGlobalDefaultConfig(): AutoLayoutConfig {
  if (typeof window === "undefined") return DEFAULT_AUTOLAYOUT_CONFIG;
  try {
    const raw = window.localStorage.getItem(AUTOLAYOUT_DEFAULT_STORAGE_KEY);
    if (!raw) return DEFAULT_AUTOLAYOUT_CONFIG;
    const parsed = JSON.parse(raw) as Partial<AutoLayoutConfig>;
    // Shallow-merge over the default so a partial/older blob still hydrates.
    return {
      ...DEFAULT_AUTOLAYOUT_CONFIG,
      ...parsed,
      place: { ...BALANCED_PLACE, ...(parsed.place ?? {}) },
      route: { ...BALANCED_ROUTE, ...(parsed.route ?? {}) },
    };
  } catch {
    return DEFAULT_AUTOLAYOUT_CONFIG;
  }
}

/** Persist the global default seeded into designs without their own config. */
export function writeGlobalDefaultConfig(cfg: AutoLayoutConfig): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      AUTOLAYOUT_DEFAULT_STORAGE_KEY,
      JSON.stringify(cfg),
    );
  } catch {
    // ignore quota / privacy errors
  }
}

/** Seed the modal: per-design persisted config wins, else the global default. */
export function seedConfig(
  persisted: AutoLayoutConfig | undefined,
): AutoLayoutConfig {
  return persisted ?? readGlobalDefaultConfig();
}
