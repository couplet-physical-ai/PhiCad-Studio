import {
  Search,
  Grid2X2,
  List,
  Scan,
  ChevronLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";

export type ViewMode = "canvas" | "list";

interface CanvasToolbarProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onSearch: (query: string) => void;
  onFitView: () => void; // For canvas fit view
  onHome?: () => void;
}

export function CanvasToolbar({
  viewMode,
  onViewModeChange,
  onSearch,
  onFitView,
  onHome,
}: CanvasToolbarProps) {
  return (
    <div className="flex h-12 items-center gap-2 border-b border-border bg-background px-4 py-2">
      <div className="flex items-center gap-1">
        {onHome && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={onHome}
                  aria-label="Back to boards"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Boards</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        <div className="flex items-center rounded-md border border-border  bg-muted/30 p-1">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => onViewModeChange("canvas")}
                  className={`flex h-7 w-7 items-center justify-center cursor-pointer rounded-sm transition-colors ${
                    viewMode === "canvas"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <Grid2X2 className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Canvas View</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => onViewModeChange("list")}
                  className={`flex h-7 w-7 items-center justify-center cursor-pointer rounded-sm transition-colors ${
                    viewMode === "list"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <List className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>List View</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      <Separator orientation="vertical" className="h-6" />
      <div className="relative flex-1 max-w-sm">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search ideas..."
          onChange={(e) => onSearch(e.target.value)}
          className="h-8 w-full bg-muted/30 pl-9"
          data-brainstorm-search
        />
      </div>
      <div className="flex-1" />
      <div className="flex items-center gap-1">
        {viewMode === "canvas" && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={onFitView}
                >
                  <Scan className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Fit to Screen</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    </div>
  );
}
