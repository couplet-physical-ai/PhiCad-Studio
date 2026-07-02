import { describe, expect, test } from "bun:test";
import {
  createReadDocumentToolHandler,
  readDocumentToolSpec,
} from "../tools/read-document-tool";
import { WRITER_DOCUMENT_TARGET_TYPE } from "../adapters/writer-document-target";

function createTargetStub(overrides?: {
  exists?: (targetId: string) => Promise<boolean>;
  getContentContext?: (targetId: string) => Promise<{
    fullContent: Record<string, unknown>;
    contentMarkdown: string;
  }>;
  getMetadata?: (targetId: string) => Promise<Record<string, unknown>>;
}) {
  return {
    exists:
      overrides?.exists ??
      (async () => true),
    getContentContext:
      overrides?.getContentContext ??
      (async () => ({
        fullContent: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Hello from writer." }],
            },
          ],
        },
        contentMarkdown: "Hello from writer.\n",
      })),
    getMetadata:
      overrides?.getMetadata ??
      (async () => ({
        title: "Test Doc",
        workspaceId: "ws-1",
        updatedAt: new Date("2026-02-18T10:00:00.000Z"),
      })),
  };
}

describe("writer.read_document tool", () => {
  test("registers as a module-scoped writer tool", () => {
    expect(readDocumentToolSpec.name).toBe("writer.read_document");
    expect(readDocumentToolSpec.scope).toBe("module");
  });

  test("returns document markdown from active writer target", async () => {
    const handler = createReadDocumentToolHandler(createTargetStub() as any);

    const result = await handler.execute(
      {},
      {
        taskId: "task-1",
        activeContext: {
          workspaceId: "ws-1",
          activeTarget: {
            targetType: WRITER_DOCUMENT_TARGET_TYPE,
            targetId: "doc-1",
          },
        },
      },
    );

    expect(result).toMatchObject({
      success: true,
      document: {
        id: "doc-1",
        title: "Test Doc",
        workspace_id: "ws-1",
      },
      truncated: false,
    });
    expect((result as { content_markdown?: string }).content_markdown).toContain(
      "Hello from writer",
    );
  });

  test("rejects missing active target", async () => {
    const handler = createReadDocumentToolHandler(createTargetStub() as any);

    const result = await handler.execute(
      {},
      {
        taskId: "task-1",
        activeContext: {
          workspaceId: "ws-1",
        },
      },
    );

    expect(result).toEqual({
      success: false,
      error: {
        code: "NO_ACTIVE_TARGET",
        message: "No active target in context",
      },
    });
  });

  test("rejects wrong active target type", async () => {
    const handler = createReadDocumentToolHandler(createTargetStub() as any);

    const result = await handler.execute(
      {},
      {
        taskId: "task-1",
        activeContext: {
          workspaceId: "ws-1",
          activeTarget: {
            targetType: "knowledge.page",
            targetId: "page-1",
          },
        },
      },
    );

    expect(result).toEqual({
      success: false,
      error: {
        code: "INVALID_TARGET_TYPE",
        message: "Active target must be 'writer.document'",
      },
    });
  });

  test("rejects workspace mismatches", async () => {
    const handler = createReadDocumentToolHandler(
      createTargetStub({
        getMetadata: async () => ({
          title: "Cross-workspace doc",
          workspaceId: "ws-2",
        }),
      }) as any,
    );

    const result = await handler.execute(
      {},
      {
        taskId: "task-1",
        activeContext: {
          workspaceId: "ws-1",
          activeTarget: {
            targetType: WRITER_DOCUMENT_TARGET_TYPE,
            targetId: "doc-1",
          },
        },
      },
    );

    expect(result).toEqual({
      success: false,
      error: {
        code: "WORKSPACE_MISMATCH",
        message: "Active document does not belong to the current workspace",
      },
    });
  });

  test("respects max_chars truncation", async () => {
    const longText = "A".repeat(1000);
    const handler = createReadDocumentToolHandler(
      createTargetStub({
        getContentContext: async () => ({
          fullContent: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: longText }],
              },
            ],
          },
          contentMarkdown: longText,
        }),
      }) as any,
    );

    const result = (await handler.execute(
      { max_chars: 300 },
      {
        taskId: "task-1",
        activeContext: {
          workspaceId: "ws-1",
          activeTarget: {
            targetType: WRITER_DOCUMENT_TARGET_TYPE,
            targetId: "doc-1",
          },
        },
      },
    )) as {
      success: boolean;
      content_markdown?: string;
      total_chars?: number;
      returned_chars?: number;
      truncated?: boolean;
    };

    expect(result.success).toBe(true);
    expect(result.truncated).toBe(true);
    expect(result.total_chars).toBeGreaterThan(300);
    expect(result.returned_chars).toBe(300);
    expect(result.content_markdown?.length).toBe(300);
  });
});
