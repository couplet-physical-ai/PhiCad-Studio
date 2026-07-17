import { describe, it, expect } from "vitest";
import { fileToEditorContent, titleFromFileName } from "./import-content";

function makeFile(content: string, name: string, type: string): File {
  return new File([content], name, { type });
}

/* eslint-disable @typescript-eslint/no-explicit-any */

describe("titleFromFileName", () => {
  it("strips the extension and any path segments", () => {
    expect(titleFromFileName("notes.md")).toBe("notes");
    expect(titleFromFileName("a/b/Doc.TXT")).toBe("Doc");
    expect(titleFromFileName("no-ext")).toBe("no-ext");
  });
});

describe("fileToEditorContent — plain text", () => {
  it("splits blank lines into paragraphs and newlines into hardBreaks", async () => {
    const { title, content } = await fileToEditorContent(
      makeFile("Line1\nLine2\n\nPara2", "notes.txt", "text/plain"),
    );
    expect(title).toBe("notes");
    expect(content.engine).toBe("tiptap");

    const data = content.data as any;
    expect(data.type).toBe("doc");
    expect(data.content).toHaveLength(2);

    const first = data.content[0];
    expect(first.type).toBe("paragraph");
    const kinds = first.content.map((n: any) => n.type);
    expect(kinds).toContain("hardBreak");
    expect(kinds).toContain("text");
  });
});

describe("fileToEditorContent — markdown", () => {
  it("maps headings, lists, and marks to ProseMirror nodes", async () => {
    const { content } = await fileToEditorContent(
      makeFile("# Title\n\n- a\n- b\n\n**bold**", "doc.md", "text/markdown"),
    );
    expect(content.engine).toBe("tiptap");

    const data = content.data as any;
    expect(data.type).toBe("doc");
    const topTypes = data.content.map((n: any) => n.type);
    expect(topTypes).toContain("heading");
    expect(topTypes).toContain("bulletList");
  });
});
