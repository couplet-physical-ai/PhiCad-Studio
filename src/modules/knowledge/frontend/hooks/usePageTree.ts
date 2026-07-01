import { useEffect, useCallback, useRef } from "react";
import type { PageTreeNode } from "../../shared/types";
import { useKnowledgeApi } from "../KnowledgeApiContext";
import { useTreeStore } from "../stores/tree-store";

interface UsePageTreeResult {
  tree: PageTreeNode[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const DEFAULT_WORKSPACE = "default";

export function usePageTree(designId?: string | null): UsePageTreeResult {
  const {
    tree,
    setTree,
    setScope,
    isLoading,
    setIsLoading,
    error,
    setError,
    refreshToken,
  } = useTreeStore();
  const api = useKnowledgeApi();

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const pages = designId
        ? await api.getProjectTree(designId, DEFAULT_WORKSPACE)
        : await api.getWorkspaceTree(DEFAULT_WORKSPACE);
      setTree(pages);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load pages");
    } finally {
      setIsLoading(false);
    }
  }, [designId, api, setTree, setIsLoading, setError]);

  useEffect(() => {
    if (refreshToken > 0) {
      void refresh();
    }
  }, [refreshToken, refresh]);

  useEffect(() => {
    setScope({ designId: designId ?? null, workspaceId: DEFAULT_WORKSPACE });
  }, [designId, setScope]);

  const hasFetchedRef = useRef<string | null>(null);
  const scopeKey = designId ?? "global";

  useEffect(() => {
    if (hasFetchedRef.current !== scopeKey && !isLoading) {
      hasFetchedRef.current = scopeKey;
      void refresh();
    }
  }, [refresh, isLoading, scopeKey]);

  return { tree, isLoading, error, refresh };
}
