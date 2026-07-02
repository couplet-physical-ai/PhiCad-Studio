import type { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("license_entitlements")
    .addColumn("license_tier", "varchar", (col) =>
      col.defaultTo("alpha-tester"),
    )
    .execute();
  await db.schema
    .alterTable("accounts")
    .addColumn("alpha_enrolled_at", "varchar")
    .execute();
}

export async function down(_db: Kysely<any>): Promise<void> {
  // SQLite doesn't support DROP COLUMN easily, leave as no-op
}
