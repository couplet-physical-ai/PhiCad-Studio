/**
 * One-time migration script: reads legacy JSON feedback files and inserts into DB.
 * Usage: bun src/scripts/migrate-files-to-db.ts
 */
import { loadConfig } from "../config.ts";
import { createDatabase } from "../db/index.ts";
import { runMigrations } from "../db/migrate.ts";
import { FileStorageService } from "../services/file-storage.ts";

async function main() {
  const config = loadConfig();
  console.log("Connecting to database...");
  const db = await createDatabase(config);
  await runMigrations(db);

  const fileStorage = new FileStorageService(config.dataDir);
  const legacyFeedbacks = await fileStorage.listLegacyFeedbacks();

  if (legacyFeedbacks.length === 0) {
    console.log("No legacy feedback entries found.");
    await db.destroy();
    return;
  }

  console.log(`Found ${legacyFeedbacks.length} legacy feedback entries.`);
  let migrated = 0;
  let skipped = 0;

  for (const legacy of legacyFeedbacks) {
    const existing = await db
      .selectFrom("feedback")
      .select("id")
      .where("id", "=", legacy.id)
      .executeTakeFirst();

    if (existing) {
      skipped++;
      continue;
    }

    const now = new Date().toISOString();
    const platform = legacy.systemContext?.platform ?? null;

    await db
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

    await fileStorage.migrateLegacyFiles(legacy.id);
    migrated++;
  }

  console.log(`Migration complete: ${migrated} migrated, ${skipped} skipped (already exist).`);
  await db.destroy();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
