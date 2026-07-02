import { useStreamChat } from "@/hooks/useStreamChat";
import { useCallback, useState, useEffect, useRef, useMemo } from "react";
import { useBackendURL } from "@/contexts/BackendURLContext";
import { useAppStore } from "@/stores/app-store";
import { useChatStore } from "@/stores/chat-store";
import { useBrainstormStore } from "../stores/brainstorm-store";
import type { BrainstormNode } from "../../shared/types";

interface UseNodeChatOptions {
    onChatCreated?: (chatId: string) => Promise<void>;
}

/**
 * Hook for managing AI chat within a brainstorming node
 * Uses core chat infrastructure with category='brainstorming_node' for isolation
 */
export function useNodeChat(
    node: BrainstormNode,
    options?: UseNodeChatOptions
) {
    const [chatId, setChatId] = useState<string | null>(node.chatId ?? null);
    const [isInitializing, setIsInitializing] = useState(false);

    const { backendURL } = useBackendURL();
    const workspaceId = useAppStore((state) => state.activeWorkspaceId);
    const pendingModelSelection = useChatStore((state) => state.pendingModelSelection);
    const boards = useBrainstormStore((state) => state.boards);
    const currentBoardId = useBrainstormStore((state) => state.currentBoardId);
    const streamChat = useStreamChat();
    const { loadMessages, resetState } = streamChat;

    const selectedProvider = pendingModelSelection?.provider ?? "openai";
    const selectedModel = pendingModelSelection?.model ?? "gpt-4o-mini-2024-07-18";

    const board = useMemo(() => {
        if (!currentBoardId) return undefined;
        return boards.find((b) => b.id === currentBoardId);
    }, [boards, currentBoardId]);

    const systemPrompt = useMemo(() => {
        const boardTitle = board?.title ? `Board: ${board.title}` : "";
        const boardDescription = board?.description
            ? `Board context: ${board.description}`
            : "";
        return `You are discussing this brainstorming idea.
${boardTitle}
${boardDescription}

Idea: ${node.title}

Help the user explore, refine, and develop this idea. Provide insights, ask clarifying questions, and suggest improvements.`;
    }, [board?.description, board?.title, node.title]);

    // Use refs for stable access in callback without dependency changes
    const optionsRef = useRef(options);
    useEffect(() => { optionsRef.current = options; }, [options]);

    const systemPromptRef = useRef(systemPrompt);
    useEffect(() => { systemPromptRef.current = systemPrompt; }, [systemPrompt]);

    // Track initialization attempt to prevent infinite loops on error
    const attemptRef = useRef(false);

    // Keep track of current chatId to check in callback without adding to deps
    const chatIdRef = useRef(chatId);
    useEffect(() => { chatIdRef.current = chatId; }, [chatId]);

    const initializeChat = useCallback(async () => {
        // Prevent multiple attempts or re-running if already done
        if (chatIdRef.current || attemptRef.current) return;

        attemptRef.current = true;
        setIsInitializing(true);

        try {
            if (node.chatId) {
                // Chat already exists - load messages
                console.log("[useNodeChat] Loading messages for chat:", node.chatId);
                setChatId(node.chatId);
                await loadMessages(node.chatId);
            } else {
                // Create new chat via core API
                console.log("[useNodeChat] Creating new chat for node:", node.title);
                const response = await fetch(`${backendURL}/api/chats`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        title: node.title,
                        category: "brainstorming_node",
                        workspaceId: workspaceId || "default-workspace",
                        config: {
                            systemPrompt: systemPromptRef.current,
                            provider: selectedProvider,
                            model: selectedModel,
                        },
                    }),
                });

                if (!response.ok) {
                    const text = await response.text();
                    throw new Error(`Failed to create chat: ${response.status} ${text}`);
                }

                const data = await response.json();

                // Handle different response structures ({ chat: ... } or { ok: true, data: { chat: ... } })
                let chat = data.chat;
                if (!chat && data.data?.chat) {
                    chat = data.data.chat;
                }

                if (!chat || !chat.id) {
                    console.error("[useNodeChat] Invalid API response structure:", data);
                    throw new Error("Invalid API response: missing chat object");
                }

                // Notify parent to link chat to node
                if (optionsRef.current?.onChatCreated) {
                    await optionsRef.current.onChatCreated(chat.id);
                }

                setChatId(chat.id);
            }
        } catch (err) {
            console.error("[useNodeChat] Failed to initialize chat:", err);
            // Verify if we should reset attemptRef to allow retry?
            // For now, keep it true to prevent infinite loop spamming the API.
            // User can manually retry by closing/reopening or we can add a retry button later.
            // attemptRef.current = false; 
        } finally {
            setIsInitializing(false);
        }
    }, [
        node.chatId,
        node.title,
        // chatId removed (use ref)
        // isInitializing removed (logic handled by attemptRef)
        backendURL,
        workspaceId,
        selectedProvider,
        selectedModel,
        loadMessages,
    ]);

    // Reset when node changes
    useEffect(() => {
        if (node.chatId !== chatId) {
            attemptRef.current = false;
            setChatId(node.chatId ?? null);
            resetState();
        }
    }, [node.id, node.chatId, chatId, resetState]);

    return {
        chatId,
        initializeChat,
        isInitializing,
        systemPrompt,
        provider: selectedProvider,
        model: selectedModel,
        messages: streamChat.messages,
        status: streamChat.status,
        modelLoadingState: streamChat.modelLoadingState,
        submitMessage: streamChat.submitMessage,
        abort: streamChat.abort,
        loadMessages: streamChat.loadMessages,
    };
}
