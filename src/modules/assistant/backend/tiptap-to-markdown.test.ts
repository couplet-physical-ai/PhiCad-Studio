import { describe, expect, it } from "bun:test";
import { tiptapToMarkdown, extractImagesFromTiptap } from "./tiptap-to-markdown";

describe("tiptapToMarkdown", () => {
  it("returns empty string for invalid input", () => {
    expect(tiptapToMarkdown(null)).toBe("");
    expect(tiptapToMarkdown({})).toBe("");
    expect(tiptapToMarkdown({ type: "invalid" })).toBe("");
  });

  it("converts paragraphs", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Hello world" }],
        },
      ],
    };
    expect(tiptapToMarkdown(doc)).toBe("Hello world");
  });

  it("converts headings", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Section" }],
        },
      ],
    };
    expect(tiptapToMarkdown(doc)).toBe("## Section");
  });

  it("converts bullet lists", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "First" }],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Second" }],
                },
              ],
            },
          ],
        },
      ],
    };
    const md = tiptapToMarkdown(doc);
    expect(md).toContain("- First");
    expect(md).toContain("- Second");
  });

  it("converts bold and italic marks", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Bold", marks: [{ type: "bold" }] },
            { type: "text", text: " and " },
            { type: "text", text: "italic", marks: [{ type: "italic" }] },
          ],
        },
      ],
    };
    expect(tiptapToMarkdown(doc)).toBe("**Bold** and *italic*");
  });

  it("truncates to maxChars", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "a".repeat(100) }],
        },
      ],
    };
    const md = tiptapToMarkdown(doc, { maxChars: 20 });
    expect(md.length).toBeLessThan(100);
    expect(md).toContain("truncated");
  });
});

describe("extractImagesFromTiptap", () => {
  it("returns empty array when no images", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Hello" }],
        },
      ],
    };
    expect(extractImagesFromTiptap(doc)).toEqual([]);
  });

  it("extracts base64 images", () => {
    const base64 = "data:image/png;base64,iVBORw0KGgo=";
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Before " },
            {
              type: "image",
              attrs: { src: base64, alt: "diagram" },
            },
          ],
        },
      ],
    };
    const images = extractImagesFromTiptap(doc);
    expect(images).toHaveLength(1);
    expect(images[0]).toMatchObject({
      src: base64,
      alt: "diagram",
      mimeType: "image/png",
    });
    expect(images[0].byteSize).toBeGreaterThan(0);
  });

  it("ignores non-data-uri images", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "image",
          attrs: { src: "https://example.com/img.png", alt: "remote" },
        },
      ],
    };
    expect(extractImagesFromTiptap(doc)).toEqual([]);
  });

  it("extracts images from nested content", () => {
    const base64 = "data:image/jpeg;base64,/9j/4AAQ";
    const doc = {
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "image",
                      attrs: { src: base64, alt: "nested" },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    const images = extractImagesFromTiptap(doc);
    expect(images).toHaveLength(1);
    expect(images[0].alt).toBe("nested");
  });
});
