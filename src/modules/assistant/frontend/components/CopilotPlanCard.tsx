// S7: cloud-run plan card — view/edit/reorder/lock the plan, approve a parked
// plan (`awaiting_approval`), or resume a checkpoint (`awaiting_input`) with
// optional guidance. Frames are only refetch triggers (refreshKey); the REST
// plan view is the source of truth. 409 (plan-revision CAS) → refetch + notice.

import {
  ArrowDown,
  ArrowUp,
  Check,
  ListChecks,
  Loader2,
  Lock,
  LockOpen,
  Pencil,
  Play,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState, type ReactElement } from "react";
import type { CopilotPlanTask, CopilotPlanView } from "@openpcb/contracts";

interface PlanOpInput {
  action: "add" | "edit" | "remove" | "reorder" | "lock" | "unlock";
  taskId?: string;
  afterTaskId?: string | null;
  title?: string;
  checkpoint?: boolean;
}

export interface CopilotPlanCardProps {
  assistantBase: string;
  chatId: string;
  cloudRunId: string;
  /** Bump on every copilot.plan.* / run.awaiting.* frame to refetch. */
  refreshKey: number;
  /** x-cloud-bearer / x-cloud-copilot-url (+ api url) forwarded per request. */
  cloudHeaders: Record<string, string>;
  onError?: (message: string) => void;
  /** Initial plan state (static-markup tests; effects fetch the live view). */
  initialPlan?: CopilotPlanView | null;
}

const TERMINAL = new Set(["completed", "failed", "cancelled"]);

function statusPill(status: CopilotPlanTask["status"]): string {
  switch (status) {
    case "completed":
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300";
    case "in_progress":
      return "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300";
    case "failed":
      return "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300";
    case "skipped":
      return "bg-slate-100 text-slate-500 line-through dark:bg-slate-900 dark:text-slate-500";
    default:
      return "bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300";
  }
}

