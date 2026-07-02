import { Loader2, MessageSquare, Pin, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatInterface } from "@/components/ChatInterface";
import { cn } from "@/lib/utils";
import { useEffect, useMemo, useState } from "react";
import { useDocumentThreads } from "../hooks/useDocumentThreads";
import { useWriterDocumentChat } from "../hooks/useWriterDocumentChat";
import type { EditLifecycleEvent } from "../hooks/useWriterDocumentChat";

interface ChatPanelProps {
  documentId: string;
  onEditApplied?: () => void;
  onEditLifecycleEvent?: (event: EditLifecycleEvent) => void;
}

export function ChatPanel({ documentId, onEditApplied, onEditLifecycleEvent }: ChatPanelProps) {
  const { threads, loading, createThread, updateThread, deleteThread } =
    useDocumentThreads(documentId);

  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  const activeThread = useMemo(
    () => threads.find((thread) => thread.link.chat_id === activeChatId) ?? null,
    [threads, activeChatId],
  );

  useEffect(() => {
    if (threads.length === 0) {
      setActiveChatId(null);
      return;
    }

    if (activeChatId && threads.some((thread) => thread.link.chat_id === activeChatId)) {
      return;
    }

    const fallback = threads[0];
    if (fallback) {
      setActiveChatId(fallback.link.chat_id);
    }
  }, [threads, activeChatId]);

  const writerChat = useWriterDocumentChat({
    documentId,
    chatId: activeChatId,
    onEditApplied: onEditApplied
      ? (event) => {
          if (event.documentId === documentId) {
            onEditApplied();
          }
        }
      : undefined,
    onEditLifecycleEvent: onEditLifecycleEvent
      ? (event) => {
          if (event.documentId === documentId) {
            onEditLifecycleEvent(event);
          }
        }
      : undefined,
  });

  const handleCreateThread = async () => {
    const created = await createThread();
    if (created?.chat_id) {
      setActiveChatId(created.chat_id);
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading threads...</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-2 border-b border-border space-y-2">
        <Button variant="outline" size="sm" className="w-full" onClick={handleCreateThread}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          New Thread
        </Button>

        {threads.length > 0 && (
          <div className="flex gap-1 overflow-x-auto pb-1">
            {threads.map(({ link, chat }) => {
              const isActive = activeChatId === link.chat_id;
              return (
                <div
                  key={link.id}
                  onClick={() => setActiveChatId(link.chat_id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setActiveChatId(link.chat_id);
                    }
                  }}
                  className={cn(
                    "group/thread inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs",
                    "transition-colors whitespace-nowrap",
                    isActive
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-background hover:bg-accent/40 text-muted-foreground",
                  )}
                >
                  {link.is_pinned && <Pin className="h-3 w-3 text-amber-500" />}
                  <span className="max-w-[110px] truncate">{chat?.title || "Thread"}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 opacity-0 group-hover/thread:opacity-100 transition-opacity"
                    onClick={(event) => {
                      event.stopPropagation();
                      void updateThread(link.id, { is_pinned: !link.is_pinned });
                    }}
                  >
                    <Pin className={cn("h-3 w-3", link.is_pinned && "text-amber-500")} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 opacity-0 group-hover/thread:opacity-100 transition-opacity text-destructive"
                    onClick={(event) => {
                      event.stopPropagation();
                      void deleteThread(link.id);
                    }}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0">
        {!activeChatId ? (
          <div className="flex items-center justify-center h-full p-4">
            <div className="text-center text-muted-foreground">
              <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No chat threads</p>
              <p className="text-xs mt-1 opacity-70">Create a thread to discuss this document</p>
            </div>
          </div>
        ) : (
          <ChatInterface
            config={{
              messages: writerChat.messages,
              status: writerChat.status,
              className: "h-full",
              modelName: writerChat.model,
              ui: {
                mode: "compact",
                placeholder: "Ask AI to refine or write this document...",
                emptyState: {
                  title: "Chat about this document",
                  description:
                    "Ask for rewrites, expansions, or drafting help. The assistant can edit the document directly.",
                },
              },
              features: {
                tools: {
                  enabled: writerChat.toolsEnabled,
                  toolChoice: writerChat.toolsEnabled ? "auto" : "none",
                  onToolsEnabledChange: writerChat.setToolsEnabled,
                },
                reasoning: {
                  enabled: true,
                  defaultExpanded: false,
                },
              },
              context: {
                workspaceId: activeThread?.chat?.workspaceId,
                chatId: activeChatId,
                activeContext: activeThread?.chat?.workspaceId
                  ? {
                      workspaceId: activeThread.chat.workspaceId,
                      activeTarget: {
                        targetType: "writer.document",
                        targetId: documentId,
                      },
                    }
                  : undefined,
              },
              behavior: {
                onSubmit: async (message) => {
                  await writerChat.submitMessage({
                    text: message.text || "",
                    files: message.files,
                  });
                },
                onStop: writerChat.abort,
                autoFocus: true,
                modelLoading: {
                  state: writerChat.modelLoadingState,
                },
              },
            }}
          />
        )}
      </div>

      {writerChat.status === "submitted" && (
        <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-3 w-3 animate-spin" />
          Preparing response...
        </div>
      )}
    </div>
  );
}
