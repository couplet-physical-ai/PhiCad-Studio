import { eq, and, desc, asc, sql } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import {
  writer_thread_link,
  type WriterThreadLinkRow,
  type NewWriterThreadLink,
} from "../schema";

type DbInstance = BunSQLiteDatabase<Record<string, unknown>>;

export class ThreadLinkRepository {
  constructor(private db: DbInstance) {}

  async create(data: NewWriterThreadLink): Promise<WriterThreadLinkRow> {
    const [link] = await this.db
      .insert(writer_thread_link)
      .values(data)
      .returning();
    return link!;
  }

  async findById(id: string): Promise<WriterThreadLinkRow | null> {
    const [link] = await this.db
      .select()
      .from(writer_thread_link)
      .where(eq(writer_thread_link.id, id));
    return link ?? null;
  }

  async findByChatId(chatId: string): Promise<WriterThreadLinkRow | null> {
    const [link] = await this.db
      .select()
      .from(writer_thread_link)
      .where(eq(writer_thread_link.chat_id, chatId));
    return link ?? null;
  }

  async findByDocument(
    documentId: string,
    includeClosed = false
  ): Promise<WriterThreadLinkRow[]> {
    const conditions = [eq(writer_thread_link.document_id, documentId)];
    if (!includeClosed) {
      conditions.push(eq(writer_thread_link.is_closed, false));
    }

    return this.db
      .select()
      .from(writer_thread_link)
      .where(and(...conditions))
      .orderBy(
        desc(writer_thread_link.is_pinned),
        asc(writer_thread_link.display_order),
        desc(writer_thread_link.created_at)
      );
  }

  async update(
    id: string,
    updates: Partial<Pick<WriterThreadLinkRow, "is_pinned" | "is_closed" | "display_order">>
  ): Promise<WriterThreadLinkRow> {
    const [link] = await this.db
      .update(writer_thread_link)
      .set({ ...updates, updated_at: new Date() })
      .where(eq(writer_thread_link.id, id))
      .returning();
    return link!;
  }

  async delete(id: string): Promise<void> {
    await this.db
      .delete(writer_thread_link)
      .where(eq(writer_thread_link.id, id));
  }

  async deleteByDocument(documentId: string): Promise<void> {
    await this.db
      .delete(writer_thread_link)
      .where(eq(writer_thread_link.document_id, documentId));
  }

  async getNextDisplayOrder(documentId: string): Promise<number> {
    const result = await this.db
      .select({ maxOrder: sql<number>`MAX(${writer_thread_link.display_order})` })
      .from(writer_thread_link)
      .where(eq(writer_thread_link.document_id, documentId));
    return (result[0]?.maxOrder ?? -1) + 1;
  }
}
