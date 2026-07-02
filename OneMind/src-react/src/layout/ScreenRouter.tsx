import { useEffect } from "react";
import {
  useNavigationStore,
  initializeNavigationFromHash,
  setupHashChangeListener,
} from "@/stores/navigation-store";
import { HomeScreen } from "@/screens/HomeScreen";
import { ChatScreen } from "@/screens/ChatScreen";
import { ProjectScreen } from "@/screens/ProjectScreen";
import { ProjectsListView } from "@/screens/ProjectsListView";

export function ScreenRouter() {
  const currentScreen = useNavigationStore((s) => s.currentScreen);

  useEffect(() => {
    initializeNavigationFromHash();
    return setupHashChangeListener();
  }, []);

  switch (currentScreen) {
    case "home":
      return <HomeScreen />;
    case "chat":
      return <ChatScreen />;
    case "projects":
      return <ProjectsListView />;
    case "project":
      return <ProjectScreen />;
    default:
      return <HomeScreen />;
  }
}
