import {
  MentionRegistry,
  parseMentions,
  getUniqueEntityRefs,
} from "../../../core/backend/mentions";
import type {
  ResolvedMentionContent,
  MentionImage,
} from "./mention-resolver-types";
import {
  tiptapToMarkdown,
  extractImagesFromTiptap,
  type ExtractedImage,
} from "./tiptap-to-markdown";

export const MENTION_LIMITS = {
  MAX_CHARS_PER_PAGE: 10000,
  MAX_TOTAL_CONTEXT_CHARS: 50000,
  MAX_PAGES_PER_MESSAGE: 10,
  MAX_IMAGES_PER_PAGE: 10,
  MAX_TOTAL_IMAGES: 20,
  MAX_IMAGE_BYTE_SIZE: 5 * 1024 * 1024,
  RESOLUTION_TIMEOUT_MS: 5000,
};

function isKnowledgePageSnapshotData(
  data: unknown,
): data is { title: string; content: unknown; properties: Record<string, unknown> } {
  if (!data || typeof data !== "object") return false;
  const obj = data as Record<string, unknown>;
  return "title" in obj && "content" in obj;
}

function isEditorContent(
  content: unknown,
): content is { engine: string; version: number; data: unknown } {
  if (!content || typeof content !== "object") return false;
  const obj = content as Record<string, unknown>;
  return "engine" in obj && "data" in obj;
}

export class MentionContentResolver {
  private maxCharsPerPage: number;
  private maxTotalChars: number;

  constructor(
    maxCharsPerPage = MENTION_LIMITS.MAX_CHARS_PER_PAGE,
    maxTotalChars = MENTION_LIMITS.MAX_TOTAL_CONTEXT_CHARS,
  ) {
    this.maxCharsPerPage = maxCharsPerPage;
    this.maxTotalChars = maxTotalChars;
  }

  async resolveMessageMentions(
    messageContent: string,
    workspaceId: string,
  ): Promise<ResolvedMentionContent[]> {
    const mentions = parseMentions(messageContent);
    if (mentions.length === 0) {
      return [];
    }

    const uniqueRefs = getUniqueEntityRefs(mentions).slice(
      0,
      MENTION_LIMITS.MAX_PAGES_PER_MESSAGE,
    );

    const resolutionPromises = uniqueRefs.map((ref) =>
      this.resolveSingleMention(ref, workspaceId).catch((err) => {
        console.warn(
          `[MentionContentResolver] Failed to resolve ${ref.entityType}:${ref.entityId}:`,
          err,
        );
        return null;
      }),
    );

    const results = await Promise.all(resolutionPromises);
    return results.filter((r): r is ResolvedMentionContent => r !== null);
  }

  private async resolveSingleMention(
    ref: { entityType: string; entityId: string },
    workspaceId: string,
  ): Promise<ResolvedMentionContent | null> {
    const registry = MentionRegistry.get();

    const entity = await registry.resolve(
      ref.entityType,
      ref.entityId,
      workspaceId,
    );

    if (!entity) {
      return {
        entityType: ref.entityType,
        entityId: ref.entityId,
        displayText: "Deleted Document",
        content: "[This document has been deleted]",
        images: [],
        exists: false,
      };
    }

    let content = "";
    let images: MentionImage[] = [];

    if (ref.entityType === "knowledge-page") {
      const resolved = await this.resolveKnowledgePageContent(ref.entityId);
      content = resolved.content;
      images = resolved.images;
    }

    if (!content && images.length === 0) {
      return {
        entityType: ref.entityType,
        entityId: ref.entityId,
        displayText: entity.displayText,
        content: "[Empty page]",
        images: [],
        exists: true,
      };
    }

    return {
      entityType: ref.entityType,
      entityId: ref.entityId,
      displayText: entity.displayText,
      content: content || "[Document contains only images]",
      images,
      exists: true,
    };
  }

  private async resolveKnowledgePageContent(entityId: string): Promise<{
    content: string;
    images: MentionImage[];
  }> {
    const registry = MentionRegistry.get();

    try {
      const snapshot = await registry.createSnapshot("knowledge-page", entityId);
      if (!snapshot) return { content: "", images: [] };

      if (!isKnowledgePageSnapshotData(snapshot.data)) {
        console.warn(
          `[MentionContentResolver] Invalid snapshot data structure for ${entityId}`,
        );
        return { content: "", images: [] };
      }

      const pageData = snapshot.data;
      if (!pageData.content) return { content: "", images: [] };

      if (!isEditorContent(pageData.content)) {
        console.warn(
          `[MentionContentResolver] Invalid editor content structure for ${entityId}`,
        );
        return { content: "", images: [] };
      }

      // PDF-engine pages have no Tiptap doc to convert. Return a stub so the
      // reference still resolves; full text extraction is a follow-up.
      if (pageData.content.engine === "pdf") {
        const data = pageData.content.data as {
          fileName?: string;
          pageCount?: number;
        };
        const name = data.fileName ?? pageData.title;
        const pages =
          typeof data.pageCount === "number"
            ? `${data.pageCount} page${data.pageCount === 1 ? "" : "s"}`
            : "PDF";
        return {
          content: `[PDF document "${name}" — ${pages}. Attached PDF; text not extracted.]`,
          images: [],
        };
      }

      const extracted = extractImagesFromTiptap(pageData.content.data)
        .filter((img) => img.byteSize <= MENTION_LIMITS.MAX_IMAGE_BYTE_SIZE)
        .slice(0, MENTION_LIMITS.MAX_IMAGES_PER_PAGE)
        .map(
          (img): MentionImage => ({
            src: img.src,
            alt: img.alt,
            mimeType: img.mimeType,
            byteSize: img.byteSize,
          }),
        );

      const content = tiptapToMarkdown(pageData.content.data, {
        maxChars: this.maxCharsPerPage,
        excludeImages: true,
      });

      return { content, images: extracted };
    } catch (err) {
      console.warn(
        `[MentionContentResolver] Failed to get page content for ${entityId}:`,
        err,
      );
      return { content: "", images: [] };
    }
  }

  formatAsContextSection(resolved: ResolvedMentionContent[]): string {
    if (resolved.length === 0) return "";

    const header =
      "## Referenced Documents\n\nThe user has referenced the following documents in their message:\n\n";
    let totalChars = header.length;
    const includedSections: string[] = [];

    for (const r of resolved) {
      const typeLabel = this.getEntityTypeLabel(r.entityType);
      const sectionHeader = `### ${r.displayText} (${typeLabel})`;
      const section = `${sectionHeader}\n\n${r.content}`;
      const sectionWithSeparator =
        includedSections.length > 0 ? `\n\n---\n\n${section}` : section;

      if (totalChars + sectionWithSeparator.length > this.maxTotalChars) {
        const truncationNotice =
          "\n\n---\n\n*[Additional referenced documents omitted due to size limit]*";
        if (totalChars + truncationNotice.length <= this.maxTotalChars) {
          includedSections.push(truncationNotice.replace(/^\n\n---\n\n/, ""));
        }
        break;
      }

      includedSections.push(section);
      totalChars += sectionWithSeparator.length;
    }

    if (includedSections.length === 0) return "";

    return `${header}${includedSections.join("\n\n---\n\n")}`;
  }

  private getEntityTypeLabel(entityType: string): string {
    const labels: Record<string, string> = {
      "knowledge-page": "Knowledge Page",
      "library-component": "Component",
      design: "Design",
    };
    return labels[entityType] || entityType;
  }
}
