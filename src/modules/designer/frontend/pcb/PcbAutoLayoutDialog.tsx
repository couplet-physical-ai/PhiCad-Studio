import { X } from "lucide-react";
import { type ReactElement, type ReactNode, useEffect, useState } from "react";
import type { AutoLayoutConfig } from "../../../../sdks/designer";
import { CollapsibleSection } from "../components/CollapsibleSection";
import { applyPreset } from "./autolayout/config";

interface PcbAutoLayoutDialogProps {
  open: boolean;
  /** Seed config (per-design persisted, else the global default). */
  config: AutoLayoutConfig;
  onClose: () => void;
  /** Persist + start the run. Parent owns persistence + orchestration. */
  onRun: (config: AutoLayoutConfig) => void;
}

function CheckRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}): ReactElement {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-300">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="cursor-pointer"
      />
    </label>
  );
}

function NumberRow({
  label,
  value,
  step,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  step?: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
}): ReactElement {
  return (
    <label className="flex items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-300">
      <span>{label}</span>
      <input
        type="number"
        step={step ?? 0.05}
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number.parseFloat(e.target.value) || 0)}
        className="w-20 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-right font-mono text-xs dark:border-slate-700 dark:bg-slate-900"
      />
    </label>
  );
}

function SelectRow({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (v: string) => void;
}): ReactElement {
  return (
    <label className="flex items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-300">
      <span>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-40 cursor-pointer rounded border border-slate-300 bg-white px-1.5 py-0.5 text-xs dark:border-slate-700 dark:bg-slate-900"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Field({ children }: { children: ReactNode }): ReactElement {
  return <div className="space-y-2">{children}</div>;
}

/**
 * Unified Auto-Layout config modal. Progressive disclosure: preset + stage
 * toggles + Run are always visible; the curated place/route knobs live under a
 * collapsible "Advanced" section. Any Advanced edit flips the preset to Custom.
 * Mirrors `PcbDesignRulesDialog` (centered blocking modal).
 */
export function PcbAutoLayoutDialog({
  open,
  config,
  onClose,
  onRun,
}: PcbAutoLayoutDialogProps): ReactElement | null {
  const [cfg, setCfg] = useState<AutoLayoutConfig>(config);

  // Re-seed each time the modal opens against the live persisted config.
  useEffect(() => {
    if (open) setCfg(config);
  }, [open, config]);

  // Escape closes.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const selectPreset = (p: string): void => {
    if (p === "fast" || p === "balanced" || p === "quality") {
      setCfg((c) => applyPreset(c, p));
    }
  };
  const toggleStage = (key: "runPlace" | "runRoute"): void =>
    setCfg((c) => ({ ...c, [key]: !c[key] }));
  const patchPlace = (partial: Partial<AutoLayoutConfig["place"]>): void =>
    setCfg((c) => ({ ...c, preset: "custom", place: { ...c.place, ...partial } }));
  const patchRoute = (partial: Partial<AutoLayoutConfig["route"]>): void =>
    setCfg((c) => ({ ...c, preset: "custom", route: { ...c.route, ...partial } }));
  const setEffort = (e: string): void => {
    if (e === "fast" || e === "balanced" || e === "quality") {
      setCfg((c) => ({ ...c, preset: "custom", effort: e }));
    }
  };

  const canRun = cfg.runPlace || cfg.runRoute;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Auto-Layout"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[85vh] w-[440px] max-w-[92vw] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-950">
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Auto-Layout
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="cursor-pointer rounded p-1 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          <Field>
            <SelectRow
              label="Preset"
              value={cfg.preset}
              options={[
                { value: "fast", label: "Fast" },
                { value: "balanced", label: "Balanced" },
                { value: "quality", label: "Quality" },
                { value: "custom", label: "Custom" },
              ]}
              onChange={selectPreset}
            />
          </Field>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-200">
              Stages
            </h3>
            <CheckRow
              label="Place components"
              checked={cfg.runPlace}
              onChange={() => toggleStage("runPlace")}
            />
            <CheckRow
              label="Route traces"
              checked={cfg.runRoute}
              onChange={() => toggleStage("runRoute")}
            />
            {cfg.runPlace && cfg.runRoute ? (
              <p className="text-[11px] text-slate-400">
                Runs sequentially: place → review → route → review.
              </p>
            ) : null}
          </section>

          <CollapsibleSection
            id="pcb.autolayout.advanced"
            title="Advanced"
            defaultOpen={false}
          >
            <div className="space-y-4 px-2 pb-2 pt-1">
              <div className="space-y-2">
                <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Effort
                </h4>
                <SelectRow
                  label="Effort"
                  value={cfg.effort}
                  options={[
                    { value: "fast", label: "Fast" },
                    { value: "balanced", label: "Balanced" },
                    { value: "quality", label: "Quality" },
                  ]}
                  onChange={setEffort}
                />
              </div>

              {cfg.runPlace ? (
                <div className="space-y-2">
                  <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Placement
                  </h4>
                  <CheckRow
                    label="Allow rotation"
                    checked={cfg.place.allowRotate}
                    onChange={(v) => patchPlace({ allowRotate: v })}
                  />
                  <CheckRow
                    label="Allow flip to back"
                    checked={cfg.place.allowFlip}
                    onChange={(v) => patchPlace({ allowFlip: v })}
                  />
                  <CheckRow
                    label="Move connectors"
                    checked={cfg.place.moveConnectors}
                    onChange={(v) => patchPlace({ moveConnectors: v })}
                  />
                  <CheckRow
                    label="Respect existing traces"
                    checked={cfg.place.respectExistingTraces}
                    onChange={(v) => patchPlace({ respectExistingTraces: v })}
                  />
                  <NumberRow
                    label="Target utilization"
                    value={cfg.place.targetUtilization}
                    step={0.05}
                    min={0.1}
                    max={0.95}
                    onChange={(v) =>
                      patchPlace({
                        targetUtilization: Math.max(0.1, Math.min(0.95, v)),
                      })
                    }
                  />
                </div>
              ) : null}

              {cfg.runRoute ? (
                <div className="space-y-2">
                  <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Routing
                  </h4>
                  <SelectRow
                    label="Geometry"
                    value={cfg.route.geometryMode}
                    options={[
                      { value: "manhattan-45", label: "45° (default)" },
                      { value: "manhattan-90", label: "90° only" },
                    ]}
                    onChange={(v) =>
                      patchRoute({
                        geometryMode:
                          v === "manhattan-90" ? "manhattan-90" : "manhattan-45",
                      })
                    }
                  />
                  <CheckRow
                    label="Allow vias"
                    checked={cfg.route.allowVias}
                    onChange={(v) => patchRoute({ allowVias: v })}
                  />
                  <NumberRow
                    label="Max vias / net (0 = unlimited)"
                    value={cfg.route.maxViasPerNet ?? 0}
                    step={1}
                    min={0}
                    onChange={(v) =>
                      patchRoute({ maxViasPerNet: v > 0 ? Math.round(v) : null })
                    }
                  />
                  <SelectRow
                    label="Copper pours"
                    value={
                      cfg.route.serializePours === true
                        ? "on"
                        : cfg.route.serializePours === false
                          ? "off"
                          : "auto"
                    }
                    options={[
                      { value: "auto", label: "Auto (negotiate)" },
                      { value: "on", label: "Send pours" },
                      { value: "off", label: "Ignore pours" },
                    ]}
                    onChange={(v) =>
                      patchRoute({
                        serializePours:
                          v === "on" ? true : v === "off" ? false : "auto",
                      })
                    }
                  />
                </div>
              ) : null}
            </div>
          </CollapsibleSection>
        </div>

        <footer className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onRun(cfg)}
            disabled={!canRun}
            className="cursor-pointer rounded-md bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Run
          </button>
        </footer>
      </div>
    </div>
  );
}
