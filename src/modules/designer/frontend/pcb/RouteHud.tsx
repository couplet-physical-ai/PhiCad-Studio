import { useEffect, useRef, type ReactElement } from "react";
import { RotateCcw } from "lucide-react";
import type { RouteHudModel } from "./tools/route-hud-model";

interface RouteHudProps {
  /** Null while the route tool is idle (no active session). */
  model: RouteHudModel | null;
  /** Render color of the session's copper layer. */
  layerColor: string;
  /** Inline custom-width editor (opened by Alt+W or clicking the width). */
  widthInputOpen: boolean;
  onOpenWidthInput: () => void;
  onWidthInputSubmit: (widthMm: number) => void;
  onWidthInputClose: () => void;
  /** Shown when widthSource !== "netclass" — one click back to the class. */
  onResetWidthToNetClass: () => void;
}

function formatMm(value: number): string {
  return value >= 100 ? value.toFixed(0) : value.toFixed(2);
}

/**
 * Compact route status strip at the canvas bottom. Always answers: which net,
 * which layer, what width and WHY (source badge), how long so far, is the
 * ghost DRC-clean, and which keys do what. Idle shows a one-line prompt.
 */
export function RouteHud({
  model,
  layerColor,
  widthInputOpen,
  onOpenWidthInput,
  onWidthInputSubmit,
  onWidthInputClose,
  onResetWidthToNetClass,
}: RouteHudProps): ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (widthInputOpen) inputRef.current?.select();
  }, [widthInputOpen]);

  if (!model) {
    return (
      <div
        role="status"
        aria-label="Route tool"
        className="absolute bottom-3 left-1/2 z-30 -translate-x-1/2 rounded-lg border border-slate-300 bg-white/95 px-3 py-1.5 text-[11px] text-slate-600 shadow-lg backdrop-blur dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-300"
      >
        Route — click a pad to start · Esc exit
      </div>
    );
  }

  const clean = model.drcConflictCount === 0;
  const widthBadge =
    model.widthSource === "netclass"
      ? `netclass${model.netClassName ? ` '${model.netClassName}'` : ""}`
      : model.widthSource;

  return (
    <div
      role="region"
      aria-label="Route status"
      className="absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 flex-col gap-1 rounded-lg border border-slate-300 bg-white/95 px-3 py-1.5 shadow-xl backdrop-blur dark:border-slate-700 dark:bg-slate-900/95"
    >
      <div className="flex items-center gap-3 text-[11px] text-slate-700 dark:text-slate-200">
        <span className="font-semibold">{model.netName ?? "no net"}</span>
        <span className="flex items-center gap-1">
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: layerColor }}
          />
          {model.layer}
        </span>
        {widthInputOpen ? (
          <input
            ref={inputRef}
            type="number"
            step={0.05}
            min={0.01}
            defaultValue={model.widthMm}
            aria-label="Trace width (mm)"
            className="w-16 rounded border border-slate-300 bg-white px-1 py-0.5 text-[11px] dark:border-slate-600 dark:bg-slate-800"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const next = Number(e.currentTarget.value);
                if (Number.isFinite(next) && next > 0) {
                  onWidthInputSubmit(next);
                }
                onWidthInputClose();
              }
              if (e.key === "Escape") onWidthInputClose();
            }}
            onBlur={onWidthInputClose}
          />
        ) : (
          <button
            type="button"
            className="flex items-center gap-1 rounded px-1 hover:bg-slate-100 dark:hover:bg-slate-800"
            title="Set custom width (Alt+W)"
            onClick={onOpenWidthInput}
          >
            {formatMm(model.widthMm)} mm
            <span className="text-slate-400 dark:text-slate-500">
              · {widthBadge}
            </span>
          </button>
        )}
        {model.widthSource !== "netclass" ? (
          <button
            type="button"
            aria-label="Reset width to net class"
            title="Reset width to net class"
            className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
            onClick={onResetWidthToNetClass}
          >
            <RotateCcw size={11} />
          </button>
        ) : null}
        {model.viaDiameterMm !== null && model.viaDrillMm !== null ? (
          <span className="text-slate-500 dark:text-slate-400">
            via {formatMm(model.viaDiameterMm)}/{formatMm(model.viaDrillMm)}
            {model.viaOverridden ? "*" : ""}
          </span>
        ) : null}
        <span className="text-slate-500 dark:text-slate-400">
          {model.lengthMm.toFixed(1)} mm
        </span>
        <span
          className={
            clean
              ? "font-medium text-emerald-600 dark:text-emerald-400"
              : "font-medium text-red-600 dark:text-red-400"
          }
        >
          {clean
            ? "clear"
            : `${model.drcConflictCount} conflict${model.drcConflictCount === 1 ? "" : "s"}`}
        </span>
      </div>
      <div className="flex items-center gap-2 text-[10px] text-slate-400 dark:text-slate-500">
        {model.hints.map((h) => (
          <span key={h.keys}>
            <kbd className="font-sans">{h.keys}</kbd> {h.label}
          </span>
        ))}
      </div>
    </div>
  );
}
