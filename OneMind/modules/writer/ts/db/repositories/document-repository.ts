import { eq, and, isNull, desc, like } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import {
  writer_document,
  type WriterDocumentRow,
  type NewWriterDocument,
} from "../schema";
import type { EditorContent } from "../../../shared/types";

type DbInstance = BunSQLiteDatabase<Record<string, unknown>>;

export class DocumentRepository {
  constructor(private db: DbInstance) {}

  async create(data: NewWriterDocument): Promise<WriterDocumentRow> {
    const [doc] = await this.db
      .insert(writer_document)
      .values(data)
      .returning();
    return doc!;
  }

  async findById(id: string): Promise<WriterDocumentRow | null> {
    const [doc] = await this.db
      .select()
      .from(writer_document)
      .where(and(eq(writer_document.id, id), isNull(writer_document.deleted_at)));
    return doc ?? null;
  }

  async findByIdIncludeDeleted(id: string): Promise<WriterDocumentRow | null> {
    const [doc] = await this.db
      .select()
      .from(writer_document)
      .where(eq(writer_document.id, id));
    return doc ?? null;
  }

  async findByWorkspace(workspaceId: string): Promise<WriterDocumentRow[]> {
    return this.db
      .select()
      .from(writer_document)
      .where(
        and(
          eq(writer_document.workspace_id, workspaceId),
          isNull(writer_document.deleted_at)
        )
      )
      .orderBy(desc(writer_document.updated_at));
  }

  async search(
    workspaceId: string,
    query: string,
    limit = 20
  ): Promise<WriterDocumentRow[]> {
    return this.db
      .select()
      .from(writer_document)
      .where(
        and(
          eq(writer_document.workspace_id, workspaceId),
          like(writer_document.title, `%${query}%`),
          isNull(writer_document.deleted_at)
        )
      )
      .orderBy(desc(writer_document.updated_at))
      .limit(limit);
  }

  async updateTitle(id: string, title: string): Promise<WriterDocumentRow> {
    const [doc] = await this.db
      .update(writer_document)
      .set({ title, updated_at: new Date() })
      .where(eq(writer_document.id, id))
      .returning();
    return doc!;
  }

  async updateContent(id: string, content: EditorContent): Promise<WriterDocumentRow> {
    const [doc] = await this.db
      .update(writer_document)
      .set({
        content_json: content,
        content_engine: content.engine,
        content_version: content.version,
        updated_at: new Date(),
      })
      .where(eq(writer_document.id, id))
      .returning();
    return doc!;
  }

  async updateProjectId(id: string, projectId: string | null): Promise<WriterDocumentRow> {
    const [doc] = await this.db
      .update(writer_document)
      .set({ project_id: projectId, updated_at: new Date() })
      .where(eq(writer_document.id, id))
      .returning();
    return doc!;
  }

  async softDelete(id: string): Promise<void> {
    await this.db
      .update(writer_document)
      .set({ deleted_at: new Date() })
      .where(eq(writer_document.id, id));
  }

  async softDeleteMany(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    let count = 0;
    const now = new Date();
    for (const id of ids) {
      const docs = await this.db
        .update(writer_document)
        .set({ deleted_at: now })
        .where(eq(writer_document.id, id))
        .returning();
      if (docs.length > 0) count++;
    }
    return count;
  }

  async restore(id: string): Promise<WriterDocumentRow> {
    const [doc] = await this.db
      .update(writer_document)
      .set({ deleted_at: null, updated_at: new Date() })
      .where(eq(writer_document.id, id))
      .returning();
    return doc!;
  }
}
