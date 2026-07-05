/**
 * Offline-first upload queue (spec §6): rotated session-log segments and
 * milestone snapshots become durable queue rows (same outbox shape as
 * designer_comment_outbox) and drain to the dataset ingest API with
 * exponential backoff + jitter. At-least-once; the ingest API is idempotent
 * by event id / content hash, so replays are no-ops server-side.
 *
 * No OPENPCB_DATASET_INGEST_URL → rows still accumulate locally (bounded by
 * the session cap) and drain never runs; capture stays fully offline.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { and, eq, inArray, lte, or, isNull } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { captureUploadQueue } from "../schema";
import type { CaptureConfig } from "./config";
import { decompressSegment } from "./zstd-io";
import type { SessionLogEntry } from "./types";
import { ulid } from "./ulid";

type Db = BetterSQLite3Database<Record<string, unknown>>;

const BACKOFF_BASE_MS = 1_000;
const BACKOFF_CAP_MS = 5 * 60_000;

export interface UploaderLogger {
  warn?: (message: string, meta?: Record<string, unknown>) => void;
}

function now(): string {
  return new Date().toISOString();
}

function backoffMs(attempts: number): number {
  const base = Math.min(BACKOFF_BASE_MS * 2 ** attempts, BACKOFF_CAP_MS);
  return base + Math.floor(Math.random() * base * 0.25); // + jitter
}

export class CaptureUploader {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private draining = false;

  constructor(
    private readonly db: Db,
    private readonly config: CaptureConfig,
    private readonly logger: UploaderLogger,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  enqueue(
    kind: "events" | "board",
    payloadPath: string,
    designId: string,
    sessionUlid: string,
  ): void {
    this.db
      .insert(captureUploadQueue)
      .values({
        id: ulid(),
        kind,
        payloadPath,
        designId,
        sessionUlid,
        status: "pending",
        attempts: 0,
        nextAttemptAt: null,
        createdAt: now(),
        updatedAt: now(),
      })
      .run();
  }

  start(): void {
    if (this.timer || !this.config.ingestUrl) return;
    const tick = () => {
      void this.drainOnce().finally(() => {
        if (this.timer !== null) {
          this.timer = setTimeout(tick, this.config.uploadIntervalMs);
          this.timer.unref?.();
        }
      });
    };
    this.timer = setTimeout(tick, this.config.uploadIntervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /** Process every due row once. Startup rescan = pending + stale inflight. */
  async drainOnce(): Promise<void> {
    if (!this.config.ingestUrl || this.draining) return;
    this.draining = true;
    try {
      const due = this.db
        .select()
        .from(captureUploadQueue)
        .where(
          and(
            inArray(captureUploadQueue.status, ["pending", "inflight"]),
            or(
              isNull(captureUploadQueue.nextAttemptAt),
              lte(captureUploadQueue.nextAttemptAt, now()),
            ),
          ),
        )
        .all();
      for (const row of due) {
        await this.uploadRow(row);
      }
    } finally {
      this.draining = false;
    }
  }

  private markInflight(id: string): void {
    this.db
      .update(captureUploadQueue)
      .set({ status: "inflight", updatedAt: now() })
      .where(eq(captureUploadQueue.id, id))
      .run();
  }

  private markDone(id: string): void {
    this.db
      .update(captureUploadQueue)
      .set({ status: "done", updatedAt: now() })
      .where(eq(captureUploadQueue.id, id))
      .run();
  }

  private markRetry(id: string, attempts: number, error: string): void {
    this.db
      .update(captureUploadQueue)
      .set({
        status: "pending",
        attempts,
        lastError: error.slice(0, 500),
        nextAttemptAt: new Date(Date.now() + backoffMs(attempts)).toISOString(),
        updatedAt: now(),
      })
      .where(eq(captureUploadQueue.id, id))
      .run();
  }

  private async uploadRow(row: typeof captureUploadQueue.$inferSelect): Promise<void> {
    this.markInflight(row.id);
    try {
      const bytes = readFileSync(row.payloadPath);
      const response =
        row.kind === "events"
          ? await this.postEvents(row, bytes)
          : await this.postBoard(row, bytes);
      if (!response.ok) {
        throw new Error(`ingest ${response.status}`);
      }
      this.markDone(row.id);
    } catch (error) {
      this.markRetry(row.id, row.attempts + 1, String(error));
      this.logger.warn?.("capture upload retry scheduled", {
        id: row.id,
        attempts: row.attempts + 1,
        error: String(error),
      });
    }
  }

  private origin(row: typeof captureUploadQueue.$inferSelect, filePath: string) {
    return {
      origin_type: "desktop_session",
      origin_url: `desktop://design/${row.designId ?? "unknown"}`,
      path: `${row.sessionUlid ?? "session"}/${path.basename(filePath)}`,
      revision: "",
    };
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    const headers: Record<string, string> = { ...extra };
    if (this.config.ingestToken) {
      headers.Authorization = `Bearer ${this.config.ingestToken}`;
    }
    return headers;
  }

  /** Session-log segment → JSONL event batch (idempotent by entry ULID). */
  private async postEvents(
    row: typeof captureUploadQueue.$inferSelect,
    bytes: Buffer,
  ): Promise<Response> {
    const text = decompressSegment(bytes, row.payloadPath).toString();
    const lines: string[] = [];
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      const entry = JSON.parse(line) as SessionLogEntry;
      lines.push(
        JSON.stringify({
          event_id: entry.id,
          kind: `desktop.${entry.kind}`,
          payload: entry,
          session_id: row.sessionUlid,
          board_id: null,
          job_id: entry.jobId ?? null,
          origin: this.origin(row, row.payloadPath),
        }),
      );
    }
    return this.fetchImpl(`${this.config.ingestUrl}/v1/ingest/events`, {
      method: "POST",
      headers: this.headers({ "content-type": "application/x-ndjson" }),
      body: lines.join("\n"),
    });
  }

  /** Milestone snapshot → multipart board ingest (decompressed JSON). */
  private async postBoard(
    row: typeof captureUploadQueue.$inferSelect,
    bytes: Buffer,
  ): Promise<Response> {
    const json = decompressSegment(bytes, row.payloadPath);
    const filename = path.basename(row.payloadPath).replace(/\.(zst|gz)$/, "");
    const form = new FormData();
    form.append("files", new Blob([json], { type: "application/json" }), filename);
    form.append("origin", JSON.stringify(this.origin(row, filename)));
    return this.fetchImpl(`${this.config.ingestUrl}/v1/ingest/board`, {
      method: "POST",
      headers: this.headers(),
      body: form,
    });
  }
}
