import { useEffect, useRef, type ReactElement } from "react";
import type { TuneHudModel } from "./tools/tune-hud-model";

interface TuneHudProps {
  /** Null while the Tune tool is idle (no trace picked yet). */
  model: TuneHudModel | null;
  /** Inline typed-target editor (the anti-KiCad-v8 in-tool override). */
  targetInputOpen: boolean;
  onOpenTargetInput: () => void;
  onTargetInputSubmit: (targetMm: number) => void;
  onTargetInputClose: () => void;
  onClearTargetOverride: () => void;
}

const BAND_CLASS: Record<NonNullable<TuneHudModel["band"]>, string> = {
  short: "font-medium text-amber-600 dark:text-amber-400",
  ok: "font-medium text-emerald-600 dark:text-emerald-400",
  long: "font-medium text-red-600 dark:text-red-400",
};

/**
 * Bottom status strip for the length-Tune tool: which net, current vs target
 * length with tolerance-band color, serpentine parameters, and the key map.
 */
export function TuneHud({
  model,
  targetInputOpen,
  onOpenTargetInput,
  onTargetInputSubmit,
  onTargetInputClose,
  onClearTargetOverride,
}: TuneHudProps): ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (targetInputOpen) inputRef.current?.select();
  }, [targetInputOpen]);

  if (!model) {
    return (
      <div
        role="status"
        aria-label="Tune tool"
        className="absolute bottom-3 left-1/2 z-30 -translate-x-1/2 rounded-lg border border-slate-300 bg-white/95 px-3 py-1.5 text-[11px] text-slate-600 shadow-lg backdrop-blur dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-300"
      >
        Tune — click a routed trace to add serpentine length · Esc exit
      </div>
    );
  }

  return (
    <div
      role="region"
      aria-label="Tune status"
      className="absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 flex-col gap-1 rounded-lg border border-slate-300 bg-white/95 px-3 py-1.5 shadow-xl backdrop-blur dark:border-slate-700 dark:bg-slate-900/95"
    >
      <div className="flex items-center gap-3 text-[11px] text-slate-700 dark:text-slate-200">
        <span className="font-semibold">{model.netName ?? "no net"}</span>
        <span className={model.band ? BAND_CLASS[model.band] : "text-slate-500 dark:text-slate-400"}>
          {model.currentMm.toFixed(2)}
          {model.targetMm !== null ? ` / ${model.targetMm.toFixed(2)}` : ""} mm
        </span>
        {model.band ? (
          <span className="text-slate-400 dark:text-slate-500">
            {model.band === "ok"
              ? "in tolerance"
              : model.band === "short"
                ? `${Math.abs(model.deltaMm ?? 0).toFixed(2)} mm short`
                : `${Math.abs(model.deltaMm ?? 0).toFixed(2)} mm over`}
          </span>
        ) : null}
        {targetInputOpen ? (
          <input
            ref={inputRef}
            type="number"
            step={0.1}
            min={0.1}
            defaultValue={model.targetMm ?? undefined}
            aria-label="Target length (mm)"
            className="w-20 rounded border border-slate-300 bg-white px-1 py-0.5 text-[11px] dark:border-slate-600 dark:bg-slate-800"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const next = Number(e.currentTarget.value);
                if (Number.isFinite(next) && next > 0) {
                  onTargetInputSubmit(next);
                }
                onTargetInputClose();
                e.stopPropagation();
              }
              if (e.key === "Escape") {
                onTargetInputClose();
                e.stopPropagation();
              }
            }}
            onBlur={onTargetInputClose}
          />
        ) : (
          <button
            type="button"
            className="rounded px-1 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            title="Type a target length (overrides the group rule)"
            onClick={onOpenTargetInput}
          >
            {model.targetSource === "override"
              ? "target: typed"
              : model.targetSource === "group"
                ? `target: '${model.groupName}'`
                : "set target…"}
          </button>
        )}
        {model.targetSource === "override" ? (
          <button
            type="button"
            className="rounded px-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
            title="Clear the typed target"
            onClick={onClearTargetOverride}
          >
            ×
          </button>
        ) : null}
        <span className="text-slate-500 dark:text-slate-400">
          A {model.amplitudeMm.toFixed(2)} · pitch {model.spacingMm.toFixed(2)}
        </span>
        {model.meanderStatus === "too-short" ? (
          <span className="text-amber-600 dark:text-amber-400">
            span too small for target — extend the sweep or raise amplitude
          </span>
        ) : null}
        {model.meanderStatus === "span-too-small" ? (
          <span className="text-amber-600 dark:text-amber-400">
            sweep along the trace to place serpentines
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-2 text-[10px] text-slate-400 dark:text-slate-500">
        <span>
          <kbd className="font-sans">drag</kbd> paint span
        </span>
        <span>
          <kbd className="font-sans">click</kbd> freeze
        </span>
        <span>
          <kbd className="font-sans">+/-</kbd> amplitude
        </span>
        <span>
          <kbd className="font-sans">,/.</kbd> pitch
        </span>
        <span>
          <kbd className="font-sans">Enter</kbd> apply
        </span>
        <span>
          <kbd className="font-sans">Esc</kbd> cancel
        </span>
      </div>
    </div>
  );
}
