import { describe, test, expect, mock } from "bun:test";
import { createDocumentInfoToolHandler } from "../tools/document-info-tool";
import type { ToolExecutionContext } from "../../../../src-ts/shared/types/tool.types";

function makeTarget(overrides: Partial<{
  exists: (id: string) => Promise<boolean>;
  getContent: (id: string) => Promise<unknown>;
  getContentContext: (id: string) => Promise<unknown>;
  getMetadata: (id: string) => Promise<Record<string, unknown>>;
}> = {}) {
  return {
    exists: overrides.exists ?? (async () => true),
    getContent: overrides.getContent ?? (async () => ({
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: "Title" }],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Hello world" }],
        },
      ],
    })),
    getContentContext: overrides.getContentContext ?? (async () => ({
      fullContent: { type: "doc", content: [] },
      contentMarkdown: "",
    })),
    getMetadata: overrides.getMetadata ?? (async () => ({
      title: "My Doc",
      workspaceId: "ws-1",
      updatedAt: "2024-01-01T00:00:00.000Z",
    })),
  };
}

function makeContext(overrides?: Partial<ToolExecutionContext>): ToolExecutionContext {
  return {
    taskId: "task-1",
    activeContext: {
      workspaceId: "ws-1",
      activeTarget: {
        targetType: "writer.document",
        targetId: "doc-1",
      },
    },
    ...overrides,
  };
}

describe("writer.document_info tool", () => {
  test("returns document metadata for a non-empty document", async () => {
    const handler = createDocumentInfoToolHandler(makeTarget());
    const result = await handler.execute({}, makeContext()) as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result.id).toBe("doc-1");
    expect(result.title).toBe("My Doc");
    expect(result.isEmpty).toBe(false);
    expect(typeof result.charCount).toBe("number");
    expect((result.charCount as number)).toBeGreaterThan(0);
    expect(typeof result.wordCount).toBe("number");
    expect((result.wordCount as number)).toBeGreaterThan(0);
    expect(result.updatedAt).toBe("2024-01-01T00:00:00.000Z");
    expect(Array.isArray(result.outline)).toBe(true);
    expect((result.outline as Array<{ level: number; text: string }>)[0]).toEqual({ level: 1, text: "Title" });
  });

  test("returns isEmpty=true for empty document", async () => {
    const handler = createDocumentInfoToolHandler(
      makeTarget({
        getContent: async () => ({
          type: "doc",
          content: [{ type: "paragraph" }],
        }),
      }),
    );
    const result = await handler.execute({}, makeContext()) as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result.isEmpty).toBe(true);
    expect(result.charCount).toBe(0);
    expect(result.wordCount).toBe(0);
    expect((result.outline as unknown[]).length).toBe(0);
  });

  test("fails without workspace", async () => {
    const handler = createDocumentInfoToolHandler(makeTarget());
    const ctx: ToolExecutionContext = { taskId: "t", activeContext: {} };
    const result = await handler.execute({}, ctx) as Record<string, unknown>;

    expect(result.success).toBe(false);
    expect((result.error as Record<string, unknown>).code).toBe("MISSING_WORKSPACE");
  });

  test("fails without active target", async () => {
    const handler = createDocumentInfoToolHandler(makeTarget());
    const ctx: ToolExecutionContext = {
      taskId: "t",
      activeContext: { workspaceId: "ws-1" },
    };
    const result = await handler.execute({}, ctx) as Record<string, unknown>;

    expect(result.success).toBe(false);
    expect((result.error as Record<string, unknown>).code).toBe("NO_ACTIVE_TARGET");
  });

  test("fails when document not found", async () => {
    const handler = createDocumentInfoToolHandler(
      makeTarget({ exists: async () => false }),
    );
    const result = await handler.execute({}, makeContext()) as Record<string, unknown>;

    expect(result.success).toBe(false);
    expect((result.error as Record<string, unknown>).code).toBe("DOCUMENT_NOT_FOUND");
  });

  test("fails on workspace mismatch", async () => {
    const handler = createDocumentInfoToolHandler(
      makeTarget({ getMetadata: async () => ({ workspaceId: "ws-other", title: "X" }) }),
    );
    const result = await handler.execute({}, makeContext()) as Record<string, unknown>;

    expect(result.success).toBe(false);
    expect((result.error as Record<string, unknown>).code).toBe("WORKSPACE_MISMATCH");
  });
});
