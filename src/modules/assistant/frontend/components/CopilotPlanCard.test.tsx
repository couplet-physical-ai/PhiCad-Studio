// Static-markup smoke tests (node env, no jsdom — MarkdownContent.test.tsx
// pattern). Effects don't run under renderToStaticMarkup, so state is seeded
// via `initialPlan`; interaction paths are covered by the backend proxy tests
// and the live e2e.

import React from "react";
import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { CopilotPlanTask, CopilotPlanView } from "@openpcb/contracts";
import { CopilotPlanCard } from "./CopilotPlanCard";

function task(over: Partial<CopilotPlanTask>): CopilotPlanTask {
  return {
    taskId: "task_1",
    seq: 0,
    title: "Inspect I2C nets",
    status: "pending",
    mode: "agent",
    checkpoint: false,
    locked: false,
    createdBy: "planner",
    ...over,
  };
}

function render(plan: CopilotPlanView): string {
  return renderToStaticMarkup(
    <CopilotPlanCard
      assistantBase="http://b/api/modules/assistant"
      chatId="chat_1"
      cloudRunId="crun_1"
      refreshKey={0}
      cloudHeaders={{ "x-cloud-bearer": "t", "x-cloud-copilot-url": "http://c" }}
      initialPlan={plan}
    />,
  );
}

describe("CopilotPlanCard", () => {
  test("renders rows with status pills, checkpoint badge, lock state", () => {
    const html = render({
      planRevision: 3,
      status: "running",
      tasks: [
        task({ taskId: "t0", seq: 0, status: "completed", title: "Plan" }),
        task({ taskId: "t1", seq: 1, status: "in_progress", title: "Inspect" }),
        task({ taskId: "t2", seq: 2, checkpoint: true, title: "Review placement" }),
        task({ taskId: "t3", seq: 3, locked: true, title: "Wrap up" }),
        task({ taskId: "t4", seq: 4, status: "skipped", title: "Old step" }),
      ],
    });
    expect(html).toContain("Cloud plan");
    expect(html).toContain("rev 3");
    expect(html).toContain("completed");
    expect(html).toContain("running"); // in_progress renders as "running"
    expect(html).toContain("checkpoint");
    expect(html).toContain("skipped");
    expect(html).toContain("Review placement");
    expect(html).toContain("Skip this step"); // pending row actions present
  });

  test("awaiting_approval shows the Approve banner", () => {
    const html = render({
      planRevision: 1,
      status: "awaiting_approval",
      tasks: [task({})],
    });
    expect(html).toContain("waiting for your approval");
    expect(html).toContain("Approve plan");
    expect(html).not.toContain("Guidance for next step");
  });

  test("awaiting_input shows the guidance input + Resume", () => {
    const html = render({
      planRevision: 2,
      status: "awaiting_input",
      tasks: [task({ status: "completed" }), task({ taskId: "t2", seq: 1 })],
    });
    expect(html).toContain("Checkpoint");
    expect(html).toContain("Guidance for next step");
    expect(html).toContain("Resume");
    expect(html).not.toContain("Approve plan");
  });

  test("hidden for terminal runs and empty plans", () => {
    expect(
      render({ planRevision: 1, status: "completed", tasks: [task({})] }),
    ).toBe("");
    expect(render({ planRevision: 0, status: "running", tasks: [] })).toBe("");
  });
});
