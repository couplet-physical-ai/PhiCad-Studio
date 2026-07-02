import React from "react";
import LeftSidebar from "./LeftSidebar";
import RightSidebar from "./RightSidebar";
import TopBar from "./TopBar";

import { Button } from "@/components/ui/button.tsx";
import {
  Settings,
  Home,
  MessageSquare,
  MessageCircleWarning,
  Briefcase,
} from "lucide-react";
import { SettingsDialog } from "@/settings";
import { FeedbackDialog } from "@/components/feedback/FeedbackDialog";
import { useHotkeys } from "react-hotkeys-hook";
import { getSpaceModules } from "@shared/generated/modules";
import { ModuleSpace } from "@/modules/ModuleSpace";
import { ScreenRouter } from "./ScreenRouter";
import { useNavigationStore } from "@/stores/navigation-store";
import { useSidebarButtons } from "@/contexts/SidebarButtonsContext";

import { ReconnectionOverlay } from "@/components/health/ReconnectionOverlay";
import { Toaster } from "@/components/ui/toaster";
import { UpdateChecker } from "@/components/update/UpdateChecker";
import { UpdateDialog } from "@/components/update/UpdateDialog";

export type LayoutProps = {
  children?: React.ReactNode;
};

export type SidebarButtons = {
  top?: React.ReactNode[];
  bottom?: React.ReactNode[];
};

export default function Layout({ children }: LayoutProps) {
  const spaceModules = getSpaceModules();
  const [settingsDialogOpen, setSettingsDialogOpen] = React.useState(false);
  const [feedbackDialogOpen, setFeedbackDialogOpen] = React.useState(false);
  const [activeSpaceId, setActiveSpaceId] = React.useState<string | null>(null);
  const { rightTop, rightBottom } = useSidebarButtons();

  const { navigateToHome, navigateToNewChat, navigateToProjects, currentScreen } =
    useNavigationStore();

  useHotkeys(["alt+s", "ctrl+,"], () => setSettingsDialogOpen(true), {
    enableOnFormTags: true,
    enableOnContentEditable: true,
    preventDefault: true,
    description: "Open settings",
  });

  useHotkeys(
    "mod+h",
    () => {
      setActiveSpaceId(null);
      navigateToHome();
    },
    {
      enableOnFormTags: true,
      preventDefault: true,
      description: "Go to home",
    },
  );

  useHotkeys(
    "mod+n",
    () => {
      setActiveSpaceId(null);
      navigateToNewChat();
    },
    {
      enableOnFormTags: true,
      preventDefault: true,
      description: "New chat",
    },
  );

  const mainContent = React.useMemo(() => {
    if (activeSpaceId) {
      return <ModuleSpace moduleId={activeSpaceId} />;
    }
    return children || <ScreenRouter />;
  }, [activeSpaceId, children]);

  return (
    <>
      <div className="grid h-screen grid-cols-[75px_1fr_75px] grid-rows-[auto_1fr]">
        <div className="col-span-3 row-start-1 z-20">
          <TopBar
            spaces={spaceModules}
            activeSpaceId={activeSpaceId}
            setActiveSpaceId={setActiveSpaceId}
          />
        </div>

        <LeftSidebar
          top={[
            <Button
              key="home-button"
              variant={
                activeSpaceId === null && currentScreen === "home"
                  ? "default"
                  : "ghost"
              }
              size="icon"
              className="rounded-lg"
              aria-label="Home"
              onClick={() => {
                setActiveSpaceId(null);
                navigateToHome();
              }}
            >
              <Home className="h-5 w-5" />
            </Button>,
            <Button
              key="chat-button"
              variant={
                activeSpaceId === null && currentScreen === "chat"
                  ? "default"
                  : "ghost"
              }
              size="icon"
              className="rounded-lg"
              aria-label="Chat"
              onClick={() => {
                setActiveSpaceId(null);
                navigateToNewChat();
              }}
            >
              <MessageSquare className="h-5 w-5" />
            </Button>,
            <Button
              key="projects-button"
              variant={
                activeSpaceId === null && currentScreen === "projects"
                  ? "default"
                  : "ghost"
              }
              size="icon"
              className="rounded-lg"
              aria-label="Projects"
              onClick={() => {
                setActiveSpaceId(null);
                navigateToProjects();
              }}
            >
              <Briefcase className="h-5 w-5" />
            </Button>,
          ]}
          bottom={[
              <Button
                  key="feedback-button"
                  variant="ghost"
                  size="icon"
                  className="rounded-lg"
                  aria-label="Feedback"
                  onClick={() => setFeedbackDialogOpen(true)}
              >
                  <MessageCircleWarning className="h-5 w-5" />
              </Button>,
            <Button
              key="settings-button"
              onClick={() => setSettingsDialogOpen(true)}
              variant="ghost"
              size="icon"
              className="rounded-lg"
              aria-label="Open settings"
            >
              <Settings className="h-5 w-5" />
            </Button>,
          ]}
        />

        <main className="col-start-2 border-t border-s border-e border-border row-start-2 min-h-0 overflow-auto rounded-t-lg bg-background">
          {mainContent}
        </main>

        <RightSidebar top={rightTop} bottom={rightBottom} />
      </div>

      <SettingsDialog
        open={settingsDialogOpen}
        onOpenChange={setSettingsDialogOpen}
      />
      <FeedbackDialog
        open={feedbackDialogOpen}
        onOpenChange={setFeedbackDialogOpen}
      />
      <ReconnectionOverlay />
      <Toaster />
      <UpdateChecker />
      <UpdateDialog />
    </>
  );
}
