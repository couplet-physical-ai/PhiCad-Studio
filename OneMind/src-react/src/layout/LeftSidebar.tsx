"use client";

import * as React from "react";
import { Settings, Plus } from "lucide-react";
import appIcon from "../assets/icon.png";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { WorkspaceManagerDialog } from "@/components/workspace/WorkspaceManagerDialog";
import { WorkspaceCreateDialog } from "@/components/workspace/WorkspaceCreateDialog";
import { useAppStore } from "@/stores/app-store";
import { SidebarButtons } from "@/layout/Layout.tsx";

export default function LeftSidebar({top, bottom}:SidebarButtons): React.ReactElement{
  const { workspaces, activeWorkspaceId, setActiveWorkspace } = useAppStore();

  const [managerDialogOpen, setManagerDialogOpen] = React.useState(false);
  const [createDialogOpen, setCreateDialogOpen] = React.useState(false);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = React.useState<string | null>(null);
  
  return (
    <aside className="col-start-1 row-start-2 flex flex-col justify-between bg-surface px-2 pb-3 pt-0 text-text-primary">
      <div className="flex flex-col items-center gap-4 pb-4">

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost_dark"
              size="icon"
              className="rounded-lg h-15 w-15"
              aria-label="workspaces"
            >
              <img src={appIcon} className="h-12 w-12" alt="App icon" />
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            side="right"
            align="start"
            className="bg-background border border-border text-foreground shadow-lg rounded-xl px-1 py-2"
          >
            <DropdownMenuLabel className="px-3 text-xs uppercase tracking-widest text-muted-foreground">
              Workspaces
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="my-1" />

            {/* Workspace List */}
            {workspaces.map((workspace) => {
              const isActive = activeWorkspaceId === workspace.id
              return (
                <DropdownMenuItem
                  key={workspace.id}
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-surface-muted focus:bg-surface-muted",
                    isActive ? "bg-surface text-text-primary" : "bg-background text-foreground"
                  )}
                  onSelect={(event) => {
                    const settingsTrigger = (event.target as HTMLElement).closest(
                      "[data-workspace-settings]"
                    );
                    if (settingsTrigger) {
                      event.preventDefault();
                      return;
                    }

                    setActiveWorkspace(workspace.id);
                  }}
                >
                  <span className="flex-1">{workspace.name}</span>
                  <span data-workspace-settings className="flex items-center">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9"
                      aria-label={`Workspace ${workspace.name} settings`}
                      onClick={(event) => {
                        event.stopPropagation();
                        event.preventDefault();
                        setSelectedWorkspaceId(workspace.id);
                        setManagerDialogOpen(true);
                      }}
                    >
                      <Settings className="h-4 w-4" />
                    </Button>
                  </span>
                </DropdownMenuItem>
              )
            })}

            {/* Create New Workspace Button */}
            <DropdownMenuSeparator className="my-1" />
            <DropdownMenuItem
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-surface-muted focus:bg-surface-muted"
              onSelect={() => setCreateDialogOpen(true)}
            >
              <Plus className="h-4 w-4" />
              <span>Create Workspace</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex flex-col gap-2">
            {top?.map((Button) => Button)}
        </div>

        {/* Module-specific LeftSidebar top buttons */}
      </div>

      <div className="flex flex-col items-center gap-2 py-4">
        {/* Module-specific LeftSidebar bottom buttons */}
        <div className="flex flex-col gap-2">
            {bottom?.map((Button) => Button)}
        </div>
      </div>

      {/* Workspace Manager Dialog */}
      {selectedWorkspaceId && (
        <WorkspaceManagerDialog
          workspaceId={selectedWorkspaceId}
          open={managerDialogOpen}
          onOpenChange={(open) => {
            setManagerDialogOpen(open);
            if (!open) setSelectedWorkspaceId(null);
          }}
        />
      )}

      {/* Workspace Create Dialog */}
      <WorkspaceCreateDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />
    </aside>
  );

}
