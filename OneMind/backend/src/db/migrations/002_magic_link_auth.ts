import type { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("accounts")
    .addColumn("id", "varchar", (col) => col.primaryKey())
    .addColumn("email", "varchar", (col) => col.notNull().unique())
    .addColumn("created_at", "varchar", (col) => col.notNull())
    .addColumn("updated_at", "varchar", (col) => col.notNull())
    .execute();

  await db.schema
    .createTable("magic_link_tokens")
    .addColumn("id", "varchar", (col) => col.primaryKey())
    .addColumn("account_id", "varchar", (col) => col.notNull().references("accounts.id").onDelete("cascade"))
    .addColumn("token_hash", "varchar", (col) => col.notNull().unique())
    .addColumn("created_at", "varchar", (col) => col.notNull())
    .addColumn("expires_at", "varchar", (col) => col.notNull())
    .addColumn("consumed_at", "varchar")
    .execute();

  await db.schema.createIndex("idx_accounts_email").on("accounts").column("email").execute();
  await db.schema.createIndex("idx_magic_link_tokens_account_id").on("magic_link_tokens").column("account_id").execute();
  await db.schema.createIndex("idx_magic_link_tokens_expires_at").on("magic_link_tokens").column("expires_at").execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("magic_link_tokens").execute();
  await db.schema.dropTable("accounts").execute();
}
