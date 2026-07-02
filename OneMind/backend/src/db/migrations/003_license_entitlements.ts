import type { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("license_entitlements")
    .addColumn("id", "varchar", (col) => col.primaryKey())
    .addColumn("account_id", "varchar", (col) => col.notNull().references("accounts.id").onDelete("cascade"))
    .addColumn("device_id", "varchar", (col) => col.notNull())
    .addColumn("license_id", "varchar", (col) => col.notNull())
    .addColumn("license_status", "varchar", (col) => col.notNull())
    .addColumn("created_at", "varchar", (col) => col.notNull())
    .addColumn("updated_at", "varchar", (col) => col.notNull())
    .addColumn("revoked_at", "varchar")
    .execute();

  await db.schema
    .createIndex("idx_license_entitlements_account_device")
    .on("license_entitlements")
    .columns(["account_id", "device_id"])
    .unique()
    .execute();

  await db.schema.createIndex("idx_license_entitlements_license_status").on("license_entitlements").column("license_status").execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("license_entitlements").execute();
}
