import { describe, expect, it } from "bun:test";
import {
  parseMentions,
  createMentionSyntax,
  hasMentions,
  stripMentions,
  getUniqueEntityRefs,
} from "./mention-parser";

describe("mention-parser", () => {
  describe("parseMentions", () => {
    it("returns empty array for empty content", () => {
      expect(parseMentions("")).toEqual([]);
      expect(parseMentions("   ")).toEqual([]);
    });

    it("parses a single mention", () => {
      const content = "Check @[knowledge-page:abc-123|My Page] for details";
      const mentions = parseMentions(content);
      expect(mentions).toHaveLength(1);
      expect(mentions[0]).toEqual({
        entityType: "knowledge-page",
        entityId: "abc-123",
        displayText: "My Page",
        raw: "@[knowledge-page:abc-123|My Page]",
        position: 6,
      });
    });

    it("parses multiple mentions", () => {
      const content =
        "@[knowledge-page:a|Page A] and @[library-component:b|Resistor]";
      const mentions = parseMentions(content);
      expect(mentions).toHaveLength(2);
      expect(mentions[0].entityType).toBe("knowledge-page");
      expect(mentions[1].entityType).toBe("library-component");
    });

    it("does not parse malformed mentions", () => {
      expect(parseMentions("@[missing-pipe]")).toEqual([]);
      expect(parseMentions("@[type:id|")).toEqual([]);
      expect(parseMentions("no mention here")).toEqual([]);
    });

    it("limits mentions to prevent abuse", () => {
      const content = Array.from(
        { length: 150 },
        (_, i) => `@[knowledge-page:${i}|Page ${i}]`,
      ).join(" ");
      const mentions = parseMentions(content);
      expect(mentions.length).toBe(100);
    });
  });

  describe("createMentionSyntax", () => {
    it("creates valid mention syntax", () => {
      expect(createMentionSyntax("knowledge-page", "id-1", "Hello World")).toBe(
        "@[knowledge-page:id-1|Hello World]",
      );
    });

    it("sanitizes display text", () => {
      expect(createMentionSyntax("knowledge-page", "id", "A|B]C")).toBe(
        "@[knowledge-page:id|ABC]",
      );
    });

    it("returns empty string for empty display text", () => {
      expect(createMentionSyntax("knowledge-page", "id", "   ")).toBe("");
    });
  });

  describe("hasMentions", () => {
    it("detects mentions", () => {
      expect(hasMentions("@[knowledge-page:a|A]")).toBe(true);
      expect(hasMentions("no mention")).toBe(false);
    });
  });

  describe("stripMentions", () => {
    it("replaces mentions with display text", () => {
      expect(stripMentions("Hello @[knowledge-page:a|World]")).toBe(
        "Hello @World",
      );
    });
  });

  describe("getUniqueEntityRefs", () => {
    it("deduplicates by entity type and id", () => {
      const mentions = [
        {
          entityType: "knowledge-page",
          entityId: "a",
          displayText: "A",
          raw: "",
          position: 0,
        },
        {
          entityType: "knowledge-page",
          entityId: "a",
          displayText: "A2",
          raw: "",
          position: 10,
        },
        {
          entityType: "library-component",
          entityId: "a",
          displayText: "Comp",
          raw: "",
          position: 20,
        },
      ];
      const unique = getUniqueEntityRefs(mentions);
      expect(unique).toHaveLength(2);
    });
  });
});
