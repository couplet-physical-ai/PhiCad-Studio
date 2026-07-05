// CopilotStreamFrame → local event mapping (S5).
//
// The 11 `run.*` frames are string-identical to `AiRunEventType` and map onto
// `AiRunEvent` (so the S6 cloud-chat executor re-emits them through the same
// `{_aiEvent}` task-chunk path the local BYO runs use — `useAssistantStream`
// unchanged). The 6 copilot-only frames (`run.awaiting.approval`,
// `copilot.task.updated`, `copilot.proposal.created`, `copilot.plan.created/
// updated/checkpoint`) have NO AiRunEventType equivalent and come back on a
// discriminated `copilot` branch for dedicated handling (proposal mirroring, plan UI).
//
// Copilot frames carry a loose `data` object and no timestamp; required
// AiRunEvent data fields missing from the wire get honest defaults.

import type { AiRunEvent } from "@openpcb/ai-core";
import type {
  CopilotOnlyFrameType,
  CopilotSharedRunFrameType,
  CopilotStreamFrame,
} from "@openpcb/contracts";

export type CopilotOnlyFrame = CopilotStreamFrame & {
  type: CopilotOnlyFrameType;
};

export type MappedFrame =
  | { kind: "ai"; event: AiRunEvent }
  | { kind: "copilot"; frame: CopilotOnlyFrame };

const SHARED_RUN_FRAME_TYPES: ReadonlySet<string> = new Set([
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
] satisfies CopilotSharedRunFrameType[]);

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

/** Fill the AiRunEvent data shape for one shared frame type. */
function aiEventData(
  type: CopilotSharedRunFrameType,
  data: Record<string, unknown>,
): AiRunEvent["data"] {
  switch (type) {
    case "run.started":
      return {
        model: str(data.model, "cloud-copilot"),
        toolCount: typeof data.toolCount === "number" ? data.toolCount : 0,
      };
    case "run.message.delta":
      return { delta: str(data.delta) };
    case "run.message.completed":
      return {
        content: str(data.content),
        toolCallCount:
          typeof data.toolCallCount === "number" ? data.toolCallCount : 0,
      };
    case "run.tool.requested":
      return {
        toolCallId: str(data.toolCallId),
        toolName: str(data.toolName),
        argumentsJson: str(data.argumentsJson, "{}"),
      };
    case "run.tool.running":
      return { toolCallId: str(data.toolCallId), toolName: str(data.toolName) };
    case "run.tool.succeeded":
      return {
        toolCallId: str(data.toolCallId),
        toolName: str(data.toolName),
        resultJson: str(data.resultJson, "{}"),
        sources: [],
        truncated: false,
        warnings: [],
      };
    case "run.tool.failed":
      return {
        toolCallId: str(data.toolCallId),
        toolName: str(data.toolName),
        errorMessage: str(data.errorMessage ?? data.error, "tool failed"),
      };
    case "run.warning":
      return { code: str(data.code, "warning"), message: str(data.message) };
    case "run.completed":
      return {
        iterations: typeof data.iterations === "number" ? data.iterations : 0,
      };
    case "run.failed":
      return {
        errorMessage: str(data.errorMessage ?? data.reason, "run failed"),
      };
    case "run.cancelled":
      return { reason: str(data.reason) || undefined };
  }
}

export function mapFrame(frame: CopilotStreamFrame): MappedFrame {
  if (SHARED_RUN_FRAME_TYPES.has(frame.type)) {
    const type = frame.type as CopilotSharedRunFrameType;
    return {
      kind: "ai",
      event: {
        type,
        runId: frame.runId,
        timestamp: new Date().toISOString(),
        data: aiEventData(type, frame.data ?? {}),
      } as AiRunEvent,
    };
  }
  return { kind: "copilot", frame: frame as CopilotOnlyFrame };
}
