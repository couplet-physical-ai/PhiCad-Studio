import type { ToolSpec } from "../../../../src-ts/shared/types/tool-spec.types";
import type { ToolHandler, ToolExecutionContext } from "../../../../src-ts/shared/types/tool.types";
import { requireWorkspaceContext } from "../../../../src-ts/src/domain/services/tools/tool-guards";
import { tiptapToMarkdown } from "../../../../src-ts/src/domain/utils/tiptap-to-markdown";
import { WRITER_DOCUMENT_TARGET_TYPE, type WriterDocumentTarget } from "../adapters/writer-document-target";

interface ActiveTargetContext {
  targetType?: unknown;
  targetId?: unknown;
}

interface ToolActiveContext {
  workspaceId?: unknown;
  activeTarget?: ActiveTargetContext;
}

interface HeadingOutline {
  level: number;
  text: string;
}

interface TiptapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  text?: string;
}

export const documentInfoToolSpec: ToolSpec = {
  name: "writer.document_info",
  scope: "module",
  version: "1.0",
  description:
    "Get metadata about the current Writer document: title, word count, whether it's empty, last updated. Use this to understand document state before editing.",
  inputSchema: {
    type: "object",
    properties: {},
    additionalProperties: true,
  },
  guards: [requireWorkspaceContext()],
};

function extractHeadings(content: unknown): HeadingOutline[] {
  if (!content || typeof content !== "object") return [];
  const doc = content as { type?: string; content?: TiptapNode[] };
  if (doc.type !== "doc" || !doc.content) return [];

  const headings: HeadingOutline[] = [];
  for (const node of doc.content) {
    if (node.type === "heading") {
      const level = (node.attrs?.level as number) || 1;
      const text = extractText(node);
      if (text) headings.push({ level, text });
    }
  }
  return headings;
}

function extractText(node: TiptapNode): string {
  if (node.type === "text") return node.text || "";
  if (!node.content) return "";
  return node.content.map(extractText).join("");
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function toIsoString(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return null;
}

type InfoTarget = Pick<WriterDocumentTarget, "exists" | "getContent" | "getContentContext" | "getMetadata">;

export function createDocumentInfoToolHandler(target: InfoTarget): ToolHandler {
  return {
    execute: async (_rawArgs: Record<string, unknown>, context?: ToolExecutionContext) => {
      const activeContext = context?.activeContext as ToolActiveContext | undefined;

      const workspaceId =
        typeof activeContext?.workspaceId === "string" && activeContext.workspaceId.trim().length > 0
          ? activeContext.workspaceId
          : null;

      if (!workspaceId) {
        return { success: false, error: { code: "MISSING_WORKSPACE", message: "workspace_id required" } };
      }

      const activeTarget = activeContext?.activeTarget;
      if (!activeTarget || activeTarget.targetType !== WRITER_DOCUMENT_TARGET_TYPE) {
        return {
          success: false,
          error: { code: "NO_ACTIVE_TARGET", message: "No active Writer document in context" },
        };
      }

      if (typeof activeTarget.targetId !== "string" || activeTarget.targetId.length === 0) {
        return { success: false, error: { code: "INVALID_TARGET_ID", message: "Active target id is required" } };
      }

      const targetId = activeTarget.targetId;

      try {
        const exists = await target.exists(targetId);
        if (!exists) {
          return { success: false, error: { code: "DOCUMENT_NOT_FOUND", message: `Document not found: ${targetId}` } };
        }

        const metadata = (await target.getMetadata?.(targetId)) ?? {};
        const docWorkspaceId = typeof metadata.workspaceId === "string" ? metadata.workspaceId : workspaceId;
        if (docWorkspaceId !== workspaceId) {
          return {
            success: false,
            error: { code: "WORKSPACE_MISMATCH", message: "Document does not belong to the current workspace" },
          };
        }

        const tiptapContent = await target.getContent(targetId);
        const markdown = tiptapToMarkdown(tiptapContent, { excludeImages: true, includeCodeBlocks: true });
        const charCount = markdown.length;
        const wordCount = countWords(markdown);
        const isEmpty = charCount === 0;
        const outline = extractHeadings(tiptapContent);

        return {
          success: true,
          id: targetId,
          title: typeof metadata.title === "string" ? metadata.title : null,
          isEmpty,
          charCount,
          wordCount,
          updatedAt: toIsoString(metadata.updatedAt),
          outline,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to read document info";
        return { success: false, error: { code: "READ_FAILED", message } };
      }
    },
  };
}
