/**
 * PerNetOutcome derivation (spec §6) — computed at export from the
 * AutoCopperRegistry + the live projection's copper. NEVER derived by diffing
 * snapshots.
 *
 * Per net with registered auto copper (rows with status 'undone' excluded —
 * an undone apply is proposal rejection, not a rip; the raw undo events stay
 * in the log so this remains re-derivable):
 * - every registration untouched            → accepted (explicit, first-class)
 * - every registration deleted, and the net now has copper beyond
 *   (registered ∪ preexisting-at-apply) ids → rerouted
 * - every registration deleted otherwise    → ripped
 * - any other mix                           → modified
 * editCount = total touches across the net's registrations.
 */

import { and, eq, ne } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { captureAutoCopper, captureAutolayoutJobs } from "../schema";
import type { PerNetOutcome } from "./types";

type Db = BetterSQLite3Database<Record<string, unknown>>;

export interface LiveCopper {
  traces: Array<{ id: string; netId: string | null }>;
  vias: Array<{ id: string; netId: string | null }>;
}

export function derivePerNetOutcomes(
  db: Db,
  designId: string,
  live: LiveCopper,
): PerNetOutcome[] {
  const jobs = db
    .select()
    .from(captureAutolayoutJobs)
    .where(eq(captureAutolayoutJobs.designId, designId))
    .all();
  if (jobs.length === 0) return [];

  const liveIdsByNet = new Map<string, Set<string>>();
  for (const item of [...live.traces, ...live.vias]) {
    if (!item.netId) continue;
    const set = liveIdsByNet.get(item.netId) ?? new Set<string>();
    set.add(item.id);
    liveIdsByNet.set(item.netId, set);
  }

  const outcomes: PerNetOutcome[] = [];
  for (const job of jobs) {
    const rows = db
      .select()
      .from(captureAutoCopper)
      .where(
        and(
          eq(captureAutoCopper.designId, designId),
          eq(captureAutoCopper.jobId, job.jobId),
          ne(captureAutoCopper.status, "undone"),
        ),
      )
      .all();
    if (rows.length === 0) continue;

    let preexisting: Record<string, string[]> = {};
    try {
      preexisting = JSON.parse(job.preexistingNetCopperJson) as Record<string, string[]>;
    } catch {
      preexisting = {};
    }

    const byNet = new Map<string, typeof rows>();
    for (const row of rows) {
      const netId = row.netId ?? "";
      const list = byNet.get(netId) ?? [];
      list.push(row);
      byNet.set(netId, list);
    }

    for (const [netId, regs] of [...byNet.entries()].sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      let editCount = 0;
      let deleted = 0;
      let untouched = 0;
      for (const reg of regs) {
        let touches: unknown[] = [];
        try {
          const parsed = JSON.parse(reg.touchesJson);
          touches = Array.isArray(parsed) ? parsed : [];
        } catch {
          touches = [];
        }
        editCount += touches.length;
        if (reg.status === "deleted") deleted += 1;
        if (reg.status === "active" && touches.length === 0) untouched += 1;
      }

      let outcome: PerNetOutcome["outcome"];
      if (untouched === regs.length) {
        outcome = "accepted";
      } else if (deleted === regs.length) {
        const known = new Set([
          ...regs.map((reg) => reg.geometryId),
          ...(preexisting[netId] ?? []),
        ]);
        const liveIds = liveIdsByNet.get(netId) ?? new Set<string>();
        const hasNewCopper = [...liveIds].some((id) => !known.has(id));
        outcome = hasNewCopper ? "rerouted" : "ripped";
      } else {
        outcome = "modified";
      }

      outcomes.push({
        jobId: job.jobId,
        appliedCandidateId: job.appliedCandidateId,
        netId,
        outcome,
        editCount,
        trigger: "export",
      });
    }
  }
  return outcomes;
}
