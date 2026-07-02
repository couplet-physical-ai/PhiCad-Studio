import { memo, useState, useMemo } from "react";
import type { BrainstormNode } from "../../shared/types";
import {
  ChevronRight,
  ChevronDown,
  Search,
  Star,
  AlertTriangle,
} from "lucide-react";

interface ExplorerPanelProps {
  nodes: BrainstormNode[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  onFocusNode: (nodeId: string) => void;
}

interface TreeNodeProps {
  node: BrainstormNode;
  allNodes: BrainstormNode[];
  level: number;
  selectedNodeId: string | null;
  expandedIds: Set<string>;
  onToggleExpand: (nodeId: string) => void;
  onSelectNode: (nodeId: string) => void;
  onFocusNode: (nodeId: string) => void;
}

function getNodeChildren(
  nodeId: string,
  allNodes: BrainstormNode[],
): BrainstormNode[] {
  return allNodes.filter((n) => n.parentId === nodeId);
}

function isNodeStale(
  node: BrainstormNode,
  allNodes: BrainstormNode[],
): boolean {
  if (!node.parentId) return false;
  const parent = allNodes.find((n) => n.id === node.parentId);
  if (!parent) return false;
  return (node.reviewedParentVersion ?? 0) < parent.version;
}

const TreeNode = memo(function TreeNode({
  node,
  allNodes,
  level,
  selectedNodeId,
  expandedIds,
  onToggleExpand,
  onSelectNode,
  onFocusNode,
}: TreeNodeProps) {
  const children = getNodeChildren(node.id, allNodes);
  const hasChildren = children.length > 0;
  const isExpanded = expandedIds.has(node.id);
  const isSelected = selectedNodeId === node.id;
  const isStale = isNodeStale(node, allNodes);

  return (
    <div>
      <div
        className={`
          flex items-center gap-1 py-1 px-2 rounded-md cursor-pointer
          hover:bg-muted/50 transition-colors
          ${isSelected ? "bg-muted" : ""}
        `}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={() => onSelectNode(node.id)}
        onDoubleClick={() => onFocusNode(node.id)}
      >
        <button
          className="w-4 h-4 flex items-center justify-center shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) onToggleExpand(node.id);
          }}
        >
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown className="w-3 h-3 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-3 h-3 text-muted-foreground" />
            )
          ) : null}
        </button>

        <span
          className={`
            w-2 h-2 rounded-full shrink-0
            ${node.type === "root" ? "bg-primary" : ""}
            ${node.type === "idea" ? "bg-blue-500" : ""}
            ${node.type === "chat_reference" ? "bg-purple-500" : ""}
            ${node.type === "project_portal" ? "bg-green-500" : ""}
          `}
        />

        <span className="flex-1 text-sm truncate">
          {node.title || "Untitled"}
        </span>

        <div className="flex items-center gap-1 shrink-0">
          {node.isStarred && (
            <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
          )}
          {isStale && <AlertTriangle className="w-3 h-3 text-amber-500" />}
        </div>
      </div>

      {hasChildren && isExpanded && (
        <div>
          {children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              allNodes={allNodes}
              level={level + 1}
              selectedNodeId={selectedNodeId}
              expandedIds={expandedIds}
              onToggleExpand={onToggleExpand}
              onSelectNode={onSelectNode}
              onFocusNode={onFocusNode}
            />
          ))}
        </div>
      )}
    </div>
  );
});

export const ExplorerPanel = memo(function ExplorerPanel({
  nodes,
  selectedNodeId,
  onSelectNode,
  onFocusNode,
  searchQuery: externalSearchQuery,
}: ExplorerPanelProps & { searchQuery?: string }) {
  const [internalSearchQuery, setInternalSearchQuery] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    const rootNodes = nodes.filter((n) => !n.parentId);
    return new Set(rootNodes.map((n) => n.id));
  });

  const searchQuery =
    externalSearchQuery !== undefined
      ? externalSearchQuery
      : internalSearchQuery;

  const filteredNodes = useMemo(() => {
    if (!searchQuery.trim()) return nodes;
    const query = searchQuery.toLowerCase();
    return nodes.filter((n) => n.title.toLowerCase().includes(query));
  }, [nodes, searchQuery]);

  const rootNodes = useMemo(() => {
    if (searchQuery.trim()) {
      return filteredNodes;
    }
    return nodes.filter((n) => !n.parentId);
  }, [nodes, filteredNodes, searchQuery]);

  const handleToggleExpand = (nodeId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  const handleExpandAll = () => {
    setExpandedIds(new Set(nodes.map((n) => n.id)));
  };

  const handleCollapseAll = () => {
    setExpandedIds(new Set());
  };

  return (
    <div className="flex h-full flex-col border-r border-border bg-background">
      {externalSearchQuery === undefined && (
        <div className="p-3 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search ideas..."
              value={internalSearchQuery}
              onChange={(e) => setInternalSearchQuery(e.target.value)}
              data-brainstorm-search
              className="w-full pl-8 pr-3 py-1.5 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
            <button onClick={handleExpandAll} className="hover:text-foreground">
              Expand all
            </button>
            <span>·</span>
            <button
              onClick={handleCollapseAll}
              className="hover:text-foreground"
            >
              Collapse all
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto p-2">
        {rootNodes.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            {searchQuery ? "No ideas match your search" : "No ideas yet"}
          </div>
        ) : (
          rootNodes.map((node) => (
            <TreeNode
              key={node.id}
              node={node}
              allNodes={searchQuery ? filteredNodes : nodes}
              level={0}
              selectedNodeId={selectedNodeId}
              expandedIds={expandedIds}
              onToggleExpand={handleToggleExpand}
              onSelectNode={onSelectNode}
              onFocusNode={onFocusNode}
            />
          ))
        )}
      </div>

      <div className="p-3 border-t border-border text-xs text-muted-foreground">
        {nodes.length} idea{nodes.length !== 1 ? "s" : ""}
        {searchQuery && ` · ${filteredNodes.length} shown`}
      </div>
    </div>
  );
});
