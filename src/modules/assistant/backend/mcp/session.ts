import { MODULE_SDK_TOKENS, type DesignerSDK } from "../../../../sdks";
import type { CoreBackendModuleContext } from "../../../../core/contracts/modules/backend-module";
import type { ConversationStore } from "../conversation-store";
import type { ContextResolver } from "../context-resolver";

/**
 * MCP sessions are backed by a real assistant chat.
 *
 * Every designer tool resolves its target design through the chat's context
 * bindings (`ContextResolver.getPrimaryDesign(chatId)` — see
 * `tools/designer-tools.ts`). Giving each MCP client a chat therefore makes all
 * of those tools work unmodified, and has the side benefit that tool events and
 * write proposals persist down the normal path: the user watches what the
 * external agent did in the assistant panel, and approves pending deletions
 * with the buttons that are already there.
 *
 * One chat per client *name*, not per MCP session: clients reconnect constantly
 * (every restart is a new session id), and a chat per session would bury the
 * sidebar within a day.
 */

const CHAT_TITLE_PREFIX = "MCP";

export interface McpSession {
  /** Stable across reconnects for a given client. */
  clientKey: string;
  clientName: string;
  chatId: string;
  /** Set by `designer_use_design`; beats the UI-active design, loses to an explicit argument. */
  pinnedDesignId: string | null;
  toolCallSeq: number;
}

export interface McpSessionDeps {
  ctx: CoreBackendModuleContext;
  conversation: ConversationStore;
  contextResolver: ContextResolver;
  /** Creates a chat with the configured default provider/preset. */
  createChat: (input: { title: string }) => { id: string };
}

function chatTitleFor(clientName: string): string {
  return `${CHAT_TITLE_PREFIX} · ${clientName}`;
}

function isMcpChatFor(
  metadata: Record<string, unknown> | null,
  clientKey: string,
): boolean {
  if (!metadata) return false;
  const mcp = metadata.mcp;
  if (typeof mcp !== "object" || mcp === null) return false;
  return (mcp as { clientKey?: unknown }).clientKey === clientKey;
}

export class McpSessionRegistry {
  private readonly sessions = new Map<string, McpSession>();

  constructor(private readonly deps: McpSessionDeps) {}

  private designerSdk(): DesignerSDK | undefined {
    return (
      this.deps.ctx.sdk.get<DesignerSDK>(MODULE_SDK_TOKENS.DESIGNER) ?? undefined
    );
  }

  /**
   * Get (or lazily create) the session for a client. Reuses the client's
   * existing chat across app restarts by matching `metadata.mcp.clientKey`,
   * so the transcript is continuous.
   *
   * `key` must be stable across every request of a conversation (it comes from
   * a header — see `handler.ts`), while `name` is only cosmetic and may not be
   * known until `initialize`. Keying on the display name instead would split
   * one client across two chats the moment the announced name differs from the
   * header.
   */
  acquire(identity: { key: string; name: string }): McpSession {
    const clientKey = identity.key.trim().toLowerCase() || "unknown-client";
    const clientName = identity.name.trim() || clientKey;
    const cached = this.sessions.get(clientKey);
    if (cached && this.deps.conversation.getChat(cached.chatId)) return cached;

    const existing = this.deps.conversation
      .listChats()
      .find((chat) => isMcpChatFor(chat.metadata, clientKey));

    const chatId =
      existing?.id ??
      this.deps.createChat({ title: chatTitleFor(clientName) }).id;

    if (!existing) {
      this.deps.conversation.updateChat(chatId, {
        metadata: { mcp: { clientKey, clientName } },
      });
    }

    const session: McpSession = {
      clientKey,
      clientName,
      chatId,
      pinnedDesignId: null,
      toolCallSeq: 0,
    };
    this.sessions.set(clientKey, session);
    return session;
  }

  /**
   * Which design a tool call should act on.
   *
   * Explicit argument wins, then a `designer_use_design` pin, then whatever the
   * user has focused in the designer UI. `null` is a legitimate answer (nothing
   * open, nothing pinned) — callers turn it into a message telling the model to
   * list designs or create one.
   */
  resolveDesignId(
    session: McpSession,
    explicitDesignId?: string | null,
  ): string | null {
    if (explicitDesignId) return explicitDesignId;
    if (session.pinnedDesignId) return session.pinnedDesignId;
    return this.designerSdk()?.getActiveDesignId() ?? null;
  }

  /**
   * Point the session's chat at `designId`.
   *
   * `ContextResolver.maybeAutoBindDesign` refuses to move a chat that is
   * already bound elsewhere — correct for a human conversation, wrong here,
   * where one long-lived chat follows the user across designs. So drop a
   * mismatched primary binding first and rebind.
   */
  async bindSessionToDesign(
    session: McpSession,
    designId: string,
  ): Promise<void> {
    const primary = this.deps.contextResolver.getPrimaryDesign(session.chatId);
    if (primary?.refId === designId) return;
    if (primary) {
      this.deps.conversation.deleteBinding(session.chatId, primary.id);
    }
    const design = await this.designerSdk()?.getDesign(designId);
    if (!design) return;
    await this.deps.contextResolver.bindDesign(session.chatId, {
      id: design.head.id,
      name: design.head.name,
    });
  }

  /** Monotonic per-session counter, used to build stable run ids. */
  nextRunId(session: McpSession): string {
    session.toolCallSeq += 1;
    return `mcp:${session.clientKey}:${session.toolCallSeq}`;
  }
}
