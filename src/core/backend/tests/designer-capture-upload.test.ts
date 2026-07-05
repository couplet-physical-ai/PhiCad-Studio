import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { DesignerCommandEnvelope, DesignerSDK } from "../../../sdks";
import { MODULE_SDK_TOKENS } from "../../../sdks";
import {
  resetCaptureRuntimeForTesting,
  resolveCaptureRuntime,
} from "../../../modules/designer/backend/capture";
import {
  getSharedSqlite,
  resetSharedSqliteForTesting,
} from "../db/sqlite-client";
import { DiagnosticsStore } from "../diagnostics/diagnostics-store";
import { createHttpServer } from "../http/create-http-server";
import { MentionRegistry } from "../mentions";
import { ModuleRuntime } from "../modules/module-loader";
import { ModuleRouterRegistry } from "../router/module-registry";

const SESSION = "designer-pcb-session";

interface IngestStub {
  url: string;
  requests: Array<{ path: string; auth: string | null; bodyLines: number }>;
  failuresRemaining: number;
  stop(): void;
}

function startIngestStub(failFirst = 0): IngestStub {
  const stub: IngestStub = {
    url: "",
    requests: [],
    failuresRemaining: failFirst,
    stop: () => {},
  };
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      const body = await request.text();
      stub.requests.push({
        path: new URL(request.url).pathname,
        auth: request.headers.get("authorization"),
        bodyLines: body.split("\n").filter((line) => line.trim()).length,
      });
      if (stub.failuresRemaining > 0) {
        stub.failuresRemaining -= 1;
        return new Response("boom", { status: 500 });
      }
      return Response.json({ created: 1, skipped: 0, errors: [] });
    },
  });
  stub.url = `http://127.0.0.1:${server.port}`;
  stub.stop = () => server.stop(true);
  return stub;
}

async function createRuntime() {
  const repoRoot = path.resolve(import.meta.dir, "../../..");
  const moduleRegistry = new ModuleRouterRegistry();
  const moduleRuntime = new ModuleRuntime({
    moduleRegistry,
    workspaceRoot: repoRoot,
  });
  await moduleRuntime.bootstrap();
  createHttpServer({
    diagnosticsStore: new DiagnosticsStore(),
    moduleRegistry,
    moduleRuntime,
  });
  const sdk = moduleRuntime
    .getSdkRegistry()
    .resolve<DesignerSDK>(MODULE_SDK_TOKENS.DESIGNER);
  return { moduleRuntime, sdk };
}

function setupEnv(label: string, ingestUrl: string): void {
  MentionRegistry.init();
  resetSharedSqliteForTesting();
  process.env.OPENPCB_DB_PATH = path.join(
    os.tmpdir(),
    `${label}-${Date.now()}-${crypto.randomUUID()}.sqlite`,
  );
  process.env.OPENPCB_CAPTURE_DIR = mkdtempSync(path.join(os.tmpdir(), `${label}-`));
  process.env.OPENPCB_FEATURE_DATASET_CAPTURE = "1";
  process.env.OPENPCB_CAPTURE_SEGMENT_MB = "1"; // still big; rotation forced via endAll
  process.env.OPENPCB_DATASET_INGEST_URL = ingestUrl;
  process.env.OPENPCB_DATASET_INGEST_TOKEN = "test-upload-token";
  resetCaptureRuntimeForTesting();
}

function envelope(
  designId: string,
  commandId: string,
  command: DesignerCommandEnvelope["command"],
): DesignerCommandEnvelope {
  return {
    commandId,
    sessionId: SESSION,
    aggregateId: designId,
    baseRevision: null,
    issuedAt: Date.now(),
    command,
  };
}

function queueRows(): Array<{ status: string; attempts: number; kind: string }> {
  return getSharedSqlite()
    .query<{ status: string; attempts: number; kind: string }>(
      "SELECT status, attempts, kind FROM designer_capture_upload_queue ORDER BY id",
    )
    .all();
}

