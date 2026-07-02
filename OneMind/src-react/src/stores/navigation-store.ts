import { create } from "zustand";

export type Screen = "home" | "chat" | "project" | "projects";

interface NavigationState {
  currentScreen: Screen;
  chatId: string | null;
  currentProjectId: string | null;
  previousScreen: Screen | null;
  projectFilter: string | null;
  folderFilter: string | null;
  sidebarCollapsed: boolean;
  // Track if current chat was opened from a project
  chatProjectContext: string | null;

  setScreen: (screen: Screen) => void;
  navigateToHome: () => void;
  navigateToChat: (chatId: string | null, fromProjectId?: string | null) => void;
  navigateToNewChat: () => void;
  navigateToProjects: () => void;
  navigateToProject: (projectId: string) => void;
  navigateFromProject: () => void;
  navigateBackFromChat: () => void;
  setProjectFilter: (projectId: string | null) => void;
  setFolderFilter: (folderId: string | null) => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
}

const SIDEBAR_COLLAPSED_KEY = "onemind-sidebar-collapsed";

function getPersistedSidebarState(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
  } catch {
    return false;
  }
}

function persistSidebarState(collapsed: boolean): void {
  try {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
  } catch {
    /* empty */
  }
}

function updateUrlHash(
  chatId: string | null,
  projectId: string | null = null,
  projectsList = false,
): void {
  if (chatId) {
    window.location.hash = `#chat-${chatId}`;
  } else if (projectId) {
    window.location.hash = `#project-${projectId}`;
  } else if (projectsList) {
    window.location.hash = "#projects";
  } else {
    history.pushState(
      "",
      document.title,
      window.location.pathname + window.location.search,
    );
  }
}

export const useNavigationStore = create<NavigationState>((set, get) => ({
  currentScreen: "home",
  chatId: null,
  currentProjectId: null,
  previousScreen: null,
  projectFilter: null,
  folderFilter: null,
  sidebarCollapsed: getPersistedSidebarState(),
  chatProjectContext: null,

  setScreen: (screen) => set({ currentScreen: screen }),

  navigateToHome: () => {
    set({
      currentScreen: "home",
      chatId: null,
      currentProjectId: null,
      chatProjectContext: null,
    });
    updateUrlHash(null);
  },

  navigateToChat: (chatId, fromProjectId) => {
    set({
      currentScreen: "chat",
      chatId,
      currentProjectId: null,
      chatProjectContext: fromProjectId ?? null,
    });
    updateUrlHash(chatId);
  },

  navigateToNewChat: () => {
    set({
      currentScreen: "chat",
      chatId: null,
      currentProjectId: null,
      chatProjectContext: null,
    });
    updateUrlHash(null);
  },

  navigateToProjects: () => {
    set({
      currentScreen: "projects",
      chatId: null,
      currentProjectId: null,
      chatProjectContext: null,
    });
    updateUrlHash(null, null, true);
  },

  navigateToProject: (projectId) => {
    const current = get().currentScreen;
    set({
      previousScreen: current !== "project" ? current : get().previousScreen,
      currentScreen: "project",
      currentProjectId: projectId,
      chatId: null,
      chatProjectContext: null,
    });
    updateUrlHash(null, projectId);
  },

  navigateFromProject: () => {
    const previous = get().previousScreen;
    if (previous === "chat" && get().chatId) {
      get().navigateToChat(get().chatId);
    } else {
      get().navigateToHome();
    }
  },

  navigateBackFromChat: () => {
    const projectContext = get().chatProjectContext;
    if (projectContext) {
      set({
        currentScreen: "project",
        currentProjectId: projectContext,
        chatId: null,
        chatProjectContext: null,
      });
      updateUrlHash(null, projectContext);
    } else {
      get().navigateToHome();
    }
  },

  setProjectFilter: (projectId) => set({ projectFilter: projectId }),

  setFolderFilter: (folderId) => set({ folderFilter: folderId }),

  toggleSidebar: () => {
    const newState = !get().sidebarCollapsed;
    persistSidebarState(newState);
    set({ sidebarCollapsed: newState });
  },

  setSidebarCollapsed: (collapsed) => {
    persistSidebarState(collapsed);
    set({ sidebarCollapsed: collapsed });
  },
}));

export function initializeNavigationFromHash(): void {
  if (typeof window === "undefined") return;

  const hash = window.location.hash;
  if (hash.startsWith("#chat-")) {
    const chatId = hash.substring(6);
    useNavigationStore.getState().navigateToChat(chatId);
  } else if (hash === "#projects") {
    useNavigationStore.getState().navigateToProjects();
  } else if (hash.startsWith("#project-")) {
    const projectId = hash.substring(9);
    useNavigationStore.getState().navigateToProject(projectId);
  }
}

export function setupHashChangeListener(): () => void {
  const handleHashChange = () => {
    const hash = window.location.hash;
    const state = useNavigationStore.getState();

    if (hash.startsWith("#chat-")) {
      const chatId = hash.substring(6);
      if (chatId !== state.chatId) {
        useNavigationStore.setState({
          currentScreen: "chat",
          chatId,
          currentProjectId: null,
        });
      }
    } else if (hash === "#projects") {
      if (state.currentScreen !== "projects") {
        useNavigationStore.setState({
          currentScreen: "projects",
          chatId: null,
          currentProjectId: null,
          chatProjectContext: null,
        });
      }
    } else if (hash.startsWith("#project-")) {
      const projectId = hash.substring(9);
      if (projectId !== state.currentProjectId) {
        const current = state.currentScreen;
        useNavigationStore.setState({
          previousScreen: current !== "project" ? current : state.previousScreen,
          currentScreen: "project",
          currentProjectId: projectId,
          chatId: null,
          chatProjectContext: null,
        });
      }
    }
  };

  window.addEventListener("hashchange", handleHashChange);
  return () => window.removeEventListener("hashchange", handleHashChange);
}
