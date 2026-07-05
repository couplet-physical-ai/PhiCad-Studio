/**
 * Segment compression for the session log. Prefers builtin zstd (`node:zlib`,
 * present in Bun ≥1.2 and Node ≥22.15 / Electron 41's Node) and falls back to
 * gzip where zstd is unavailable — the segment extension records which was used.
 */

import zlib from "node:zlib";

export const ZSTD_AVAILABLE = typeof zlib.zstdCompressSync === "function";

export function segmentExtension(): string {
  return ZSTD_AVAILABLE ? ".jsonl.zst" : ".jsonl.gz";
}

export function compressSegment(data: Uint8Array): Buffer {
  return ZSTD_AVAILABLE
    ? zlib.zstdCompressSync(data)
    : zlib.gzipSync(data);
}

export function decompressSegment(data: Uint8Array, filename: string): Buffer {
  if (filename.endsWith(".zst")) return zlib.zstdDecompressSync(data);
  if (filename.endsWith(".gz")) return zlib.gunzipSync(data);
  return Buffer.from(data);
}
