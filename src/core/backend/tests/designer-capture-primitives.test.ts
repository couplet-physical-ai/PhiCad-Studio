import { afterEach, describe, expect, test } from "bun:test";
import { resolveCaptureConfig } from "../../../modules/designer/backend/capture/config";
import { ulid } from "../../../modules/designer/backend/capture/ulid";
import {
  ZSTD_AVAILABLE,
  compressSegment,
  decompressSegment,
  segmentExtension,
} from "../../../modules/designer/backend/capture/zstd-io";

describe("ulid", () => {
  test("format: 26 Crockford base32 chars", () => {
    const id = ulid();
    expect(id).toHaveLength(26);
    expect(id).toMatch(/^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{26}$/);
  });

  test("monotonic within the same millisecond", () => {
    const now = Date.now();
    const a = ulid(now);
    const b = ulid(now);
    const c = ulid(now);
    expect(b > a).toBe(true);
    expect(c > b).toBe(true);
  });

  test("time-ordered across milliseconds", () => {
    const a = ulid(1000);
    const b = ulid(2000);
    expect(b > a).toBe(true);
  });
});

describe("zstd-io", () => {
  test("zstd available on this runtime (Bun/Node >=22.15)", () => {
    expect(ZSTD_AVAILABLE).toBe(true);
    expect(segmentExtension()).toBe(".jsonl.zst");
  });

  test("round-trips a segment", () => {
    const data = Buffer.from(
      Array.from({ length: 100 }, (_, i) => `{"seq":${i}}`).join("\n"),
    );
    const compressed = compressSegment(data);
    expect(compressed.byteLength).toBeLessThan(data.byteLength);
    const restored = decompressSegment(compressed, `log.000001${segmentExtension()}`);
    expect(restored.equals(data)).toBe(true);
  });
});

describe("capture config", () => {
  const saved = { ...process.env };

  afterEach(() => {
    for (const key of [
      "OPENPCB_CAPTURE_DIR",
      "OPENPCB_CAPTURE_SEGMENT_MB",
      "OPENPCB_CAPTURE_SESSION_CAP_MB",
      "OPENPCB_FEATURE_DATASET_CAPTURE",
      "OPENPCB_DB_PATH",
    ]) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  test("defaults: disabled in test builds, root beside the DB", () => {
    delete process.env.OPENPCB_FEATURE_DATASET_CAPTURE;
    delete process.env.OPENPCB_CAPTURE_DIR;
    process.env.OPENPCB_DB_PATH = "/tmp/x/openpcb.sqlite";
    const config = resolveCaptureConfig();
    expect(config.enabled).toBe(false); // NODE_ENV != production
    expect(config.captureRoot).toBe("/tmp/x/capture");
    expect(config.segmentMaxBytes).toBe(16 * 1024 * 1024);
    expect(config.sessionCapBytes).toBe(200 * 1024 * 1024);
    expect(config.snapshotEveryNCommands).toBe(500);
  });

  test("env overrides: explicit dir, caps, force-enable", () => {
    process.env.OPENPCB_FEATURE_DATASET_CAPTURE = "1";
    process.env.OPENPCB_CAPTURE_DIR = "/tmp/capture-override";
    process.env.OPENPCB_CAPTURE_SEGMENT_MB = "1";
    process.env.OPENPCB_CAPTURE_SESSION_CAP_MB = "5";
    const config = resolveCaptureConfig();
    expect(config.enabled).toBe(true);
    expect(config.captureRoot).toBe("/tmp/capture-override");
    expect(config.segmentMaxBytes).toBe(1024 * 1024);
    expect(config.sessionCapBytes).toBe(5 * 1024 * 1024);
  });
});
