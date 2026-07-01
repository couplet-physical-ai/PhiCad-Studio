import { useCallback, useState, useEffect, useRef } from "react";
import { Search, Plus, Loader2, FileText, X } from "lucide-react";
import { Button } from "@shared/frontend/ui/button";
import { PageTree } from "./PageTree";
import { useKnowledgeApi } from "../../hooks";
import { useTreeStore } from "../../stores/tree-store";
import type { PageSearchResult } from "../../shared/types";

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
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PageSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const refreshToken = useTreeStore((state) => state.refreshToken);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const isInSearchMode = searchQuery.length >= 2;

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-muted/5">
      <div className="flex items-center gap-1 border-b border-border p-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 w-full rounded-md bg-transparent pl-8 pr-7 text-sm text-foreground placeholder:text-muted-foreground focus:bg-accent/30 focus:outline-none"
          />
          {searchQuery && (
            <button
              onClick={handleClearSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          icon={isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          onClick={handleCreatePage}
          disabled={isCreating}
          aria-label="New page"
        />
      </div>

      {isInSearchMode ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {isSearching ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : searchResults.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">
              No pages found for "{searchQuery}"
            </p>
          ) : (
            <div className="space-y-1">
              {searchResults.map((result) => (
                <button
                  key={result.id}
                  onClick={() => handleSelectSearchResult(result.id)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent/50"
                >
                  <span className="shrink-0 text-base leading-none">
                    {result.icon || (
                      <FileText className="h-4 w-4 text-muted-foreground" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium">
                      {result.title}
                    </p>
                    {result.breadcrumb && result.breadcrumb.length > 0 && (
                      <p className="truncate text-[11px] text-muted-foreground">
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
