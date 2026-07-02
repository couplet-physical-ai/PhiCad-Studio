import { describe, test, expect, beforeEach } from "bun:test";
import { WriterDocumentTarget, WRITER_DOCUMENT_TARGET_TYPE } from "../adapters/writer-document-target";

describe("WriterDocumentTarget", () => {
  test("targetType should be writer.document", () => {
    expect(WRITER_DOCUMENT_TARGET_TYPE).toBe("writer.document");
  });

  test("supportedModes should include all required modes", () => {
    const mockDocRepo = {
      findById: async () => null,
      create: async () => ({}),
      updateContent: async () => ({}),
    } as any;
    const mockVersionRepo = {
      findById: async () => null,
      create: async () => ({}),
    } as any;

    const target = new WriterDocumentTarget(mockDocRepo);
    
    expect(target.supportedModes).toContain("replace");
    expect(target.supportedModes).toContain("append");
    expect(target.supportedModes).toContain("selection");
    expect(target.supportedModes).toContain("generate");
  });

  test("exists should return false for non-existent document", async () => {
    const mockDocRepo = {
      findById: async () => null,
    } as any;

    const target = new WriterDocumentTarget(mockDocRepo);
    const exists = await target.exists("non-existent-id");
    
    expect(exists).toBe(false);
  });

  test("exists should return true for existing document", async () => {
    const mockDocRepo = {
      findById: async () => ({ id: "doc-1", title: "Test" }),
    } as any;

    const target = new WriterDocumentTarget(mockDocRepo);
    const exists = await target.exists("doc-1");
    
    expect(exists).toBe(true);
  });

  test("getContent should return default doc for empty content", async () => {
    const mockDocRepo = {
      findById: async () => ({
        id: "doc-1",
        content_json: { engine: "tiptap", version: 1, data: null },
      }),
    } as any;

    const target = new WriterDocumentTarget(mockDocRepo);
    const content = await target.getContent("doc-1");
    
    expect(content.type).toBe("doc");
    expect(content.content).toHaveLength(1);
    expect(content.content![0].type).toBe("paragraph");
  });

  test("getContent should return tiptap data", async () => {
    const tiptapData = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }] }],
    } as any;
    const mockDocRepo = {
      findById: async () => ({
        id: "doc-1",
        content_json: { engine: "tiptap", version: 1, data: tiptapData },
      }),
    } as any;

    const target = new WriterDocumentTarget(mockDocRepo);
    const content = await target.getContent("doc-1");
    
    expect(content).toEqual(tiptapData);
  });

  test("validateSelection should return true for valid selection", async () => {
    const tiptapData = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Hello World" }] }],
    } as any;
    const mockDocRepo = {
      findById: async () => ({
        id: "doc-1",
        content_json: { engine: "tiptap", version: 1, data: tiptapData },
      }),
    } as any;

    const target = new WriterDocumentTarget(mockDocRepo);
    const valid = await target.validateSelection("doc-1", { type: "tiptap", from: 0, to: 5 });
    
    expect(valid).toBe(true);
  });

  test("validateSelection should return false for invalid selection", async () => {
    const tiptapData = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Hi" }] }],
    } as any;
    const mockDocRepo = {
      findById: async () => ({
        id: "doc-1",
        content_json: { engine: "tiptap", version: 1, data: tiptapData },
      }),
    } as any;

    const target = new WriterDocumentTarget(mockDocRepo);
    const valid = await target.validateSelection("doc-1", { type: "tiptap", from: 0, to: 100 });
    
    expect(valid).toBe(false);
  });
});
