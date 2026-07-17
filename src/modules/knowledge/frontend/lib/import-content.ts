import MarkdownIt from "markdown-it";
import { generateJSON } from "@tiptap/html";
import { createKnowledgeEditorExtensions } from "../components/Editor/tiptap-extensions";
import type { EditorContent } from "../../shared/types";

const md = new MarkdownIt({ html: false, linkify: true, breaks: false });

/** Page title from a filename: basename minus its extension. */
export function titleFromFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name;
  return base.replace(/\.[^.]+$/, "").trim() || "Untitled";
}

/** Plain text → ProseMirror doc: blank lines split paragraphs, newlines → hardBreak. */
function txtToDoc(text: string): unknown {
  const blocks = text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((b) => b.replace(/\n+$/g, ""))
    .filter((b) => b.length > 0);

  const paragraphs = blocks.map((block) => {
    const lines = block.split("\n");
    const inline: unknown[] = [];
    lines.forEach((line, i) => {
      if (i > 0) inline.push({ type: "hardBreak" });
      if (line.length > 0) inline.push({ type: "text", text: line });
    });
    return inline.length > 0
      ? { type: "paragraph", content: inline }
      : { type: "paragraph" };
  });

  return {
    type: "doc",
    content: paragraphs.length > 0 ? paragraphs : [{ type: "paragraph" }],
  };
}

export interface ImportedDoc {
  title: string;
  content: EditorContent;
}

/**
 * Convert an uploaded .txt/.md file into a Tiptap EditorContent for a new page.
 * Markdown is rendered to HTML then mapped to ProseMirror JSON via the shared
 * editor schema; plain text is split into paragraphs directly.
 */
export async function fileToEditorContent(file: File): Promise<ImportedDoc> {
  const text = await file.text();
  const isMarkdown = /\.(md|markdown)$/i.test(file.name);
  const data = isMarkdown
    ? generateJSON(md.render(text), createKnowledgeEditorExtensions())
    : txtToDoc(text);

  return {
    title: titleFromFileName(file.name),
    content: { engine: "tiptap" as const, version: 1, data },
  };
}
