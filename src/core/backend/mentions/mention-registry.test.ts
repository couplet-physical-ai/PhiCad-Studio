import { describe, expect, it, beforeEach } from "bun:test";
import { MentionRegistry } from "./mention-registry";
import type {
  MentionProvider,
  MentionEntity,
  MentionSearchContext,
  MentionSnapshot,
} from "./types";

class TestProvider implements MentionProvider {
  readonly entityType = "test-item";
  readonly displayName = "Test Item";
  readonly defaultIcon = "🧪";

  async search(context: MentionSearchContext): Promise<MentionEntity[]> {
    const items = [
      { id: "1", displayText: "Alpha", updatedAt: "2024-01-01T00:00:00Z" },
      { id: "2", displayText: "Beta", updatedAt: "2024-01-02T00:00:00Z" },
    ];
    return items
      .filter((item) =>
        item.displayText.toLowerCase().includes(context.query.toLowerCase()),
      )
      .map((item) => ({
        id: item.id,
        entityType: this.entityType,
        displayText: item.displayText,
        icon: this.defaultIcon,
        workspaceId: context.workspaceId,
        navigationPath: `/test/${item.id}`,
        updatedAt: item.updatedAt,
      }));
  }

  async resolve(
    entityId: string,
    workspaceId: string,
  ): Promise<MentionEntity | null> {
    if (entityId === "missing") return null;
    return {
      id: entityId,
      entityType: this.entityType,
      displayText: `Item ${entityId}`,
      workspaceId,
      navigationPath: `/test/${entityId}`,
      updatedAt: "2024-01-01T00:00:00Z",
    };
  }

  async createSnapshot(entityId: string): Promise<MentionSnapshot> {
    return {
      entityId,
      entityType: this.entityType,
      displayText: `Item ${entityId}`,
      entityVersion: "2024-01-01T00:00:00Z",
      snapshotCreatedAt: "2024-01-01T00:00:00Z",
      data: { id: entityId },
    };
  }

  async getNavigationPath(entityId: string): Promise<string | null> {
    return `/test/${entityId}`;
  }
}

describe("MentionRegistry", () => {
  beforeEach(() => {
    MentionRegistry.reset();
    MentionRegistry.init();
  });

  it("initializes as singleton", () => {
    const a = MentionRegistry.init();
    const b = MentionRegistry.get();
    expect(a).toBe(b);
  });

  it("registers and retrieves providers", () => {
    const registry = MentionRegistry.get();
    registry.register(new TestProvider());
    expect(registry.getEntityTypes()).toContain("test-item");
  });

  it("searches across registered providers", async () => {
    const registry = MentionRegistry.get();
    registry.register(new TestProvider());
    const results = await registry.search(
      { query: "Alpha", workspaceId: "default" },
      ["test-item"],
    );
    expect(results).toHaveLength(1);
    expect(results[0].displayText).toBe("Alpha");
  });

  it("sorts search results with prefix matches first", async () => {
    const registry = MentionRegistry.get();
    registry.register(new TestProvider());
    const results = await registry.search(
      { query: "Be", workspaceId: "default" },
      ["test-item"],
    );
    expect(results[0].displayText).toBe("Beta");
  });

  it("resolves existing entities", async () => {
    const registry = MentionRegistry.get();
    registry.register(new TestProvider());
    const entity = await registry.resolve("test-item", "1", "default");
    expect(entity).not.toBeNull();
    expect(entity?.displayText).toBe("Item 1");
  });

  it("returns null for missing entities", async () => {
    const registry = MentionRegistry.get();
    registry.register(new TestProvider());
    const entity = await registry.resolve("test-item", "missing", "default");
    expect(entity).toBeNull();
  });

  it("creates snapshots", async () => {
    const registry = MentionRegistry.get();
    registry.register(new TestProvider());
    const snapshot = await registry.createSnapshot("test-item", "1");
    expect(snapshot).not.toBeNull();
    expect(snapshot?.entityType).toBe("test-item");
  });

  it("throws for unregistered entity types on snapshot", async () => {
    const registry = MentionRegistry.get();
    await expect(
      registry.createSnapshot("unknown", "1"),
    ).rejects.toThrow("No mention provider");
  });
});
