import type { ReactElement } from "react";

import type { LayoutProgressState } from "./state/types";

/**
 * Deterministic, work-based progress.
 *
 * The service reports work consumed against a work budget and explicitly does NOT report
 * time, so nothing here converts progress into an ETA — a wall-clock promise the engine
 * never made is worse than no promise. When the stream drops, the fallback to polling is
 * shown rather than hidden: a UI that looks live while it is actually polling every 1.5 s
 * teaches users to distrust it.
 */
export function AutoLayoutProgress({
  progress,
  cancelling,
}: {
  progress: LayoutProgressState;
  cancelling: boolean;
}): ReactElement {
  const percent =
    progress.fraction === null ? null : Math.round(progress.fraction * 100);
  const total = progress.candidatesTotal;

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-medium text-slate-700 dark:text-slate-200">
          {cancelling
            ? "Cancelling…"
            : phaseLabel(progress.lastFrame, progress.candidates.length)}
        </p>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded bg-slate-200 dark:bg-slate-800">
          <div
            className={`h-full rounded bg-violet-600 transition-[width] duration-300 ${
              percent === null ? "animate-pulse w-1/3" : ""
            }`}
            style={percent === null ? undefined : { width: `${percent}%` }}
          />
        </div>
        <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
          {percent === null ? "Working…" : `${percent}% of the work budget`}
          {total !== null
            ? ` · ${progress.candidatesFinished}/${total} candidates evaluated`
            : progress.candidates.length > 0
              ? ` · ${progress.candidatesFinished}/${progress.candidates.length} candidates evaluated`
              : ""}
          {progress.polling ? " · live updates unavailable, polling" : ""}
        </p>
      </div>

      {progress.candidates.length > 0 ? (
        <ul className="space-y-1">
          {progress.candidates
            .slice()
            .sort((a, b) => a.index - b.index)
            .map((candidate) => (
              <li
                key={candidate.candidateId}
                className="flex items-center justify-between rounded border border-slate-200 px-2 py-1 text-[11px] dark:border-slate-800"
              >
                <span className="text-slate-700 dark:text-slate-200">
                  Candidate {candidate.index + 1}
                </span>
                <span
                  className={
                    candidate.finished
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-slate-500 dark:text-slate-400"
                  }
                >
                  {candidate.finished ? "done" : (candidate.stage ?? "queued")}
                </span>
              </li>
            ))}
        </ul>
      ) : null}
    </div>
  );
}

function phaseLabel(lastFrame: string | null, seen: number): string {
  switch (lastFrame) {
    case null:
    case "layout.accepted":
      return "Preparing board";
    case "layout.candidate.started":
    case "layout.candidate.stage":
    case "layout.progress":
      return seen > 0 ? "Generating and routing candidates" : "Generating candidates";
    case "layout.candidate.finished":
      return "Evaluating candidates";
    default:
      return "Working";
  }
}
