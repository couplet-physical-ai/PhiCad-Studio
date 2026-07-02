import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { loadConfig } from "./config.ts";
import { createDatabase } from "./db/index.ts";
import { runMigrations } from "./db/migrate.ts";
import { SessionService } from "./services/session.ts";
import { FeedbackService } from "./services/feedback.ts";
import { AnalyticsService } from "./services/analytics.ts";
import { FileStorageService } from "./services/file-storage.ts";
import { MagicLinkAuthService } from "./services/magic-link-auth.ts";
import { EntitlementService } from "./services/entitlement.ts";
import { DeviceSlotPolicyService } from "./services/device-slot-policy.ts";
import type { AppContext } from "./context.ts";
import { handleRequest } from "./router.ts";

async function initializeStorage(dataDir: string): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  if (process.platform === "darwin") {
    const noIndexMarker = join(dataDir, ".metadata_never_index");
    await writeFile(noIndexMarker, "", { flag: "a" });
  }
}

async function autoMigrateLegacyData(ctx: AppContext): Promise<void> {
  const legacyFeedbacks = await ctx.fileStorage.listLegacyFeedbacks();
  if (legacyFeedbacks.length === 0) return;

  console.log(`  Found ${legacyFeedbacks.length} legacy feedback entries, migrating...`);

  for (const legacy of legacyFeedbacks) {
    // Check if already migrated
    const existing = await ctx.feedbackService.findById(legacy.id);
    if (existing) continue;

    const platform = legacy.systemContext?.platform ?? null;
    const now = new Date().toISOString();

    await ctx.db
      .insertInto("feedback")
      .values({
        id: legacy.id,
        email: legacy.email ?? null,
        type: legacy.type,
        status: "new",
        message: legacy.message,
        timestamp: legacy.timestamp,
        app_version: legacy.appVersion,
        user_agent: legacy.userAgent,
        system_context: legacy.systemContext ? JSON.stringify(legacy.systemContext) : null,
        files: JSON.stringify(legacy.files),
        platform,
        notes: null,
        received_at: legacy.receivedAt,
        reviewed_at: null,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      })
      .execute();

    // Copy attachment files to new location
    await ctx.fileStorage.migrateLegacyFiles(legacy.id);
  }

  console.log(`  Migrated ${legacyFeedbacks.length} feedback entries`);
}

async function startServer(): Promise<void> {
  const config = loadConfig();

  console.log("Starting OneMind backend...");

  // 1. Initialize storage
  await initializeStorage(config.dataDir);

  // 2. Initialize database
  console.log("  Initializing database...");
  const db = await createDatabase(config);

  // 3. Run migrations
  await runMigrations(db);

  // 4. Create services
  const sessionService = new SessionService(db);
  const feedbackService = new FeedbackService(db);
  const analyticsService = new AnalyticsService(db);
  const fileStorage = new FileStorageService(config.dataDir);
  const magicLinkAuthService = new MagicLinkAuthService(db);
  const deviceSlotPolicyService = new DeviceSlotPolicyService(db);
  const entitlementService = await EntitlementService.create(db, deviceSlotPolicyService, {
    issuer: "onemind-license-service",
    audience: "onemind-desktop",
    keyId: "entitlement-main",
  });

  // 5. Build context
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

  // 6. Auto-migrate legacy file-based feedback
  await autoMigrateLegacyData(ctx);

  // 7. Cleanup expired sessions
  await sessionService.cleanup();

  // 8. Start server
  Bun.serve({
    port: config.port,
    async fetch(request) {
      return handleRequest(request, ctx);
    },
  });

  console.log(`OneMind backend running on http://localhost:${config.port}`);
  console.log(`  Landing page: http://localhost:${config.port}/`);
  console.log(`  Data directory: ${config.dataDir}`);
  console.log(`  Health check: http://localhost:${config.port}/health`);
  console.log(`  Feedback endpoint: http://localhost:${config.port}/v1/feedback`);
  console.log(`  Events endpoint: http://localhost:${config.port}/v1/events`);
  console.log(`  Admin interface: http://localhost:${config.port}/admin`);
  if (config.adminPassword === "admin123") {
    console.log(`  Default password: admin123 (change in production!)`);
  }
  if (!config.apiKey) {
    console.log(`  Warning: No API_KEY configured - events endpoint accepts all requests`);
  }
}

void startServer();