export function CopilotPlanCard({
  assistantBase,
  chatId,
  cloudRunId,
  refreshKey,
  cloudHeaders,
  onError,
  initialPlan = null,
}: CopilotPlanCardProps): ReactElement | null {
  const [plan, setPlan] = useState<CopilotPlanView | null>(initialPlan);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [guidance, setGuidance] = useState("");
  const [editing, setEditing] = useState<{ taskId: string; title: string } | null>(
    null,
  );

  const base = `${assistantBase}/chats/${chatId}/cloud-runs/${cloudRunId}`;

  const fetchPlan = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch(`${base}/plan`, { headers: cloudHeaders });
      if (!res.ok) return; // parked creds/network issues are transient here
      setPlan((await res.json()) as CopilotPlanView);
    } catch {
      // refetch triggers again on the next frame
    }
    // cloudHeaders is rebuilt per render by the caller — key on its bearer only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, cloudHeaders["x-cloud-bearer"]]);

  useEffect(() => {
    void fetchPlan();
  }, [fetchPlan, refreshKey]);

  const act = useCallback(
    async (fn: () => Promise<Response>): Promise<void> => {
      setBusy(true);
      setNotice(null);
      try {
        const res = await fn();
        if (res.status === 409) {
          setNotice("Plan changed elsewhere — refreshed.");
        } else if (!res.ok) {
          const bodyText = await res.text();
          onError?.(`Plan action failed (${res.status}): ${bodyText.slice(0, 200)}`);
        }
      } catch (err) {
        onError?.(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
        void fetchPlan();
      }
    },
    [fetchPlan, onError],
  );

  const patch = useCallback(
    (ops: PlanOpInput[]) =>
      act(() =>
        fetch(`${base}/plan`, {
          method: "PATCH",
          headers: { ...cloudHeaders, "content-type": "application/json" },
          body: JSON.stringify({
            expectedPlanRevision: plan?.planRevision ?? 0,
            ops,
          }),
        }),
      ),
    [act, base, cloudHeaders, plan?.planRevision],
  );

  if (!plan || plan.tasks.length === 0 || TERMINAL.has(plan.status)) return null;

  const pending = plan.tasks.filter((t) => t.status === "pending");
  const parkedApproval = plan.status === "awaiting_approval";
  const parkedCheckpoint = plan.status === "awaiting_input";

  const moveUp = (task: CopilotPlanTask): void => {
    const idx = pending.findIndex((t) => t.taskId === task.taskId);
    if (idx <= 0) return;
    // reorder: place after the task two slots above (front when none)
    const anchor = idx >= 2 ? pending[idx - 2]!.taskId : null;
    void patch([{ action: "reorder", taskId: task.taskId, afterTaskId: anchor }]);
  };
  const moveDown = (task: CopilotPlanTask): void => {
    const idx = pending.findIndex((t) => t.taskId === task.taskId);
    if (idx === -1 || idx >= pending.length - 1) return;
    void patch([
      { action: "reorder", taskId: task.taskId, afterTaskId: pending[idx + 1]!.taskId },
    ]);
  };

  return (
    <div
      data-testid="copilot-plan-card"
      className="rounded-xl border border-sky-300 bg-sky-50 p-3 text-xs text-slate-700 dark:border-sky-900/60 dark:bg-sky-950/20 dark:text-slate-200"
    >
      <div className="flex items-center gap-2 pb-2 font-medium">
        <ListChecks className="h-4 w-4" />
        Cloud plan
        <span className="text-[10px] text-slate-400">rev {plan.planRevision}</span>
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
        {notice ? (
          <span className="text-[10px] text-amber-600 dark:text-amber-300">
            {notice}
          </span>
        ) : null}
      </div>
      <ol className="space-y-1">
        {plan.tasks.map((task) => (
          <li key={task.taskId} className="flex items-center gap-1.5">
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] ${statusPill(task.status)}`}
            >
              {task.status === "in_progress" ? "running" : task.status}
            </span>
            {editing?.taskId === task.taskId ? (
              <>
                <input
                  className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-1 py-0.5 dark:border-slate-700 dark:bg-slate-950"
                  value={editing.title}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                  aria-label="Step title"
                />
                <button
                  type="button"
                  title="Save title"
                  onClick={() => {
                    const title = editing.title.trim();
                    setEditing(null);
                    if (title && title !== task.title)
                      void patch([{ action: "edit", taskId: task.taskId, title }]);
                  }}
                >
                  <Check className="h-3 w-3" />
                </button>
              </>
            ) : (
              <span className="min-w-0 flex-1 truncate" title={task.title}>
                {task.title}
                {task.checkpoint ? (
                  <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                    checkpoint
                  </span>
                ) : null}
              </span>
            )}
            {task.status === "pending" ? (
              <span className="flex shrink-0 gap-1 text-slate-400">
                <button
                  type="button"
                  title="Edit title"
                  disabled={busy}
                  onClick={() => setEditing({ taskId: task.taskId, title: task.title })}
                >
                  <Pencil className="h-3 w-3 hover:text-slate-600" />
                </button>
                <button type="button" title="Move up" disabled={busy}
                  onClick={() => moveUp(task)}>
                  <ArrowUp className="h-3 w-3 hover:text-slate-600" />
                </button>
                <button type="button" title="Move down" disabled={busy}
                  onClick={() => moveDown(task)}>
                  <ArrowDown className="h-3 w-3 hover:text-slate-600" />
                </button>
                <button
                  type="button"
                  title={task.locked ? "Unlock (allow agent edits)" : "Lock (block agent edits)"}
                  disabled={busy}
                  onClick={() =>
                    void patch([
                      { action: task.locked ? "unlock" : "lock", taskId: task.taskId },
                    ])
                  }
                >
                  {task.locked ? (
                    <Lock className="h-3 w-3 text-amber-500" />
                  ) : (
                    <LockOpen className="h-3 w-3 hover:text-slate-600" />
                  )}
                </button>
                <button
                  type="button"
                  title="Skip this step"
                  disabled={busy}
                  onClick={() =>
                    void patch([{ action: "remove", taskId: task.taskId }])
                  }
                >
                  <X className="h-3 w-3 hover:text-red-500" />
                </button>
              </span>
            ) : task.locked ? (
              <Lock className="h-3 w-3 shrink-0 text-amber-500" />
            ) : null}
          </li>
        ))}
      </ol>
      {parkedApproval ? (
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2 dark:border-amber-900/60 dark:bg-amber-950/20">
          <span className="flex-1 text-amber-800 dark:text-amber-200">
            The plan is waiting for your approval.
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void act(() =>
                fetch(`${base}/plan/approve`, { method: "POST", headers: cloudHeaders }),
              )
            }
            className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            <Check className="h-3 w-3" /> Approve plan
          </button>
        </div>
      ) : null}
      {parkedCheckpoint ? (
        <div className="mt-2 space-y-1.5 rounded-lg border border-amber-300 bg-amber-50 p-2 dark:border-amber-900/60 dark:bg-amber-950/20">
          <div className="text-amber-800 dark:text-amber-200">
            Checkpoint — the run is paused for your input.
          </div>
          <div className="flex items-center gap-2">
            <input
              className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-950"
              placeholder="Guidance for next step (optional)"
              aria-label="Guidance for next step"
              value={guidance}
              onChange={(e) => setGuidance(e.target.value)}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                const message = guidance.trim();
                setGuidance("");
                void act(() =>
                  fetch(`${base}/resume`, {
                    method: "POST",
                    headers: { ...cloudHeaders, "content-type": "application/json" },
                    body: JSON.stringify(message ? { message } : {}),
                  }),
                );
              }}
              className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <Play className="h-3 w-3" /> Resume
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
