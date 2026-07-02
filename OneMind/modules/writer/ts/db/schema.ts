import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { v7 as uuidv7 } from "uuid";
import type { EditorContent, VersionSource } from "../../shared/types";

export const writer_document = sqliteTable(
  "module_writer_document",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    workspace_id: text("workspace_id").notNull(),
    title: text("title").notNull(),
    content_engine: text("content_engine").notNull().default("tiptap"),
    content_version: integer("content_version").notNull().default(1),
    content_json: text("content_json", { mode: "json" })
      .$type<EditorContent>()
      .notNull(),
    created_at: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$default(() => new Date()),
    updated_at: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$default(() => new Date())
      .$onUpdate(() => new Date()),
    deleted_at: integer("deleted_at", { mode: "timestamp_ms" }),
    project_id: text("project_id"),
  },
  (table) => [
    index("idx_wd_workspace").on(table.workspace_id),
    index("idx_wd_deleted").on(table.deleted_at),
    index("idx_wd_title").on(table.title),
    index("idx_wd_updated").on(table.updated_at),
    index("idx_wd_project").on(table.project_id),
  ]
);

export const writer_version = sqliteTable(
  "module_writer_version",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    document_id: text("document_id")
      .notNull()
      .references(() => writer_document.id, { onDelete: "cascade" }),
    source: text("source").$type<VersionSource>().notNull(),
    title: text("title"),
    content_snapshot: text("content_snapshot", { mode: "json" })
      .$type<EditorContent>()
      .notNull(),
    thread_id: text("thread_id"),
    message_id: text("message_id"),
    edit_id: text("edit_id"),
    created_at: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$default(() => new Date()),
  },
  (table) => [
    index("idx_wv_document").on(table.document_id),
    index("idx_wv_source").on(table.source),
    index("idx_wv_created").on(table.created_at),
    index("idx_wv_thread").on(table.thread_id),
  ]
);

export const writer_thread_link = sqliteTable(
  "module_writer_thread_link",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    document_id: text("document_id")
      .notNull()
      .references(() => writer_document.id, { onDelete: "cascade" }),
    chat_id: text("chat_id").notNull(),
    is_pinned: integer("is_pinned", { mode: "boolean" }).notNull().default(false),
    is_closed: integer("is_closed", { mode: "boolean" }).notNull().default(false),
    display_order: integer("display_order").notNull().default(0),
    created_at: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$default(() => new Date()),
    updated_at: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$default(() => new Date())
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("idx_wtl_document").on(table.document_id),
    index("idx_wtl_chat").on(table.chat_id),
    index("idx_wtl_order").on(table.document_id, table.is_pinned, table.display_order),
  ]
);

export type WriterDocumentRow = typeof writer_document.$inferSelect;
export type NewWriterDocument = typeof writer_document.$inferInsert;

export type WriterVersionRow = typeof writer_version.$inferSelect;
export type NewWriterVersion = typeof writer_version.$inferInsert;

export type WriterThreadLinkRow = typeof writer_thread_link.$inferSelect;
export type NewWriterThreadLink = typeof writer_thread_link.$inferInsert;
