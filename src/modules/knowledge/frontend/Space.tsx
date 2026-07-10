import { useState, useEffect, useCallback, useRef } from "react";
import type { ModuleSpaceProps } from "../../../core/contracts/modules/frontend-entry";
import { KnowledgeApiProvider } from "./KnowledgeApiContext";
import { Sidebar } from "./components/Sidebar/Sidebar";
import { PageEditor } from "./components/Editor/PageEditor";
import { usePage, usePageTree, useKnowledgePageUpdates } from "./hooks";
import { useTreeStore } from "./stores/tree-store";
import type { PageUpdateEvent } from "../shared/types";

const DEFAULT_WORKSPACE = "default";

function KnowledgeSpaceInner({
  backendURL,
  moduleId,
  designId,
}: ModuleSpaceProps) {
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const recentRequestIdsRef = useRef<Set<string>>(new Set());
  const deferredPageUpdateRef = useRef<PageUpdateEvent | null>(null);
  const deferredReconnectRefreshRef = useRef(false);
  const authorityModeRef = useRef<"idle" | "manual" | "ai">("idle");

  const { tree } = usePageTree(designId);
  const {
    page,
    isLoading: isPageLoading,
    error: pageError,
    refresh: refreshPage,
    setPage,
  } = usePage(selectedPageId);

  const requestRefresh = useTreeStore((state) => state.requestRefresh);

  const handlePageUpdate = useCallback(
    (event: PageUpdateEvent) => {
      if (!selectedPageId) return;
      if (event.pageId !== selectedPageId) return;

      if (event.requestId && recentRequestIdsRef.current.has(event.requestId)) {
        recentRequestIdsRef.current.delete(event.requestId);
        return;
      }

      if (authorityModeRef.current === "idle") {
        void refreshPage();
        return;
      }
      deferredPageUpdateRef.current = event;
    },
    [refreshPage, selectedPageId],
  );

  const handleReconnectAfterOutage = useCallback(() => {
    if (!selectedPageId) return;
    if (authorityModeRef.current === "idle") {
      deferredReconnectRefreshRef.current = false;
      void refreshPage();
      return;
    }
    deferredReconnectRefreshRef.current = true;
  }, [refreshPage, selectedPageId]);

  useKnowledgePageUpdates(
    backendURL,
    moduleId,
    handlePageUpdate,
    handleReconnectAfterOutage,
  );

  useEffect(() => {
    setSelectedPageId(null);
    setPage(null);
  }, [designId, setPage]);

  const handleSaveRequestId = useCallback((requestId: string) => {
    const recent = recentRequestIdsRef.current;
    recent.delete(requestId);
    recent.add(requestId);
    while (recent.size > 50) {
      const oldest = recent.values().next().value;
      if (!oldest) break;
      recent.delete(oldest);
    }
  }, []);

  const handlePageDeleted = useCallback(
    (deletedPageId: string) => {
      if (!selectedPageId) return;
      if (deletedPageId === selectedPageId) {
        setSelectedPageId(null);
        setPage(null);
      }
    },
    [selectedPageId, setPage],
  );

  return (
    <div className="flex h-full w-full bg-surface-app text-text-primary">
      <div className="w-[260px] flex-shrink-0 border-r border-slate-200 bg-surface-app dark:border-slate-800">
        <Sidebar
          selectedPageId={selectedPageId}
          onSelectPage={setSelectedPageId}
          onPageDeleted={handlePageDeleted}
          designId={designId}
        />
      </div>
      <div className="min-w-0 flex-1 bg-surface-card">
        <PageEditor
          pageId={selectedPageId}
          page={page}
          isLoading={isPageLoading}
          error={pageError}
          refreshPage={refreshPage}
          onPageChange={setPage}
          onPageDeleted={handlePageDeleted}
          workspaceId={DEFAULT_WORKSPACE}
          designId={designId}
          onSelectPage={setSelectedPageId}
          onSaveRequestId={handleSaveRequestId}
          onRefreshTree={requestRefresh}
        />
      </div>
    </div>
  );
}

export function KnowledgeSpace(props: ModuleSpaceProps) {
  return (
    <KnowledgeApiProvider
      backendURL={props.backendURL}
      moduleId={props.moduleId}
    >
      <KnowledgeSpaceInner {...props} />
    </KnowledgeApiProvider>
  );
}