async function seedOneSegment(sdk: DesignerSDK): Promise<void> {
  const design = await sdk.createDesign({ name: "Upload" });
  const proj = await sdk.getPcbProjection(design.id);
  const netClassId = proj!.board.netClasses[0]!.id;
  await sdk.dispatchCommand(
    design.id,
    envelope(design.id, `cmd-upload-${crypto.randomUUID()}`, {
      type: "pcb_add_trace",
      layer: "F.Cu",
      pointsNm: [
        { x: 0, y: 0 },
        { x: 5_000_000, y: 0 },
      ],
      widthMm: 0.25,
      netId: "netU",
      netClassId,
      segmentMode: "manhattan-90",
    } as never),
    { actor: "user" },
  );
  // Force rotation → enqueue (normally size-triggered). The singleton already
  // exists (module bootstrap), so the ctx argument is never used.
  const capture = resolveCaptureRuntime(undefined as never);
  capture.flushAll();
  capture.session(design.id).writer.end();
}

afterEach(() => {
  resetCaptureRuntimeForTesting();
  for (const key of [
    "OPENPCB_FEATURE_DATASET_CAPTURE",
    "OPENPCB_CAPTURE_DIR",
    "OPENPCB_CAPTURE_SEGMENT_MB",
    "OPENPCB_DATASET_INGEST_URL",
    "OPENPCB_DATASET_INGEST_TOKEN",
  ]) {
    delete process.env[key];
  }
});

describe("capture upload queue", () => {
  test("rotated segment uploads as JSONL events with bearer token", async () => {
    const stub = startIngestStub();
    try {
      setupEnv("capture-upload", stub.url);
      const { sdk } = await createRuntime();
      await seedOneSegment(sdk);

      const rows = queueRows();
      expect(rows.length).toBeGreaterThanOrEqual(1);
      expect(rows[0]?.kind).toBe("events");

      const capture = resolveCaptureRuntime(undefined as never);
      await capture.drainUploadsOnce();

      expect(queueRows().every((row) => row.status === "done")).toBe(true);
      expect(stub.requests).toHaveLength(rows.length);
      expect(stub.requests[0]?.path).toBe("/v1/ingest/events");
      expect(stub.requests[0]?.auth).toBe("Bearer test-upload-token");
      expect(stub.requests[0]?.bodyLines).toBeGreaterThanOrEqual(2); // session_start + command
    } finally {
      stub.stop();
    }
  });

  test("resume after failures: attempts/backoff persisted, later drain succeeds", async () => {
    const stub = startIngestStub(2); // first two requests fail 500
    try {
      setupEnv("capture-upload-retry", stub.url);
      const { sdk } = await createRuntime();
      await seedOneSegment(sdk);

      const capture = resolveCaptureRuntime(undefined as never);
      await capture.drainUploadsOnce(); // fails → retry scheduled
      let rows = queueRows();
      expect(rows[0]?.status).toBe("pending");
      expect(rows[0]?.attempts).toBe(1);

      // next_attempt_at is in the future → immediate drain is a no-op
      const requestsAfterFirst = stub.requests.length;
      await capture.drainUploadsOnce();
      expect(stub.requests.length).toBe(requestsAfterFirst);

      // Simulate the backoff elapsing (as after an app restart much later).
      getSharedSqlite()
        .query("UPDATE designer_capture_upload_queue SET next_attempt_at = ?")
        .run(new Date(Date.now() - 1000).toISOString());
      await capture.drainUploadsOnce(); // second failure
      await new Promise((resolve) => setTimeout(resolve, 10));
      getSharedSqlite()
        .query("UPDATE designer_capture_upload_queue SET next_attempt_at = ?")
        .run(new Date(Date.now() - 1000).toISOString());
      await capture.drainUploadsOnce(); // succeeds

      rows = queueRows();
      expect(rows[0]?.status).toBe("done");
      expect(rows[0]?.attempts).toBe(2);
    } finally {
      stub.stop();
    }
  });

  test("no ingest URL: rows accumulate locally, drain is a no-op", async () => {
    setupEnv("capture-upload-offline", "");
    const { sdk } = await createRuntime();
    await seedOneSegment(sdk);

    const rows = queueRows();
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const capture = resolveCaptureRuntime(undefined as never);
    await capture.drainUploadsOnce();
    expect(queueRows().every((row) => row.status === "pending")).toBe(true);
  });
});
