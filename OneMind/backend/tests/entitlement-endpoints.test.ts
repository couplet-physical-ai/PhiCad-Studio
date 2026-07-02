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
import { verifyEntitlementToken } from "../src/license/entitlement-crypto.ts";
import { handleRequest } from "../src/router.ts";
import { AnalyticsService } from "../src/services/analytics.ts";
import { EntitlementService } from "../src/services/entitlement.ts";
import { DeviceSlotPolicyService } from "../src/services/device-slot-policy.ts";
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

function decodeBase64Url(value: string): string {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}

function extractKid(token: string): string {
  const [headerPart] = token.split(".");
  if (!headerPart) {
    throw new Error("Token header missing");
  }

  const parsed = JSON.parse(decodeBase64Url(headerPart)) as { kid?: unknown };
  if (typeof parsed.kid !== "string" || parsed.kid.length === 0) {
    throw new Error("Token kid missing");
  }
  return parsed.kid;
}

function forceKeyUnavailable(service: EntitlementService): void {
  const mutable = service as unknown as { privateKey: CryptoKey | null };
  mutable.privateKey = null;
}

async function createHarness(): Promise<TestHarness> {
  const dataDir = await mkdtemp(join(tmpdir(), "onemind-backend-entitlement-"));
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

afterEach(async () => {
  for (const harness of activeHarnesses) {
    await harness.cleanup();
    activeHarnesses.delete(harness);
  }
});

describe("entitlement endpoints", () => {
  it("executes login -> entitlement -> replacement -> revocation integration flow", async () => {
    const harness = await createHarness();
    const email = "integration-flow@example.com";

    // Use service directly since HTTP endpoint doesn't expose raw token (by design)
    const accountId = await createAccountId(harness.ctx, email);

    harness.setNow("2026-01-01T00:00:00.000Z");
    const firstIssueResponse = await handleRequest(
      new Request("http://localhost/v1/license/entitlements/issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          deviceId: "device-a",
          licenseId: "license-a",
        }),
      }),
      harness.ctx,
    );
    expect(firstIssueResponse.status).toBe(200);

    harness.setNow("2026-01-01T00:01:00.000Z");
    const secondIssueResponse = await handleRequest(
      new Request("http://localhost/v1/license/entitlements/issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          deviceId: "device-b",
          licenseId: "license-b",
        }),
      }),
      harness.ctx,
    );
    expect(secondIssueResponse.status).toBe(200);

    harness.setNow("2026-01-01T00:02:00.000Z");
    const thirdIssueBlockedResponse = await handleRequest(
      new Request("http://localhost/v1/license/entitlements/issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          deviceId: "device-c",
          licenseId: "license-c",
        }),
      }),
      harness.ctx,
    );
    expect(thirdIssueBlockedResponse.status).toBe(409);
    const thirdIssueBlockedBody = await thirdIssueBlockedResponse.json();
    expect(thirdIssueBlockedBody.error.code).toBe("DEVICE_SLOT_REPLACEMENT_REQUIRED");

    harness.setNow("2026-01-01T00:03:00.000Z");
    const thirdIssueReplaceResponse = await handleRequest(
      new Request("http://localhost/v1/license/entitlements/issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          deviceId: "device-c",
          licenseId: "license-c",
          replaceOldest: true,
        }),
      }),
      harness.ctx,
    );
    expect(thirdIssueReplaceResponse.status).toBe(200);

    const slots = await harness.db
      .selectFrom("device_slots")
      .select(["device_id", "slot_index"])
      .where("account_id", "=", accountId)
      .orderBy("slot_index", "asc")
      .execute();
    expect(slots).toEqual([
      { device_id: "device-c", slot_index: 0 },
      { device_id: "device-b", slot_index: 1 },
    ]);

    const revokeResponse = await handleRequest(
      new Request("http://localhost/v1/license/entitlements/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          deviceId: "device-c",
          licenseId: "license-c",
        }),
      }),
      harness.ctx,
    );
    expect(revokeResponse.status).toBe(200);
    const revokeBody = await revokeResponse.json();

    const verifiedRevoked = await verifyEntitlementToken(revokeBody.data.token as string, {
      expectedIssuer: "onemind-license-service",
      expectedAudience: "onemind-desktop",
      nowSeconds: Math.floor(new Date("2026-01-01T00:03:00.000Z").getTime() / 1000),
      resolvePublicKey: async (keyId) => harness.ctx.entitlementService.getPublicKey(keyId),
      isJtiReplayed: async () => false,
    });
    expect(verifiedRevoked.ok).toBe(true);
    if (!verifiedRevoked.ok) {
      throw new Error("Expected revoked entitlement verification success");
    }
    expect(verifiedRevoked.claims.licenseStatus).toBe("REVOKED");
    expect(verifiedRevoked.claims.accessStatus).toBe("blocked");

    harness.setNow("2026-01-01T00:04:00.000Z");
    const refreshRevokedResponse = await handleRequest(
      new Request("http://localhost/v1/license/entitlements/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          deviceId: "device-c",
          licenseId: "license-c",
        }),
      }),
      harness.ctx,
    );
    expect(refreshRevokedResponse.status).toBe(200);
    const refreshRevokedBody = await refreshRevokedResponse.json();
    const verifiedRefreshRevoked = await verifyEntitlementToken(refreshRevokedBody.data.token as string, {
      expectedIssuer: "onemind-license-service",
      expectedAudience: "onemind-desktop",
      nowSeconds: Math.floor(new Date("2026-01-01T00:04:00.000Z").getTime() / 1000),
      resolvePublicKey: async (keyId) => harness.ctx.entitlementService.getPublicKey(keyId),
      isJtiReplayed: async () => false,
    });
    expect(verifiedRefreshRevoked.ok).toBe(true);
    if (!verifiedRefreshRevoked.ok) {
      throw new Error("Expected refreshed revoked entitlement verification success");
    }
    expect(verifiedRefreshRevoked.claims.licenseStatus).toBe("REVOKED");
    expect(verifiedRefreshRevoked.claims.accessStatus).toBe("blocked");
  });

  it("returns 503 when entitlement signer is unavailable (outage edge)", async () => {
    const harness = await createHarness();
    const accountId = await createAccountId(harness.ctx, "outage-edge@example.com");

    forceKeyUnavailable(harness.ctx.entitlementService);

    const response = await handleRequest(
      new Request("http://localhost/v1/license/entitlements/issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          deviceId: "device-outage",
          licenseId: "license-outage",
        }),
      }),
      harness.ctx,
    );

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body).toEqual({
      success: false,
      error: {
        code: "ENTITLEMENT_KEY_UNAVAILABLE",
        message: "Entitlement signer is unavailable",
      },
    });
  });

  it("issues signed entitlement with account/device/license claims", async () => {
    const harness = await createHarness();
    const accountId = await createAccountId(harness.ctx, "claims@example.com");

    const response = await handleRequest(
      new Request("http://localhost/v1/license/entitlements/issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          deviceId: "device-1",
          licenseId: "license-1",
        }),
      }),
      harness.ctx,
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(typeof body.data.token).toBe("string");

    const token = body.data.token as string;
    const kid = extractKid(token);
    const nowSeconds = Math.floor(new Date("2026-01-01T00:00:00.000Z").getTime() / 1000);

    const verified = await verifyEntitlementToken(token, {
      expectedIssuer: "onemind-license-service",
      expectedAudience: "onemind-desktop",
      nowSeconds,
      resolvePublicKey: async (keyId) => harness.ctx.entitlementService.getPublicKey(keyId),
      isJtiReplayed: async () => false,
    });

    expect(kid).toBe("entitlement-test-kid");
    expect(verified.ok).toBe(true);
    if (!verified.ok) {
      throw new Error("Expected entitlement verification success");
    }

    expect(verified.claims.accountId).toBe(accountId);
    expect(verified.claims.deviceId).toBe("device-1");
    expect(verified.claims.licenseId).toBe("license-1");
    expect(verified.claims.licenseStatus).toBe("ACTIVE");
    expect(verified.claims.accessStatus).toBe("active");
    expect(verified.claims.exp).toBeGreaterThan(nowSeconds);
  });

  it("refreshes entitlement with a new expiry", async () => {
    const harness = await createHarness();
    const accountId = await createAccountId(harness.ctx, "refresh@example.com");

    const issueResponse = await handleRequest(
      new Request("http://localhost/v1/license/entitlements/issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, deviceId: "device-2", licenseId: "license-2" }),
      }),
      harness.ctx,
    );
    const issueBody = await issueResponse.json();

    harness.setNow("2026-01-01T00:05:00.000Z");
    const refreshResponse = await handleRequest(
      new Request("http://localhost/v1/license/entitlements/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, deviceId: "device-2", licenseId: "license-2" }),
      }),
      harness.ctx,
    );

    expect(refreshResponse.status).toBe(200);
    const refreshBody = await refreshResponse.json();
    expect(refreshBody.success).toBe(true);

    const initialVerify = await verifyEntitlementToken(issueBody.data.token as string, {
      expectedIssuer: "onemind-license-service",
      expectedAudience: "onemind-desktop",
      nowSeconds: Math.floor(new Date("2026-01-01T00:00:00.000Z").getTime() / 1000),
      resolvePublicKey: async (keyId) => harness.ctx.entitlementService.getPublicKey(keyId),
      isJtiReplayed: async () => false,
    });
    const refreshedVerify = await verifyEntitlementToken(refreshBody.data.token as string, {
      expectedIssuer: "onemind-license-service",
      expectedAudience: "onemind-desktop",
      nowSeconds: Math.floor(new Date("2026-01-01T00:05:00.000Z").getTime() / 1000),
      resolvePublicKey: async (keyId) => harness.ctx.entitlementService.getPublicKey(keyId),
      isJtiReplayed: async () => false,
    });

    expect(initialVerify.ok).toBe(true);
    expect(refreshedVerify.ok).toBe(true);
    if (!initialVerify.ok || !refreshedVerify.ok) {
      throw new Error("Expected both entitlement tokens to verify");
    }

    expect(refreshedVerify.claims.exp).toBeGreaterThan(initialVerify.claims.exp);
  });

  it("revocation emits blocked-status signed entitlement", async () => {
    const harness = await createHarness();
    const accountId = await createAccountId(harness.ctx, "revoke@example.com");

    const revokeResponse = await handleRequest(
      new Request("http://localhost/v1/license/entitlements/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, deviceId: "device-3", licenseId: "license-3" }),
      }),
      harness.ctx,
    );

    expect(revokeResponse.status).toBe(200);
    const revokeBody = await revokeResponse.json();
    expect(revokeBody.success).toBe(true);

    const nowSeconds = Math.floor(new Date("2026-01-01T00:00:00.000Z").getTime() / 1000);
    const verified = await verifyEntitlementToken(revokeBody.data.token as string, {
      expectedIssuer: "onemind-license-service",
      expectedAudience: "onemind-desktop",
      nowSeconds,
      resolvePublicKey: async (keyId) => harness.ctx.entitlementService.getPublicKey(keyId),
      isJtiReplayed: async () => false,
    });

    expect(verified.ok).toBe(true);
    if (!verified.ok) {
      throw new Error("Expected revoked entitlement verification success");
    }

    expect(verified.claims.licenseStatus).toBe("REVOKED");
    expect(verified.claims.accessStatus).toBe("blocked");
    expect(verified.claims.entitlements[0]).toEqual({
      featureId: "chat.core",
      granted: false,
      reason: "license_blocked",
    });
  });
});
