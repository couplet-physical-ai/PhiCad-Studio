/**
 * SessionLogWriter — append-only JSONL segments per capture session, compressed
 * on rotation, hard-capped per session (spec §6).
 *
 * Cap semantics: when total on-disk size (compressed segments + active raw)
 * exceeds the session cap, ONE final `capture_truncated` entry is written and
 * the log stops. We stop rather than drop-oldest because `seq` continuity is
 * what makes the undo/tag stream interpretable; the prefix stays fully usable.
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import type { SessionLogEntry } from "./types";
import { ulid } from "./ulid";
import { compressSegment, segmentExtension } from "./zstd-io";

export interface SessionLogWriterOptions {
  captureRoot: string;
  designId: string;
  sessionUlid: string;
  segmentMaxBytes: number;
  sessionCapBytes: number;
  initialSeq?: number;
}

export type AppendResult =
  | { logged: true; entry: SessionLogEntry }
  | { logged: false; reason: "capped" };

export class SessionLogWriter {
  readonly dir: string;
  private seq: number;
  private segmentIndex = 1;
  private activeRawBytes = 0;
  private compressedBytes = 0;
  private pending: string[] = [];
  private truncated = false;

  constructor(private readonly options: SessionLogWriterOptions) {
    this.seq = options.initialSeq ?? 0;
    this.dir = path.join(
      options.captureRoot,
      "sessions",
      options.designId,
      options.sessionUlid,
    );
    mkdirSync(this.dir, { recursive: true });
    // Resume: skip past already-rotated segments and any active raw segment.
    while (
      existsSync(this.segmentPath(this.segmentIndex) + segmentExtension()) ||
      existsSync(this.compressedPathAnyCodec(this.segmentIndex))
    ) {
      this.compressedBytes += this.segmentSizeOnDisk(this.segmentIndex);
      this.segmentIndex++;
    }
    if (existsSync(this.activeRawPath())) {
      this.activeRawBytes = statSync(this.activeRawPath()).size;
    }
  }

  get currentSeq(): number {
    return this.seq;
  }

  get isTruncated(): boolean {
    return this.truncated;
  }

  get bytesOnDisk(): number {
    return this.compressedBytes + this.activeRawBytes;
  }

  private segmentPath(index: number): string {
    return path.join(this.dir, `log.${String(index).padStart(6, "0")}`);
  }

  private compressedPathAnyCodec(index: number): string {
    const zst = this.segmentPath(index) + ".jsonl.zst";
    return existsSync(zst) ? zst : this.segmentPath(index) + ".jsonl.gz";
  }

  private segmentSizeOnDisk(index: number): number {
    const file = this.compressedPathAnyCodec(index);
    return existsSync(file) ? statSync(file).size : 0;
  }

  private activeRawPath(): string {
    return this.segmentPath(this.segmentIndex) + ".jsonl";
  }

  /** Append an entry. Assigns seq/id/ts; returns the completed entry. */
  append(
    partial: Omit<SessionLogEntry, "v" | "seq" | "id" | "ts" | "designId">,
  ): AppendResult {
    if (this.truncated) return { logged: false, reason: "capped" };
    const entry: SessionLogEntry = {
      v: 1,
      seq: this.seq + 1,
      id: ulid(),
      ts: new Date().toISOString(),
      designId: this.options.designId,
      ...partial,
    };
    this.seq = entry.seq;
    const line = `${JSON.stringify(entry)}\n`;
    this.pending.push(line);
    this.activeRawBytes += Buffer.byteLength(line);

    if (this.bytesOnDisk > this.options.sessionCapBytes) {
      this.truncated = true;
      const marker: SessionLogEntry = {
        v: 1,
        seq: this.seq + 1,
        id: ulid(),
        ts: new Date().toISOString(),
        designId: this.options.designId,
        kind: "capture_truncated",
        actor: "system",
      };
      this.seq = marker.seq;
      this.pending.push(`${JSON.stringify(marker)}\n`);
      this.flush();
      this.rotate();
      return { logged: true, entry };
    }

    if (this.activeRawBytes >= this.options.segmentMaxBytes) {
      this.flush();
      this.rotate();
    }
    return { logged: true, entry };
  }

  /** Persist buffered lines to the active raw segment. */
  flush(): void {
    if (this.pending.length === 0) return;
    appendFileSync(this.activeRawPath(), this.pending.join(""));
    this.pending = [];
  }

  /** Compress the active raw segment and start the next one. */
  rotate(): void {
    this.flush();
    const raw = this.activeRawPath();
    if (!existsSync(raw)) return;
    const data = readFileSync(raw);
    if (data.byteLength === 0) {
      unlinkSync(raw);
      return;
    }
    const compressed = compressSegment(data);
    writeFileSync(this.segmentPath(this.segmentIndex) + segmentExtension(), compressed);
    unlinkSync(raw);
    this.compressedBytes += compressed.byteLength;
    this.activeRawBytes = 0;
    this.segmentIndex++;
  }

  /** Final flush + rotation (session end / shutdown). */
  end(): void {
    this.flush();
    this.rotate();
  }
}
