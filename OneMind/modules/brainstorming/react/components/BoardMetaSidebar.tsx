import { useState, useEffect, useMemo } from "react";
import type {
  BrainstormBoard,
  BrainstormNode,
  BrainstormEdge,
} from "../../shared/types";
import { ExplorerPanel } from "./ExplorerPanel";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface BoardMetaSidebarProps {
  board: BrainstormBoard | undefined;
  nodes: BrainstormNode[];
  edges: BrainstormEdge[];
  onUpdateBoard: (updates: Partial<BrainstormBoard>) => void;
  onUpdateNode: (nodeId: string, updates: Partial<BrainstormNode>) => void;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  onFocusNode: (nodeId: string) => void;
  searchQuery: string;
}

export function BoardMetaSidebar({
  board,
  nodes,
  edges,
  onUpdateBoard,
  onUpdateNode,
  selectedNodeId,
  onSelectNode,
  onFocusNode,
  searchQuery,
}: BoardMetaSidebarProps) {
  const [activeTab, setActiveTab] = useState<"info" | "tree">("tree");
  const [title, setTitle] = useState(board?.title || "");
  const [description, setDescription] = useState(board?.description || "");
  const [systemPromptValidation, setSystemPromptValidation] = useState(
    board?.systemPromptValidation || "",
  );
  const [nodePrompt, setNodePrompt] = useState("");

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId),
    [nodes, selectedNodeId],
  );

  useEffect(() => {
    if (board) {
      setTitle(board.title);
      setDescription(board.description || "");
      setSystemPromptValidation(board.systemPromptValidation || "");
    }
  }, [board?.id]);

  useEffect(() => {
    setNodePrompt(selectedNode?.systemPromptValidation || "");
  }, [selectedNode?.id, selectedNode?.systemPromptValidation]);

  const handleBlur = () => {
    if (!board) return;
    const nextDescription = description || "";
    const nextPrompt = systemPromptValidation || "";
    if (
      title !== board.title ||
      nextDescription !== (board.description || "") ||
      nextPrompt !== (board.systemPromptValidation || "")
    ) {
      onUpdateBoard({
        title,
        description: nextDescription,
        systemPromptValidation: nextPrompt || undefined,
      });
    }
  };

  const handleNodePromptBlur = () => {
    if (!selectedNode) return;
    const nextPrompt = nodePrompt || "";
    if (nextPrompt !== (selectedNode.systemPromptValidation || "")) {
      onUpdateNode(selectedNode.id, {
        systemPromptValidation: nextPrompt || undefined,
      });
    }
  };

  if (!board) {
    return null;
  }

  return (
    <div className="flex h-full w-80 flex-col border-l border-border bg-background">
      <div className="flex items-center justify-between border-b border-border p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Details
        </h2>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as "info" | "tree")}
        className="flex-1 flex flex-col"
      >
        <div className="px-4 pt-2">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="info">Info</TabsTrigger>
            <TabsTrigger value="tree">Tree</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent
          value="info"
          className="flex-1 overflow-y-auto p-4 space-y-6"
        >
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              Title
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleBlur}
              className="font-medium"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              Description
            </label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={handleBlur}
              placeholder="Add board description..."
              className="min-h-[100px] resize-none text-sm"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              Validation System Prompt
            </label>
            <Textarea
              value={systemPromptValidation}
              onChange={(e) => setSystemPromptValidation(e.target.value)}
              onBlur={handleBlur}
              placeholder="Default validation instructions for this board"
              className="min-h-[120px] resize-none text-sm"
            />
          </div>

          {selectedNode && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">
                Node Validation Prompt
              </label>
              <Textarea
                value={nodePrompt}
                onChange={(e) => setNodePrompt(e.target.value)}
                onBlur={handleNodePromptBlur}
                placeholder="Optional node-specific validation instructions"
                className="min-h-[120px] resize-none text-sm"
              />
            </div>
          )}

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              Statistics
            </label>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-md border border-border bg-muted/50 p-3">
                <div className="text-2xl font-bold">{nodes.length}</div>
                <div className="text-xs text-muted-foreground">Nodes</div>
              </div>
              <div className="rounded-md border border-border bg-muted/50 p-3">
                <div className="text-2xl font-bold">{edges.length}</div>
                <div className="text-xs text-muted-foreground">Connections</div>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              Metadata
            </label>
            <div className="rounded-md border border-border p-3 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created</span>
                <span>{new Date(board.createdAt).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Updated</span>
                <span>{new Date(board.updatedAt).toLocaleDateString()}</span>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent
          value="tree"
          className="flex-1 overflow-hidden flex flex-col"
        >
          <ExplorerPanel
            nodes={nodes}
            selectedNodeId={selectedNodeId}
            onSelectNode={onSelectNode}
            onFocusNode={onFocusNode}
            searchQuery={searchQuery}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
