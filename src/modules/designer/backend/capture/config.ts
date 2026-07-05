/**
 * Capture configuration. The capture root sits beside the SQLite DB
 * (dev `dev-data/capture`, prod `~/.openpcb/capture`) — the tiny path resolver
 * mirrors `src/core/backend/db/sqlite-client.ts` (modules cannot import it).
 *
 * The single global switch is the `dataset.capture` feature flag: default OFF in
 * dev/test builds, ON in packaged builds, overridable with
 * `OPENPCB_FEATURE_DATASET_CAPTURE`. When off, every capture hook is a no-op.
 */

import os from "node:os";
import path from "node:path";
import { isFeatureEnabled } from "../../../../core/contracts/feature-flags/backend";

export interface CaptureConfig {
  enabled: boolean;
  captureRoot: string;
  /** Rotate the active JSONL segment at this many raw bytes. */
  segmentMaxBytes: number;
  /** Stop capturing a session once its on-disk size exceeds this (spec: 200 MB). */
  sessionCapBytes: number;
  /** Milestone snapshot every N commands (spec: 500). */
  snapshotEveryNCommands: number;
  /** Dataset ingest API; empty = spool locally only. */
  ingestUrl: string;
  ingestToken: string;
  uploadIntervalMs: number;
}

function resolveDataDir(): string {
  const explicit = process.env.OPENPCB_DB_PATH;
  if (explicit && explicit.length > 0) return path.dirname(explicit);
  if (process.env.NODE_ENV === "development") {
    return path.resolve(process.cwd(), "dev-data");
  }
  return path.join(os.homedir(), ".openpcb");
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function resolveCaptureConfig(): CaptureConfig {
  const captureRoot =
    process.env.OPENPCB_CAPTURE_DIR && process.env.OPENPCB_CAPTURE_DIR.length > 0
      ? process.env.OPENPCB_CAPTURE_DIR
      : path.join(resolveDataDir(), "capture");
  return {
    enabled: isFeatureEnabled("dataset.capture"),
    captureRoot,
    segmentMaxBytes: intEnv("OPENPCB_CAPTURE_SEGMENT_MB", 16) * 1024 * 1024,
    sessionCapBytes: intEnv("OPENPCB_CAPTURE_SESSION_CAP_MB", 200) * 1024 * 1024,
    snapshotEveryNCommands: intEnv("OPENPCB_CAPTURE_SNAPSHOT_EVERY", 500),
    ingestUrl: process.env.OPENPCB_DATASET_INGEST_URL ?? "",
    ingestToken: process.env.OPENPCB_DATASET_INGEST_TOKEN ?? "",
    uploadIntervalMs: intEnv("OPENPCB_CAPTURE_UPLOAD_INTERVAL_MS", 15_000),
  };
}
