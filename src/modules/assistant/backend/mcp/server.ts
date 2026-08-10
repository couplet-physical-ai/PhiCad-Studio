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

export const MCP_SERVER_NAME = "openpcb";

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
  const server = new McpServer({
    name: MCP_SERVER_NAME,
    version: deps.appVersion,
  });

  const session = deps.sessions.acquire(identity);

  registerProjectedTools(server, session, {
    registry: deps.registry,
    sessions: deps.sessions,
    contextResolver: deps.contextResolver,
    contextSizePreference: deps.contextSizePreference,
    allowWrites: deps.allowWrites,
  });

  registerUseDesignTool(server, session, { sessions: deps.sessions }, async () => {
    const designer = deps.ctx.sdk.get<DesignerSDK>(MODULE_SDK_TOKENS.DESIGNER);
    if (!designer) return [];
    return (await designer.listDesigns()).map((d) => ({
      id: d.id,
      name: d.name,
    }));
  });

  registerResources(server, deps.ctx);
  registerPrompts(server);

  return server;
}
