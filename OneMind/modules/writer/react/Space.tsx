import { useState, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
import { useRegisterSidebarButtons } from "@/contexts/SidebarButtonsContext";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { MessageSquare, History, Plus, FileText, AlertCircle, Trash2, X } from "lucide-react";
import { DocumentCard } from "./components/DocumentCard";
import { WriterEditor } from "./components/WriterEditor";
import { ChatPanel } from "./components/ChatPanel";
import { VersionsPanel } from "./components/VersionsPanel";
import { useWriterDocuments } from "./hooks/useWriterDocuments";
import type { EditLifecycleEvent } from "./hooks/useWriterDocumentChat";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type PanelState = "none" | "chat" | "versions";
type AiEditState = "idle" | "running";

export function Space() {
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [panelState, setPanelState] = useState<PanelState>("none");
  const [editorRefreshToken, setEditorRefreshToken] = useState(0);
  const [aiEditState, setAiEditState] = useState<AiEditState>("idle");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const { documents, loading, error, isBackendReady, createDocument, updateDocument, deleteDocument, deleteDocuments } = useWriterDocuments(activeWorkspaceId);
  const canCreateDocument = Boolean(activeWorkspaceId && isBackendReady && !loading);
  const { setRightTopButtons, clearButtons } = useRegisterSidebarButtons();

  const resetEditorState = useCallback(() => {
    setEditorRefreshToken(0);
    setAiEditState("idle");
  }, []);

  const selectionMode = selectedIds.size > 0;

  const handleCreateDocument = useCallback(async (projectId?: string) => {
    const doc = await createDocument("Untitled Document", projectId);
    if (doc) {
      setSelectedDocumentId(doc.id);
      resetEditorState();
    }
  }, [createDocument, resetEditorState]);

  const handleOpenDocument = useCallback((id: string) => {
    setSelectedDocumentId(id);
    resetEditorState();
  }, [resetEditorState]);

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    const idsToDelete = [...selectedIds];
    const deleted = await deleteDocuments(idsToDelete);
    if (deleted) {
      if (selectedDocumentId && idsToDelete.includes(selectedDocumentId)) {
        setSelectedDocumentId(null);
        setPanelState("none");
        resetEditorState();
      }
      setSelectedIds(new Set());
      setBulkDeleteOpen(false);
    }
  }, [selectedIds, deleteDocuments, selectedDocumentId, resetEditorState]);

  const openBulkDeleteDialog = useCallback(() => {
    if (selectedIds.size === 0) return;
    setBulkDeleteOpen(true);
  }, [selectedIds.size]);

  const handleRename = useCallback(async (id: string, newTitle: string) => {
    await updateDocument(id, { title: newTitle });
  }, [updateDocument]);

  const handleMoveToProject = useCallback(async (id: string, projectId: string | null) => {
    await updateDocument(id, { project_id: projectId });
  }, [updateDocument]);

  const handleDelete = useCallback(async (id: string) => {
    const deleted = await deleteDocument(id);
    if (deleted) {
      if (selectedDocumentId === id) {
        setSelectedDocumentId(null);
        setPanelState("none");
        resetEditorState();
      }
      setSelectedIds((prev) => {
        if (!prev.has(id)) {
          return prev;
        }
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, [deleteDocument, selectedDocumentId, resetEditorState]);

  // Register sidebar buttons when doc is selected
  useEffect(() => {
    if (!selectedDocumentId) {
      clearButtons();
      return;
    }

    setRightTopButtons([
      <Tooltip key="chat">
        <TooltipTrigger asChild>
          <Button
            variant={panelState === "chat" ? "default" : "ghost"}
            size="icon"
            className="h-8 w-8"
            onClick={() => setPanelState((p) => (p === "chat" ? "none" : "chat"))}
          >
            <MessageSquare className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">Chat</TooltipContent>
      </Tooltip>,
      <Tooltip key="versions">
        <TooltipTrigger asChild>
          <Button
            variant={panelState === "versions" ? "default" : "ghost"}
            size="icon"
            className="h-8 w-8"
            onClick={() => setPanelState((p) => (p === "versions" ? "none" : "versions"))}
          >
            <History className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">Versions</TooltipContent>
      </Tooltip>,
    ]);

    return () => clearButtons();
  }, [selectedDocumentId, panelState, setRightTopButtons, clearButtons]);

  // Clear stale selections when docs change
  useEffect(() => {
    if (selectedIds.size === 0) return;
    const docIds = new Set(documents.map((d) => d.id));
    setSelectedIds((prev) => {
      const next = new Set([...prev].filter((id) => docIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [documents]);

  // If selected document was deleted or became unavailable, return to list view
  useEffect(() => {
    if (!selectedDocumentId || loading) return;
    const selectedStillExists = documents.some((doc) => doc.id === selectedDocumentId);
    if (!selectedStillExists) {
      setSelectedDocumentId(null);
      setPanelState("none");
      setAiEditState("idle");
    }
  }, [documents, loading, selectedDocumentId]);

  const handleAiEditLifecycleEvent = useCallback(
    (event: EditLifecycleEvent) => {
      if (!selectedDocumentId || event.documentId !== selectedDocumentId) {
        return;
      }
      if (event.status === "started") {
        setAiEditState("running");
        return;
      }
      setAiEditState("idle");
    },
    [selectedDocumentId],
  );

  // Shared card props
  const cardProps = {
    selectionMode,
    onOpen: handleOpenDocument,
    onToggleSelect: handleToggleSelect,
    onRename: handleRename,
    onMoveToProject: handleMoveToProject,
    onDelete: handleDelete,
  };

  // No doc selected: flat workspace document grid
  if (!selectedDocumentId) {
    return (
      <div
        data-testid="writer-space"
        className="flex h-full w-full overflow-hidden bg-background text-foreground"
      >
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Bulk action bar */}
          {selectionMode && (
            <div className="flex items-center gap-3 px-6 py-2 border-b border-border bg-muted/50">
              <span className="text-sm font-medium">
                {selectedIds.size} selected
              </span>
              <Button
                variant="destructive"
                size="sm"
                onClick={openBulkDeleteDialog}
              >
                <Trash2 className="h-4 w-4 mr-1.5" />
                Delete
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearSelection}
              >
                <X className="h-4 w-4 mr-1.5" />
                Cancel
              </Button>
            </div>
          )}

          <div className="flex-1 overflow-auto">
            {error && (
              <Alert variant="destructive" className="mx-6 mt-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {!activeWorkspaceId && (
              <div className="flex-1 flex items-center justify-center h-full">
                <p className="text-sm text-muted-foreground">Please select a workspace first</p>
              </div>
            )}
            {activeWorkspaceId && !isBackendReady && (
              <div className="flex-1 flex items-center justify-center h-full">
                <p className="text-sm text-muted-foreground">Waiting for backend connection...</p>
              </div>
            )}
            {activeWorkspaceId && isBackendReady && documents.length === 0 && !loading && (
              <div className="flex-1 flex items-center justify-center h-full p-8">
                <div className="text-center text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium">No documents yet</p>
                  <p className="text-sm mt-1">Create your first document to get started</p>
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={() => handleCreateDocument()}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    New Document
                  </Button>
                </div>
              </div>
            )}
            {activeWorkspaceId && isBackendReady && documents.length > 0 && (
              <div className="max-w-5xl mx-auto p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                      Documents
                    </h2>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleCreateDocument()}
                    disabled={!canCreateDocument}
                  >
                    <Plus className="h-4 w-4 mr-1.5" />
                    New Document
                  </Button>
                </div>
                <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {documents.map((doc) => (
                    <DocumentCard
                      key={doc.id}
                      document={doc}
                      selected={selectedIds.has(doc.id)}
                      {...cardProps}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete selected documents?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will remove {selectedIds.size} selected document{selectedIds.size === 1 ? "" : "s"} from this workspace.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => void handleBulkDelete()}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    );
  }

  // Doc selected: editor + optional right panel
  return (
    <div
      data-testid="writer-space"
      className="flex h-full w-full overflow-hidden bg-background text-foreground"
    >
      <main className="h-full min-w-0 flex-1 flex flex-col" data-testid="writer-editor-root">
        <WriterEditor
          documentId={selectedDocumentId}
          externalRefreshToken={editorRefreshToken}
          aiEditState={aiEditState}
          onBack={() => {
            setSelectedDocumentId(null);
            setPanelState("none");
            resetEditorState();
          }}
        />
      </main>

      {panelState !== "none" && (
        <aside
          data-testid="writer-right-pane"
          className={cn(
            "h-full shrink-0 border-l border-border flex flex-col w-[320px]",
            "animate-in slide-in-from-right-2 fade-in duration-200"
          )}
        >
          <div className="flex-1 overflow-hidden">
            {panelState === "chat" ? (
              <div data-testid="writer-chat-panel" className="h-full">
                <ChatPanel
                  documentId={selectedDocumentId}
                  onEditApplied={() => setEditorRefreshToken((prev) => prev + 1)}
                  onEditLifecycleEvent={handleAiEditLifecycleEvent}
                />
              </div>
            ) : (
              <div data-testid="writer-versions-panel" className="h-full">
                <VersionsPanel documentId={selectedDocumentId} />
              </div>
            )}
          </div>
        </aside>
      )}
    </div>
  );
}
