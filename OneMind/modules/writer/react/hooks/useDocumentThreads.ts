import { useState, useEffect, useCallback } from "react";
import { useBackendURL } from "@/contexts/BackendURLContext";
import { createChat } from "@/lib/api/chat-api";
import { useAppStore } from "@/stores/app-store";
import type { ChatMetadata } from "@shared/types";

interface ThreadLink {
  id: string;
  document_id: string;
  chat_id: string;
  is_pinned: boolean;
  is_closed: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

interface DocumentThread {
  link: ThreadLink;
  chat: ChatMetadata | null;
}

export function useDocumentThreads(documentId: string | null) {
  const [threads, setThreads] = useState<DocumentThread[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { backendURL } = useBackendURL();
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);

  const fetchThreads = useCallback(async () => {
    if (!documentId || !backendURL) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${backendURL}/api/modules/writer/documents/${documentId}/threads`
      );
      if (!res.ok) throw new Error("Failed to fetch threads");
      const data = await res.json();
      const threadLinks: ThreadLink[] = data.threads ?? [];
      
      const threadsWithChats = await Promise.all(
        threadLinks.map(async (link) => {
          try {
            const chatRes = await fetch(`${backendURL}/api/chats/${link.chat_id}`);
            if (chatRes.ok) {
              const chatData = await chatRes.json();
              return { link, chat: chatData.chat as ChatMetadata };
            }
          } catch (err) {
            console.warn(`[useDocumentThreads] Failed to fetch chat ${link.chat_id}:`, err);
          }
          return { link, chat: null };
        })
      );
      
      setThreads(threadsWithChats);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [documentId, backendURL]);

  useEffect(() => {
    fetchThreads();
  }, [fetchThreads]);

  const createThread = useCallback(
    async (title?: string): Promise<ThreadLink | null> => {
      if (!documentId || !backendURL) return null;
      try {
        const workspaceId = activeWorkspaceId ?? "default-workspace";
        const createdChat = await createChat(
          {
            title: title || "Document Thread",
            category: "writer_document",
            contextRef: {
              type: "writer_document",
              id: documentId,
            },
          },
          workspaceId,
        );
        const chatId = createdChat.id;
        if (!chatId) throw new Error("No chat ID returned");

        const linkRes = await fetch(
          `${backendURL}/api/modules/writer/documents/${documentId}/threads`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId }),
          }
        );
        if (!linkRes.ok) throw new Error("Failed to link thread");
        const linkData = await linkRes.json();
        await fetchThreads();
        return linkData.thread;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
        return null;
      }
    },
    [documentId, backendURL, activeWorkspaceId, fetchThreads]
  );

  const updateThread = useCallback(
    async (
      threadId: string,
      updates: { is_pinned?: boolean; is_closed?: boolean }
    ): Promise<boolean> => {
      if (!backendURL) return false;
      try {
        const res = await fetch(`${backendURL}/api/modules/writer/threads/${threadId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updates),
        });
        if (!res.ok) throw new Error("Failed to update thread");
        await fetchThreads();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
        return false;
      }
    },
    [backendURL, fetchThreads]
  );

  const deleteThread = useCallback(
    async (threadId: string): Promise<boolean> => {
      if (!backendURL) return false;
      try {
        const res = await fetch(`${backendURL}/api/modules/writer/threads/${threadId}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error("Failed to delete thread");
        await fetchThreads();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
        return false;
      }
    },
    [backendURL, fetchThreads]
  );

  return {
    threads,
    loading,
    error,
    refresh: fetchThreads,
    createThread,
    updateThread,
    deleteThread,
  };
}
