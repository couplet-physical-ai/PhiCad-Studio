import type { ReactElement } from "react";

export interface BundleHudModel {
  /** Collected pad count. */
  padCount: number;
  /** Distinct net names in the bundle (display order). */
  netNames: string[];
  /** True once the centerline has waypoints (collection locked). */
  routing: boolean;
  pitchMm: number;
  /** Detected `_P/_N` / `+/-` pair (N=2). */
  diffPair: boolean;
}

/**
 * Bottom status strip for bundle routing: collection progress, pitch, pair
 * detection, and the key map. Idle shows the entry prompt. `notice` renders
 * in BOTH states (commit blocks, rejected pad clicks) so feedback for the
 * first click is never swallowed.
 */
export function BundleHud({
  model,
  notice = null,
}: {
  model: BundleHudModel | null;
  notice?: string | null;
}): ReactElement {
  if (!model) {
    return (
      <div
        role="status"
        aria-label="Bundle tool"
        className="absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 flex-col gap-1 rounded-lg border border-slate-300 bg-white/95 px-3 py-1.5 text-[11px] text-slate-600 shadow-lg backdrop-blur dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-300"
      >
        <span>
          Bundle — click 2+ pads to collect, then click space to route them in
          parallel · Esc exit
        </span>
        {notice ? (
          <span role="alert" className="text-red-600 dark:text-red-400">
            {notice}
          </span>
        ) : null}
      </div>
    );
  }
  return (
    <div
      role="region"
      aria-label="Bundle status"
      className="absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 flex-col gap-1 rounded-lg border border-slate-300 bg-white/95 px-3 py-1.5 shadow-xl backdrop-blur dark:border-slate-700 dark:bg-slate-900/95"
    >
      <div className="flex items-center gap-3 text-[11px] text-slate-700 dark:text-slate-200">
        <span className="font-semibold">
          {model.padCount} pad{model.padCount === 1 ? "" : "s"}
          {model.diffPair ? " · diff pair" : ""}
        </span>
        {model.netNames.length > 0 ? (
          <span className="max-w-64 truncate text-slate-500 dark:text-slate-400">
            {model.netNames.join(", ")}
          </span>
        ) : null}
        <span className="text-slate-500 dark:text-slate-400">
          pitch {model.pitchMm.toFixed(2)} mm
        </span>
        {!model.routing && model.padCount < 2 ? (
          <span className="text-slate-400 dark:text-slate-500">
            click more pads…
          </span>
        ) : null}
      </div>
      {notice ? (
        <div
          role="alert"
          className="text-[11px] text-red-600 dark:text-red-400"
        >
          {notice}
        </div>
      ) : null}
      <div className="flex items-center gap-2 text-[10px] text-slate-400 dark:text-slate-500">
        {model.routing ? (
          <span>
            <kbd className="font-sans">click</kbd> waypoint
          </span>
        ) : (
          <span>
            <kbd className="font-sans">click pad</kbd> add/remove
          </span>
        )}
        <span>
          <kbd className="font-sans">,/.</kbd> pitch
        </span>
        <span>
          <kbd className="font-sans">⌫</kbd> back
        </span>
        <span>
          <kbd className="font-sans">Enter</kbd> commit lanes
        </span>
        <span>
          <kbd className="font-sans">Esc</kbd> cancel
        </span>
      </div>
    </div>
  );
}
