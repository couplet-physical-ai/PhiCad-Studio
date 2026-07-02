import { eq, desc } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import {
  writer_version,
  type WriterVersionRow,
  type NewWriterVersion,
} from "../schema";

type DbInstance = BunSQLiteDatabase<Record<string, unknown>>;

export class VersionRepository {
  constructor(private db: DbInstance) {}

  async create(data: NewWriterVersion): Promise<WriterVersionRow> {
    const [version] = await this.db
      .insert(writer_version)
      .values(data)
      .returning();
    return version!;
  }

  async findById(id: string): Promise<WriterVersionRow | null> {
    const [version] = await this.db
      .select()
      .from(writer_version)
      .where(eq(writer_version.id, id));
    return version ?? null;
  }

  async findByDocument(documentId: string): Promise<WriterVersionRow[]> {
    return this.db
      .select()
      .from(writer_version)
      .where(eq(writer_version.document_id, documentId))
      .orderBy(desc(writer_version.created_at));
  }

  async findLatestByDocument(documentId: string): Promise<WriterVersionRow | null> {
    const [version] = await this.db
      .select()
      .from(writer_version)
      .where(eq(writer_version.document_id, documentId))
      .orderBy(desc(writer_version.created_at))
      .limit(1);
    return version ?? null;
  }

  async deleteByDocument(documentId: string): Promise<void> {
    await this.db
      .delete(writer_version)
      .where(eq(writer_version.document_id, documentId));
  }
}
