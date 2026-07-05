// S6: the `assistant.cloud-chat` task executor — runs a chat turn on the
// cloud-copilot service instead of the local BYO provider.
//
// Flow: decrypt per-task cloud credentials → sync gate (push snapshot when the
// cloud copy is behind) → create an `agent` run (approvePlan=true — the plan
// card approves/resumes, S7) → stream frames with Last-Event-ID resume until
// terminal.
// Shared `run.*` frames re-emit through the same `{_aiEvent}` task-chunk path
// the local runs use (useAssistantStream unchanged); `copilot.proposal.created`
// mirrors the cloud proposal into the local write-proposal store (origin
// "cloud") plus a synthetic succeeded tool event so the existing proposal
// cards render it.

import type { AiRunEvent, AiSourceRef } from "@openpcb/ai-core";
import type { CopilotProposalView, CopilotStreamFrame } from "@openpcb/contracts";
import type { CoreBackendModuleContext } from "../../../../core/contracts/modules/backend-module";
import type { TaskExecutionContext, TasksSDK } from "../../../../sdks";
import { MODULE_SDK_TOKENS, type DesignerSDK } from "../../../../sdks";
import type { ContextResolver } from "../context-resolver";
import type { ConversationStore } from "../conversation-store";
import { isFeatureEnabled } from "../../../../core/contracts/feature-flags/backend";
import {
  createRun,
  listProposals,
  putBoardSnapshot,
  stopRun,
  streamRun,
  type CopilotClientContext,
  type StreamRunOptions,
  type StreamRunResult,
} from "./copilot-client";
import { mapFrame } from "./frame-mapper";
import { openCloudCredentials } from "./token-crypto";

export interface CloudChatPayload {
  chatId: string;
  assistantMessageId: string;
  goal: string;
  cloudCredsEnc: string;
}

/** Injectable copilot API surface (tests feed fixture frames). */
export interface CopilotApi {
  createRun: typeof createRun;
  streamRun: (
    ctx: CopilotClientContext,
    runId: string,
    opts: StreamRunOptions,
  ) => Promise<StreamRunResult>;
  listProposals: typeof listProposals;
  stopRun: typeof stopRun;
  putBoardSnapshot: typeof putBoardSnapshot;
}

export interface CloudRunServiceOptions {
  ctx: CoreBackendModuleContext;
  conversation: ConversationStore;
  contextResolver: ContextResolver;
  api?: CopilotApi;
}

export class CloudRunService {
  private readonly api: CopilotApi;

  constructor(private readonly options: CloudRunServiceOptions) {
    this.api = options.api ?? {
      createRun,
      streamRun,
      listProposals,
      stopRun,
      putBoardSnapshot,
    };
    const tasks = options.ctx.sdk.get<TasksSDK>(MODULE_SDK_TOKENS.TASKS);
    if (!tasks) throw new Error("TasksSDK not registered");
    tasks.registerExecutor("assistant.cloud-chat", {
      execute: (taskCtx) =>
        this.execute(taskCtx as TaskExecutionContext<CloudChatPayload>),
    });
  }

  private designer(): DesignerSDK {
    const sdk = this.options.ctx.sdk.get<DesignerSDK>(MODULE_SDK_TOKENS.DESIGNER);
    if (!sdk) throw new Error("DesignerSDK not registered");
    return sdk;
  }

  private boundDesignId(chatId: string): string | null {
    const primary = this.options.contextResolver.getPrimaryDesign(chatId);
    return primary && primary.status === "active" ? primary.refId : null;
  }

