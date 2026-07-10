import { useCallback, useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import { Button } from "@shared/frontend/ui/button";
import { usePageTree, useKnowledgeApi } from "../../hooks";
import { TreeItem } from "./TreeItem";
import type { PageTreeNode } from "../../../shared/types";

interface PageTreeProps {
  selectedPageId: string | null;
  onSelectPage: (id: string) => void;
  onPageDeleted?: (id: string) => void;
  designId?: string | null;
}

export function PageTree({
  selectedPageId,
  onSelectPage,
  onPageDeleted,
  designId,
}: PageTreeProps) {
  const { tree, isLoading, error, refresh } = usePageTree(designId);
  const api = useKnowledgeApi();
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = useCallback(async () => {
    setIsCreating(true);
    try {
      const page = await api.createPage({
        workspace_id: "default",
        project_id: designId ?? undefined,
        title: "Untitled",
      });
      if (page) onSelectPage(page.id);
    } catch (err) {
      console.error("Failed to create page:", err);
    } finally {
      setIsCreating(false);
    }
  }, [api, designId, onSelectPage]);

  if (isLoading) {
    return (
      <div className="space-y-2 p-2">
        <div className="h-8 w-full animate-pulse rounded-md bg-slate-200 dark:bg-slate-800" />
        <div className="h-8 w-full animate-pulse rounded-md bg-slate-200 dark:bg-slate-800" />
        <div className="h-8 w-full animate-pulse rounded-md bg-slate-200 dark:bg-slate-800" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-2 text-sm text-red-600">
        <p>{error}</p>
        <button
          onClick={() => refresh()}
          className="mt-2 rounded-md bg-slate-100 px-3 py-1 text-xs hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700"
        >
          Retry
        </button>
      </div>
    );
  }

  if (tree.length === 0) {
    return (
      <div className="p-3">
        <div className="rounded-card border border-dashed border-slate-300 bg-surface-card px-4 py-10 text-center dark:border-slate-700">
          <p className="text-sm text-text-secondary">No pages yet</p>
          <p className="mt-1 text-xs text-text-tertiary">
            Create your first page to get started.
          </p>
          <div className="mt-3 flex justify-center">
            <Button
              variant="primary"
              size="sm"
              icon={
                isCreating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )
              }
              onClick={handleCreate}
              disabled={isCreating}
            >
              New page
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-2">
      {tree.map((node) => (
        <TreeItem
          key={node.id}
          node={node}
          selectedId={selectedPageId}
          onSelect={onSelectPage}
          onPageDeleted={onPageDeleted}
          designId={designId}
        />
      ))}
    </div>
  );
}

export function getPreviousSibling(
  tree: PageTreeNode[],
  nodeId: string,
): PageTreeNode | null {
  const parent = findParentNode(tree, nodeId);
  const siblings = parent?.children ?? tree;
  const index = siblings.findIndex((n) => n.id === nodeId);
  return index > 0 ? siblings[index - 1]! : null;
}

export function findParentNode(
  tree: PageTreeNode[],
  id: string,
): PageTreeNode | null {
  for (const node of tree) {
    if (node.children?.some((child) => child.id === id)) return node;
    if (node.children) {
      const found = findParentNode(node.children, id);
      if (found) return found;
    }
  }
  return null;
}
