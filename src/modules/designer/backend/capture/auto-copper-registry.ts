/**
 * AutoCopperRegistry — attribution of auto-layout-created copper (spec §6).
 *
 * Maintained by the command layer, never reconstructed by diffing:
 * - apply loop registers created geometry (ids from history patches),
 * - every later command records touches (modify/delete) on registered rows,
 * - undo/redo transitions are driven by the replayed history entry's commandId
 *   and patches — geometry ids are stable across undo→redo, so rows toggle
 *   between `undone` and recomputed statuses instead of being re-keyed.
 *
 * Persisted in SQLite: undo history survives restarts and two DesignerStore
 * instances share one DB, so in-memory state would drift.
 */

import { and, eq, inArray } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { captureAutoCopper, captureAutolayoutJobs } from "../schema";
import type { ClassifiedCopperPatches } from "./patch-classifier";

type Db = BetterSQLite3Database<Record<string, unknown>>;

export interface TouchRecord {
  commandId: string;
  kind: "modify" | "delete";
}

function now(): string {
  return new Date().toISOString();
}

function parseTouches(json: string): TouchRecord[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as TouchRecord[]) : [];
  } catch {
    return [];
  }
}

function statusFromTouches(touches: TouchRecord[]): string {
  if (touches.some((t) => t.kind === "delete")) return "deleted";
  if (touches.some((t) => t.kind === "modify")) return "modified";
  return "active";
}

export function registerAutolayoutJob(
  db: Db,
  params: {
    jobId: string;
    designId: string;
    appliedCandidateId: string | null;
    captureSessionUlid: string;
    snapshotHash: string | null;
    engineVersion: string | null;
    resultSummaryJson: string | null;
    preexistingNetCopper: Record<string, string[]>;
  },
): void {
  db.insert(captureAutolayoutJobs)
    .values({
      jobId: params.jobId,
      designId: params.designId,
      appliedCandidateId: params.appliedCandidateId,
      captureSessionUlid: params.captureSessionUlid,
      appliedAt: now(),
      snapshotHash: params.snapshotHash,
      engineVersion: params.engineVersion,
      resultSummaryJson: params.resultSummaryJson,
      preexistingNetCopperJson: JSON.stringify(params.preexistingNetCopper),
    })
    .onConflictDoNothing()
    .run();
}

/** Register geometry created by one apply-loop command (from its patches). */
export function registerCreatedGeometry(
  db: Db,
  params: {
    designId: string;
    jobId: string;
    appliedCandidateId: string | null;
    commandId: string;
    created: ClassifiedCopperPatches["created"];
  },
): void {
  const timestamp = now();
  for (const ref of params.created) {
    db.insert(captureAutoCopper)
      .values({
        geometryId: ref.geometryId,
        designId: params.designId,
        kind: ref.kind,
        netId: ref.netId,
        jobId: params.jobId,
        appliedCandidateId: params.appliedCandidateId,
        createdByCommandId: params.commandId,
        status: "active",
        touchesJson: "[]",
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .onConflictDoNothing()
      .run();
  }
}

/** Membership check used by tag derivation (touches_auto_copper). */
export function isRegisteredAutoCopper(
  db: Db,
  designId: string,
  geometryId: string,
): boolean {
  const row = db
    .select({ geometryId: captureAutoCopper.geometryId })
    .from(captureAutoCopper)
    .where(
      and(
        eq(captureAutoCopper.designId, designId),
        eq(captureAutoCopper.geometryId, geometryId),
      ),
    )
    .get();
  return row !== undefined;
}

/** Record modify/delete touches from a non-apply command's patches. */
export function recordTouches(
  db: Db,
  designId: string,
  commandId: string,
  classified: ClassifiedCopperPatches,
): void {
  const touched: { geometryId: string; kind: "modify" | "delete" }[] = [
    ...classified.modified.map((ref) => ({ geometryId: ref.geometryId, kind: "modify" as const })),
    ...classified.deleted.map((ref) => ({ geometryId: ref.geometryId, kind: "delete" as const })),
  ];
  if (touched.length === 0) return;
  const ids = touched.map((t) => t.geometryId);
  const rows = db
    .select()
    .from(captureAutoCopper)
    .where(
      and(
        eq(captureAutoCopper.designId, designId),
        inArray(captureAutoCopper.geometryId, ids),
      ),
    )
    .all();
  const byId = new Map(rows.map((row) => [row.geometryId, row]));
  for (const touch of touched) {
    const row = byId.get(touch.geometryId);
    if (!row) continue;
    const touches = parseTouches(row.touchesJson);
    if (touches.some((t) => t.commandId === commandId && t.kind === touch.kind)) continue;
    touches.push({ commandId, kind: touch.kind });
    db.update(captureAutoCopper)
      .set({
        touchesJson: JSON.stringify(touches),
        status: row.status === "undone" ? "undone" : statusFromTouches(touches),
        updatedAt: now(),
      })
      .where(eq(captureAutoCopper.geometryId, touch.geometryId))
      .run();
  }
}

/**
 * Undo/redo transition for one replayed history entry.
 * - undo of a creating command ⇒ rows `undone`; redo ⇒ recomputed from touches.
 * - undo of a touching command ⇒ its touch removed; redo ⇒ re-added (from patches,
 *   via recordTouches at the call site).
 */
export function onHistoryReplay(
  db: Db,
  designId: string,
  direction: "undo" | "redo",
  commandId: string,
): void {
  const createdRows = db
    .select()
    .from(captureAutoCopper)
    .where(
      and(
        eq(captureAutoCopper.designId, designId),
        eq(captureAutoCopper.createdByCommandId, commandId),
      ),
    )
    .all();
  for (const row of createdRows) {
    const status =
      direction === "undo" ? "undone" : statusFromTouches(parseTouches(row.touchesJson));
    db.update(captureAutoCopper)
      .set({ status, updatedAt: now() })
      .where(eq(captureAutoCopper.geometryId, row.geometryId))
      .run();
  }
  if (direction === "undo") {
    // Remove this command's touches from any registered geometry.
    const rows = db
      .select()
      .from(captureAutoCopper)
      .where(eq(captureAutoCopper.designId, designId))
      .all();
    for (const row of rows) {
      const touches = parseTouches(row.touchesJson);
      const remaining = touches.filter((t) => t.commandId !== commandId);
      if (remaining.length === touches.length) continue;
      db.update(captureAutoCopper)
        .set({
          touchesJson: JSON.stringify(remaining),
          status: row.status === "undone" ? "undone" : statusFromTouches(remaining),
          updatedAt: now(),
        })
        .where(eq(captureAutoCopper.geometryId, row.geometryId))
        .run();
    }
  }
}