  async execute(
    taskCtx: TaskExecutionContext<CloudChatPayload>,
  ): Promise<{ messageId: string; cloudRunId: string }> {
    const { conversation } = this.options;
    const payload = taskCtx.task.payload;
    const { chatId, assistantMessageId } = payload;

    let creds;
    try {
      creds = openCloudCredentials(payload.cloudCredsEnc);
    } catch {
      throw new Error(
        "Cloud credentials unavailable (expired or unreadable) — re-send the message.",
      );
    }
    const cctx: CopilotClientContext = {
      copilotUrl: creds.copilotUrl,
      bearer: creds.bearer,
    };

    await this.options.contextResolver.refreshBindingHealth(chatId);
    const designId = this.boundDesignId(chatId);
    if (!designId) {
      throw new Error("Cloud Copilot needs a design bound to this chat.");
    }

    const designer = this.designer();
    const link = await designer.getCloudLink(designId);
    if (!link) {
      throw new Error(
        "This design is not linked to the cloud — link it (cloud sync) first.",
      );
    }
    // Sync gate: the agent must read what the user sees.
    let cloudRevision = link.lastSyncedRevision;
    if (creds.apiUrl) {
      const pushed = await designer.pushCloudSnapshot(designId, {
        bearer: creds.bearer,
        apiUrl: creds.apiUrl,
      });
      cloudRevision = pushed.revision;
    }
    // S8: board-snapshot push so the cloud layout tools can place/route. Best-
    // effort — a schematic-only design (or flag off) just skips; the tools then
    // honestly report "no board snapshot synced". revision must match the CLOUD
    // design revision (the copilot staleness check compares against it).
    if (isFeatureEnabled("cloud.autolayout")) {
      try {
        const build = await designer.buildBoardSnapshot(designId);
        if (build && (build.snapshot.placements?.length ?? 0) > 0) {
          await this.api.putBoardSnapshot(cctx, link.cloudDesignId, {
            revision: cloudRevision,
            snapshot: build.snapshot,
          });
        }
      } catch (err) {
        this.options.ctx.logger.warn("board-snapshot push failed", {
          designId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const created = await this.api.createRun(cctx, {
      designId: link.cloudDesignId,
      kind: "agent",
      goal: payload.goal,
      approvePlan: true, // S7: the plan card renders/approves the parked plan
    });
    const runId = created.runId;

    const emitAiEvent = (event: AiRunEvent): void => {
      taskCtx.emitChunk({ kind: "json", content: JSON.stringify({ _aiEvent: event }) });
    };
    const emitText = (text: string): void => {
      conversation.appendMessageContent(assistantMessageId, text);
      taskCtx.emitChunk({ kind: "text", content: text });
    };

    const mirrored = new Set<string>();
    // toolCallId → persisted tool-event dto, so SSE reconnect replays and status
    // transitions reuse the same row (no duplicate ToolCards).
    const toolEventsByCall = new Map<
      string,
      { id: string; argumentsJson: string }
    >();
    let sawTerminal: "completed" | "failed" | "cancelled" | null = null;
    let failureReason = "";

    const onFrame = async (frame: CopilotStreamFrame): Promise<void> => {
      const mapped = mapFrame(frame);
      if (mapped.kind === "ai") {
        const event = mapped.event;
        if (event.type === "run.message.delta") {
          conversation.appendMessageContent(
            assistantMessageId,
            (event.data as { delta: string }).delta,
          );
        }
        // Persist cloud tool events (S11): ToolCard/SourceChips render from the
        // conversation store, which the local BYO path fills but cloud runs never
        // did — datasheet page citations were invisible without this.
        this.upsertCloudToolEvent(event, {
          chatId,
          taskId: taskCtx.task.id,
          messageId: assistantMessageId,
          toolEventsByCall,
        });
        if (event.type === "run.completed") sawTerminal = "completed";
        if (event.type === "run.cancelled") sawTerminal = "cancelled";
        if (event.type === "run.failed") {
          sawTerminal = "failed";
          failureReason =
            (event.data as { errorMessage?: string }).errorMessage ?? "run failed";
        }
        emitAiEvent(event);
        return;
      }
      // copilot-only frames: always forward raw for the plan card / future UI
      // (S7 — useAssistantStream parses {_copilotFrame} and refetches the plan);
      // the switch below adds side effects (proposal mirror, transcript text).
      const f = mapped.frame;
      taskCtx.emitChunk({
        kind: "json",
        content: JSON.stringify({ _copilotFrame: f }),
      });
      switch (f.type) {
        case "copilot.proposal.created": {
          const cloudProposalId = String(f.data.id ?? "");
          if (!cloudProposalId || mirrored.has(cloudProposalId)) return;
          mirrored.add(cloudProposalId);
          await this.mirrorProposal(taskCtx, cctx, runId, {
            chatId,
            assistantMessageId,
            designId,
            cloudProposalId,
          });
          return;
        }
        case "copilot.plan.created":
        case "copilot.plan.updated": {
          const tasks = (f.data.tasks ?? []) as Array<{ title?: string }>;
          if (tasks.length > 0) {
            emitText(
              `\n\n**Plan** (${f.type === "copilot.plan.created" ? "created" : "updated"}):\n` +
                tasks.map((t, i) => `${i + 1}. ${t.title ?? "step"}`).join("\n") +
                "\n\n",
            );
          }
          return;
        }
        case "run.awaiting.approval": {
          emitText(
            "\n\n⏸ The plan is waiting for your approval — review it in the plan card.\n\n",
          );
          return;
        }
        case "copilot.plan.checkpoint": {
          const title = typeof f.data.title === "string" ? f.data.title : "checkpoint";
          emitText(
            `\n\n⏸ Checkpoint after “${title}” — the run is paused for your guidance. ` +
              "Resume it from the plan card.\n\n",
          );
          return;
        }
        default:
        // copilot.task.updated — raw forward above is enough.
      }
    };

    let lastEventId: string | null = null;
    let attempts = 0;
    while (!sawTerminal) {
      if (taskCtx.signal.aborted) break;
      try {
        const res = await this.api.streamRun(cctx, runId, {
          lastEventId,
          signal: taskCtx.signal,
          onFrame,
        });
        lastEventId = res.lastEventId;
        if (!res.terminal && !taskCtx.signal.aborted) {
          attempts += 1;
          if (attempts > 20) throw new Error("cloud stream kept disconnecting");
          await new Promise((r) => setTimeout(r, Math.min(1000 * attempts, 5000)));
        }
      } catch (err) {
        if (taskCtx.signal.aborted) break;
        attempts += 1;
        if (attempts > 20) throw err;
        await new Promise((r) => setTimeout(r, Math.min(1000 * attempts, 5000)));
      }
    }

    if (taskCtx.signal.aborted && !sawTerminal) {
      // Best-effort cancel; the copilot run keeps its own lifecycle.
      try {
        await this.api.stopRun(cctx, runId);
      } catch {
        /* run may already be terminal */
      }
      emitAiEvent({
        type: "run.cancelled",
        runId,
        timestamp: new Date().toISOString(),
        data: { reason: "stopped from desktop" },
      } as AiRunEvent);
      return { messageId: assistantMessageId, cloudRunId: runId };
    }

    if (sawTerminal === "failed") {
      throw new Error(`Cloud run failed: ${failureReason}`);
    }
    conversation.setMessageMetadata(assistantMessageId, {
      ai: { cloudRunId: runId, mode: "cloud" },
    } as never);
    return { messageId: assistantMessageId, cloudRunId: runId };
  }

  /** Persist a cloud run's tool lifecycle into the conversation store (S11).
   * Same rows the local BYO executor writes (run-service.ts) — trimmed: no
   * tool-role transcript messages (cloud history lives server-side). */
  private upsertCloudToolEvent(
    event: AiRunEvent,
    ctx: {
      chatId: string;
      taskId: string | null;
      messageId: string | null;
      toolEventsByCall: Map<string, { id: string; argumentsJson: string }>;
    },
  ): void {
    if (
      event.type !== "run.tool.requested" &&
      event.type !== "run.tool.running" &&
      event.type !== "run.tool.succeeded" &&
      event.type !== "run.tool.failed"
    ) {
      return;
    }
    const data = event.data as {
      toolCallId?: string;
      toolName?: string;
      argumentsJson?: string;
      resultJson?: string;
      sources?: AiSourceRef[];
      errorMessage?: string;
    };
    const toolCallId = data.toolCallId ?? "";
    if (!toolCallId) return;
    const prior = ctx.toolEventsByCall.get(toolCallId);
    const status =
      event.type === "run.tool.requested"
        ? ("requested" as const)
        : event.type === "run.tool.running"
          ? ("running" as const)
          : event.type === "run.tool.succeeded"
            ? ("succeeded" as const)
            : ("failed" as const);
    const argumentsJson = data.argumentsJson ?? prior?.argumentsJson ?? "{}";
    const dto = this.options.conversation.upsertToolEvent({
      id: prior?.id,
      chatId: ctx.chatId,
      taskId: ctx.taskId,
      messageId: ctx.messageId,
      toolCallId,
      toolName: data.toolName ?? "",
      status,
      argumentsJson,
      resultJson:
        event.type === "run.tool.succeeded" ? (data.resultJson ?? "{}") : undefined,
      errorJson:
        event.type === "run.tool.failed"
          ? JSON.stringify({ message: data.errorMessage ?? "tool failed" })
          : undefined,
      sources: event.type === "run.tool.succeeded" ? (data.sources ?? []) : undefined,
    });
    ctx.toolEventsByCall.set(toolCallId, { id: dto.id, argumentsJson });
  }

  /** Mirror one staged cloud proposal into the local store + a succeeded tool
   * event so the existing proposal cards pick it up. */
  private async mirrorProposal(
    taskCtx: TaskExecutionContext<CloudChatPayload>,
    cctx: CopilotClientContext,
    runId: string,
    ids: {
      chatId: string;
      assistantMessageId: string;
      designId: string;
      cloudProposalId: string;
    },
  ): Promise<void> {
    let view: CopilotProposalView | undefined;
    try {
      const { proposals } = await this.api.listProposals(cctx, runId);
      view = proposals.find((p) => p.id === ids.cloudProposalId);
    } catch {
      view = undefined;
    }
    if (!view) return; // frame without a fetchable proposal — nothing to mirror

    // Copilot builds its envelopes to the assistant contract (operations carry
    // real designer command payloads), so the local apply path can execute them
    // directly — but the proposals API returns a view, so reassemble the
    // envelope shape applyDesignerSchematicEditsProposal expects. designId is
    // the LOCAL design: the desktop applies to what the user is editing.
    const envelope = {
      id: view.id,
      kind: view.kind,
      toolName: "cloud_copilot",
      title: view.title ?? "Cloud Copilot proposal",
      summary: view.summary ?? "",
      riskLevel: view.riskLevel,
      designId: ids.designId,
      baseRevision: view.baseRevision,
      operations: (view.operations ?? []) as never[],
      payload: {},
      sources: (view.sources ?? []) as never[],
      warnings: [],
    };
    const record = this.options.conversation.createWriteProposal({
      chatId: ids.chatId,
      kind: view.kind,
      designId: ids.designId,
      baseRevision: view.baseRevision,
      proposal: view,
      envelope: envelope as never,
      toolName: "cloud_copilot",
      title: envelope.title,
      summary: view.summary ?? null,
      riskLevel: view.riskLevel,
      operations: envelope.operations,
      origin: "cloud",
      cloudRunId: runId,
      cloudProposalId: view.id,
    });

    // The proposal cards derive from succeeded tool events whose resultJson
    // carries {id, kind, designId} matching a write-proposal record.
    const event = this.options.conversation.upsertToolEvent({
      chatId: ids.chatId,
      taskId: taskCtx.task.id,
      messageId: ids.assistantMessageId,
      toolCallId: `cloud_${view.id}`,
      toolName: "cloud_copilot",
      status: "succeeded",
      argumentsJson: JSON.stringify({ cloudRunId: runId }),
      resultJson: JSON.stringify({
        id: record.id,
        kind: record.kind,
        designId: ids.designId,
        baseRevision: record.baseRevision,
        title: record.title,
        summary: record.summary,
      }),
    });
    taskCtx.emitChunk({
      kind: "json",
      content: JSON.stringify({
        _aiEvent: {
          type: "run.tool.succeeded",
          runId,
          timestamp: new Date().toISOString(),
          data: {
            toolCallId: event.toolCallId,
            toolName: "cloud_copilot",
            resultJson: event.resultJson ?? "{}",
            sources: [],
            truncated: false,
            warnings: [],
            summary: record.title ?? "Cloud proposal staged",
          },
        } satisfies AiRunEvent,
      }),
    });
  }
}
