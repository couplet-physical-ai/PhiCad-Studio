import type { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  // Feedback table
  await db.schema
    .createTable("feedback")
    .addColumn("id", "varchar", (col) => col.primaryKey())
    .addColumn("email", "varchar")
    .addColumn("type", "varchar", (col) => col.notNull())
    .addColumn("status", "varchar", (col) => col.notNull().defaultTo("new"))
    .addColumn("message", "text", (col) => col.notNull())
    .addColumn("timestamp", "varchar", (col) => col.notNull())
    .addColumn("app_version", "varchar", (col) => col.notNull())
    .addColumn("user_agent", "text", (col) => col.notNull())
    .addColumn("system_context", "text")
    .addColumn("files", "text")
    .addColumn("platform", "varchar")
    .addColumn("notes", "text")
    .addColumn("received_at", "varchar", (col) => col.notNull())
    .addColumn("reviewed_at", "varchar")
    .addColumn("created_at", "varchar", (col) => col.notNull())
    .addColumn("updated_at", "varchar", (col) => col.notNull())
    .addColumn("deleted_at", "varchar")
    .execute();

  await db.schema.createIndex("idx_feedback_type").on("feedback").column("type").execute();
  await db.schema.createIndex("idx_feedback_status").on("feedback").column("status").execute();
  await db.schema.createIndex("idx_feedback_received_at").on("feedback").column("received_at").execute();
  await db.schema.createIndex("idx_feedback_platform").on("feedback").column("platform").execute();
  await db.schema.createIndex("idx_feedback_app_version").on("feedback").column("app_version").execute();

  // Analytics events table
  await db.schema
    .createTable("analytics_events")
    .addColumn("id", "varchar", (col) => col.primaryKey())
    .addColumn("event_name", "varchar", (col) => col.notNull())
    .addColumn("event_category", "varchar", (col) => col.notNull())
    .addColumn("session_id", "varchar")
    .addColumn("app_version", "varchar", (col) => col.notNull())
    .addColumn("platform", "varchar", (col) => col.notNull())
    .addColumn("properties", "text")
    .addColumn("timestamp", "varchar", (col) => col.notNull())
    .addColumn("received_at", "varchar", (col) => col.notNull())
    .execute();

  await db.schema.createIndex("idx_events_name").on("analytics_events").column("event_name").execute();
  await db.schema.createIndex("idx_events_category").on("analytics_events").column("event_category").execute();
  await db.schema.createIndex("idx_events_timestamp").on("analytics_events").column("timestamp").execute();
  await db.schema
    .createIndex("idx_events_category_timestamp")
    .on("analytics_events")
    .columns(["event_category", "timestamp"])
    .execute();

  // Sessions table
  await db.schema
    .createTable("sessions")
    .addColumn("id", "varchar", (col) => col.primaryKey())
    .addColumn("created_at", "varchar", (col) => col.notNull())
    .addColumn("expires_at", "varchar", (col) => col.notNull())
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("sessions").execute();
  await db.schema.dropTable("analytics_events").execute();
  await db.schema.dropTable("feedback").execute();
}
