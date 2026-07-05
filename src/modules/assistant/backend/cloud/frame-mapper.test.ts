import { describe, expect, test } from "bun:test";
import type { CopilotStreamFrame } from "@openpcb/contracts";
import { mapFrame, toSourceRefs } from "./frame-mapper";

function frame(
  type: CopilotStreamFrame["type"],
  data: Record<string, unknown> = {},
): CopilotStreamFrame {
  return { type, runId: "run-1", seq: 1, data };
}

const SHARED = [
  "run.started",
  "run.message.delta",
  "run.message.completed",
  "run.tool.requested",
  "run.tool.running",
  "run.tool.succeeded",
  "run.tool.failed",
  "run.warning",
  "run.completed",
  "run.failed",
  "run.cancelled",
] as const;

const COPILOT_ONLY = [
  "run.awaiting.approval",
  "copilot.task.updated",
  "copilot.proposal.created",
  "copilot.plan.created",
  "copilot.plan.updated",
] as const;

describe("frame-mapper", () => {
  test("all 16 frame types route to exactly one branch", () => {
    for (const t of SHARED) {
      const mapped = mapFrame(frame(t));
      expect(mapped.kind).toBe("ai");
      if (mapped.kind === "ai") expect(mapped.event.type).toBe(t);
    }
    for (const t of COPILOT_ONLY) {
      const mapped = mapFrame(frame(t));
      expect(mapped.kind).toBe("copilot");
      if (mapped.kind === "copilot") expect(mapped.frame.type).toBe(t);
    }
  });

  test("shared events carry runId + synthesized timestamp", () => {
    const mapped = mapFrame(frame("run.message.delta", { delta: "hi" }));
    if (mapped.kind !== "ai") throw new Error("expected ai branch");
    expect(mapped.event.runId).toBe("run-1");
    expect(Date.parse(mapped.event.timestamp)).toBeGreaterThan(0);
    expect(mapped.event.data).toEqual({ delta: "hi" });
  });

  test("copilot wire payloads map onto required AiRunEvent fields", () => {
    const failed = mapFrame(
      frame("run.failed", { reason: "design not found" }),
    );
    if (failed.kind !== "ai") throw new Error("expected ai branch");
    expect(failed.event.data).toEqual({ errorMessage: "design not found" });

    const tool = mapFrame(
      frame("run.tool.succeeded", { toolCallId: "c1", toolName: "erc" }),
    );
    if (tool.kind !== "ai") throw new Error("expected ai branch");
    expect(tool.event.data).toEqual({
      toolCallId: "c1",
      toolName: "erc",
      resultJson: "{}",
      sources: [],
      truncated: false,
      warnings: [],
    });

    const completed = mapFrame(frame("run.message.completed", { content: "x" }));
    if (completed.kind !== "ai") throw new Error("expected ai branch");
    expect(completed.event.data).toEqual({ content: "x", toolCallCount: 0 });
  });

  test("copilot-only frames pass through untouched (incl. data)", () => {
    const f = frame("copilot.proposal.created", {
      proposal: { id: "prop-1", kind: "designer_place_components" },
    });
    const mapped = mapFrame(f);
    if (mapped.kind !== "copilot") throw new Error("expected copilot branch");
    expect(mapped.frame).toBe(f);
  });

  // S11: datasheet page citations ride run.tool.succeeded data.sources
  test("succeeded frames carry coerced sources/warnings/truncated", () => {
    const sha = "a".repeat(64);
    const mapped = mapFrame(
      frame("run.tool.succeeded", {
        toolCallId: "c1",
        toolName: "copilot_datasheet_lookup",
        sources: [
          { id: `${sha}:p.12`, kind: "file", label: "STM32 DS", path: "p.12" },
        ],
        warnings: ["preparing", 42],
        truncated: true,
      }),
    );
    if (mapped.kind !== "ai") throw new Error("expected ai branch");
    const data = mapped.event.data as {
      sources: Array<{ id: string; kind: string; path?: string }>;
      warnings: string[];
      truncated: boolean;
    };
    expect(data.sources).toEqual([
      { id: `${sha}:p.12`, kind: "file", label: "STM32 DS", path: "p.12" },
    ]);
    expect(data.warnings).toEqual(["preparing"]); // non-strings dropped
    expect(data.truncated).toBe(true);
  });
});

describe("toSourceRefs", () => {
  test("non-array and absent input → []", () => {
    expect(toSourceRefs(undefined)).toEqual([]);
    expect(toSourceRefs("nope")).toEqual([]);
    expect(toSourceRefs({})).toEqual([]);
  });

  test("id backfilled from refId/sha256; idless items dropped", () => {
    const refs = toSourceRefs([
      { refId: "ref-1", path: "p.3" },
      { sha256: "b".repeat(64) },
      { path: "p.9" },
      "garbage",
      null,
    ]);
    expect(refs.map((r) => r.id)).toEqual(["ref-1", "b".repeat(64)]);
  });

  test("kind aliasing + fallback, label fallback chain", () => {
    const refs = toSourceRefs([
      { id: "1", kind: "doc", path: "p.2" }, // alias → file, label ← path
      { id: "2", kind: "component" }, // alias → library-component, label ← id
      { id: "3", kind: "weird" }, // unknown → file
      { id: "4", kind: "net", label: "GND" }, // valid kind kept
    ]);
    expect(refs.map((r) => r.kind)).toEqual([
      "file",
      "library-component",
      "file",
      "net",
    ]);
    expect(refs.map((r) => r.label)).toEqual(["p.2", "2", "3", "GND"]);
  });

  test("metadata/excerpt passthrough, array metadata rejected", () => {
    const refs = toSourceRefs([
      {
        id: "1",
        kind: "file",
        excerpt: "VDD max 4.0V",
        metadata: { page: 12, sha256: "x" },
      },
      { id: "2", kind: "file", metadata: [1, 2] },
    ]);
    expect(refs[0]?.excerpt).toBe("VDD max 4.0V");
    expect(refs[0]?.metadata).toEqual({ page: 12, sha256: "x" });
    expect(refs[1]?.metadata).toBeUndefined();
  });
});
