/**
 * Milestone snapshots (spec §6): full BoardSnapshot at project-open,
 * autolayout-applied, export, session end, import, and every N commands.
 *
 * Content-addressed with a LOCAL sha256 over JSON.stringify(snapshot) — used
 * only for filename dedup. This is deliberately NOT the canonical snapshot
 * hash (spec §1 forbids reimplementing canonical hashing outside the pinned
 * cloud-auto-layout image); the ingest side recomputes the canonical board_id
 * in M3.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { compressSegment, segmentExtension } from "./zstd-io";

export interface StoredSnapshotRef {
  sha256: string;
  path: string;
  /** False when an identical snapshot was already stored (write skipped). */
  written: boolean;
}

export function storeMilestoneSnapshot(
  sessionDir: string,
  snapshot: unknown,
): StoredSnapshotRef {
  const json = JSON.stringify(snapshot);
  const sha256 = createHash("sha256").update(json).digest("hex");
  const dir = path.join(sessionDir, "snapshots");
  const extension = segmentExtension().replace(".jsonl", ".json");
  const file = path.join(dir, `${sha256}${extension}`);
  if (existsSync(file)) {
    return { sha256, path: file, written: false };
  }
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, compressSegment(Buffer.from(json)));
  return { sha256, path: file, written: true };
}
