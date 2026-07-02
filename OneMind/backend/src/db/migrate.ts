import {
  Migrator,
  type Kysely,
  type Migration,
  type MigrationProvider,
} from "kysely";
import type { Database } from "./types.ts";
import * as migration001 from "./migrations/001_initial.ts";
import * as migration002 from "./migrations/002_magic_link_auth.ts";
import * as migration003 from "./migrations/003_license_entitlements.ts";
import * as migration004 from "./migrations/004_device_slots.ts";
import * as migration005 from "./migrations/005_license_tiers.ts";

const migrations: Record<string, Migration> = {
  "001_initial": migration001,
  "002_magic_link_auth": migration002,
  "003_license_entitlements": migration003,
  "004_device_slots": migration004,
  "005_license_tiers": migration005,
};

class StaticMigrationProvider implements MigrationProvider {
  async getMigrations(): Promise<Record<string, Migration>> {
    return migrations;
  }
}

export async function runMigrations(db: Kysely<Database>): Promise<void> {
  const migrator = new Migrator({
    db,
    provider: new StaticMigrationProvider(),
  });

  const { error, results } = await migrator.migrateToLatest();

  if (results?.length) {
    for (const result of results) {
      if (result.status === "Success") {
        console.log(`  Migration "${result.migrationName}" applied`);
      } else if (result.status === "Error") {
        console.error(`  Migration "${result.migrationName}" failed`);
      }
    }
  }

  if (error) {
    console.error("Migration failed:", error);
    throw error;
  }
}
