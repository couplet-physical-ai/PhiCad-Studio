import { eq, desc } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type {
  MentionProvider,
  MentionEntity,
  MentionSearchContext,
  MentionSnapshot,
  LibraryComponentSnapshotData,
} from "../../../../core/backend/mentions/types";
import { components, componentFootprints, footprints } from "../schema";

export class LibraryComponentMentionProvider implements MentionProvider {
  readonly entityType = "library-component";
  readonly displayName = "Component";
  readonly defaultIcon = "🔌";

  constructor(private db: BetterSQLite3Database<Record<string, unknown>>) {}

  async search(context: MentionSearchContext): Promise<MentionEntity[]> {
    const limit = context.query === "" ? 2 : (context.limit ?? 10);
    const query = context.query.trim().toLowerCase();

    const rows = await this.db
      .select({
        id: components.id,
        name: components.name,
        description: components.description,
        manufacturerPartNumber: components.manufacturerPartNumber,
        footprintId: components.footprintId,
        createdAt: components.createdAt,
      })
      .from(components)
      .orderBy(desc(components.createdAt))
      .limit(100);

    const filtered = query
      ? rows.filter(
          (row) =>
            row.name.toLowerCase().includes(query) ||
            row.description.toLowerCase().includes(query) ||
            (row.manufacturerPartNumber?.toLowerCase().includes(query) ?? false),
        )
      : rows;

    return filtered.slice(0, limit).map((row) => ({
      id: row.id,
      entityType: this.entityType,
      displayText: row.name,
      icon: this.defaultIcon,
      description: row.manufacturerPartNumber
        ? `${row.manufacturerPartNumber} · ${row.description}`
        : row.description,
      workspaceId: context.workspaceId,
      navigationPath: `/library/component/${row.id}`,
      updatedAt: String(row.createdAt),
    }));
  }

  async resolve(
    entityId: string,
    _workspaceId: string,
  ): Promise<MentionEntity | null> {
    const row = await this.db
      .select()
      .from(components)
      .where(eq(components.id, entityId))
      .limit(1);

    if (!row[0]) return null;

    return {
      id: row[0].id,
      entityType: this.entityType,
      displayText: row[0].name,
      icon: this.defaultIcon,
      description: row[0].manufacturerPartNumber
        ? `${row[0].manufacturerPartNumber} · ${row[0].description}`
        : row[0].description,
      workspaceId: _workspaceId,
      navigationPath: `/library/component/${row[0].id}`,
      updatedAt: String(row[0].createdAt),
    };
  }

  async createSnapshot(entityId: string): Promise<MentionSnapshot> {
    const [component, variants] = await Promise.all([
      this.db.select().from(components).where(eq(components.id, entityId)).limit(1),
      this.db
        .select({
          footprintId: componentFootprints.footprintId,
          variantLabel: componentFootprints.variantLabel,
          isDefault: componentFootprints.isDefault,
          footprintName: footprints.name,
        })
        .from(componentFootprints)
        .leftJoin(footprints, eq(componentFootprints.footprintId, footprints.id))
        .where(eq(componentFootprints.componentId, entityId)),
    ]);

    if (!component[0]) {
      throw new Error(`Component not found: ${entityId}`);
    }

    const c = component[0];
    const defaultVariant = variants.find((v) => v.isDefault === 1);

    const snapshotData: LibraryComponentSnapshotData = {
      id: c.id,
      name: c.name,
      mpn: c.manufacturerPartNumber ?? undefined,
      package: defaultVariant?.footprintName ?? undefined,
      value: c.description,
      description: c.description,
    };

    return {
      entityId: c.id,
      entityType: this.entityType,
      displayText: c.name,
      icon: this.defaultIcon,
      entityVersion: String(c.createdAt),
      snapshotCreatedAt: new Date().toISOString(),
      data: snapshotData as unknown as Record<string, unknown>,
    };
  }

  async getNavigationPath(entityId: string): Promise<string | null> {
    const row = await this.db
      .select({ id: components.id })
      .from(components)
      .where(eq(components.id, entityId))
      .limit(1);
    return row[0] ? `/library/component/${row[0].id}` : null;
  }
}
