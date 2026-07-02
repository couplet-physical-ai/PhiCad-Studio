import { useCallback, useEffect, useRef, useState } from "react";
import type { FileUIPart } from "ai";
import { useStreamChat } from "@/hooks/useStreamChat";
import { useAppStore } from "@/stores/app-store";
import { useChatStore } from "@/stores/chat-store";
import { updateChat } from "@/lib/api/chat-api";
import { useBackendURL } from "@/contexts/BackendURLContext";
import { buildWriterSystemPrompt, type WriterPromptDocument } from "./writer-chat-prompt";
import {
  collectEditToolCalls,
  collectEditToolResults,
  isSuccessfulEditToolResult,
  getEditId,
  type EditLifecycleEvent,
  type EditAppliedEvent,
} from "@modules/_kit/edit-lifecycle";

export type { EditLifecycleEvent };

interface UseWriterDocumentChatOptions {
  documentId: string | null;
  chatId: string | null;
  onEditApplied?: (event: EditAppliedEvent) => void;
  onEditLifecycleEvent?: (event: EditLifecycleEvent) => void;
}

export function useWriterDocumentChat({
  documentId,
  chatId,
  onEditApplied,
  onEditLifecycleEvent,
}: UseWriterDocumentChatOptions) {
  const streamChat = useStreamChat();
  const {
    loadMessages,
    resetState,
    submitMessage: submitStreamMessage,
    abort,
    messages,
  } = streamChat;
  const [toolsEnabled, setToolsEnabled] = useState(true);
  const hydratedChatsRef = useRef<Set<string>>(new Set());
  const hydrationBarriersByChatRef = useRef<Map<string, Promise<void>>>(new Map());
  const seenToolCallsByChatRef = useRef<Map<string, Set<string>>>(new Map());
  const seenToolResultsByChatRef = useRef<Map<string, Set<string>>>(new Map());
  const messagesRef = useRef(messages);

  const { backendURL, isReady } = useBackendURL();
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const pendingModelSelection = useChatStore((state) => state.pendingModelSelection);

  const selectedProvider = pendingModelSelection?.provider ?? "openai";
  const selectedModel = pendingModelSelection?.model ?? "gpt-4o-mini-2024-07-18";

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    if (!chatId) {
      resetState();
      return;
    }

    hydratedChatsRef.current.delete(chatId);
    seenToolCallsByChatRef.current.set(chatId, new Set());
    seenToolResultsByChatRef.current.set(chatId, new Set());
    resetState();

    const barrier = loadMessages(chatId).catch(() => {
      // Keep chat submit resilient even if hydration fails.
    }).finally(() => {
      const baselineMessages = messagesRef.current;
      const baselineCalls = collectEditToolCalls(baselineMessages);
      const baselineResults = collectEditToolResults(baselineMessages);
      const seenCalls = seenToolCallsByChatRef.current.get(chatId) ?? new Set<string>();
      const seenResults = seenToolResultsByChatRef.current.get(chatId) ?? new Set<string>();
      for (const call of baselineCalls) {
        seenCalls.add(call.occurrenceKey);
      }
      for (const result of baselineResults) {
        seenResults.add(result.occurrenceKey);
      }
      seenToolCallsByChatRef.current.set(chatId, seenCalls);
      seenToolResultsByChatRef.current.set(chatId, seenResults);
      hydratedChatsRef.current.add(chatId);
    });
    hydrationBarriersByChatRef.current.set(chatId, barrier);
  }, [chatId, loadMessages, resetState]);

  useEffect(() => {
    if (!chatId || !documentId) {
      return;
    }

    const seenCalls = seenToolCallsByChatRef.current.get(chatId) ?? new Set<string>();
    seenToolCallsByChatRef.current.set(chatId, seenCalls);
    const seen =
      seenToolResultsByChatRef.current.get(chatId) ?? new Set<string>();
    seenToolResultsByChatRef.current.set(chatId, seen);

    const toolCalls = collectEditToolCalls(messages);
    const toolResults = collectEditToolResults(messages);

    if (!hydratedChatsRef.current.has(chatId)) {
      for (const call of toolCalls) {
        seenCalls.add(call.occurrenceKey);
      }
      for (const result of toolResults) {
        seen.add(result.occurrenceKey);
      }
      return;
    }

    for (const call of toolCalls) {
      if (seenCalls.has(call.occurrenceKey)) {
        continue;
      }
      seenCalls.add(call.occurrenceKey);
      onEditLifecycleEvent?.({
        chatId,
        documentId,
        toolCallId: call.toolCallId,
        toolName: call.toolName,
        status: "started",
      });
    }

    for (const result of toolResults) {
      if (seen.has(result.occurrenceKey)) {
        continue;
      }

      seen.add(result.occurrenceKey);
      if (!seenCalls.has(result.occurrenceKey)) {
        seenCalls.add(result.occurrenceKey);
        onEditLifecycleEvent?.({
          chatId,
          documentId,
          toolCallId: result.toolCallId,
          toolName: result.toolName,
          status: "started",
        });
      }

      const success = isSuccessfulEditToolResult(result);
      onEditLifecycleEvent?.({
        chatId,
        documentId,
        toolCallId: result.toolCallId,
        toolName: result.toolName,
        status: success ? "completed" : "failed",
        editId: getEditId(result.result),
        result: result.result,
      });

      if (!success || !onEditApplied) {
        continue;
      }

      onEditApplied({
        chatId,
        documentId,
        toolCallId: result.toolCallId,
        editId: getEditId(result.result),
        result: result.result,
      });
    }
  }, [chatId, documentId, messages, onEditApplied, onEditLifecycleEvent]);

  const fetchDocumentForPrompt = useCallback(async (): Promise<WriterPromptDocument | null> => {
    if (!backendURL || !isReady || !documentId) {
      return null;
    }

    try {
      const response = await fetch(`${backendURL}/api/modules/writer/documents/${documentId}`);
      if (!response.ok) {
        return null;
      }
      const data = (await response.json()) as {
        document?: WriterPromptDocument;
      };
      return data.document ?? null;
    } catch (err) {
      console.warn("[writer-chat] Failed to fetch document for prompt:", err);
      return null;
    }
  }, [backendURL, isReady, documentId]);

  const submitMessage = useCallback(
    async (params: { text: string; files?: FileUIPart[] }) => {
      if (!chatId || !documentId) {
        throw new Error("Cannot submit a message without an active document thread");
      }

      const hydrationBarrier = hydrationBarriersByChatRef.current.get(chatId);
      if (hydrationBarrier) {
        await hydrationBarrier;
      }

      const workspaceId = activeWorkspaceId ?? "default-workspace";
      const docSnapshot = await fetchDocumentForPrompt();
      const promptForTurn = docSnapshot
        ? buildWriterSystemPrompt(docSnapshot, { userQuery: params.text })
        : null;

      if (promptForTurn) {
        try {
          await updateChat(chatId, {
            config: {
              systemPrompt: promptForTurn,
              provider: selectedProvider,
              model: selectedModel,
            },
          });
        } catch (err) {
          console.warn("[writer-chat] Failed to sync system prompt:", err);
        }
      }

      await submitStreamMessage({
        chatId,
        provider: selectedProvider,
        model: selectedModel,
        text: params.text,
        files: params.files,
        workspaceId,
        toolChoice: toolsEnabled ? "auto" : "none",
        allowedTools: toolsEnabled
          ? ["writer.read_document", "writer.document_info", "edit_content", "core.format_content"]
          : undefined,
        activeContext: {
          workspaceId,
          activeTarget: {
            targetType: "writer.document",
            targetId: documentId,
          },
        },
      });
    },
    [
      chatId,
      documentId,
      activeWorkspaceId,
      fetchDocumentForPrompt,
      selectedProvider,
      selectedModel,
      submitStreamMessage,
      toolsEnabled,
    ],
  );

  return {
    ...streamChat,
    provider: selectedProvider,
    model: selectedModel,
    toolsEnabled,
    setToolsEnabled,
    submitMessage,
    abort,
  };
}
