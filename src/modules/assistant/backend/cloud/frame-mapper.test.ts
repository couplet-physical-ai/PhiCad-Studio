import { describe, expect, test } from "bun:test";
import type { CopilotStreamFrame } from "@openpcb/contracts";
import { mapFrame } from "./frame-mapper";

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
});
