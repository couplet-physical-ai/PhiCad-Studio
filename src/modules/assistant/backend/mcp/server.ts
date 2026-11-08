import { McpServer } from "@modelcontextprotocol/server";
import type { AiToolRegistry } from "@openpcb/ai-core";
import type { ContextResolver } from "../context-resolver";
import type { McpSessionRegistry } from "./session";
import {
  registerProjectedTools,
  registerUseDesignTool,
} from "./tool-projection";
import { registerResources } from "./resources";
import { registerPrompts } from "./prompts";
import { MODULE_SDK_TOKENS, type DesignerSDK } from "../../../../sdks";
import type { CoreBackendModuleContext } from "../../../../core/contracts/modules/backend-module";

export const MCP_SERVER_NAME = "phicad-studio";

const MCP_SERVER_INSTRUCTIONS = `PhiCad-Studio is an OpenPCB-based visual PCB workspace. This server does not host a model; a separate MCP client (such as a code editor or desktop agent) is the AI harness. Local OpenPCB editing/history is the native design authority. Circuit JSON and the isolated Circuit Engine are validation/build-preview only in V1: never claim they persisted a design or produced fabrication-authoritative output. Read openpcb://studio/capabilities before choosing a workflow. The endpoint is protected by a per-launch token and the packaged stdio bridge; writes are advertised only when the user explicitly enables them.`;

export interface BuildMcpServerDeps {
  ctx: CoreBackendModuleContext;
  appVersion: string;
  registry: AiToolRegistry;
  sessions: McpSessionRegistry;
  contextResolver: ContextResolver;
  contextSizePreference: "small" | "medium" | "large";
  allowWrites: boolean;
}

/**
 * Build the MCP server for one client.
 *
 * `createMcpHandler` calls this per request, so it must stay cheap: the session
 * (and its backing chat) is looked up, not recreated, and the tool registry is
 * built once by the caller.
 */
export function buildMcpServer(
  identity: { key: string; name: string },
  deps: BuildMcpServerDeps,
): McpServer {
  const server = new McpServer(
    {
      name: MCP_SERVER_NAME,
      version: deps.appVersion,
    },
    { instructions: MCP_SERVER_INSTRUCTIONS },
  );

  const session = deps.sessions.acquire(identity);

  registerProjectedTools(server, session, {
    registry: deps.registry,
    sessions: deps.sessions,
    contextResolver: deps.contextResolver,
    contextSizePreference: deps.contextSizePreference,
    allowWrites: deps.allowWrites,
  });

  registerUseDesignTool(
    server,
    session,
    { sessions: deps.sessions },
    async () => {
      const designer = deps.ctx.sdk.get<DesignerSDK>(
        MODULE_SDK_TOKENS.DESIGNER,
      );
      if (!designer) return [];
      return (await designer.listDesigns()).map((d) => ({
        id: d.id,
        name: d.name,
      }));
    },
  );

  registerResources(server, deps.ctx);
  registerPrompts(server);

  return server;
}
