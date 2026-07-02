import {
  MoreVertical,
  Plus,
  LayoutGrid,
  Pencil,
  Trash2,
  Copy,
  ChevronLeft,
} from "lucide-react";
import { useState } from "react";
import type { BrainstormBoard } from "../../shared/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface BoardListSidebarProps {
  boards: BrainstormBoard[];
  currentBoardId: string | null;
  onSelectBoard: (id: string) => void;
  onCreateBoard: () => void;
  onDeleteBoard: (id: string) => void;
  onRenameBoard: (id: string, title: string) => void;
}

export function BoardListSidebar({
  boards,
  currentBoardId,
  onSelectBoard,
  onCreateBoard,
  onDeleteBoard,
  onRenameBoard,
}: BoardListSidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [editingBoardId, setEditingBoardId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const handleStartRename = (board: BrainstormBoard) => {
    setEditingBoardId(board.id);
    setEditTitle(board.title);
  };

  const handleFinishRename = () => {
    if (editingBoardId && editTitle.trim()) {
      onRenameBoard(editingBoardId, editTitle.trim());
    }
    setEditingBoardId(null);
    setEditTitle("");
  };

  if (isCollapsed) {
    return (
      <div className="flex h-full w-12 flex-col items-center border-r border-border bg-background py-4">
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={onCreateBoard}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="New board"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            onClick={() => setIsCollapsed(false)}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Expand board list"
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 flex flex-1 flex-col gap-2">
          {boards.map((board) => (
            <button
              key={board.id}
              onClick={() => onSelectBoard(board.id)}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-md transition-colors",
                board.id === currentBoardId
                  ? "bg-primary/10 text-primary"
                  : "hover:bg-muted",
              )}
              title={board.title}
            >
              <span className="text-xs font-bold">{board.title[0]}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-64 flex-col border-r border-border bg-background">
      <div className="flex items-center justify-between border-b border-border p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Boards
        </h2>
        <div className="flex items-center gap-1">
          <button
            onClick={onCreateBoard}
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="New board"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            onClick={() => setIsCollapsed(true)}
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Collapse board list"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        <div className="flex flex-col gap-1">
          {boards.map((board) => (
            <div
              key={board.id}
              className={cn(
                "group flex items-center justify-between rounded-md px-3 py-2 text-sm transition-colors cursor-pointer",
                board.id === currentBoardId
                  ? "bg-primary/10 text-primary"
                  : "hover:bg-muted",
              )}
              onClick={() => onSelectBoard(board.id)}
            >
              {editingBoardId === board.id ? (
                <input
                  autoFocus
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onBlur={handleFinishRename}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleFinishRename();
                    if (e.key === "Escape") setEditingBoardId(null);
                  }}
                  className="flex-1 bg-transparent outline-none"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <>
                  <div className="flex items-center gap-2 overflow-hidden">
                    <LayoutGrid className="h-4 w-4 shrink-0 opacity-50" />
                    <span className="truncate font-medium">{board.title}</span>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-background/50 rounded"
                        onClick={(e) => e.stopPropagation()}
                        aria-label="Board actions"
                      >
                        <MoreVertical className="h-3 w-3" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartRename(board);
                        }}
                      >
                        <Pencil className="mr-2 h-4 w-4" />
                        Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                      >
                        <Copy className="mr-2 h-4 w-4" />
                        Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteBoard(board.id);
                        }}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
