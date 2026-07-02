import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import type { Kysely } from "kysely";

import { loadConfig } from "../src/config.ts";
import type { AppContext } from "../src/context.ts";
import { createDatabase } from "../src/db/index.ts";
import { runMigrations } from "../src/db/migrate.ts";
import type { Database } from "../src/db/types.ts";
import { handleRequest } from "../src/router.ts";
import { AnalyticsService } from "../src/services/analytics.ts";
import { FileStorageService } from "../src/services/file-storage.ts";
import { FeedbackService } from "../src/services/feedback.ts";
import { MagicLinkAuthService } from "../src/services/magic-link-auth.ts";
import { SessionService } from "../src/services/session.ts";
import { EntitlementService } from "../src/services/entitlement.ts";
import { DeviceSlotPolicyService } from "../src/services/device-slot-policy.ts";

interface TestHarness {
  ctx: AppContext;
  db: Kysely<Database>;
  cleanup: () => Promise<void>;
}

const activeHarnesses = new Set<TestHarness>();

async function createHarness(): Promise<TestHarness> {
  const dataDir = await mkdtemp(join(tmpdir(), "onemind-backend-auth-"));

  process.env.NODE_ENV = "test";
  process.env.DATA_DIR = dataDir;
  process.env.ADMIN_PASSWORD = "admin123";
  process.env.SESSION_SECRET = "test-secret";

  const config = loadConfig();
  const db = await createDatabase(config);
  await runMigrations(db);

  const sessionService = new SessionService(db);
  const feedbackService = new FeedbackService(db);
  const analyticsService = new AnalyticsService(db);
  const fileStorage = new FileStorageService(config.dataDir);
  const magicLinkAuthService = new MagicLinkAuthService(db, { now: () => new Date() });
  const deviceSlotPolicyService = new DeviceSlotPolicyService(db, () => new Date());
  const entitlementService = await EntitlementService.create(db, deviceSlotPolicyService, {
    issuer: "onemind-license-service",
    audience: "onemind-desktop",
    keyId: "entitlement-test-kid",
  });

  const ctx: AppContext = {
    config,
    db,
    feedbackService,
    analyticsService,
    sessionService,
    fileStorage,
    magicLinkAuthService,
    entitlementService,
    deviceSlotPolicyService,
  };

  const harness: TestHarness = {
    ctx,
    db,
    cleanup: async () => {
      await db.destroy();
      await rm(dataDir, { recursive: true, force: true });
    },
  };

  activeHarnesses.add(harness);
  return harness;
}

afterEach(async () => {
  for (const harness of activeHarnesses) {
    await harness.cleanup();
    activeHarnesses.delete(harness);
  }
});

describe("magic-link auth endpoints", () => {
  it("issues and consumes a magic link token to create a session", async () => {
    const harness = await createHarness();
    const email = "test@example.com";

    const issueRequest = new Request("http://localhost/v1/auth/magic-link/issue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const issueResponse = await handleRequest(issueRequest, harness.ctx);
    expect(issueResponse.status).toBe(200);

    const issueBody = await issueResponse.json();
    expect(issueBody.success).toBe(true);
    
    const issued = await harness.ctx.magicLinkAuthService.issueMagicLink(email);
    const magicLinkToken = issued.token;

    const consumeRequest = new Request("http://localhost/v1/auth/magic-link/consume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: magicLinkToken }),
    });
    const consumeResponse = await handleRequest(consumeRequest, harness.ctx);

    expect(consumeResponse.status).toBe(200);
    const consumeBody = await consumeResponse.json();
    expect(consumeBody).toMatchObject({
      success: true,
      data: {
        email,
      },
    });
    expect(typeof consumeBody.data.accountId).toBe("string");
    expect(typeof consumeBody.data.sessionId).toBe("string");
  });

  it("rejects replayed magic-link token with deterministic error code", async () => {
    const harness = await createHarness();

    const issueResponse = await handleRequest(
      new Request("http://localhost/v1/auth/magic-link/issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "replay@example.com" }),
      }),
      harness.ctx,
    );
    const issueBody = await issueResponse.json();
    expect(issueBody.success).toBe(true);

    const issued = await harness.ctx.magicLinkAuthService.issueMagicLink("replay@example.com");
    const magicLinkToken = issued.token;

    const firstConsume = await handleRequest(
      new Request("http://localhost/v1/auth/magic-link/consume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: magicLinkToken }),
      }),
      harness.ctx,
    );
    expect(firstConsume.status).toBe(200);

    const replayConsume = await handleRequest(
      new Request("http://localhost/v1/auth/magic-link/consume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: magicLinkToken }),
      }),
      harness.ctx,
    );

    expect(replayConsume.status).toBe(409);
    const replayBody = await replayConsume.json();
    expect(replayBody).toEqual({
      success: false,
      error: {
        code: "MAGIC_LINK_ALREADY_USED",
        message: "Magic link token has already been consumed",
      },
    });
  });

  it("rejects expired magic-link token with deterministic error code", async () => {
    const harness = await createHarness();

    const issueResponse = await handleRequest(
      new Request("http://localhost/v1/auth/magic-link/issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "expired@example.com" }),
      }),
      harness.ctx,
    );
    const issueBody = await issueResponse.json();
    expect(issueBody.success).toBe(true);

    const issued = await harness.ctx.magicLinkAuthService.issueMagicLink("expired@example.com");
    const magicLinkToken = issued.token;

    const now = new Date(Date.now() - 60_000).toISOString();
    await harness.db.updateTable("magic_link_tokens").set({ expires_at: now }).execute();

    const consumeResponse = await handleRequest(
      new Request("http://localhost/v1/auth/magic-link/consume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: magicLinkToken }),
      }),
      harness.ctx,
    );

    expect(consumeResponse.status).toBe(410);
    const body = await consumeResponse.json();
    expect(body).toEqual({
      success: false,
      error: {
        code: "MAGIC_LINK_EXPIRED",
        message: "Magic link token is expired",
      },
    });
  });
});
