import { useCallback, useState, useEffect, useRef } from "react";
import { Search, Plus, Loader2, FileText, Upload, X } from "lucide-react";
import { Button } from "@shared/frontend/ui/button";
import { PageTree } from "./PageTree";
import { useKnowledgeApi } from "../../hooks";
import { useTreeStore } from "../../stores/tree-store";
import { fileToEditorContent } from "../../lib/import-content";
import type { PageSearchResult } from "../../../shared/types";

const IMPORT_ACCEPT =
  ".txt,.md,.markdown,.pdf,text/plain,text/markdown,application/pdf";

interface SidebarProps {
  onSelectPage: (id: string) => void;
  selectedPageId: string | null;
  onPageDeleted?: (id: string) => void;
  designId?: string | null;
}

export function Sidebar({
  onSelectPage,
  selectedPageId,
  onPageDeleted,
  designId,
}: SidebarProps) {
  const api = useKnowledgeApi();
  const [isCreating, setIsCreating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PageSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const refreshToken = useTreeStore((state) => state.refreshToken);
  const requestRefresh = useTreeStore((state) => state.requestRefresh);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const performSearch = useCallback(
    async (query: string) => {
      if (query.length < 2) {
        setSearchResults([]);
        setIsSearching(false);
        return;
      }
      setIsSearching(true);
      try {
        const results = await api.searchPages("default", query, "all");
        setSearchResults(results);
      } catch (err) {
        console.error("Search failed:", err);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    },
    [api],
  );

  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (searchQuery.length >= 2) {
      setIsSearching(true);
      searchTimerRef.current = setTimeout(() => performSearch(searchQuery), 300);
    } else {
      setSearchResults([]);
      setIsSearching(false);
    }
  }, [searchQuery, performSearch]);

  useEffect(() => {
    if (refreshToken > 0 && searchQuery.length >= 2) {
      void performSearch(searchQuery);
    }
  }, [refreshToken, searchQuery, performSearch]);

  const handleClearSearch = useCallback(() => {
    setSearchQuery("");
    setSearchResults([]);
  }, []);

  const handleSelectSearchResult = useCallback(
    (id: string) => {
      onSelectPage(id);
      handleClearSearch();
    },
    [onSelectPage, handleClearSearch],
  );

  const handleCreatePage = useCallback(async () => {
    setIsCreating(true);
    try {
      const page = await api.createPage({
        workspace_id: "default",
        project_id: designId ?? undefined,
        title: "Untitled",
      });
      if (page) {
        onSelectPage(page.id);
      }
    } catch (err) {
      console.error("Failed to create page:", err);
    } finally {
      setIsCreating(false);
    }
  }, [api, designId, onSelectPage]);

  const handleImportFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setIsImporting(true);
      let lastPageId: string | null = null;
      try {
        for (const file of Array.from(files)) {
          const isPdf =
            /\.pdf$/i.test(file.name) || file.type === "application/pdf";
          const page = isPdf
            ? await api.importPdf(file, { project_id: designId ?? undefined })
            : await (async () => {
                const { title, content } = await fileToEditorContent(file);
                return api.createPage({
                  workspace_id: "default",
                  project_id: designId ?? undefined,
                  title,
                  content,
                });
              })();
          if (page) lastPageId = page.id;
        }
        requestRefresh();
        if (lastPageId) onSelectPage(lastPageId);
      } catch (err) {
        console.error("Failed to import document:", err);
      } finally {
        setIsImporting(false);
      }
    },
    [api, designId, onSelectPage, requestRefresh],
  );

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const isInSearchMode = searchQuery.length >= 2;

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-surface-app">
      <div className="flex items-center gap-1 border-b border-slate-200 p-2 dark:border-slate-800">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-tertiary" />
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 w-full rounded-control border border-slate-300 bg-surface-input pl-8 pr-7 text-sm text-text-primary outline-none placeholder:text-text-tertiary focus:border-violet-500 focus:ring-1 focus:ring-violet-500 dark:border-slate-700"
          />
          {searchQuery && (
            <button
              onClick={handleClearSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          icon={
            isImporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )
          }
          onClick={handleImportClick}
          disabled={isImporting}
          title="Import .txt / .md / .pdf"
          aria-label="Import document"
        />
        <Button
          variant="ghost"
          size="sm"
          icon={isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          onClick={handleCreatePage}
          disabled={isCreating}
          aria-label="New page"
        />
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={IMPORT_ACCEPT}
          className="hidden"
          onChange={(e) => {
            void handleImportFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {isInSearchMode ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {isSearching ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-text-tertiary" />
            </div>
          ) : searchResults.length === 0 ? (
            <p className="py-8 text-center text-xs text-text-tertiary">
              No pages found for "{searchQuery}"
            </p>
          ) : (
            <div className="space-y-1">
              {searchResults.map((result) => (
                <button
                  key={result.id}
                  onClick={() => handleSelectSearchResult(result.id)}
                  className="flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left text-sm text-text-secondary hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <span className="shrink-0 text-base leading-none">
                    {result.icon || (
                      <FileText className="h-4 w-4 text-text-tertiary" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-text-primary">
                      {result.title}
                    </p>
                    {result.breadcrumb && result.breadcrumb.length > 0 && (
                      <p className="truncate text-[11px] text-text-tertiary">
                        {result.breadcrumb.join(" / ")}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">
            Pages
          </div>
          <PageTree
            selectedPageId={selectedPageId}
            onSelectPage={onSelectPage}
            onPageDeleted={onPageDeleted}
            designId={designId}
          />
        </div>
      )}
    </div>
  );
}
