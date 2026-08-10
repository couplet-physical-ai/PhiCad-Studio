// Auto Layout configuration: presets, request mapping, persistence and migration.
//
// The stage-toggle model is gone. `runPlace` / `runRoute` described a desktop-sequenced
// place-then-route flow that no longer exists — full Auto Layout is one composite cloud job
// — so the config now describes INTENT (scope, priority, effort) and the curated knobs.
// Old persisted blobs still parse; see `migrateConfig`.
//
// Deliberate non-goal: pinning engine budgets. Route budget fields (`budgetMode`,
// `maxExpansions`, the job-budget knobs) are never set here, so a service-side default
// change reaches shipped desktops without a release. Effort maps to portfolio/restarts only.

import type {
  AutoLayoutConfig,
  PlaceOptions,
  RouteOptions,
} from "../../../../../sdks/designer";

export type AutoLayoutEffort = AutoLayoutConfig["effort"];
export type AutoLayoutPreset = AutoLayoutConfig["preset"];
export type AutoLayoutScope = NonNullable<AutoLayoutConfig["scope"]>;

/** localStorage key holding the global default config seeded into new designs. */
export const AUTOLAYOUT_DEFAULT_STORAGE_KEY = "openpcb.autolayout.defaultConfig";

/**
 * Effort tier → engine knobs. Balanced leaves place `restarts`/`maxMoves` undefined so the
 * service applies its own defaults.
 */
const EFFORT_TUNING: Record<
  AutoLayoutEffort,
  { restarts?: number; maxMoves?: number; portfolio: number }
> = {
  fast: { restarts: 2, maxMoves: 3000, portfolio: 1 },
  balanced: { portfolio: 4 },
  quality: { restarts: 8, portfolio: 8 },
};

/**
 * Priority preset → placement weight bias.
 *
 * Only weights whose behaviour is understood are set, and only away from the engine's own
 * default when the preset's NAME promises it — an unbenchmarked magic number dressed up as
 * a product control is worse than deferring to the engine. `preserve` is the one preset
 * that must set something (a non-zero displacement weight is what "keep my layout" means).
 */
const PRESET_WEIGHTS: Partial<
  Record<AutoLayoutPreset, NonNullable<PlaceOptions["weights"]>>
> = {
  routability: { congestion: 1 },
  compact: { hpwl: 1.5 },
  preserve: { displacement: 1 },
};

/** Effort implied by a priority preset (the three legacy presets ARE effort tiers). */
function effortForPreset(preset: AutoLayoutPreset): AutoLayoutEffort {
  switch (preset) {
    case "fast":
    case "balanced":
    case "quality":
      return preset;
    default:
      return "balanced";
  }
}

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

export const DEFAULT_AUTOLAYOUT_CONFIG: AutoLayoutConfig = {
  preset: "balanced",
  effort: "balanced",
  scope: "all",
  place: { ...BALANCED_PLACE },
  route: { ...BALANCED_ROUTE },
};

/** Apply a named preset, keeping scope (a user's selection intent survives preset changes). */
export function applyPreset(
  cfg: AutoLayoutConfig,
  preset: Exclude<AutoLayoutPreset, "custom">,
): AutoLayoutConfig {
  return {
    ...cfg,
    preset,
    effort: effortForPreset(preset),
    place: { ...BALANCED_PLACE },
    route: { ...BALANCED_ROUTE },
  };
}

export interface LayoutRequestBody {
  routeOptions: RouteOptions;
  placeOptions: PlaceOptions;
  serializePours?: boolean;
}

/**
 * Build the `/autolayout` submit body.
 *
 * `selectedPlacementIds` drives subset placement: with a `selected` scope the placer moves
 * only those components and treats everything else as fixed. An empty selection NEVER
 * silently becomes a whole-board run — the caller is responsible for not offering the
 * scope, and the mapping simply omits the subset fields.
 */
