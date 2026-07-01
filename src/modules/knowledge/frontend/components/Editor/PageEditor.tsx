import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Plus, Trash2, AlertCircle, FileText } from "lucide-react";
import type { Editor } from "@tiptap/react";
import { Button } from "@shared/frontend/ui/button";
import { useKnowledgeApi, useAutosave } from "../../hooks";
import { TiptapEditor } from "./TiptapEditor";
import { FixedToolbar } from "./FixedToolbar";
import { LinkDialog } from "./LinkDialog";
import type { EditorContent, Page } from "../../shared/types";

interface PageEditorProps {
  pageId: string | null;
  page: Page | null;
  isLoading: boolean;
  error: string | null;
  refreshPage: () => Promise<void>;
  onPageChange?: (page: Page) => void;
  onPageDeleted?: (id: string) => void;
  workspaceId?: string | null;
  designId?: string | null;
  onSelectPage?: (id: string) => void;
  onSaveRequestId?: (requestId: string) => void;
  onRefreshTree?: () => void;
}

function toIsoTimestamp(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export function PageEditor({
  pageId,
  page,
  isLoading,
  error,
  refreshPage,
  onPageChange,
  onPageDeleted,
  designId,
  onSelectPage,
  onSaveRequestId,
  onRefreshTree,
}: PageEditorProps) {
  const api = useKnowledgeApi();
  const [editor, setEditor] = useState<Editor | null>(null);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [icon, setIcon] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const titleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const updatedAtRef = useRef(new Map<string, string>());
  const pageIdRef = useRef(pageId);
  const pageRef = useRef(page);

  useEffect(() => {
    pageIdRef.current = pageId;
  }, [pageId]);

  useEffect(() => {
    pageRef.current = page;
  }, [page]);

  useEffect(() => {
    if (page) {
      setTitle(page.title);
      setIcon(page.icon);
      const iso = toIsoTimestamp(page.updated_at);
      if (iso) {
        updatedAtRef.current.set(page.id, iso);
      }
    }
  }, [page]);

  useEffect(() => {
    return () => {
      if (titleTimerRef.current) {
        clearTimeout(titleTimerRef.current);
      }
    };
  }, []);

  const handleSaveContent = useCallback(
    async (content: EditorContent) => {
      const currentPageId = pageIdRef.current;
      const currentPage = pageRef.current;
      if (!currentPageId || !currentPage) return;
      const requestId = crypto.randomUUID();
      onSaveRequestId?.(requestId);
      try {
        const result = await api.updatePageContent(currentPageId, content, {
          ifUnmodifiedSince: updatedAtRef.current.get(currentPageId) ?? undefined,
          requestId,
        });
        if (result?.page) {
          const iso = toIsoTimestamp(result.page.updated_at);
          if (iso) updatedAtRef.current.set(result.page.id, iso);
        }
      } catch (err) {
        console.error("Failed to save page content:", err);
        throw err;
      }
    },
    [api, onSaveRequestId],
  );

  const { status: saveStatus, triggerSave, resetPending } = useAutosave({
    saveKey: pageId ?? "none",
    debounceMs: 500,
    onSave: handleSaveContent,
  });

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value;
    const currentPageId = pageId;
    setTitle(newTitle);
    if (titleTimerRef.current) clearTimeout(titleTimerRef.current);
    titleTimerRef.current = setTimeout(async () => {
      if (!currentPageId) return;
      try {
        const updated = await api.updatePageMeta(currentPageId, { title: newTitle });
        if (updated) {
          const iso = toIsoTimestamp(updated.updated_at);
          if (iso) updatedAtRef.current.set(updated.id, iso);
          onPageChange?.(updated);
          onRefreshTree?.();
        }
      } catch (err) {
        console.error("Failed to update title:", err);
      }
    }, 1000);
  };

  const handleCreatePage = useCallback(async () => {
    if (!onSelectPage) return;
    setIsCreating(true);
    try {
      const newPage = await api.createPage({
        workspace_id: "default",
        project_id: designId ?? undefined,
        title: "Untitled",
      });
      if (newPage) {
        onRefreshTree?.();
        onSelectPage(newPage.id);
      }
    } catch (err) {
      console.error("Failed to create page:", err);
    } finally {
      setIsCreating(false);
    }
  }, [api, designId, onSelectPage, onRefreshTree]);

  const handleDeletePage = useCallback(async () => {
    if (!pageId || !page || page.is_project_root) return;
    if (!window.confirm("Delete this page?")) return;
    try {
      await api.deletePage(pageId);
      onPageDeleted?.(pageId);
      onRefreshTree?.();
    } catch (err) {
      console.error("Failed to delete page:", err);
    }
  }, [pageId, page, api, onPageDeleted, onRefreshTree]);

  useEffect(() => {
    resetPending();
    if (titleTimerRef.current) {
      clearTimeout(titleTimerRef.current);
      titleTimerRef.current = null;
    }
  }, [pageId, resetPending]);

  if (!pageId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-slate-500">
        <FileText className="h-12 w-12" />
        <p className="text-sm">Select a page or create a new one.</p>
        {onSelectPage && (
          <Button
            variant="primary"
            size="sm"
            icon={<Plus className="h-4 w-4" />}
            onClick={handleCreatePage}
            disabled={isCreating}
          >
            New page
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <input
          type="text"
          value={title}
          onChange={handleTitleChange}
          placeholder="Page title"
          className="flex-1 bg-transparent text-lg font-semibold text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            icon={<Plus className="h-4 w-4" />}
            onClick={handleCreatePage}
            disabled={isCreating}
          >
            {isCreating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon={<Trash2 className="h-4 w-4" />}
            onClick={handleDeletePage}
            disabled={!page || page.is_project_root}
          />
          {saveStatus !== "idle" && (
            <span className="ml-2 text-xs text-muted-foreground">
              {saveStatus === "saving" && "Saving..."}
              {saveStatus === "saved" && "Saved"}
              {saveStatus === "error" && "Error"}
            </span>
          )}
        </div>
      </div>

      {editor && <FixedToolbar editor={editor} onLinkClick={() => setLinkDialogOpen(true)} />}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading && !page ? (
          <div className="p-4 text-sm text-muted-foreground">Loading page...</div>
        ) : error ? (
          <div className="flex items-center gap-2 p-4 text-sm text-red-600">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        ) : page ? (
          <TiptapEditor
            initialContent={page.content_json}
            onChange={triggerSave}
            onReady={setEditor}
            readOnly={false}
          />
        ) : null}
      </div>

      {editor && (
        <LinkDialog
          editor={editor}
          open={linkDialogOpen}
          onOpenChange={setLinkDialogOpen}
        />
      )}
    </div>
  );
}
