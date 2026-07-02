import { useState, useRef, useCallback } from "react";
import { FileText, MoreVertical, Pencil, FolderInput, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { WriterDocument } from "../hooks/useWriterDocuments";

interface Project {
  id: string;
  name: string;
  color?: string | null;
}

interface DocumentCardProps {
  document: WriterDocument;
  projects?: Project[];
  selected?: boolean;
  selectionMode?: boolean;
  onOpen: (id: string) => void;
  onToggleSelect?: (id: string) => void;
  onRename: (id: string, newTitle: string) => void;
  onMoveToProject: (id: string, projectId: string | null) => void;
  onDelete: (id: string) => void;
}

function formatRelativeDate(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function DocumentCard({
  document,
  projects,
  selected,
  selectionMode,
  onOpen,
  onToggleSelect,
  onRename,
  onMoveToProject,
  onDelete,
}: DocumentCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [renameValue, setRenameValue] = useState(document.title);
  const menuClosedAt = useRef(0);
  const projectList = projects ?? [];

  const openRename = useCallback(() => {
    setRenameValue(document.title);
    setRenameOpen(true);
  }, [document.title]);

  const submitRename = useCallback(async () => {
    const nextTitle = renameValue.trim();
    if (!nextTitle) return;
    await onRename(document.id, nextTitle);
    setRenameOpen(false);
  }, [document.id, renameValue, onRename]);

  const confirmDelete = useCallback(async () => {
    await onDelete(document.id);
    setDeleteOpen(false);
  }, [document.id, onDelete]);

  const handleCardClick = useCallback(() => {
    // Block card click if dropdown was just open (within 200ms)
    if (Date.now() - menuClosedAt.current < 200) return;
    if (menuOpen || renameOpen || deleteOpen) return;
    if (selectionMode) {
      onToggleSelect?.(document.id);
    } else {
      onOpen(document.id);
    }
  }, [selectionMode, document.id, onOpen, onToggleSelect, menuOpen, renameOpen, deleteOpen]);

  const handleMenuOpenChange = useCallback((open: boolean) => {
    setMenuOpen(open);
    if (!open) {
      menuClosedAt.current = Date.now();
    }
  }, []);

  return (
    <div
      className={`group relative w-full rounded-lg border bg-card hover:bg-accent cursor-pointer transition-colors overflow-hidden ${
        selected ? "border-primary ring-1 ring-primary" : "border-border"
      }`}
      onClick={handleCardClick}
    >
      {/* Selection checkbox */}
      <div
        className={cn(
          "absolute top-2 left-2 z-10 transition-opacity",
          selectionMode || selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <Checkbox
          checked={!!selected}
          onCheckedChange={() => onToggleSelect?.(document.id)}
        />
      </div>

      {/* Thumbnail */}
      <div className="aspect-[3/4] flex items-center justify-center bg-neutral-100 dark:bg-neutral-800">
        <FileText className="h-8 w-8 text-muted-foreground/50" />
      </div>

      {/* Info */}
      <div className="px-3 pt-2">
        <p className="text-sm font-medium truncate">{document.title}</p>
      </div>
      <div className="px-3 pb-3">
        <p className="text-xs text-muted-foreground">
          {formatRelativeDate(document.updated_at)}
        </p>
      </div>

      {/* Context menu */}
      <DropdownMenu open={menuOpen} onOpenChange={handleMenuOpenChange}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Document actions"
            className="absolute top-2 right-2 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 backdrop-blur-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              openRename();
            }}
          >
            <Pencil className="h-4 w-4 mr-2" />
            Rename
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <FolderInput className="h-4 w-4 mr-2" />
              Move to Project
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  void onMoveToProject(document.id, null);
                }}
                disabled={!document.project_id}
              >
                No Project
              </DropdownMenuItem>
              {projectList.length > 0 && <DropdownMenuSeparator />}
              {projectList.map((project) => (
                <DropdownMenuItem
                  key={project.id}
                  onSelect={(e) => {
                    e.preventDefault();
                    void onMoveToProject(document.id, project.id);
                  }}
                  disabled={document.project_id === project.id}
                >
                  <span
                    className="h-2 w-2 rounded-full mr-2 shrink-0"
                    style={{ backgroundColor: project.color || "var(--color-primary)" }}
                  />
                  {project.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={(e) => {
              e.preventDefault();
              setDeleteOpen(true);
            }}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent showCloseButton={false} onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Rename document</DialogTitle>
            <DialogDescription>Enter a new title for this document.</DialogDescription>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void submitRename();
              }
            }}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                setRenameOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={(e) => {
                e.stopPropagation();
                void submitRename();
              }}
              disabled={!renameValue.trim()}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete document?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove "{document.title}" from this workspace.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={(e) => e.stopPropagation()}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.stopPropagation();
                void confirmDelete();
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
