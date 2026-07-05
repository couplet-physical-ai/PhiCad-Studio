/**
 * Capture runtime — process-wide singleton wiring the session log, tag
 * derivation, and the AutoCopperRegistry into the command layer (WP-D4).
 *
 * Every public hook is fail-isolated: capture must never break dispatch,
 * undo/redo, or routes. When the `dataset.capture` flag is off, `enabled` is
 * false and every hook returns immediately (zero I/O).
 *
 * A singleton (not per-store state) because TWO DesignerStore instances exist
 * (sdk.ts and routes.ts both call createDesignerStore) and both must feed one
 * log/registry.
 */

import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { CoreBackendModuleContext } from "../../../../core/contracts/modules/backend-module";
import type {
  DesignerCommandEnvelope,
  DesignerDispatchResult,
} from "../../../../sdks";
import type { EcsPatch } from "../../../../shared/domain/commands";
import { captureSessions } from "../schema";
import {
  isRegisteredAutoCopper,
  onHistoryReplay as registryOnHistoryReplay,
  recordTouches,
  registerAutolayoutJob,
  registerCreatedGeometry,
} from "./auto-copper-registry";
import { resolveCaptureConfig, type CaptureConfig } from "./config";
import { classifyCopperPatches } from "./patch-classifier";
import { SessionLogWriter } from "./session-log";
import { deriveTags } from "./tags";
import type { DispatchCaptureMeta, SessionLogEntry } from "./types";
import { ulid } from "./ulid";

type Db = BetterSQLite3Database<Record<string, unknown>>;

interface CaptureSession {
  sessionUlid: string;
  writer: SessionLogWriter;
  commandsSinceSnapshot: number;
}

export interface CommandAppliedInput {
  designId: string;
  envelope: DesignerCommandEnvelope;
  result: DesignerDispatchResult;
  meta?: DispatchCaptureMeta;
  forwardPatches: readonly EcsPatch[];
  inversePatches: readonly EcsPatch[];
}

export interface HistoryReplayInput {
  designId: string;
  editorSessionId: string;
  direction: "undo" | "redo";
  commandId: string;
  revision: number;
  forwardPatches: readonly EcsPatch[];
  inversePatches: readonly EcsPatch[];
}

const FLUSH_INTERVAL_MS = 250;

export class CaptureRuntime {
  readonly enabled: boolean;
  readonly config: CaptureConfig;
  private readonly db: Db;
  private readonly logger: CoreBackendModuleContext["logger"];
  private readonly sessions = new Map<string, CaptureSession>();
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor(ctx: CoreBackendModuleContext, config = resolveCaptureConfig()) {
    this.config = config;
    this.enabled = config.enabled;
    this.db = ctx.db.db as Db;
    this.logger = ctx.logger;
    if (this.enabled) {
      this.flushTimer = setInterval(() => this.flushAll(), FLUSH_INTERVAL_MS);
      this.flushTimer.unref?.();
    }
  }

  /** Lazy per-(process, design) capture session (spec §6 "per project session"). */
  session(designId: string): CaptureSession {
    const existing = this.sessions.get(designId);
    if (existing) return existing;
    const sessionUlid = ulid();
    const writer = new SessionLogWriter({
      captureRoot: this.config.captureRoot,
      designId,
      sessionUlid,
      segmentMaxBytes: this.config.segmentMaxBytes,
      sessionCapBytes: this.config.sessionCapBytes,
    });
    this.db
      .insert(captureSessions)
      .values({
        sessionUlid,
        designId,
        startedAt: new Date().toISOString(),
        logDir: writer.dir,
      })
      .run();
    const session: CaptureSession = { sessionUlid, writer, commandsSinceSnapshot: 0 };
    this.sessions.set(designId, session);
    writer.append({ kind: "session_start", actor: "system" });
    return session;
  }

  private append(
    designId: string,
    partial: Omit<SessionLogEntry, "v" | "seq" | "id" | "ts" | "designId">,
  ): void {
    this.session(designId).writer.append(partial);
  }

  onCommandApplied(input: CommandAppliedInput): void {
    if (!this.enabled) return;
    try {
      const { designId, envelope, meta } = input;
      const classified = classifyCopperPatches(input.forwardPatches, input.inversePatches);

      // Registry BEFORE tags so an apply's own copper tags as auto copper.
      if (meta?.actor === "autolayout_apply" && meta.jobId) {
        registerCreatedGeometry(this.db, {
          designId,
          jobId: meta.jobId,
          appliedCandidateId: meta.appliedCandidateId ?? null,
          commandId: envelope.commandId,
          created: classified.created,
        });
      } else {
        recordTouches(this.db, designId, envelope.commandId, classified);
      }

      let tags: SessionLogEntry["tags"] = null;
      let tagError: string | undefined;
      try {
        tags = deriveTags(envelope, classified, (geometryId) =>
          isRegisteredAutoCopper(this.db, designId, geometryId),
        );
      } catch (error) {
        tagError = error instanceof Error ? error.message : String(error);
      }

      const session = this.session(designId);
      session.writer.append({
        kind: "command",
        actor: meta?.actor ?? "user",
        envelope,
        result: input.result,
        groupId: meta?.groupId,
        jobId: meta?.jobId,
        appliedCandidateId: meta?.appliedCandidateId,
        tags,
        ...(tagError ? { tagError } : {}),
      });
      session.commandsSinceSnapshot += 1;
    } catch (error) {
      this.logger.warn?.("capture: onCommandApplied failed", { error: String(error) });
    }
  }

