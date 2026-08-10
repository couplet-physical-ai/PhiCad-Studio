import {
  createMcpHandler,
  localhostAllowedOrigins,
  originValidationResponse,
  type McpHttpHandler,
} from "@modelcontextprotocol/server";
import type { AiToolRegistry } from "@openpcb/ai-core";
import type { ContextResolver } from "../context-resolver";
import type { AssistantSettings } from "../../../../sdks/assistant";
import type { CoreBackendModuleContext } from "../../../../core/contracts/modules/backend-module";
import { checkMcpAuth } from "./auth";
import { buildMcpServer } from "./server";
import type { McpSessionRegistry } from "./session";

/**
 * HTTP face of the MCP server.
 *
 * The endpoint is Streamable HTTP served straight out of the module router:
 * OpenPCB routes only ever see a Web `Request` and must return a `Response`
 * (`core/contracts/modules/backend-module.ts`), which is exactly the shape
 * `createMcpHandler` produces. No Node req/res adapter is involved.
 */

const CLIENT_HEADER = "x-openpcb-mcp-client";

/**
 * Client identity, used to pick which assistant chat backs the session.
 *
 * Must be derived the same way on every request of a conversation — an
 * `initialize` that resolves to one chat and a `tools/call` that resolves to
 * another would split the transcript. So it comes only from headers, which are
 * stable across a client's requests: the bundled shim sets `CLIENT_HEADER`
 * explicitly, and direct HTTP clients fall back to their User-Agent.
 */
function clientKeyFor(req: Request): string {
  const explicit = req.headers.get(CLIENT_HEADER)?.trim();
  if (explicit) return explicit;
  const ua = req.headers.get("user-agent")?.trim();
  if (ua) return ua;
  return "unknown-client";
}

/** Prefer the name the client announced at `initialize` for the chat title. */
function announcedClientName(parsedBody: unknown): string | null {
  if (typeof parsedBody !== "object" || parsedBody === null) return null;
  const body = parsedBody as { method?: unknown; params?: unknown };
  if (body.method !== "initialize") return null;
  const params = body.params as { clientInfo?: { name?: unknown } } | undefined;
  const name = params?.clientInfo?.name;
  return typeof name === "string" && name.trim().length > 0
    ? name.trim()
    : null;
}

function jsonRpcError(status: number, code: number, message: string): Response {
  return new Response(
    JSON.stringify({ jsonrpc: "2.0", id: null, error: { code, message } }),
    {
      status,
      headers: {
        "content-type": "application/json",
        ...(status === 401
          ? { "www-authenticate": 'Bearer realm="OpenPCB MCP"' }
          : {}),
      },
    },
  );
}

export interface McpEndpointDeps {
  ctx: CoreBackendModuleContext;
  appVersion: string;
  contextResolver: ContextResolver;
  sessions: McpSessionRegistry;
  getSettings(): AssistantSettings;
  /**
   * Tool registry for this endpoint. `allowWrites` selects whether write tools
   * are present at all; the caller caches per value so Ajv does not recompile
   * every schema on each request.
   */
  getRegistry(allowWrites: boolean): AiToolRegistry;
}

export class McpEndpoint {
  private handler: McpHttpHandler | null = null;
  /** Per-request client identity, read back inside the server factory. */
  private readonly requestClients = new WeakMap<
    Request,
    { key: string; name: string }
  >();

  constructor(private readonly deps: McpEndpointDeps) {}

  private ensureHandler(): McpHttpHandler {
    if (this.handler) return this.handler;
    this.handler = createMcpHandler((ctx) => {
      const identity = ctx.requestInfo
        ? this.requestClients.get(ctx.requestInfo)
        : undefined;
      const settings = this.deps.getSettings();
      return buildMcpServer(identity ?? { key: "unknown-client", name: "unknown-client" }, {
        ctx: this.deps.ctx,
        appVersion: this.deps.appVersion,
        registry: this.deps.getRegistry(settings.mcpAllowWrites),
        sessions: this.deps.sessions,
        contextResolver: this.deps.contextResolver,
        contextSizePreference: settings.contextSizePreference,
        allowWrites: settings.mcpAllowWrites,
      });
    });
    return this.handler;
  }

  async fetch(req: Request): Promise<Response> {
    // Settings gate first: a disabled server should look disabled, not
    // unauthorised, so the shim can tell the user what to switch on.
    if (!this.deps.getSettings().mcpEnabled) {
      return jsonRpcError(
        503,
        -32000,
        "OpenPCB's MCP server is disabled. Enable it in Settings → Assistant → MCP.",
      );
    }

    // DNS-rebinding guard. A request with no Origin passes (non-browser MCP
    // clients send none); a present Origin must be loopback.
    const rejected = originValidationResponse(req, localhostAllowedOrigins());
    if (rejected) return rejected;

    const authFailure = checkMcpAuth(req);
    if (authFailure) {
      return jsonRpcError(
        authFailure.code === "unauthorized" ? 401 : 500,
        -32001,
        authFailure.message,
      );
    }

    // Read the body here so the announced client name is available before the
    // server factory runs, then hand the parsed value to the SDK — the stream
    // can only be consumed once.
    let parsedBody: unknown;
    if (req.method === "POST") {
      try {
        parsedBody = await req.json();
      } catch {
        return jsonRpcError(400, -32700, "Request body is not valid JSON.");
      }
    }

    const key = clientKeyFor(req);
    this.requestClients.set(req, {
      key,
      name: announcedClientName(parsedBody) ?? key,
    });

    return this.ensureHandler().fetch(
      req,
      parsedBody === undefined ? undefined : { parsedBody },
    );
  }

  async close(): Promise<void> {
    await this.handler?.close();
    this.handler = null;
  }
}
