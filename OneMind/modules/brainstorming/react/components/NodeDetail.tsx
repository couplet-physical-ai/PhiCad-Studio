import {
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { useDebouncedCallback } from "use-debounce";
import {
  X,
  FileText,
  CheckCircle,
  Info,
  Sparkles,
  Loader2,
  Send,
  AlertTriangle,
  MessageCircle,
  Plus,
} from "lucide-react";
import type { BrainstormNode, Comment, AIJob } from "../../shared/types";
import type { EditorContent as KnowledgeEditorContent } from "../../../../modules/knowledge/shared/types";
import { TiptapEditor } from "../../../../modules/knowledge/react/components/Editor/TiptapEditor";
import { MultiSelectTags } from "./MultiSelectTags";
import { CommentInput } from "./CommentInput";
import { CommentItem } from "./CommentItem";
import { ChatInterface } from "@/components/ChatInterface";
import { useModuleChat } from "@/hooks/useModuleChat";
import { useBrainstormStore } from "../stores/brainstorm-store";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

const DEFAULT_EDITOR_CONTENT: KnowledgeEditorContent = {
  engine: "tiptap",
  version: 1,
  data: {
    type: "doc",
    content: [{ type: "paragraph", content: [] }],
  },
};

type TabId = "write" | "chat" | "validation" | "metadata" | "comments";

interface TabButtonProps {
  id: TabId;
  active: boolean;
  onClick: (id: TabId) => void;
  children: ReactNode;
  icon?: ReactNode;
}

function TabButton({ id, active, onClick, children, icon }: TabButtonProps) {
  return (
    <button
      onClick={() => onClick(id)}
      className={`flex items-center gap-2 border-b-2 cursor-pointer px-4 py-3 text-sm font-medium transition-colors ${active
        ? "border-primary text-foreground"
        : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
        }`}
    >
      {icon}
      {children}
    </button>
  );
}

interface NodeDetailProps {
  node: BrainstormNode;
  isStale: boolean;
  onClose: () => void;
  onUpdateNode: (id: string, updates: Partial<BrainstormNode>) => Promise<void>;
  onGenerateSubIdeas: (nodeId: string) => Promise<void>;
  onMarkReviewed: (nodeId: string) => Promise<void>;
  onGetComments: (nodeId: string) => Promise<Comment[]>;
  onCreateComment: (params: {
    nodeId: string;
    author: string;
    body: string;
  }) => Promise<Comment>;
  onUpdateComment: (commentId: string, body: string) => Promise<Comment>;
  onDeleteComment: (commentId: string, nodeId: string) => Promise<void>;
  onGetAIJob?: (jobId: string) => Promise<AIJob>;
}

export function NodeDetail({
  node,
  isStale,
  onClose,
  onUpdateNode,
  onGenerateSubIdeas,
  onMarkReviewed,
  onGetComments,
  onCreateComment,
  onUpdateComment,
  onDeleteComment,
}: NodeDetailProps) {
  const [activeTab, setActiveTab] = useState<TabId>("write");
  const [isGenerating, setIsGenerating] = useState(false);
  const [summaryContent, setSummaryContent] = useState<KnowledgeEditorContent>(
    (node.summaryRich as KnowledgeEditorContent) || DEFAULT_EDITOR_CONTENT,
  );
  const [mainContent, setMainContent] = useState<KnowledgeEditorContent>(
    (node.contentRich as KnowledgeEditorContent) || DEFAULT_EDITOR_CONTENT,
  );
  const [tags, setTags] = useState<string[]>(node.tags ?? []);

  // Board context for system prompt
  const boards = useBrainstormStore((state) => state.boards);
  const currentBoardId = useBrainstormStore((state) => state.currentBoardId);

  // Node Chat integration via useModuleChat
  const nodeChat = useModuleChat({
    moduleId: "brainstorming",
    contextId: node.id,
    title: node.title,
    existingChatId: node.chatId,
    systemPromptBuilder: () => {
      const board = currentBoardId ? boards.find((b) => b.id === currentBoardId) : undefined;
      const boardTitle = board?.title ? `Board: ${board.title}` : "";
      const boardDescription = board?.description ? `Board context: ${board.description}` : "";
      return `You are discussing this brainstorming idea.\n${boardTitle}\n${boardDescription}\n\nIdea: ${node.title}\n\nHelp the user explore, refine, and develop this idea. Provide insights, ask clarifying questions, and suggest improvements.`;
    },
    onChatCreated: async (chatId: string) => {
      await onUpdateNode(node.id, { chatId });
    },
  });

  // Initialize chat when tab becomes active
  useEffect(() => {
    if (activeTab === "chat") {
      nodeChat.initializeChat();
    }
  }, [activeTab, nodeChat.initializeChat]);

  // Comments state
  const [comments, setComments] = useState<Comment[]>([]);
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);

  useEffect(() => {
    setSummaryContent((node.summaryRich as KnowledgeEditorContent) || DEFAULT_EDITOR_CONTENT);
    setMainContent((node.contentRich as KnowledgeEditorContent) || DEFAULT_EDITOR_CONTENT);
    setTags(node.tags ?? []);
  }, [node]);

  const debouncedSaveSummary = useDebouncedCallback(
    useCallback(
      async (content: KnowledgeEditorContent) => {
        await onUpdateNode(node.id, { summaryRich: content });
      },
      [node.id, onUpdateNode],
    ),
    800,
  );

  const debouncedSaveContent = useDebouncedCallback(
    useCallback(
      async (content: KnowledgeEditorContent) => {
        await onUpdateNode(node.id, { contentRich: content });
      },
      [node.id, onUpdateNode],
    ),
    800,
  );

  const handleTagsChange = useCallback(
    async (next: string[]) => {
      setTags(next);
      await onUpdateNode(node.id, { tags: next });
    },
    [node.id, onUpdateNode],
  );

  useEffect(() => {
    return () => {
      debouncedSaveSummary.cancel();
      debouncedSaveContent.cancel();
    };
  }, [debouncedSaveSummary, debouncedSaveContent]);

  const handleGenerateSubIdeas = async () => {
    setIsGenerating(true);
    try {
      await onGenerateSubIdeas(node.id);
    } finally {
      setIsGenerating(false);
    }
  };

  // Load comments when switching to comments tab
  useEffect(() => {
    if (activeTab === 'comments') {
      loadComments();
    }
  }, [activeTab, node.id]);

  const loadComments = async () => {
    setIsLoadingComments(true);
    try {
      const data = await onGetComments(node.id);
      setComments(data);
    } catch (err) {
      console.error('Failed to load comments', err);
    } finally {
      setIsLoadingComments(false);
    }
  };

  const handleCreateComment = async (body: string) => {
    setIsSubmittingComment(true);
    try {
      const newComment = await onCreateComment({
        nodeId: node.id,
        author: 'User', // Single-user app
        body: body.trim(),
      });
      setComments(prev => [...prev, newComment]);
    } catch (err) {
      console.error('Failed to create comment', err);
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const handleEditComment = async (commentId: string, newBody: string) => {
    try {
      const updatedComment = await onUpdateComment(commentId, newBody.trim());
      setComments(prev => prev.map(c => c.id === commentId ? updatedComment : c));
      setEditingCommentId(null);
    } catch (err) {
      console.error('Failed to edit comment', err);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    try {
      await onDeleteComment(commentId, node.id);
      setComments(prev => prev.filter(c => c.id !== commentId));
    } catch (err) {
      console.error('Failed to delete comment', err);
      throw err;
    }
  };


  const renderContent = () => {
    switch (activeTab) {
      case "write":
        return (
          <div className="flex-1 overflow-auto p-4 md:p-6">
            <div className="mx-auto max-w-3xl border-none rounded-lg overflow-hidden min-h-[500px]">
              <TiptapEditor
                initialContent={mainContent}
                onChange={(content) => {
                  setMainContent(content);
                  debouncedSaveContent(content);
                }}
              />
            </div>
          </div>
        );
      case "chat":
        return (
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            {nodeChat.isInitializing ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">
                  Loading chat...
                </span>
              </div>
            ) : (
              <ChatInterface config={{
                messages: nodeChat.messages,
                status: nodeChat.status,
                className: "h-full",
                ui: {
                  placeholder: "Ask about this idea...",
                  emptyState: {
                    title: "Ask about this idea",
                    description: "Start a conversation to explore this idea with AI",
                  },
                },
                behavior: {
                  onSubmit: async (message: { text?: string; files?: any[] }) => {
                    if (!nodeChat.chatId) return;
                    await nodeChat.submitMessage({
                      chatId: nodeChat.chatId,
                      provider: nodeChat.provider,
                      model: nodeChat.model,
                      text: message.text || "",
                      files: message.files,
                      systemPrompt: nodeChat.systemPrompt,
                    });
                  },
                  onStop: nodeChat.abort,
                  modelLoading: {
                    state: nodeChat.modelLoadingState,
                  },
                },
              }} />
            )}
          </div>
        );
      case "validation":
        return (
          <div className="p-6">
            <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-2 mb-2 font-medium text-foreground">
                <CheckCircle className="h-4 w-4" />
                Validation Results
              </div>
              <p>No validation insights available yet.</p>
            </div>
          </div>
        );
      case "metadata":
        return (
          <div className="p-6">
            <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-2 mb-2 font-medium text-foreground">
                <Info className="h-4 w-4" />
                Metadata
              </div>
              <p>Metadata fields will appear here.</p>
            </div>
          </div>
        );
      case "comments":
        return (
          <div className="flex flex-col h-full">
            {/* Comment input at top */}
            <div className="px-6 py-4 border-b border-border">
              <CommentInput
                placeholder="Add your thoughts..."
                onSubmit={handleCreateComment}
                disabled={isSubmittingComment}
              />
            </div>

            {/* Comments list */}
            <div className="flex-1 overflow-auto px-6 py-4">
              {isLoadingComments ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : comments.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-center text-muted-foreground">
                  <MessageCircle className="h-8 w-8 mb-2 opacity-50" />
                  <p className="text-sm">No comments yet.</p>
                  <p className="text-xs">Add your thoughts above.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {comments.map(comment => (
                    <CommentItem
                      key={comment.id}
                      comment={comment}
                      isEditing={editingCommentId === comment.id}
                      onEdit={handleEditComment}
                      onDelete={handleDeleteComment}
                      onStartEdit={() => setEditingCommentId(comment.id)}
                      onCancelEdit={() => setEditingCommentId(null)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex h-full w-[80vw] max-w-[1200px] flex-col overflow-hidden border-l border-border bg-background shadow-2xl shrink-0">
      <div className="flex flex-col gap-1 border-b border-border bg-background px-3 py-2 shrink-0">
        <div className="flex items-center gap-2">
          <button
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md hover:bg-muted transition-colors"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
          <input
            className="flex-1 bg-transparent text-lg font-bold outline-none placeholder:text-muted-foreground/50"
            defaultValue={node.title}
            onBlur={async (e) => {
              const val = e.target.value.trim();
              if (val && val !== node.title) {
                await onUpdateNode(node.id, { title: val });
              }
            }}
          />
        </div>

        <div className="pl-8 space-y-1">
          <input
            className="w-full bg-transparent text-sm text-muted-foreground outline-none placeholder:text-muted-foreground/50 h-7"
            placeholder="Add summary..."
            defaultValue={(() => {
              try {
                const text = (node.summaryRich as any)?.content?.[0]?.content?.[0]?.text;
                return text || "";
              } catch { return ""; }
            })()}
            onBlur={async (e) => {
              const text = e.target.value.trim();
              const content: KnowledgeEditorContent = {
                engine: "tiptap",
                version: 1,
                data: {
                  type: "doc",
                  content: [{
                    type: "paragraph",
                    content: text ? [{ type: "text", text }] : []
                  }]
                }
              };
              setSummaryContent(content);
              await onUpdateNode(node.id, { summaryRich: content });
            }}
          />

          <div className="flex flex-wrap items-center gap-1.5">
            {tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="px-1.5 py-0 text-[10px] h-5 gap-1 hover:bg-secondary/80">
                {tag}
                <X
                  className="h-2.5 w-2.5 cursor-pointer opacity-50 hover:opacity-100"
                  onClick={() => handleTagsChange(tags.filter((t) => t !== tag))}
                />
              </Badge>
            ))}
            <Popover>
              <PopoverTrigger asChild>
                <button className="flex h-4 w-4 items-center justify-center rounded-full border border-dashed border-muted-foreground text-muted-foreground hover:border-foreground hover:text-foreground transition-colors">
                  <Plus className="h-2.5 w-2.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-48 p-1.5" align="start">
                <Input
                  placeholder="New tag..."
                  className="h-6 text-xs"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const val = e.currentTarget.value.trim();
                      if (val && !tags.includes(val)) {
                        handleTagsChange([...tags, val]);
                        e.currentTarget.value = "";
                      }
                    }
                  }}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>

      {/* Tabs Layout */}
      <div className="flex flex-col flex-1 min-h-0">
        <div className="flex items-center px-4 border-b border-border bg-background/50 shrink-0 overflow-x-auto">
          <TabButton
            id="write"
            active={activeTab === "write"}
            onClick={setActiveTab}
            icon={<FileText className="h-4 w-4" />}
          >
            Write
          </TabButton>
          <TabButton
            id="chat"
            active={activeTab === "chat"}
            onClick={setActiveTab}
            icon={<MessageCircle className="h-4 w-4" />}
          >
            Chat
          </TabButton>
          <div className="w-px h-5 bg-border mx-2" />
          <TabButton
            id="validation"
            active={activeTab === "validation"}
            onClick={setActiveTab}
            icon={<CheckCircle className="h-4 w-4" />}
          >
            Validation
          </TabButton>
          <TabButton
            id="metadata"
            active={activeTab === "metadata"}
            onClick={setActiveTab}
            icon={<Info className="h-4 w-4" />}
          >
            Metadata
          </TabButton>
          <TabButton
            id="comments"
            active={activeTab === "comments"}
            onClick={setActiveTab}
            icon={<MessageCircle className="h-4 w-4" />}
          >
            Comments
          </TabButton>
        </div>

        {/* Content Area */}
        <div className="flex-1 bg-muted/5 w-full min-h-0 relative">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}
