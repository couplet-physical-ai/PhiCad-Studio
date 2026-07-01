import type { CoreBackendModuleContext } from "../../../core/contracts/modules/backend-module";
import type { MentionRecord } from "../../../core/backend/mentions/types";

interface MentionRow {
  id: string;
  message_id: string;
  entity_type: string;
  entity_id: string;
  display_text: string;
  snapshot_data: string;
  snapshot_created_at: string;
  entity_version: string;
  position: number;
  created_at: string;
  updated_at: string;
}

type RawSqlFn = (
  query: string,
  params?: unknown[],
) => Record<string, unknown>[];

function rawSqlFrom(ctx: CoreBackendModuleContext): RawSqlFn {
  return (
    ctx.db as { rawSql<T = unknown>(q: string, p?: unknown[]): T[] }
  ).rawSql.bind(ctx.db);
}

function id(): string {
  return crypto.randomUUID();
}

function now(): string {
  return new Date().toISOString();
}

function decodeJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  const text = String(value);
  if (!text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

function rowToMention(row: Record<string, unknown>): MentionRecord {
  return {
    id: String(row.id),
    messageId: String(row.message_id),
    entityType: String(row.entity_type),
    entityId: String(row.entity_id),
    displayText: String(row.display_text),
    snapshotData: decodeJson(row.snapshot_data, {}),
    snapshotCreatedAt: String(row.snapshot_created_at),
    entityVersion: String(row.entity_version),
    position: Number(row.position) || 0,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export class MentionRepository {
  private rawSql: RawSqlFn;

  constructor(ctx: CoreBackendModuleContext) {
    this.rawSql = rawSqlFrom(ctx);
  }

  async createMany(
    mentions: Omit<MentionRecord, "id" | "createdAt" | "updatedAt">[],
  ): Promise<MentionRecord[]> {
    if (mentions.length === 0) return [];

    const inserted: MentionRecord[] = [];
    const timestamp = now();

    for (const mention of mentions) {
      const record: MentionRecord = {
        ...mention,
        id: id(),
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      this.rawSql(
        `INSERT INTO assistant_message_mention (
          id, message_id, entity_type, entity_id, display_text,
          snapshot_data, snapshot_created_at, entity_version, position,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          record.id,
          record.messageId,
          record.entityType,
          record.entityId,
          record.displayText,
          JSON.stringify(record.snapshotData),
          record.snapshotCreatedAt,
          record.entityVersion,
          record.position,
          record.createdAt,
          record.updatedAt,
        ],
      );

      inserted.push(record);
    }

    return inserted;
  }

  async getByMessageId(messageId: string): Promise<MentionRecord[]> {
    const rows = this.rawSql(
      "SELECT * FROM assistant_message_mention WHERE message_id = ? ORDER BY position",
      [messageId],
    );
    return rows.map(rowToMention);
  }

  async getByMessageIds(messageIds: string[]): Promise<Map<string, MentionRecord[]>> {
    if (messageIds.length === 0) return new Map();

    const placeholders = messageIds.map(() => "?").join(",");
    const rows = this.rawSql(
      `SELECT * FROM assistant_message_mention WHERE message_id IN (${placeholders})`,
      messageIds,
    );

    const byMessage = new Map<string, MentionRecord[]>();
    for (const row of rows) {
      const mention = rowToMention(row);
      const existing = byMessage.get(mention.messageId) ?? [];
      existing.push(mention);
      byMessage.set(mention.messageId, existing);
    }

    return byMessage;
  }

  async getByEntity(
    entityType: string,
    entityId: string,
  ): Promise<MentionRecord[]> {
    const rows = this.rawSql(
      "SELECT * FROM assistant_message_mention WHERE entity_type = ? AND entity_id = ?",
      [entityType, entityId],
    );
    return rows.map(rowToMention);
  }

  async deleteByMessageId(messageId: string): Promise<void> {
    this.rawSql(
      "DELETE FROM assistant_message_mention WHERE message_id = ?",
      [messageId],
    );
  }
}
