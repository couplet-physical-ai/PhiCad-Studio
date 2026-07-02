import { describe, expect, test } from "bun:test";
import { parseDocumentUpdatePayload } from "../update-document-payload";
import type { EditorContent } from "../../shared/types";

const sampleContent: EditorContent = {
  engine: "tiptap",
  version: 1,
  data: {
    type: "doc",
    content: [{ type: "paragraph" }],
  },
};

describe("parseDocumentUpdatePayload", () => {
  test("accepts canonical content payload", () => {
    const result = parseDocumentUpdatePayload({ content: sampleContent });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.content).toEqual(sampleContent);
    expect(result.payload.usedLegacyContentJson).toBe(false);
  });

  test("accepts legacy content_json payload", () => {
    const result = parseDocumentUpdatePayload({ content_json: sampleContent });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.content).toEqual(sampleContent);
    expect(result.payload.usedLegacyContentJson).toBe(true);
  });

  test("rejects empty payload", () => {
    const result = parseDocumentUpdatePayload({});

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(400);
  });

  test("rejects unknown fields", () => {
    const result = parseDocumentUpdatePayload({ unknown: true });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(400);
    expect(result.error).toContain("unknown fields");
  });

  test("rejects invalid content payload", () => {
    const result = parseDocumentUpdatePayload({
      content: { engine: "markdown", version: 1, data: {} },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(400);
    expect(result.error).toBe("INVALID_CONTENT");
  });
});