  onHistoryReplay(input: HistoryReplayInput): void {
    if (!this.enabled) return;
    try {
      registryOnHistoryReplay(this.db, input.designId, input.direction, input.commandId);
      if (input.direction === "redo") {
        // Re-add this command's touches, recomputed from its own patches.
        const classified = classifyCopperPatches(input.forwardPatches, input.inversePatches);
        recordTouches(this.db, input.designId, input.commandId, classified);
      }
      this.append(input.designId, {
        kind: input.direction,
        actor: "user",
        history: {
          editorSessionId: input.editorSessionId,
          commandId: input.commandId,
          revision: input.revision,
        },
      });
    } catch (error) {
      this.logger.warn?.("capture: onHistoryReplay failed", { error: String(error) });
    }
  }

  /** Before the apply loop: registers the job row (attribution anchor). */
  onAutolayoutApplyStarted(input: {
    designId: string;
    jobId: string;
    appliedCandidateId: string | null;
    resultSummary: unknown;
    preexistingNetCopper: Record<string, string[]>;
  }): void {
    if (!this.enabled) return;
    try {
      const summary = input.resultSummary as
        | { determinism?: { snapshotHash?: string; engineVersion?: string } }
        | null
        | undefined;
      registerAutolayoutJob(this.db, {
        jobId: input.jobId,
        designId: input.designId,
        appliedCandidateId: input.appliedCandidateId,
        captureSessionUlid: this.session(input.designId).sessionUlid,
        snapshotHash: summary?.determinism?.snapshotHash ?? null,
        engineVersion: summary?.determinism?.engineVersion ?? null,
        resultSummaryJson:
          input.resultSummary === undefined ? null : JSON.stringify(input.resultSummary),
        preexistingNetCopper: input.preexistingNetCopper,
      });
    } catch (error) {
      this.logger.warn?.("capture: onAutolayoutApplyStarted failed", {
        error: String(error),
      });
    }
  }

  /** After the apply loop: one summary entry linking the group. */
  onAutolayoutApplied(input: {
    designId: string;
    jobId: string;
    appliedCandidateId: string | null;
    groupId: string;
  }): void {
    if (!this.enabled) return;
    try {
      this.append(input.designId, {
        kind: "autolayout_applied",
        actor: "autolayout_apply",
        jobId: input.jobId,
        appliedCandidateId: input.appliedCandidateId ?? undefined,
        groupId: input.groupId,
      });
    } catch (error) {
      this.logger.warn?.("capture: onAutolayoutApplied failed", { error: String(error) });
    }
  }

  onImportCommitted(designId: string, summary: unknown): void {
    if (!this.enabled) return;
    try {
      this.append(designId, { kind: "import", actor: "import", importSummary: summary });
    } catch (error) {
      this.logger.warn?.("capture: onImportCommitted failed", { error: String(error) });
    }
  }

  flushAll(): void {
    for (const [designId, session] of this.sessions) {
      try {
        session.writer.flush();
        this.db
          .update(captureSessions)
          .set({
            seq: session.writer.currentSeq,
            commandsSinceSnapshot: session.commandsSinceSnapshot,
            bytesOnDisk: session.writer.bytesOnDisk,
            capped: session.writer.isTruncated ? 1 : 0,
          })
          .where(eq(captureSessions.sessionUlid, session.sessionUlid))
          .run();
      } catch (error) {
        this.logger.warn?.("capture: flush failed", { designId, error: String(error) });
      }
    }
  }

  /** Session-end flush (shutdown or design deletion). */
  endAll(): void {
    if (!this.enabled) return;
    this.flushAll();
    for (const session of this.sessions.values()) {
      try {
        session.writer.end();
        this.db
          .update(captureSessions)
          .set({ endedAt: new Date().toISOString() })
          .where(eq(captureSessions.sessionUlid, session.sessionUlid))
          .run();
      } catch (error) {
        this.logger.warn?.("capture: endAll failed", { error: String(error) });
      }
    }
    this.sessions.clear();
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }
}

let instance: CaptureRuntime | null = null;

export function resolveCaptureRuntime(ctx: CoreBackendModuleContext): CaptureRuntime {
  if (!instance) {
    instance = new CaptureRuntime(ctx);
  }
  return instance;
}

/** Test seam: drop the singleton so a fresh env/config takes effect. */
export function resetCaptureRuntimeForTesting(): void {
  instance?.endAll();
  instance = null;
}
