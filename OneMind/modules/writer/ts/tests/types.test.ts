import { describe, test, expect } from "bun:test";
import { VERSION_SOURCES } from "../../shared/types";

describe("Writer Shared Types", () => {
  test("VERSION_SOURCES should contain required sources", () => {
    expect(VERSION_SOURCES).toContain("manual");
    expect(VERSION_SOURCES).toContain("ai_apply");
    expect(VERSION_SOURCES).toContain("pre_restore");
  });

  test("VERSION_SOURCES should have exactly 3 sources", () => {
    expect(VERSION_SOURCES.length).toBe(3);
  });
});
