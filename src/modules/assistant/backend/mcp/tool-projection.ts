import {
  fromJsonSchema,
  type McpServer,
  type ToolAnnotations,
} from "@modelcontextprotocol/server";
import type {
  AiTool,
  AiToolExecutionContext,
  AiToolRegistry,
  AiToolResult,
} from "@openpcb/ai-core";
import { resolveToolLimits } from "@openpcb/ai-core";
import type { ContextResolver } from "../context-resolver";
import type { McpSession, McpSessionRegistry } from "./session";

/**
 * Project the assistant's `AiToolRegistry` onto an MCP server.
 *
 * `AiToolDefinition` is already MCP-shaped — `{name, description, inputSchema}`
 * with a name pattern MCP accepts verbatim — so this is a projection, not a
 * reimplementation. The interesting parts are the two adaptations:
 *
 * 1. `designId` injection. In-app the design comes from the chat's bindings;
 *    an MCP client has no chat, so the session resolves one (explicit arg →
 *    session pin → UI-active) and it is written into the input before dispatch.
 * 2. Result mapping. `AiToolResult` already carries a model-facing slim view
 *    (`modelData`) and a one-line `summary`, built for the in-app LLM loop.
 *    Those are exactly the right payload for MCP, so reuse them rather than
 *    shipping the full `data` (which can be megabytes of projection).
 */

/** Tools that are destructive rather than merely mutating. */
const DESTRUCTIVE_TOOLS = new Set([
  "designer_propose_schematic_deletions",
]);

/**
 * Tools that operate on a design and therefore accept `designId`. Detected from
 * the schema rather than a hardcoded list so new tools are picked up for free.
 */
function acceptsDesignId(tool: AiTool): boolean {
  const props = tool.definition.inputSchema.properties;
  return Boolean(props && "designId" in props);
}

function annotationsFor(tool: AiTool): ToolAnnotations {
  const readOnly = tool.definition.effect === "read";
  return {
    readOnlyHint: readOnly,
    destructiveHint: DESTRUCTIVE_TOOLS.has(tool.definition.name),
    // Every write tool takes an `action_id` idempotency key and re-issuing an
    // applied action is a no-op (`tools/action-id.ts`).
    idempotentHint: !readOnly,
    openWorldHint: false,
  };
}

function textOf(result: AiToolResult): string {
  if (result.summary && result.summary.length > 0) return result.summary;
  const payload = result.modelData ?? result.data;
  try {
    return JSON.stringify(payload);
  } catch {
    return result.ok ? "ok" : "error";
  }
}

export interface ToolProjectionDeps {
  registry: AiToolRegistry;
  sessions: McpSessionRegistry;
  contextResolver: ContextResolver;
  contextSizePreference: "small" | "medium" | "large";
  /** When false, `effect: "write"` tools are not registered at all. */
  allowWrites: boolean;
}

export function registerProjectedTools(
  server: McpServer,
  session: McpSession,
  deps: ToolProjectionDeps,
): void {
  for (const tool of deps.registry.list()) {
    const def = tool.definition;
    // Don't advertise what would only be refused: a client that cannot see a
    // write tool gets a clean capability picture instead of a runtime denial.
    if (!deps.allowWrites && def.effect === "write") continue;

    server.registerTool(
      def.name,
      {
        description: def.description,
        inputSchema: fromJsonSchema<Record<string, unknown>>(def.inputSchema),
        annotations: annotationsFor(tool),
      },
      async (input) => {
        const args: Record<string, unknown> = { ...(input ?? {}) };

        if (acceptsDesignId(tool)) {
          const designId = deps.sessions.resolveDesignId(
            session,
            typeof args.designId === "string" ? args.designId : null,
          );
          if (designId) {
            args.designId = designId;
            // Keep the chat's binding aligned with the design being acted on,
            // so the tools that read the binding (rather than the argument)
            // agree with the ones that read the argument.
            await deps.sessions.bindSessionToDesign(session, designId);
          }
        }

        const execCtx: AiToolExecutionContext = {
          runId: deps.sessions.nextRunId(session),
          chatId: session.chatId,
          bindings: deps.contextResolver.listBindings(session.chatId),
          limits: resolveToolLimits({
            preference: deps.contextSizePreference,
          }),
        };

        const result = await tool.execute(execCtx, args);

        return {
          content: [{ type: "text" as const, text: textOf(result) }],
          structuredContent: asStructured(result),
          isError: !result.ok,
        };
      },
    );
  }
}

/**
 * Pin the session to a design.
 *
 * Session-scoped, so it lives here rather than in the shared registry: it is
 * the only tool that writes to `McpSession`, and there is no session to write
 * to when the same registry backs the in-app assistant.
 */
export function registerUseDesignTool(
  server: McpServer,
  session: McpSession,
  deps: Pick<ToolProjectionDeps, "sessions">,
  listDesigns: () => Promise<Array<{ id: string; name: string }>>,
): void {
  server.registerTool(
    "designer_use_design",
    {
      description:
        "Pin this MCP session to a design so later calls do not need designId. The pin beats the design the user has focused in the OpenPCB UI; pass null to drop it and follow the UI again. Call designer_list_designs first to get an id.",
      inputSchema: fromJsonSchema<{ designId?: string | null }>({
        type: "object",
        properties: {
          designId: {
            type: ["string", "null"],
            description: "Design id to pin, or null to clear the pin.",
          },
        },
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => {
      const requested = (input ?? {}).designId ?? null;
      if (requested === null) {
        session.pinnedDesignId = null;
        return {
          content: [
            {
              type: "text" as const,
              text: "Pin cleared; following the design focused in OpenPCB.",
            },
          ],
          structuredContent: { pinnedDesignId: null },
        };
      }
      const match = (await listDesigns()).find((d) => d.id === requested);
      if (!match) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No design with id '${requested}'. Call designer_list_designs for valid ids.`,
            },
          ],
          structuredContent: { pinnedDesignId: session.pinnedDesignId },
          isError: true,
        };
      }
      session.pinnedDesignId = match.id;
      await deps.sessions.bindSessionToDesign(session, match.id);
      return {
        content: [
          { type: "text" as const, text: `Pinned to "${match.name}".` },
        ],
        structuredContent: { pinnedDesignId: match.id, name: match.name },
      };
    },
  );
}

/**
 * MCP requires `structuredContent` to be a JSON object. Tool results are
 * usually objects already, but wrap anything else so a scalar or array result
 * does not make the whole call invalid.
 */
function asStructured(result: AiToolResult): Record<string, unknown> {
  const payload = result.modelData ?? result.data;
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    return payload as Record<string, unknown>;
  }
  return { result: payload };
}
