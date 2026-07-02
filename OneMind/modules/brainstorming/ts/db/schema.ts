import {
  sqliteTable,
  text,
  integer,
  real,
  index,
} from "drizzle-orm/sqlite-core";
import { v7 as uuidv7 } from "uuid";
import type {
  ValidationReport,
  Attachment,
  NodeType,
  EdgeType,
  AIJobKind,
  AIJobStatus,
} from "../../shared/types";

export const brainstorm_board = sqliteTable(
  "module_brainstorming_board",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    workspace_id: text("workspace_id").notNull(),
    project_id: text("project_id"),
    title: text("title").notNull(),
    description: text("description"),
    system_prompt_validation: text("system_prompt_validation"),
    created_at: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$default(() => new Date()),
    updated_at: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$default(() => new Date())
      .$onUpdate(() => new Date()),
    deleted_at: integer("deleted_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("idx_bb_workspace").on(table.workspace_id),
    index("idx_bb_workspace_project").on(table.workspace_id, table.project_id),
    index("idx_bb_deleted").on(table.deleted_at),
  ],
);

export const brainstorm_node = sqliteTable(
  "module_brainstorming_node",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    board_id: text("board_id").notNull(),
    type: text("type").$type<NodeType>().notNull().default("idea"),
    title: text("title").notNull(),
    summary_rich: text("summary_rich", { mode: "json" }),
    content_rich: text("content_rich", { mode: "json" }),
    system_prompt_validation: text("system_prompt_validation"),
    tags_json: text("tags_json", { mode: "json" }).$type<string[]>(),
    attachments_json: text("attachments_json", { mode: "json" }).$type<
      Attachment[]
    >(),
    color: text("color"),
    parent_id: text("parent_id"),
    position_x: real("position_x").notNull().default(0),
    position_y: real("position_y").notNull().default(0),
    version: integer("version").notNull().default(1),
    reviewed_parent_version: integer("reviewed_parent_version"),
    is_starred: integer("is_starred", { mode: "boolean" }).default(false),
    is_pinned: integer("is_pinned", { mode: "boolean" }).default(false),
    is_deleted: integer("is_deleted", { mode: "boolean" }).default(false),
    child_count: integer("child_count").default(0),
    comment_count: integer("comment_count").default(0),
    validation_json: text("validation_json", {
      mode: "json",
    }).$type<ValidationReport>(),
    ai_job_ids_json: text("ai_job_ids_json", { mode: "json" }).$type<
      string[]
    >(),
    // Chat ID for linked AI conversation
    chat_id: text("chat_id"),
    created_at: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$default(() => new Date()),
    updated_at: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$default(() => new Date())
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("idx_bn_board").on(table.board_id),
    index("idx_bn_parent").on(table.parent_id),
    index("idx_bn_deleted").on(table.is_deleted),
  ],
);

export const brainstorm_edge = sqliteTable(
  "module_brainstorming_edge",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    board_id: text("board_id").notNull(),
    from_node: text("from_node").notNull(),
    to_node: text("to_node").notNull(),
    type: text("type").$type<EdgeType>().notNull().default("follows_from"),
    label: text("label"),
    created_at: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$default(() => new Date()),
  },
  (table) => [
    index("idx_be_board").on(table.board_id),
    index("idx_be_from").on(table.from_node),
    index("idx_be_to").on(table.to_node),
  ],
);

export const brainstorm_comment = sqliteTable(
  "module_brainstorming_comment",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    node_id: text("node_id").notNull(),
    author: text("author").notNull(),
    body: text("body").notNull(),
    parent_comment_id: text("parent_comment_id"),
    created_at: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$default(() => new Date()),
    updated_at: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$default(() => new Date())
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("idx_bc_node").on(table.node_id),
    index("idx_bc_parent").on(table.parent_comment_id),
  ],
);

export const brainstorm_ai_job = sqliteTable(
  "module_brainstorming_ai_job",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    board_id: text("board_id").notNull(),
    node_id: text("node_id"),
    kind: text("kind").$type<AIJobKind>().notNull(),
    status: text("status").$type<AIJobStatus>().notNull().default("queued"),
    input_snapshot_json: text("input_snapshot_json", { mode: "json" }),
    output_json: text("output_json", { mode: "json" }),
    error: text("error"),
    created_at: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$default(() => new Date()),
    updated_at: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$default(() => new Date())
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("idx_baj_board").on(table.board_id),
    index("idx_baj_node").on(table.node_id),
    index("idx_baj_status").on(table.status),
  ],
);

export const brainstorm_artifacts = sqliteTable(
  "module_brainstorming_artifacts",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    board_id: text("board_id").notNull(),
    node_id: text("node_id"),
    type: text("type").notNull(), // e.g., "markdown_export", "image_export"
    content: text("content").notNull(),
    created_at: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$default(() => new Date()),
  },
  (table) => [
    index("idx_ba_board").on(table.board_id),
    index("idx_ba_node").on(table.node_id),
  ],
);

export type DbBoard = typeof brainstorm_board.$inferSelect;
export type NewDbBoard = typeof brainstorm_board.$inferInsert;

export type DbNode = typeof brainstorm_node.$inferSelect;
export type NewDbNode = typeof brainstorm_node.$inferInsert;

export type DbEdge = typeof brainstorm_edge.$inferSelect;
export type NewDbEdge = typeof brainstorm_edge.$inferInsert;

export type DbComment = typeof brainstorm_comment.$inferSelect;
export type NewDbComment = typeof brainstorm_comment.$inferInsert;

export type DbAIJob = typeof brainstorm_ai_job.$inferSelect;
export type NewDbAIJob = typeof brainstorm_ai_job.$inferInsert;

export type DbArtifact = typeof brainstorm_artifacts.$inferSelect;
export type NewDbArtifact = typeof brainstorm_artifacts.$inferInsert;