export function toLayoutRequest(
  cfg: AutoLayoutConfig,
  selectedPlacementIds: readonly string[] = [],
): LayoutRequestBody {
  const tuning = EFFORT_TUNING[cfg.effort];
  const weights = PRESET_WEIGHTS[cfg.preset];

  const placeOptions: PlaceOptions = {
    allowRotate: cfg.place.allowRotate,
    allowFlip: cfg.place.allowFlip,
    moveConnectors: cfg.place.moveConnectors,
    respectExistingTraces: cfg.place.respectExistingTraces,
    targetUtilization: cfg.place.targetUtilization,
    ...(tuning.restarts === undefined ? {} : { restarts: tuning.restarts }),
    ...(tuning.maxMoves === undefined ? {} : { maxMoves: tuning.maxMoves }),
    ...(weights ? { weights } : {}),
  };
  if (cfg.scope === "selected" && selectedPlacementIds.length > 0) {
    placeOptions.mode = "subset";
    placeOptions.selectedIds = [...selectedPlacementIds];
  }

  const routeOptions: RouteOptions = {
    geometryMode: cfg.route.geometryMode,
    allowVias: cfg.route.allowVias,
    portfolio: tuning.portfolio,
    ...(cfg.route.maxViasPerNet === undefined
      ? {}
      : { maxViasPerNet: cfg.route.maxViasPerNet }),
  };

  const pours = cfg.route.serializePours;
  return {
    routeOptions,
    placeOptions,
    // "auto" ⇒ omit, so the backend negotiates against the deployed capability.
    ...(pours === true || pours === false ? { serializePours: pours } : {}),
  };
}

/** Build the Route Board (`/autoroute`) body — placement is never touched. */
export function toRouteRequest(cfg: AutoLayoutConfig): {
  options: RouteOptions;
  serializePours?: boolean;
} {
  const { routeOptions, serializePours } = toLayoutRequest(cfg);
  return {
    options: routeOptions,
    ...(serializePours === undefined ? {} : { serializePours }),
  };
}

/**
 * Normalize any persisted blob — old or new — into the current shape.
 *
 * The interesting case is `runPlace:false, runRoute:true`. That was a Route Board run
 * expressed as a layout config; carrying it forward as a layout config would silently start
 * moving the user's components. It maps to a Route Board configuration instead, flagged so
 * the caller can open the right dialog.
 */
export function migrateConfig(raw: unknown): {
  config: AutoLayoutConfig;
  /** True when the stored config described a route-only run. */
  routeOnly: boolean;
} {
  if (!raw || typeof raw !== "object") {
    return { config: { ...DEFAULT_AUTOLAYOUT_CONFIG }, routeOnly: false };
  }
  const parsed = raw as Partial<AutoLayoutConfig>;
  const routeOnly = parsed.runPlace === false && parsed.runRoute !== false;

  const preset: AutoLayoutPreset =
    parsed.preset && parsed.preset !== "custom" ? parsed.preset : "balanced";
  return {
    routeOnly,
    config: {
      preset: parsed.preset ?? preset,
      effort: parsed.effort ?? effortForPreset(preset),
      scope: parsed.scope ?? "all",
      place: { ...BALANCED_PLACE, ...(parsed.place ?? {}) },
      route: { ...BALANCED_ROUTE, ...(parsed.route ?? {}) },
    },
  };
}

/** Read the localStorage global default; falls back to Balanced. Never throws. */
export function readGlobalDefaultConfig(): AutoLayoutConfig {
  if (typeof window === "undefined") return DEFAULT_AUTOLAYOUT_CONFIG;
  try {
    const raw = window.localStorage.getItem(AUTOLAYOUT_DEFAULT_STORAGE_KEY);
    if (!raw) return DEFAULT_AUTOLAYOUT_CONFIG;
    return migrateConfig(JSON.parse(raw)).config;
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
export function seedConfig(persisted: AutoLayoutConfig | undefined): AutoLayoutConfig {
  return persisted ? migrateConfig(persisted).config : readGlobalDefaultConfig();
}
