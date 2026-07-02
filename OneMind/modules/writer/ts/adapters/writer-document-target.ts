import type { ContentTarget } from "../../../../src-ts/src/domain/services/content-editor/content-target.interface";
import type {
  EditMode,
  ContentSelection,
  ContentContext,
} from "../../../../src-ts/src/domain/services/content-editor/types";
import type {
  TiptapDocument,
  TiptapNode,
} from "../../../../src-ts/src/domain/utils/markdown-to-tiptap";
import { tiptapToMarkdown } from "../../../../src-ts/src/domain/utils/tiptap-to-markdown";
import type { DocumentRepository } from "../db/repositories/document-repository";
import type { EditorContent } from "../../shared/types";

export const WRITER_DOCUMENT_TARGET_TYPE = "writer.document";

const CONTEXT_CHAR_LIMIT = 10000;

export class WriterDocumentTarget implements ContentTarget {
  readonly targetType = WRITER_DOCUMENT_TARGET_TYPE;
  readonly label = "Writer Document";
  readonly description = "Edit Writer document content with AI";
  readonly supportedModes: EditMode[] = ["replace", "append", "selection", "generate"];

  constructor(
    private documentRepo: DocumentRepository
  ) {}

  async exists(targetId: string): Promise<boolean> {
    const doc = await this.documentRepo.findById(targetId);
    return doc !== null;
  }

  async getContent(targetId: string): Promise<TiptapDocument> {
    const doc = await this.documentRepo.findById(targetId);
    if (!doc) {
      throw new Error(`Document not found: ${targetId}`);
    }

    const content = doc.content_json as EditorContent;
    if (!content || content.engine !== "tiptap" || !content.data) {
      return { type: "doc", content: [{ type: "paragraph" }] };
    }

    return content.data as TiptapDocument;
  }

  async getContentContext(
    targetId: string,
    selection?: ContentSelection
  ): Promise<ContentContext> {
    const fullContent = await this.getContent(targetId);
    const contentMarkdown = tiptapToMarkdown(fullContent, {
      maxChars: CONTEXT_CHAR_LIMIT,
      excludeImages: true,
      includeCodeBlocks: true,
    });

    const context: ContentContext = {
      fullContent,
      contentMarkdown,
    };

    if (selection && selection.from !== selection.to) {
      const selectedDoc = this.sliceDoc(fullContent, selection.from, selection.to);
      const selectedMarkdown = tiptapToMarkdown(selectedDoc, {
        maxChars: CONTEXT_CHAR_LIMIT,
        excludeImages: true,
        includeCodeBlocks: true,
      });
      context.selectedContent = {
        markdown: selectedMarkdown,
        tiptap: selectedDoc,
      };
    }

    return context;
  }

  async setContent(targetId: string, content: TiptapDocument): Promise<void> {
    await this.documentRepo.updateContent(targetId, {
      engine: "tiptap",
      version: 1,
      data: content,
    });
  }

  async applySelectionUpdate(
    targetId: string,
    selection: ContentSelection,
    newContent: TiptapDocument
  ): Promise<void> {
    const current = await this.getContent(targetId);
    const docSize = this.calculateDocSize(current);
    const before = this.sliceDoc(current, 0, selection.from);
    const after = this.sliceDoc(current, selection.to, docSize);

    const updated: TiptapDocument = {
      type: "doc",
      content: [
        ...(before.content ?? []),
        ...(newContent.content ?? []),
        ...(after.content ?? []),
      ],
    };

    await this.setContent(targetId, updated);
  }

  async validateSelection(
    targetId: string,
    selection: ContentSelection
  ): Promise<boolean> {
    const content = await this.getContent(targetId);
    const docSize = this.calculateDocSize(content);
    return (
      selection.from >= 0 &&
      selection.to <= docSize &&
      selection.from <= selection.to
    );
  }

  async getMetadata(targetId: string): Promise<Record<string, unknown>> {
    const doc = await this.documentRepo.findById(targetId);
    if (!doc) {
      return {};
    }

    return {
      title: doc.title,
      workspaceId: doc.workspace_id,
      createdAt: doc.created_at,
      updatedAt: doc.updated_at,
    };
  }

  private sliceDoc(
    doc: TiptapDocument,
    from: number,
    to: number
  ): TiptapDocument {
    if (!doc.content || from >= to) {
      return { type: "doc", content: [] };
    }

    const result: TiptapNode[] = [];
    let pos = 0;

    for (const node of doc.content) {
      const size = this.calculateNodeSize(node);
      const start = pos;
      const end = pos + size;

      if (end <= from) {
        pos = end;
        continue;
      }
      if (start >= to) {
        break;
      }

      if (start >= from && end <= to) {
        result.push(node);
      } else if (node.type === "text" && node.text) {
        const textStart = Math.max(from - start, 0);
        const textEnd = Math.min(to - start, node.text.length);
        if (textEnd > textStart) {
          result.push({ ...node, text: node.text.slice(textStart, textEnd) });
        }
      } else if (node.content) {
        const sliced = this.sliceDoc(
          { type: "doc", content: node.content },
          Math.max(from - start - 1, 0),
          Math.min(to - start - 1, this.calculateDocSize({ type: "doc", content: node.content }))
        );
        if (sliced.content && sliced.content.length > 0) {
          result.push({ ...node, content: sliced.content });
        }
      }

      pos = end;
    }

    return { type: "doc", content: result };
  }

  private calculateNodeSize(node: TiptapNode): number {
    if (node.type === "text") {
      return (node.text || "").length;
    }
    if (!node.content || node.content.length === 0) {
      return 1;
    }
    let size = 2;
    for (const child of node.content) {
      size += this.calculateNodeSize(child);
    }
    return size;
  }

  private calculateDocSize(doc: TiptapDocument): number {
    if (!doc.content) return 0;
    let size = 0;
    for (const node of doc.content) {
      size += this.calculateNodeSize(node);
    }
    return size;
  }
}
