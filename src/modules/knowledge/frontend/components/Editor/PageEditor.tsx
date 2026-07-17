import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Plus, Trash2, AlertCircle, FileText } from "lucide-react";
import type { Editor } from "@tiptap/react";
import { Button } from "@shared/frontend/ui/button";
import { useKnowledgeApi, useAutosave } from "../../hooks";
import { useTreeStore } from "../../stores/tree-store";
import { TiptapEditor } from "./TiptapEditor";
import { PdfViewer } from "./PdfViewer";
import { FixedToolbar } from "./FixedToolbar";
import { LinkDialog } from "./LinkDialog";
import { findParentNode } from "../Sidebar/PageTree";
import { formatRelativeTime } from "../../lib/format";
import type { EditorContent, Page, PageTreeNode } from "../../../shared/types";

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

/** Ancestor titles for a page, root-first. Empty if the page isn't in the tree. */
function buildBreadcrumb(tree: PageTreeNode[], pageId: string): string[] {
  const crumbs: string[] = [];
  let currentId = pageId;
  for (let i = 0; i < 50; i++) {
    const parent = findParentNode(tree, currentId);
    if (!parent) break;
    crumbs.unshift(parent.title);
    currentId = parent.id;
  }
  return crumbs;
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
  const [wordCount, setWordCount] = useState(0);
  const tree = useTreeStore((state) => state.tree);
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

  useEffect(() => {
    if (!editor) return;
    const update = () => {
      const text = editor.getText().trim();
      setWordCount(text ? text.split(/\s+/).length : 0);
    };
    update();
    editor.on("update", update);
    return () => {
      editor.off("update", update);
    };
  }, [editor]);

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
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-md rounded-card border border-dashed border-slate-300 bg-surface-card px-6 py-12 text-center dark:border-slate-700">
          <FileText className="mx-auto h-10 w-10 text-text-tertiary" />
          <p className="mt-3 text-sm text-text-secondary">No page selected</p>
          <p className="mt-1 text-xs text-text-tertiary">
            Select a page from the sidebar or create a new one.
          </p>
          {onSelectPage && (
            <div className="mt-4 flex justify-center">
              <Button
                variant="primary"
                size="sm"
                icon={<Plus className="h-4 w-4" />}
                onClick={handleCreatePage}
                disabled={isCreating}
              >
                New page
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  const breadcrumb = pageId ? buildBreadcrumb(tree, pageId) : [];
  const editedRelative = page ? formatRelativeTime(page.updated_at) : null;
  const pdfData =
    page && page.content_engine === "pdf" && page.content_json.engine === "pdf"
      ? page.content_json.data
      : null;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2 px-4 pt-2">
          <input
            type="text"
            value={title}
            onChange={handleTitleChange}
            placeholder="Page title"
            className="flex-1 bg-transparent text-lg font-semibold text-text-primary placeholder:text-text-tertiary focus:outline-none"
          />
          <div className="flex items-center gap-1">
            {saveStatus !== "idle" && (
              <span
                className={`rounded-pill bg-slate-100 px-2 py-0.5 text-[11px] dark:bg-slate-800 ${
                  saveStatus === "saved"
                    ? "text-status-success"
                    : saveStatus === "error"
                      ? "text-status-danger"
                      : "text-text-tertiary"
                }`}
              >
                {saveStatus === "saving" && "Saving…"}
                {saveStatus === "saved" && "Saved"}
                {saveStatus === "error" && "Error"}
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              title="New page"
              aria-label="New page"
              icon={
                isCreating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )
              }
              onClick={handleCreatePage}
              disabled={isCreating}
            />
            <div className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" />
            <Button
              variant="ghost"
              size="sm"
              title="Delete page"
              aria-label="Delete page"
              className="hover:text-status-danger"
              icon={<Trash2 className="h-4 w-4" />}
              onClick={handleDeletePage}
              disabled={!page || page.is_project_root}
            />
          </div>
        </div>
        <div className="flex items-center gap-1.5 px-4 pb-2 pt-1 text-[11px] text-text-tertiary">
          {breadcrumb.length > 0 && (
            <>
              <span className="truncate">{breadcrumb.join(" / ")}</span>
              <span aria-hidden>·</span>
            </>
          )}
          {editedRelative && (
            <>
              <span>edited {editedRelative}</span>
              <span aria-hidden>·</span>
            </>
          )}
          {pdfData ? (
            <span>
              {pdfData.pageCount
                ? `${pdfData.pageCount} ${pdfData.pageCount === 1 ? "page" : "pages"}`
                : "PDF"}
            </span>
          ) : (
            <span>
              {wordCount} {wordCount === 1 ? "word" : "words"}
            </span>
          )}
        </div>
      </div>

      {editor && !pdfData && (
        <FixedToolbar editor={editor} onLinkClick={() => setLinkDialogOpen(true)} />
      )}

      {pdfData ? (
        <div className="min-h-0 flex-1">
          <PdfViewer
            pdfUrl={api.pdfUrl(page!.id)}
            fileName={pdfData.fileName}
          />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {isLoading && !page ? (
            <div className="p-4 text-sm text-text-tertiary">Loading page...</div>
          ) : error ? (
            <div className="flex items-center gap-2 p-4 text-sm text-status-danger">
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
      )}

      {editor && !pdfData && (
        <LinkDialog
          editor={editor}
          open={linkDialogOpen}
          onOpenChange={setLinkDialogOpen}
        />
      )}
    </div>
  );
}
