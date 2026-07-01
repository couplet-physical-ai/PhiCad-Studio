import { eq, desc } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type {
  MentionProvider,
  MentionEntity,
  MentionSearchContext,
  MentionSnapshot,
  DesignSnapshotData,
} from "../../../../core/backend/mentions/types";
import { designHeads, schematicParts } from "../schema";

export class DesignMentionProvider implements MentionProvider {
  readonly entityType = "design";
  readonly displayName = "Design";
  readonly defaultIcon = "🛠️";

  constructor(private db: BetterSQLite3Database<Record<string, unknown>>) {}

  async search(context: MentionSearchContext): Promise<MentionEntity[]> {
    const limit = context.query === "" ? 2 : (context.limit ?? 10);
    const query = context.query.trim().toLowerCase();

    const rows = await this.db
      .select({
        id: designHeads.id,
        name: designHeads.name,
        revision: designHeads.revision,
        updatedAt: designHeads.updatedAt,
      })
      .from(designHeads)
      .orderBy(desc(designHeads.updatedAt))
      .limit(50);

    const filtered = query
      ? rows.filter((row) => row.name.toLowerCase().includes(query))
      : rows;

    return filtered.slice(0, limit).map((row) => ({
      id: row.id,
      entityType: this.entityType,
      displayText: row.name,
      icon: this.defaultIcon,
      description: `Revision ${row.revision}`,
      workspaceId: context.workspaceId,
      navigationPath: `/designer/${row.id}`,
      updatedAt: String(row.updatedAt),
    }));
  }

  async resolve(
    entityId: string,
    _workspaceId: string,
  ): Promise<MentionEntity | null> {
    const row = await this.db
      .select()
      .from(designHeads)
      .where(eq(designHeads.id, entityId))
      .limit(1);

    if (!row[0]) return null;

    return {
      id: row[0].id,
      entityType: this.entityType,
      displayText: row[0].name,
      icon: this.defaultIcon,
      description: `Revision ${row[0].revision}`,
      workspaceId: _workspaceId,
      navigationPath: `/designer/${row[0].id}`,
      updatedAt: String(row[0].updatedAt),
    };
  }

  async createSnapshot(entityId: string): Promise<MentionSnapshot> {
    const [design, partCount] = await Promise.all([
      this.db
        .select()
        .from(designHeads)
        .where(eq(designHeads.id, entityId))
        .limit(1),
      this.db
        .select({ count: schematicParts.id })
        .from(schematicParts)
        .where(eq(schematicParts.designId, entityId)),
    ]);

    if (!design[0]) {
      throw new Error(`Design not found: ${entityId}`);
    }

    const d = design[0];
    const snapshotData: DesignSnapshotData = {
      id: d.id,
      name: d.name,
      revision: d.revision,
      summary: `Schematic parts: ${partCount.length}`,
    };

    return {
      entityId: d.id,
      entityType: this.entityType,
      displayText: d.name,
      icon: this.defaultIcon,
      entityVersion: String(d.updatedAt),
      snapshotCreatedAt: new Date().toISOString(),
      data: snapshotData as unknown as Record<string, unknown>,
    };
  }

  async getNavigationPath(entityId: string): Promise<string | null> {
    const row = await this.db
      .select({ id: designHeads.id })
      .from(designHeads)
      .where(eq(designHeads.id, entityId))
      .limit(1);
    return row[0] ? `/designer/${row[0].id}` : null;
  }
}
