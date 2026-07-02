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
import { DeviceSlotPolicyService } from "../src/services/device-slot-policy.ts";
import { EntitlementService } from "../src/services/entitlement.ts";
import { FeedbackService } from "../src/services/feedback.ts";
import { FileStorageService } from "../src/services/file-storage.ts";
import { MagicLinkAuthService } from "../src/services/magic-link-auth.ts";
import { SessionService } from "../src/services/session.ts";

interface TestHarness {
  ctx: AppContext;
  db: Kysely<Database>;
  setNow: (iso: string) => void;
  cleanup: () => Promise<void>;
}

const activeHarnesses = new Set<TestHarness>();

async function createHarness(): Promise<TestHarness> {
  const dataDir = await mkdtemp(join(tmpdir(), "onemind-backend-device-slots-"));
  const nowRef = { value: new Date("2026-01-01T00:00:00.000Z").getTime() };

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
  const magicLinkAuthService = new MagicLinkAuthService(db, {
    now: () => new Date(nowRef.value),
  });
  const deviceSlotPolicyService = new DeviceSlotPolicyService(db, () => new Date(nowRef.value));
  const entitlementService = await EntitlementService.create(db, deviceSlotPolicyService, {
    issuer: "onemind-license-service",
    audience: "onemind-desktop",
    keyId: "entitlement-test-kid",
    now: () => new Date(nowRef.value),
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
    setNow: (iso) => {
      nowRef.value = new Date(iso).getTime();
    },
    cleanup: async () => {
      await db.destroy();
      await rm(dataDir, { recursive: true, force: true });
    },
  };

  activeHarnesses.add(harness);
  return harness;
}

async function createAccountId(ctx: AppContext, email: string): Promise<string> {
  const issued = await ctx.magicLinkAuthService.issueMagicLink(email);
  const consumed = await ctx.magicLinkAuthService.consumeMagicLink(issued.token);
  if (!consumed.ok) {
    throw new Error(`Failed to consume magic link: ${consumed.code}`);
  }
  return consumed.accountId;
}

async function issueEntitlement(
  ctx: AppContext,
  input: { accountId: string; deviceId: string; licenseId: string },
): Promise<Response> {
  return handleRequest(
    new Request("http://localhost/v1/license/entitlements/issue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
    ctx,
  );
}

afterEach(async () => {
  for (const harness of activeHarnesses) {
    await harness.cleanup();
    activeHarnesses.delete(harness);
  }
});

describe("device slot policy", () => {
  it("returns replace-oldest prompt payload for third active device", async () => {
    const harness = await createHarness();
    const accountId = await createAccountId(harness.ctx, "slots@example.com");

    harness.setNow("2026-01-01T00:00:00.000Z");
    expect(
      (await issueEntitlement(harness.ctx, { accountId, deviceId: "device-1", licenseId: "license-1" })).status,
    ).toBe(200);

    harness.setNow("2026-01-01T00:01:00.000Z");
    expect(
      (await issueEntitlement(harness.ctx, { accountId, deviceId: "device-2", licenseId: "license-2" })).status,
    ).toBe(200);

    harness.setNow("2026-01-01T00:02:00.000Z");
    const thirdResponse = await issueEntitlement(harness.ctx, {
      accountId,
      deviceId: "device-3",
      licenseId: "license-3",
    });

    expect(thirdResponse.status).toBe(409);
    const thirdBody = await thirdResponse.json();
    expect(thirdBody).toEqual({
      success: false,
      error: {
        code: "DEVICE_SLOT_REPLACEMENT_REQUIRED",
        message: "Device slot limit reached. Replace the oldest active device to continue",
        prompt: {
          code: "DEVICE_SLOT_REPLACEMENT_REQUIRED",
          message: "Device slot limit reached. Replace the oldest active device to continue",
          maxActiveDevices: 2,
          replaceStrategy: "replace_oldest",
          oldestDevice: {
            deviceId: "device-1",
            slotIndex: 0,
            activatedAt: "2026-01-01T00:00:00.000Z",
          },
          activeDevices: [
            {
              deviceId: "device-1",
              slotIndex: 0,
              activatedAt: "2026-01-01T00:00:00.000Z",
            },
            {
              deviceId: "device-2",
              slotIndex: 1,
              activatedAt: "2026-01-01T00:01:00.000Z",
            },
          ],
        },
      },
    });
  });

  it("keeps max two active devices under concurrent third-device attempts", async () => {
    const harness = await createHarness();
    const accountId = await createAccountId(harness.ctx, "slots-concurrency@example.com");

    expect(
      (await issueEntitlement(harness.ctx, { accountId, deviceId: "device-1", licenseId: "license-1" })).status,
    ).toBe(200);
    expect(
      (await issueEntitlement(harness.ctx, { accountId, deviceId: "device-2", licenseId: "license-2" })).status,
    ).toBe(200);

    const [thirdAttempt, fourthAttempt] = await Promise.all([
      issueEntitlement(harness.ctx, { accountId, deviceId: "device-3", licenseId: "license-3" }),
      issueEntitlement(harness.ctx, { accountId, deviceId: "device-4", licenseId: "license-4" }),
    ]);

    expect(thirdAttempt.status).toBe(409);
    expect(fourthAttempt.status).toBe(409);

    const thirdBody = await thirdAttempt.json();
    const fourthBody = await fourthAttempt.json();
    expect(thirdBody.error.code).toBe("DEVICE_SLOT_REPLACEMENT_REQUIRED");
    expect(fourthBody.error.code).toBe("DEVICE_SLOT_REPLACEMENT_REQUIRED");

    const slots = await harness.db
      .selectFrom("device_slots")
      .select(["account_id", "device_id", "slot_index"])
      .where("account_id", "=", accountId)
      .execute();
    expect(slots.length).toBe(2);

    const slotDeviceIds = slots.map((slot) => slot.device_id).sort();
    expect(slotDeviceIds).toEqual(["device-1", "device-2"]);
  });
});
