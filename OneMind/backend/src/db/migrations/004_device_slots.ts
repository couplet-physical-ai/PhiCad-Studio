import type { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("device_slots")
    .addColumn("id", "varchar", (col) => col.primaryKey())
    .addColumn("account_id", "varchar", (col) => col.notNull().references("accounts.id").onDelete("cascade"))
    .addColumn("slot_index", "integer", (col) => col.notNull())
    .addColumn("device_id", "varchar", (col) => col.notNull())
    .addColumn("activated_at", "varchar", (col) => col.notNull())
    .addColumn("updated_at", "varchar", (col) => col.notNull())
    .execute();

  await db.schema
    .createIndex("idx_device_slots_account_slot")
    .on("device_slots")
    .columns(["account_id", "slot_index"])
    .unique()
    .execute();

  await db.schema
    .createIndex("idx_device_slots_account_device")
    .on("device_slots")
    .columns(["account_id", "device_id"])
    .unique()
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("device_slots").execute();
}
