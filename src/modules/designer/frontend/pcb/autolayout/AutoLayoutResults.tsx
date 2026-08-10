import type { ReactElement } from "react";
import { AlertTriangle } from "lucide-react";

import type { LayoutResultEnvelope } from "../../../../../sdks/designer/cloud-autolayout";
import { AutoLayoutCandidateCard } from "./AutoLayoutCandidateCard";

/**
 * Ranked candidate list.
 *
 * Ranking is the SERVICE's: rank 0 is the recommendation and the list keeps that order.
 * The desktop does not re-rank — it has neither the objective nor the measurements the
 * ranking is computed from, so any local ordering would be a second, weaker opinion
 * presented with the same authority.
 */
export function AutoLayoutResults({
  result,
  selectedCandidateId,
  stale,
  applying,
  onSelect,
}: {
  result: LayoutResultEnvelope;
  selectedCandidateId: string | null;
  stale: boolean;
  applying: boolean;
  onSelect: (candidateId: string) => void;
}): ReactElement {
  const ordered = [...result.candidates].sort((a, b) => a.rank - b.rank);
  const [recommended, ...alternatives] = ordered;

  return (
    <div className="space-y-3">
      {stale ? (
        <p className="flex items-start gap-1.5 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            The board changed while Auto Layout was running. You can still inspect and
            preview these candidates, but run Auto Layout again before applying.
          </span>
        </p>
      ) : null}

      {result.warnings.length > 0 ? (
        <ul className="list-disc space-y-0.5 rounded border border-slate-200 bg-slate-50 px-4 py-2 text-[11px] text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          {result.warnings.map((warning, i) => (
            <li key={i}>{warning}</li>
          ))}
        </ul>
      ) : null}

      {recommended ? (
        <ul className="space-y-1">
          <AutoLayoutCandidateCard
            candidate={recommended}
            index={0}
            selected={recommended.candidateId === selectedCandidateId}
            disabled={stale || applying}
            onSelect={() => onSelect(recommended.candidateId)}
          />
        </ul>
      ) : null}

      {alternatives.length > 0 ? (
        <div>
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Alternatives
          </p>
          <ul className="space-y-1">
            {alternatives.map((candidate, index) => (
              <AutoLayoutCandidateCard
                key={candidate.candidateId}
                candidate={candidate}
                index={index + 1}
                selected={candidate.candidateId === selectedCandidateId}
                disabled={stale || applying}
                onSelect={() => onSelect(candidate.candidateId)}
              />
            ))}
          </ul>
        </div>
      ) : null}

      <p className="text-[10px] text-slate-400 dark:text-slate-500">
        Engine {Object.entries(result.engineVersions ?? {})
          .map(([name, version]) => `${name} ${version}`)
          .join(" · ")}
        {result.objectiveVersion ? ` · objective ${result.objectiveVersion}` : ""}
      </p>
    </div>
  );
}
