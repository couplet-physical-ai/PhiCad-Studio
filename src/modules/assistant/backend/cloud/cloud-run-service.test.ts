import { beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { CopilotStreamFrame } from "@openpcb/contracts";
import { CloudRunService, type CloudChatPayload, type CopilotApi } from "./cloud-run-service";
import { _resetKeyCacheForTests, sealCloudCredentials } from "./token-crypto";

// ── fixtures ──────────────────────────────────────────────────────────────────

function frame(
  type: CopilotStreamFrame["type"],
  seq: number,
  data: Record<string, unknown> = {},
): CopilotStreamFrame {
  return { type, runId: "crun_1", seq, data };
}

const HAPPY_FRAMES: CopilotStreamFrame[] = [
  frame("run.started", 1, { kind: "agent" }),
  frame("copilot.plan.created", 2, { tasks: [{ title: "Inspect" }, { title: "Fix" }] }),
  frame("run.message.delta", 3, { delta: "Hello " }),
  frame("run.message.delta", 4, { delta: "world" }),
  frame("copilot.proposal.created", 5, {
    id: "prop_1", kind: "designer_schematic_wires", riskLevel: "medium", status: "pending",
  }),
  frame("run.message.completed", 6, { content: "Hello world" }),
  frame("run.completed", 7, {}),
];

interface Harness {
  service: CloudRunService;
  api: CopilotApi & { stopped: string[]; created: unknown[] };
  chunks: Array<{ kind: string; content: string }>;
  appended: string[];
  proposals: Array<Record<string, unknown>>;
  toolEvents: Array<Record<string, unknown>>;
  pushes: string[];
  taskCtx: {
    task: { id: string; payload: CloudChatPayload };
    signal: AbortSignal;
    emitChunk: (c: { kind: string; content: string }) => void;
  };
}

function makeHarness(opts: {
  frames?: CopilotStreamFrame[];
  abort?: AbortController;
  link?: { cloudDesignId: string; cloudWorkspaceId: string; lastSyncedRevision: number } | null;
} = {}): Harness {
  process.env.OPENPCB_DB_PATH = path.join(
    mkdtempSync(path.join(os.tmpdir(), "cloud-run-")), "data.sqlite");
  _resetKeyCacheForTests();

  const frames = opts.frames ?? HAPPY_FRAMES;
  const h = {
    chunks: [] as Harness["chunks"],
    appended: [] as string[],
    proposals: [] as Array<Record<string, unknown>>,
    toolEvents: [] as Array<Record<string, unknown>>,
    pushes: [] as string[],
  };

  const api = {
    created: [] as unknown[],
    stopped: [] as string[],
    createRun: async (_ctx: unknown, req: unknown) => {
      api.created.push(req);
      return { runId: "crun_1", status: "queued" as const };
    },
    streamRun: async (_ctx: unknown, _runId: string, o: {
      onFrame: (f: CopilotStreamFrame) => void | Promise<void>;
    }) => {
      for (const f of frames) await o.onFrame(f);
      const last = frames[frames.length - 1];
      const terminal = ["run.completed", "run.failed", "run.cancelled"].includes(
        last?.type ?? "");
      return { lastEventId: "9-0", terminal };
    },
    listProposals: async () => ({
      proposals: [{
        id: "prop_1", kind: "designer_schematic_wires", riskLevel: "medium" as const,
        status: "pending" as const, baseRevision: 3,
        title: "Add pull-ups", summary: "SDA/SCL to 3V3",
        operations: [{ id: "op1" }], sources: [],
      }],
    }),
    stopRun: async (_ctx: unknown, runId: string) => {
      api.stopped.push(runId);
      return { status: "cancelling" };
    },
  };

  const executors = new Map<string, { execute: (c: unknown) => Promise<unknown> }>();
  const sdkRegistry = new Map<string, unknown>([
    ["TasksSDK", {
      registerExecutor: (type: string, ex: { execute: (c: unknown) => Promise<unknown> }) =>
        executors.set(type, ex),
    }],
    ["DesignerSDK", {
      getCloudLink: async () =>
        opts.link === undefined
          ? { cloudDesignId: "dsg_cloud", cloudWorkspaceId: "ws_1", lastSyncedRevision: 2 }
          : opts.link,
      pushCloudSnapshot: async () => {
        h.pushes.push("push");
        return { pushed: true, revision: 3, cloudDesignId: "dsg_cloud" };
      },
    }],
  ]);

  const ctx = {
    sdk: { get: (t: string) => sdkRegistry.get(t), has: () => true },
    logger: { info() {}, warn() {}, error() {} },
  };
  const conversation = {
    appendMessageContent: (_id: string, text: string) => h.appended.push(text),
    createWriteProposal: (input: Record<string, unknown>) => {
      h.proposals.push(input);
      return { id: "local_prop_1", ...input };
    },
    upsertToolEvent: (input: Record<string, unknown>) => {
      h.toolEvents.push(input);
      return { ...input, id: "evt_1" };
    },
    setMessageMetadata: () => {},
  };
  const contextResolver = {
    refreshBindingHealth: async () => {},
    getPrimaryDesign: () => ({ status: "active", refId: "dsg_local" }),
  };

  const service = new CloudRunService({
    ctx: ctx as never,
    conversation: conversation as never,
    contextResolver: contextResolver as never,
    api: api as never,
  });

  const controller = opts.abort ?? new AbortController();
  const taskCtx = {
    task: {
      id: "task_1",
      payload: {
        chatId: "chat_1",
        assistantMessageId: "msg_1",
        goal: "add pull-ups",
        cloudCredsEnc: sealCloudCredentials({
          bearer: "tok", apiUrl: "http://api", copilotUrl: "http://copilot",
        }),
      },
    },
    signal: controller.signal,
    emitChunk: (c: { kind: string; content: string }) => h.chunks.push(c),
  };

  return { service, api: api as never, taskCtx, ...h } as Harness;
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe("assistant.cloud-chat executor", () => {
  test("happy path: sync gate, ai chunks, delta persistence, proposal mirror", async () => {
    const h = makeHarness();
    const result = await h.service.execute(h.taskCtx as never);
    expect(result).toEqual({ messageId: "msg_1", cloudRunId: "crun_1" });

    expect(h.pushes).toHaveLength(1); // sync gate ran

    const aiEvents = h.chunks
      .filter((c) => c.kind === "json")
      .map((c) => JSON.parse(c.content) as { _aiEvent?: { type: string } })
      .flatMap((p) => (p._aiEvent ? [p._aiEvent.type] : []));
    expect(aiEvents).toContain("run.started");
    expect(aiEvents).toContain("run.message.delta");
    expect(aiEvents).toContain("run.completed");
    expect(aiEvents).toContain("run.tool.succeeded"); // synthetic proposal event

    expect(h.appended.join("")).toContain("Hello world"); // deltas persisted
    expect(h.appended.join("")).toContain("**Plan**"); // plan rendered as text

    expect(h.proposals).toHaveLength(1);
    const p = h.proposals[0]!;
    expect(p.origin).toBe("cloud");
    expect(p.cloudRunId).toBe("crun_1");
    expect(p.cloudProposalId).toBe("prop_1");
    expect(p.designId).toBe("dsg_local"); // LOCAL design id, not the cloud one
    expect(h.toolEvents).toHaveLength(1);
    const evtResult = JSON.parse(String(h.toolEvents[0]!.resultJson)) as {
      id: string; kind: string;
    };
    expect(evtResult.id).toBe("local_prop_1"); // card matches the LOCAL record
  });

  test("copilot-only frames forward as {_copilotFrame}; checkpoint emits pause text", async () => {
    const h = makeHarness({
      frames: [
        frame("run.started", 1, {}),
        frame("copilot.plan.created", 2, { tasks: [{ title: "Inspect" }] }),
        frame("copilot.plan.checkpoint", 3, {
          planRevision: 2, taskId: "task_9", title: "Review placement",
        }),
        frame("run.completed", 4, {}),
      ],
    });
    await h.service.execute(h.taskCtx as never);

    const copilotFrames = h.chunks
      .filter((c) => c.kind === "json")
      .map((c) => JSON.parse(c.content) as { _copilotFrame?: { type: string } })
      .flatMap((p) => (p._copilotFrame ? [p._copilotFrame.type] : []));
    expect(copilotFrames).toContain("copilot.plan.created");
    expect(copilotFrames).toContain("copilot.plan.checkpoint");

    const text = h.appended.join("");
    expect(text).toContain("Checkpoint after “Review placement”");
    expect(text).toContain("plan card");
  });

  test("cloud run failure fails the task with the reason", async () => {
    const h = makeHarness({
      frames: [
        frame("run.started", 1, {}),
        frame("run.failed", 2, { reason: "design not found" }),
      ],
    });
    await expect(h.service.execute(h.taskCtx as never)).rejects.toThrow(
      /design not found/,
    );
  });

  test("unlinked design fails with actionable message", async () => {
    const h = makeHarness({ link: null });
    await expect(h.service.execute(h.taskCtx as never)).rejects.toThrow(/link it/);
  });

  test("pre-aborted signal stops the cloud run and emits run.cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    const h = makeHarness({ abort: controller });
    const result = await h.service.execute(h.taskCtx as never);
    expect(result.cloudRunId).toBe("crun_1");
    expect(h.api.stopped).toEqual(["crun_1"]);
    const types = h.chunks
      .filter((c) => c.kind === "json")
      .map((c) => JSON.parse(c.content) as { _aiEvent?: { type: string } })
      .flatMap((p) => (p._aiEvent ? [p._aiEvent.type] : []));
    expect(types).toContain("run.cancelled");
  });

  test("garbage credentials fail with re-send guidance", async () => {
    const h = makeHarness();
    h.taskCtx.task.payload.cloudCredsEnc = "AAAA";
    await expect(h.service.execute(h.taskCtx as never)).rejects.toThrow(/re-send/);
  });
});
