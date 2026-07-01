import { usePageTree } from "../../hooks";
import { TreeItem } from "./TreeItem";
import type { PageTreeNode } from "../../shared/types";

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

  if (isLoading) {
    return (
      <div className="space-y-2 p-2">
        <div className="h-8 w-full animate-pulse rounded-md bg-muted" />
        <div className="h-8 w-full animate-pulse rounded-md bg-muted" />
        <div className="h-8 w-full animate-pulse rounded-md bg-muted" />
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
      <p className="p-4 text-center text-xs text-muted-foreground">
        No pages yet
      </p>
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
