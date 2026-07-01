import { create } from "zustand";
import type { PageTreeNode } from "../../shared/types";

interface TreeScope {
  workspaceId: string;
  designId: string | null;
}

interface TreeState {
  tree: PageTreeNode[];
  scope: TreeScope | null;
  expandedIds: Set<string>;
  focusedId: string | null;
  isLoading: boolean;
  error: string | null;
  refreshToken: number;
}

interface TreeActions {
  setTree: (tree: PageTreeNode[]) => void;
  setScope: (scope: TreeScope) => void;
  setIsLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  requestRefresh: () => void;
  toggleExpanded: (id: string) => void;
  setExpanded: (id: string, expanded: boolean) => void;
  expandAncestors: (nodeId: string) => void;
  setFocused: (id: string | null) => void;
  isExpanded: (id: string) => boolean;
  reset: () => void;
}

type TreeStore = TreeState & TreeActions;

export function findNodeById(
  tree: PageTreeNode[],
  id: string,
): PageTreeNode | null {
  for (const node of tree) {
    if (node.id === id) return node;
    if (node.children) {
      const found = findNodeById(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

export function findParentNode(
  tree: PageTreeNode[],
  id: string,
  parent: PageTreeNode | null = null,
): PageTreeNode | null {
  for (const node of tree) {
    if (node.id === id) return parent;
    if (node.children) {
      const found = findParentNode(node.children, id, node);
      if (found) return found;
    }
  }
  return null;
}

export function getAncestorIds(tree: PageTreeNode[], nodeId: string): string[] {
  const ancestors: string[] = [];
  let currentId = nodeId;

  while (true) {
    const parent = findParentNode(tree, currentId);
    if (!parent) break;
    ancestors.push(parent.id);
    currentId = parent.id;
  }

  return ancestors;
}

export function isDescendant(
  tree: PageTreeNode[],
  ancestorId: string,
  nodeId: string,
): boolean {
  const ancestor = findNodeById(tree, ancestorId);
  if (!ancestor?.children) return false;

  const stack = [...ancestor.children];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    if (current.id === nodeId) return true;
    if (current.children) {
      stack.push(...current.children);
    }
  }

  return false;
}

const initialState: TreeState = {
  tree: [],
  scope: null,
  expandedIds: new Set<string>(),
  focusedId: null,
  isLoading: false,
  error: null,
  refreshToken: 0,
};

export const useTreeStore = create<TreeStore>((set, get) => ({
  ...initialState,

  setTree: (tree) => set({ tree }),

  setScope: (scope) => {
    const current = get().scope;
    if (
      current &&
      current.workspaceId === scope.workspaceId &&
      current.designId === scope.designId
    ) {
      return;
    }
    set({
      ...initialState,
      scope,
    });
  },

  setIsLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),

  requestRefresh: () =>
    set((state) => ({ refreshToken: state.refreshToken + 1 })),

  toggleExpanded: (id) => {
    set((state) => {
      const next = new Set(state.expandedIds);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return { expandedIds: next };
    });
  },

  setExpanded: (id, expanded) => {
    set((state) => {
      const next = new Set(state.expandedIds);
      if (expanded) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return { expandedIds: next };
    });
  },

  expandAncestors: (nodeId) => {
    const { tree } = get();
    const ancestors = getAncestorIds(tree, nodeId);
    set((state) => {
      const next = new Set(state.expandedIds);
      ancestors.forEach((id) => next.add(id));
      return { expandedIds: next };
    });
  },

  setFocused: (id) => set({ focusedId: id }),

  isExpanded: (id: string) => get().expandedIds.has(id),

  reset: () => set(initialState),
}));
