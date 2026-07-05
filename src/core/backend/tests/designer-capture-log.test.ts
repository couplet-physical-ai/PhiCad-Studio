import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { SessionLogWriter } from "../../../modules/designer/backend/capture/session-log";
import type { SessionLogEntry } from "../../../modules/designer/backend/capture/types";
import { decompressSegment } from "../../../modules/designer/backend/capture/zstd-io";

function makeWriter(overrides: Partial<{ segmentMaxBytes: number; sessionCapBytes: number }> = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), "capture-log-"));
  const writer = new SessionLogWriter({
    captureRoot: root,
    designId: "design-1",
    sessionUlid: "01SESSION",
    segmentMaxBytes: overrides.segmentMaxBytes ?? 1024,
    sessionCapBytes: overrides.sessionCapBytes ?? 1024 * 1024,
  });
  return { root, writer };
}

function commandEntry(i: number) {
  return {
    kind: "command" as const,
    actor: "user" as const,
    envelope: {
      commandId: `cmd-${i}`,
      sessionId: "designer-pcb-session",
      aggregateId: "design-1",
      baseRevision: i,
      issuedAt: 1000 + i,
      command: { type: "pcb_move", payload: { x: i } },
    } as never,
  };
}

function readAllEntries(writer: SessionLogWriter): SessionLogEntry[] {
  const entries: SessionLogEntry[] = [];
  for (const file of readdirSync(writer.dir).sort()) {
    const raw = readFileSync(path.join(writer.dir, file));
    const text = file.endsWith(".jsonl")
      ? raw.toString()
      : decompressSegment(raw, file).toString();
    for (const line of text.split("\n")) {
      if (line.trim()) entries.push(JSON.parse(line));
    }
  }
  return entries.sort((a, b) => a.seq - b.seq);
}

describe("SessionLogWriter", () => {
  test("appends entries with contiguous seq and verbatim envelope", () => {
    const { writer } = makeWriter({ segmentMaxBytes: 1024 * 1024 });
    for (let i = 1; i <= 5; i++) {
      const result = writer.append(commandEntry(i));
      expect(result.logged).toBe(true);
    }
    writer.end();
    const entries = readAllEntries(writer);
    expect(entries.map((e) => e.seq)).toEqual([1, 2, 3, 4, 5]);
    expect(entries[2]?.envelope?.commandId).toBe("cmd-3");
    expect((entries[0]?.id ?? "") < (entries[4]?.id ?? "")).toBe(true); // ULIDs sort
  });

  test("rotates at the segment threshold into compressed segments", () => {
    const { writer } = makeWriter({ segmentMaxBytes: 512 });
    for (let i = 1; i <= 40; i++) writer.append(commandEntry(i));
    writer.end();
    const files = readdirSync(writer.dir).sort();
    const compressed = files.filter((f) => f.endsWith(".jsonl.zst"));
    expect(compressed.length).toBeGreaterThan(1);
    expect(files.some((f) => f.endsWith(".jsonl") && !f.includes(".zst"))).toBe(false);
    // seq contiguous across segments
    const entries = readAllEntries(writer);
    expect(entries.map((e) => e.seq)).toEqual(
      Array.from({ length: 40 }, (_, i) => i + 1),
    );
  });

  test("session cap: capture_truncated marker, then appends refused", () => {
    const { writer } = makeWriter({ segmentMaxBytes: 256, sessionCapBytes: 600 });
    let refused = 0;
    for (let i = 1; i <= 50; i++) {
      const result = writer.append(commandEntry(i));
      if (!result.logged) refused++;
    }
    expect(writer.isTruncated).toBe(true);
    expect(refused).toBeGreaterThan(0);
    const entries = readAllEntries(writer);
    expect(entries.at(-1)?.kind).toBe("capture_truncated");
    expect(entries.at(-1)?.actor).toBe("system");
  });

  test("resume continues seq and segment numbering", () => {
    const { root, writer } = makeWriter({ segmentMaxBytes: 256 });
    for (let i = 1; i <= 10; i++) writer.append(commandEntry(i));
    writer.end();
    const before = readdirSync(writer.dir).length;

    const resumed = new SessionLogWriter({
      captureRoot: root,
      designId: "design-1",
      sessionUlid: "01SESSION",
      segmentMaxBytes: 256,
      sessionCapBytes: 1024 * 1024,
      initialSeq: 10,
    });
    resumed.append(commandEntry(11));
    resumed.end();
    const entries = readAllEntries(resumed);
    expect(entries.map((e) => e.seq)).toEqual(
      Array.from({ length: 11 }, (_, i) => i + 1),
    );
    expect(readdirSync(resumed.dir).length).toBeGreaterThan(before);
  });
});
