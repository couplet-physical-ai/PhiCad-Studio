import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactElement,
} from "react";
import {
  ChevronDown,
  ExternalLink,
  MessageSquarePlus,
  Wrench,
  X,
} from "lucide-react";
import { ModelSelectorPill } from "./components/ModelSelectorPill";
import { ChatComposer } from "./components/ChatComposer";
import type { MentionReference } from "./types/mention";
import { contextBudgetKb } from "./components/chat-format";
import { useNavigationStore } from "../../../core/frontend/src/stores/navigation-store";
import { useAuth } from "../../../core/frontend/src/cloud/AuthProvider";
import { readCloudConfig } from "../../../core/frontend/src/cloud/config";
import { cloudApi } from "../../../core/frontend/src/cloud/cloud-api";
import { useFeatureFlag } from "../../../core/frontend/src/feature-flags";
import type { CopilotUsageFrameData, WalletBalance } from "@openpcb/contracts";

const QUICK_ACTIONS = [
  "Wire the schematic",
  "Resolve BOM",
  "Run ERC",
  "Suggest improvements",
];
import type {
  AssistantChat,
  AssistantMessage,
  AssistantMessagesPage,
  AssistantPromptPresetId,
  AssistantProviderConfig,
  AssistantProviderModel,
  AssistantSettings,
  AssistantToolEventDto,
  AssistantWriteProposalDto,
  SubmitAssistantMessageResult,
} from "../../../sdks/assistant";
import type { Task, TaskEvent } from "../../../sdks/tasks";
import { MessageCard } from "./components/MessageCard";
import type {
  ActiveRunState,
  ActiveRunStatus,
} from "./components/AssistantRunStatusCard";
import { CopilotPlanCard } from "./components/CopilotPlanCard";
import { useAssistantStream } from "./hooks/useAssistantStream";
import { isNearBottom, useScrollAnchor } from "./hooks/useScrollAnchor";

interface DesignerChatDockProps {
  backendURL: string | null | undefined;
  designId: string | null;
  designName: string | null;
  designRevision: number | null;
  onClose(): void;
  onOpenFull(chatId: string): void;
  onDesignChanged(change?: {
    kind: "applied" | "rejected" | "tool";
    designId?: string;
    revision?: number;
  }): void;
}

function headers(): HeadersInit {
  return { "content-type": "application/json" };
}

function navigateFromMention(
  mention: MentionReference,
  navigateToModule: (
    moduleId: string,
    designId?: string,
    params?: Record<string, string>,
  ) => void,
): void {
  switch (mention.entityType) {
    case "knowledge-page":
      navigateToModule("knowledge", undefined, { pageId: mention.entityId });
      break;
    case "library-component":
      navigateToModule("library", undefined, { componentId: mention.entityId });
      break;
    case "design":
      navigateToModule("designer", mention.entityId);
      break;
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      detail?: string;
      error?: string;
      title?: string;
    };
    throw new Error(
      body.detail ?? body.error ?? body.title ?? `HTTP ${response.status}`,
    );
  }
  return response.json() as Promise<T>;
}

function taskStage(task: Task | TaskEvent): {
  status: ActiveRunStatus;
  stage: string;
  error: string | null;
} {
  const status = "status" in task ? task.status : undefined;
  switch (status) {
    case "queued":
    case "pending":
      return { status: "queued", stage: "Assistant is queued…", error: null };
    case "running":
      return { status: "running", stage: "Assistant is working…", error: null };
    case "streaming":
      return { status: "streaming", stage: "Writing response…", error: null };
    case "completed":
      return { status: "completed", stage: "Completed", error: null };
    case "cancelled":
      return {
        status: "cancelled",
        stage: "Assistant task cancelled.",
        error: null,
      };
    case "failed":
      return {
        status: "failed",
        stage: "Assistant stopped before completing.",
        error: "error" in task ? (task.error?.message ?? null) : null,
      };
    default:
      return { status: "running", stage: "Assistant is working…", error: null };
  }
}

// Persisted chat-mode choice. Signed-in Pro users default to Cloud Copilot; the
// stored value only records an *explicit* override (so a Pro user who switches
// back to Local BYOK keeps that on reload). null ⇒ follow the smart default.
const CHAT_MODE_STORAGE_KEY = "openpcb.assistant.chatMode";

function readStoredChatMode(): "local" | "cloud" | null {
  try {
    const value = window.localStorage.getItem(CHAT_MODE_STORAGE_KEY);
    return value === "local" || value === "cloud" ? value : null;
  } catch {
    return null;
  }
}

export function DesignerChatDock({
  backendURL,
  designId,
  designName,
  designRevision,
  onClose,
  onOpenFull,
  onDesignChanged,
}: DesignerChatDockProps): ReactElement {
  const navigateToModule = useNavigationStore((s) => s.navigateToModule);
  const assistantBase = useMemo(
    () => (backendURL ? `${backendURL}/api/modules/assistant` : null),
    [backendURL],
  );
  const tasksBase = useMemo(
    () => (backendURL ? `${backendURL}/api/modules/tasks` : null),
    [backendURL],
  );
  const [chats, setChats] = useState<AssistantChat[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [toolEvents, setToolEvents] = useState<AssistantToolEventDto[]>([]);
  const [writeProposals, setWriteProposals] = useState<
    AssistantWriteProposalDto[]
  >([]);
  const [providers, setProviders] = useState<AssistantProviderConfig[]>([]);
  const [models, setModels] = useState<AssistantProviderModel[]>([]);
  const [settings, setSettings] = useState<AssistantSettings | null>(null);
  const [providerId, setProviderId] = useState("openai");
  const [model, setModel] = useState("gpt-4o-mini");
  const [promptPresetId, setPromptPresetId] =
    useState<AssistantPromptPresetId>("strict-grounded");
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // S6 cloud chat mode: offered only when the flag is on, a copilot URL is
  // configured, and the user has a cloud session (bearer to forward).
  const cloudCopilotFlag = useFeatureFlag("cloud.copilot");
  const { session, tier } = useAuth();
  const cloudCfg = useMemo(() => readCloudConfig(), []);
  // Pro-tier gate (UX): copilot is a pro feature. The cloud-copilot service enforces
  // tier=pro server-side (the real boundary); this just hides a dead toggle for non-pro.
  const cloudModeAvailable =
    cloudCopilotFlag &&
    Boolean(cloudCfg.copilotUrl) &&
    Boolean(session) &&
    tier === "pro";
  // Explicit user override (persisted); null ⇒ follow the default. When cloud is
  // available the default is "cloud" (Pro users get Cloud Copilot by default);
  // otherwise it falls back to Local. Derived — no effect needed, so it settles
  // correctly once the async cloud session/tier resolves.
  const [chatModeOverride, setChatModeOverride] = useState<
    "local" | "cloud" | null
  >(() => readStoredChatMode());
  const chooseChatMode = useCallback((mode: "local" | "cloud") => {
    setChatModeOverride(mode);
    try {
      window.localStorage.setItem(CHAT_MODE_STORAGE_KEY, mode);
    } catch {
      // ignore persistence failures (e.g. storage disabled)
    }
  }, []);
  const effectiveMode: "local" | "cloud" =
    cloudModeAvailable && (chatModeOverride ?? "cloud") === "cloud"
      ? "cloud"
      : "local";
  const [menuOpen, setMenuOpen] = useState(false);
  const [toolCount, setToolCount] = useState<number | null>(null);
  const [activeRunsByChat, setActiveRunsByChat] = useState<
    Record<string, ActiveRunState>
  >({});
  // S7: cloud run + plan-refetch trigger per chat (set from {_copilotFrame}s).
  const [cloudRunsByChat, setCloudRunsByChat] = useState<
    Record<string, { cloudRunId: string; refreshKey: number }>
  >({});
  // Remaining Cloud AI credits: seeded from the wallet on mount, live-updated
  // from `copilot.usage` frames. null ⇒ no indicator (local/unlimited).
  const [credits, setCredits] = useState<{
    remaining: number;
    low: boolean;
  } | null>(null);
  // Set by a `run.warning{code:'budget_credits'}` frame — shows the top-up CTA.
  const [budgetHit, setBudgetHit] = useState(false);
  // Cloud Copilot requires the bound design to be cloud-linked (the agent reads
  // the synced projection). null ⇒ unknown/loading; false ⇒ show the sync prompt.
  const [cloudLinked, setCloudLinked] = useState<boolean | null>(null);
  const [linking, setLinking] = useState(false);
  const [messagesPage, setMessagesPage] = useState({
    oldestCursor: null as string | null,
    hasMore: false,
    loadingOlder: false,
    initialLoadedChatId: null as string | null,
  });
  const activeChatIdRef = useRef<string | null>(null);
  const topSentinelRef = useRef<HTMLDivElement | null>(null);
  const scroll = useScrollAnchor();

  const selectedRun = selectedChatId
    ? activeRunsByChat[selectedChatId]
    : undefined;
  const selectedCloudRun = selectedChatId
    ? cloudRunsByChat[selectedChatId]
    : undefined;
  const cloudActionHeaders = useMemo(() => {
    if (!session || !cloudCfg.copilotUrl) return null;
    const headers: Record<string, string> = {
      "x-cloud-bearer": session.access_token,
      "x-cloud-copilot-url": cloudCfg.copilotUrl,
    };
    if (cloudCfg.apiUrl) headers["x-cloud-api-url"] = cloudCfg.apiUrl;
    return headers;
  }, [session, cloudCfg]);
  const designerBase = useMemo(
    () => (backendURL ? `${backendURL}/api/modules/designer` : null),
    [backendURL],
  );
  // In cloud mode, read whether the bound design is cloud-linked so we can prompt
  // the user to sync before the agent run (which would otherwise fail "not linked").
  useEffect(() => {
    if (effectiveMode !== "cloud" || !designerBase || !designId) {
      setCloudLinked(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `${designerBase}/designs/${encodeURIComponent(designId)}/cloud-link`,
        );
        if (cancelled) return;
        if (!res.ok) {
          setCloudLinked(null);
          return;
        }
        const body = (await res.json()) as {
          data?: { link?: unknown } | null;
          link?: unknown;
        };
        const link = body.data?.link ?? body.link ?? null;
        if (!cancelled) setCloudLinked(Boolean(link));
      } catch {
        if (!cancelled) setCloudLinked(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [effectiveMode, designerBase, designId, designRevision]);

  const linkDesignForCloud = useCallback(async () => {
    if (!designerBase || !designId || !cloudActionHeaders) return;
    setLinking(true);
    setError(null);
    try {
      const res = await fetch(
        `${designerBase}/designs/${encodeURIComponent(designId)}/cloud-link`,
        {
          method: "POST",
          headers: { ...cloudActionHeaders, "content-type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      if (!res.ok) {
        const detail = await res
          .json()
          .then((b: { detail?: string; title?: string }) => b.detail ?? b.title)
          .catch(() => null);
        throw new Error(detail ?? `Sync failed (HTTP ${res.status})`);
      }
      setCloudLinked(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLinking(false);
    }
  }, [designerBase, designId, cloudActionHeaders]);

  const selectedProvider =
    providers.find((provider) => provider.id === providerId) ?? null;
  const selectedChat = chats.find((chat) => chat.id === selectedChatId) ?? null;
  const toolEventsByMessage = useMemo(() => {
    const map = new Map<string, AssistantToolEventDto[]>();
    for (const event of toolEvents) {
      if (!event.messageId) continue;
      const list = map.get(event.messageId) ?? [];
      list.push(event);
      map.set(event.messageId, list);
    }
    return map;
  }, [toolEvents]);

  const updateRun = useCallback(
    (chatId: string, patch: Partial<ActiveRunState>) => {
      setActiveRunsByChat((prev) => {
        const current = prev[chatId];
        if (!current) return prev;
        return {
          ...prev,
          [chatId]: {
            ...current,
            ...patch,
            lastEventAt: new Date().toISOString(),
          },
        };
      });
    },
    [],
  );

  const mergeToolEvents = useCallback((incoming: AssistantToolEventDto[]) => {
    setToolEvents((prev) => {
      const map = new Map(prev.map((event) => [event.id, event]));
      for (const event of incoming) map.set(event.id, event);
      return [...map.values()].sort((a, b) =>
        a.createdAt.localeCompare(b.createdAt),
      );
    });
  }, []);

  const refreshConfig = useCallback(async () => {
    if (!assistantBase) return;
    const [nextSettings, nextProviders] = await Promise.all([
      api<AssistantSettings>(`${assistantBase}/settings`),
      api<AssistantProviderConfig[]>(`${assistantBase}/providers`),
    ]);
    setSettings(nextSettings);
    setProviders(nextProviders);
    setPromptPresetId(nextSettings.defaultPromptPresetId);
    const provider =
      nextProviders.find(
        (entry) => entry.id === nextSettings.defaultProviderId,
      ) ?? nextProviders[0];
    if (provider) {
      setProviderId(provider.id);
      setModel(provider.defaultModel);
    }
  }, [assistantBase]);

  const refreshDesignChats = useCallback(async () => {
    if (!assistantBase || !designId) return;
    const data = await api<AssistantChat[]>(
      `${assistantBase}/design-chats?designId=${encodeURIComponent(designId)}`,
    );
    setChats(data);
    setSelectedChatId((current) => {
      const next =
        current && data.some((chat) => chat.id === current)
          ? current
          : (data[0]?.id ?? null);
      activeChatIdRef.current = next;
      return next;
    });
  }, [assistantBase, designId]);

  const createDesignChat = useCallback(async () => {
    if (!assistantBase || !designId) return null;
    const chat = await api<AssistantChat>(`${assistantBase}/design-chats`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        designId,
        providerConfigId: providerId,
        model,
        promptPresetId,
      }),
    });
    setChats((prev) => [chat, ...prev]);
    setSelectedChatId(chat.id);
    activeChatIdRef.current = chat.id;
    setMessages([]);
    setToolEvents([]);
    setWriteProposals([]);
    return chat;
  }, [assistantBase, designId, model, promptPresetId, providerId]);

  const ensureDesignChat = useCallback(async () => {
    if (activeChatIdRef.current) return activeChatIdRef.current;
    const chat = await createDesignChat();
    if (!chat) throw new Error("Open a design before chatting");
    return chat.id;
  }, [createDesignChat]);

  const refreshMessages = useCallback(
    async (chatId: string) => {
      if (!assistantBase) return [] as AssistantMessage[];
      const [page, proposals] = await Promise.all([
        api<AssistantMessagesPage>(
          `${assistantBase}/chats/${chatId}/messages?limit=50`,
        ),
        api<AssistantWriteProposalDto[]>(
          `${assistantBase}/chats/${chatId}/write-proposals`,
        ).catch(() => []),
      ]);
      const ids = page.items.map((message) => message.id);
      const events = ids.length
        ? await api<AssistantToolEventDto[]>(
            `${assistantBase}/chats/${chatId}/tool-events?messageIds=${encodeURIComponent(ids.join(","))}`,
          ).catch(() => [])
        : [];
      setMessages(page.items);
      setToolEvents(events);
      setWriteProposals(proposals);
      setMessagesPage({
        oldestCursor: page.nextCursor,
        hasMore: page.hasMore,
        loadingOlder: false,
        initialLoadedChatId: chatId,
      });
      requestAnimationFrame(scroll.scrollToBottom);
      return page.items;
    },
    [assistantBase, scroll.scrollToBottom],
  );

  const stream = useAssistantStream({
    backendUrl: backendURL,
    onChunkText: (ctx, delta) => {
      const near = scroll.scrollRef.current
        ? isNearBottom(scroll.scrollRef.current)
        : true;
      setMessages((prev) =>
        prev.map((message) =>
          message.id === ctx.assistantMessageId
            ? { ...message, content: message.content + delta }
            : message,
        ),
      );
      updateRun(ctx.chatId, {
        status: "streaming",
        currentStage: "Writing response…",
      });
      if (near) requestAnimationFrame(scroll.scrollToBottom);
    },
    onTaskEvent: (ctx, event) => {
      const mapped = taskStage(event);
      updateRun(ctx.chatId, {
        status: mapped.status,
        currentStage: mapped.stage,
        lastError: mapped.error,
      });
    },
    onCopilotFrame: (ctx, frame) => {
      // Live credit surfacing: advisory, no plan refetch.
      if (frame.type === "copilot.usage") {
        const usage = frame.data as Partial<CopilotUsageFrameData>;
        if (typeof usage.creditsRemaining === "number") {
          setCredits({
            remaining: usage.creditsRemaining,
            low: usage.lowBalance === true,
          });
        }
        return;
      }
      // Any other copilot-only frame both identifies the cloud run and
      // invalidates the plan view (plan created/updated/checkpoint, approval park).
      setCloudRunsByChat((prev) => {
        const current = prev[ctx.chatId];
        return {
          ...prev,
          [ctx.chatId]: {
            cloudRunId: frame.runId,
            refreshKey: (current?.refreshKey ?? 0) + 1,
          },
        };
      });
    },
    onAiEvent: (ctx, event) => {
      if (
        event.type === "run.warning" &&
        event.data.code === "budget_credits"
      ) {
        setBudgetHit(true);
      }
      if (!assistantBase) return;
      updateRun(ctx.chatId, {
        status: "tooling",
        currentStage: "Using OpenPCB tools…",
      });
      void api<AssistantToolEventDto[]>(
        `${assistantBase}/chats/${ctx.chatId}/tool-events`,
      )
        .then(mergeToolEvents)
        .catch(() => undefined);
      void api<AssistantWriteProposalDto[]>(
        `${assistantBase}/chats/${ctx.chatId}/write-proposals`,
      )
        .then(setWriteProposals)
        .catch(() => undefined);
    },
    onTerminal: (ctx, status, message) => {
      setLoading(false);
      if (status === "completed") {
        setActiveRunsByChat((prev) => {
          const next = { ...prev };
          delete next[ctx.chatId];
          return next;
        });
      } else {
        updateRun(ctx.chatId, {
          status: status === "cancelled" ? "cancelled" : "failed",
          currentStage: message ?? "Assistant stopped before completing.",
        });
      }
      if (activeChatIdRef.current === ctx.chatId)
        void refreshMessages(ctx.chatId);
      void refreshDesignChats();
    },
  });
  const openStream = stream.open;

  const restoreActiveTask = useCallback(
    async (chatId: string, items: AssistantMessage[]) => {
      if (!tasksBase) return;
      const latest = [...items]
        .reverse()
        .find((message) => message.role === "assistant" && message.taskId);
      if (!latest?.taskId) return;
      const task = await api<Task>(`${tasksBase}/tasks/${latest.taskId}`).catch(
        () => null,
      );
      if (!task || task.status === "completed") return;
      const mapped = taskStage(task);
      setActiveRunsByChat((prev) => ({
        ...prev,
        [chatId]: {
          chatId,
          taskId: task.id,
          assistantMessageId: latest.id,
          status: mapped.status,
          currentStage: mapped.stage,
          activeTools: [],
          lastError: mapped.error,
          userMessageContent: "",
          startedAt: task.startedAt ?? task.createdAt,
          lastEventAt: new Date().toISOString(),
        },
      }));
      if (!["failed", "cancelled", "paused"].includes(task.status))
        openStream({ chatId, taskId: task.id, assistantMessageId: latest.id });
    },
    [openStream, tasksBase],
  );

  useEffect(() => {
    void refreshConfig().catch((err: unknown) =>
      setError(err instanceof Error ? err.message : String(err)),
    );
  }, [refreshConfig]);

  useEffect(() => {
    if (!assistantBase) return;
    void api<unknown[]>(`${assistantBase}/tools`)
      .then((tools) => setToolCount(Array.isArray(tools) ? tools.length : null))
      .catch(() => setToolCount(null));
  }, [assistantBase]);

  // Baseline credit balance for cloud mode — seeds the composer footer before a
  // run; `copilot.usage` frames keep it live during one. Best-effort (frames are
  // the live source); a stale/failed read just leaves the last value.
  useEffect(() => {
    if (effectiveMode !== "cloud" || !assistantBase || !cloudActionHeaders)
      return;
    let cancelled = false;
    void (async () => {
      try {
        const ws = await cloudApi.personalWorkspace();
        const res = await fetch(
          `${assistantBase}/cloud/wallet?workspaceId=${encodeURIComponent(ws.id)}`,
          { headers: cloudActionHeaders },
        );
        if (cancelled || !res.ok) return;
        const wallet = (await res.json()) as WalletBalance;
        if (cancelled) return;
        setCredits(
          !wallet.unlimited && typeof wallet.balanceCredits === "number"
            ? { remaining: wallet.balanceCredits, low: wallet.lowBalance === true }
            : null,
        );
      } catch {
        // best-effort — live frames still update the indicator
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [effectiveMode, assistantBase, cloudActionHeaders]);

  const openDashboardBilling = useCallback(() => {
    const base = cloudCfg.webUrl.replace(/\/$/, "");
    if (!base) return;
    const url = `${base}/billing`;
    const electron = (
      window as unknown as {
        electronAPI?: { openExternal?: (u: string) => Promise<void> };
      }
    ).electronAPI;
    if (electron?.openExternal) void electron.openExternal(url);
    else window.open(url, "_blank", "noopener,noreferrer");
  }, [cloudCfg.webUrl]);

  useEffect(() => {
    setMessages([]);
    setToolEvents([]);
    setWriteProposals([]);
    setSelectedChatId(null);
    activeChatIdRef.current = null;
    if (designId)
      void refreshDesignChats().catch((err: unknown) =>
        setError(err instanceof Error ? err.message : String(err)),
      );
  }, [designId, refreshDesignChats]);

  useEffect(() => {
    if (!selectedChatId) return;
    activeChatIdRef.current = selectedChatId;
    const chat = chats.find((entry) => entry.id === selectedChatId);
    if (chat) {
      setProviderId(chat.providerConfigId);
      setModel(chat.model);
      setPromptPresetId(chat.promptPresetId);
    }
    void refreshMessages(selectedChatId).then((items) =>
      restoreActiveTask(selectedChatId, items),
    );
  }, [chats, refreshMessages, restoreActiveTask, selectedChatId]);

  useEffect(() => {
    if (!assistantBase || !providerId) return;
    void api<AssistantProviderModel[]>(
      `${assistantBase}/providers/${providerId}/models`,
    )
      .then(setModels)
      .catch(() => setModels([]));
  }, [assistantBase, providerId]);

  // Heal a chat pinned to a disabled/removed provider (mirrors Space.tsx): the
  // picker only lists enabled providers, so a stale id would otherwise stick and
  // every send would fail with "Provider disabled".
  useEffect(() => {
    if (providers.length === 0) return;
    const current = providers.find((entry) => entry.id === providerId);
    if (current?.enabled) return;
    const fallback =
      providers.find(
        (entry) => entry.id === settings?.defaultProviderId && entry.enabled,
      ) ?? providers.find((entry) => entry.enabled);
    if (fallback && fallback.id !== providerId) {
      setProviderId(fallback.id);
      setModel(fallback.defaultModel);
    }
  }, [providers, providerId, settings?.defaultProviderId]);

  const refreshChatModels = async (): Promise<void> => {
    if (!assistantBase || !providerId) return;
    const next = await api<AssistantProviderModel[]>(
      `${assistantBase}/providers/${providerId}/models/refresh`,
      { method: "POST", headers: headers() },
    );
    setModels(next);
  };

  useEffect(() => {
    const root = scroll.scrollRef.current;
    const target = topSentinelRef.current;
    if (!root || !target || !assistantBase || !selectedChatId) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (
          !entries.some((entry) => entry.isIntersecting) ||
          !messagesPage.hasMore ||
          messagesPage.loadingOlder ||
          !messagesPage.oldestCursor
        )
          return;
        setMessagesPage((prev) => ({ ...prev, loadingOlder: true }));
        scroll.captureBeforePrepend();
        void api<AssistantMessagesPage>(
          `${assistantBase}/chats/${selectedChatId}/messages?limit=50&before=${encodeURIComponent(messagesPage.oldestCursor)}`,
        )
          .then((page) => {
            const ids = page.items.map((message) => message.id);
            if (ids.length > 0) {
              void api<AssistantToolEventDto[]>(
                `${assistantBase}/chats/${selectedChatId}/tool-events?messageIds=${encodeURIComponent(ids.join(","))}`,
              )
                .then(mergeToolEvents)
                .catch(() => undefined);
            }
            setMessages((prev) => [...page.items, ...prev]);
            setMessagesPage({
              oldestCursor: page.nextCursor,
              hasMore: page.hasMore,
              loadingOlder: false,
              initialLoadedChatId: selectedChatId,
            });
          })
          .catch((err: unknown) =>
            setError(err instanceof Error ? err.message : String(err)),
          );
      },
      { root, threshold: 1 },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [
    assistantBase,
    mergeToolEvents,
    messagesPage.hasMore,
    messagesPage.loadingOlder,
    messagesPage.oldestCursor,
    scroll,
    selectedChatId,
  ]);

  useLayoutEffect(() => {
    if (messagesPage.initialLoadedChatId === selectedChatId)
      scroll.restoreAfterPrepend();
  }, [
    messages.length,
    messagesPage.initialLoadedChatId,
    scroll,
    selectedChatId,
  ]);

  const submit = async (event?: FormEvent, contentOverride?: string) => {
    event?.preventDefault();
    const content = (contentOverride ?? input).trim();
    if (!assistantBase || !content || !designId) return;
    // Cloud runs need a cloud-linked design; prompt to sync instead of firing a
    // run that would fail "not linked". Only block when confirmed unlinked.
    if (effectiveMode === "cloud" && cloudLinked === false) {
      setError(
        "Sync this design to the cloud to use Cloud Copilot (Sync button above), or switch to Local.",
      );
      return;
    }
    setLoading(true);
    setError(null);
    setBudgetHit(false);
    try {
      const chatId = await ensureDesignChat();
      const cloudMode = effectiveMode === "cloud";
      const submitHeaders: Record<string, string> = {
        "content-type": "application/json",
      };
      if (cloudMode && session) {
        // Per-request cloud creds (never stored by the backend raw — the task
        // payload carries them AES-GCM sealed; see backend cloud/token-crypto).
        submitHeaders["x-cloud-bearer"] = session.access_token;
        submitHeaders["x-cloud-api-url"] = cloudCfg.apiUrl;
        submitHeaders["x-cloud-copilot-url"] = cloudCfg.copilotUrl;
      }
      const result = await api<SubmitAssistantMessageResult>(
        `${assistantBase}/chats/${chatId}/messages`,
        {
          method: "POST",
          headers: submitHeaders,
          body: JSON.stringify({
            content,
            providerConfigId: providerId,
            model,
            promptPresetId,
            ...(cloudMode ? { mode: "cloud" as const } : {}),
          }),
        },
      );
      setInput("");
      setSelectedChatId(result.chat.id);
      activeChatIdRef.current = result.chat.id;
      setActiveRunsByChat((prev) => ({
        ...prev,
        [result.chat.id]: {
          chatId: result.chat.id,
          taskId: result.taskId,
          assistantMessageId: result.assistantMessage.id,
          status: "queued",
          currentStage: "Assistant is queued…",
          activeTools: [],
          lastError: null,
          userMessageContent: content,
          startedAt: new Date().toISOString(),
          lastEventAt: new Date().toISOString(),
        },
      }));
      await refreshMessages(result.chat.id);
      openStream({
        chatId: result.chat.id,
        taskId: result.taskId,
        assistantMessageId: result.assistantMessage.id,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  };

  const stopRun = useCallback(
    async (run: ActiveRunState) => {
      if (!tasksBase) return;
      await api<{ ok: true }>(`${tasksBase}/tasks/${run.taskId}/cancel`, {
        method: "POST",
      });
      updateRun(run.chatId, {
        status: "cancelled",
        currentStage: "Assistant task cancelled.",
      });
    },
    [tasksBase, updateRun],
  );

  const renameChat = useCallback(
    async (chatId: string) => {
      if (!assistantBase) return;
      const chat = chats.find((entry) => entry.id === chatId);
      const title = window.prompt("Rename chat", chat?.title ?? "");
      if (title === null) return;
      const normalized = title.trim();
      if (!normalized) return;
      const updated = await api<AssistantChat>(
        `${assistantBase}/chats/${chatId}`,
        {
          method: "PATCH",
          headers: headers(),
          body: JSON.stringify({ title: normalized }),
        },
      );
      setChats((prev) =>
        prev.map((entry) => (entry.id === updated.id ? updated : entry)),
      );
    },
    [assistantBase, chats],
  );

  const deleteChat = useCallback(
    async (chatId: string) => {
      if (!assistantBase) return;
      const chat = chats.find((entry) => entry.id === chatId);
      if (!window.confirm(`Delete "${chat?.title ?? "chat"}"?`)) return;
      await api<{ ok: true }>(`${assistantBase}/chats/${chatId}`, {
        method: "DELETE",
      });
      if (selectedChatId === chatId) {
        setMessages([]);
        setToolEvents([]);
        setWriteProposals([]);
        setSelectedChatId(null);
        activeChatIdRef.current = null;
      }
      await refreshDesignChats();
    },
    [assistantBase, chats, refreshDesignChats, selectedChatId],
  );

  if (!designId) {
    return (
      <EmptyDock
        onClose={onClose}
        message="Open or create a design to use Designer Chat."
      />
    );
  }

  return (
    <aside className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden border-l border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100">
      {/* Compact 2-row header (was 4 rows of chrome). */}
      <div className="shrink-0 border-b border-slate-200 p-2.5 dark:border-slate-800">
        <div className="flex items-center gap-1.5">
          <div className="relative min-w-0 flex-1">
            <button
              type="button"
              onClick={() => setMenuOpen((value) => !value)}
              className="flex w-full items-center justify-between gap-2 rounded border border-slate-200 px-2 py-1 text-left text-xs hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900"
            >
              <span className="truncate">
                {selectedChat?.title ?? "No chat yet"}
                {chats.length > 1 ? (
                  <span className="ml-1 text-[10px] text-slate-500">
                    · {chats.length} chats
                  </span>
                ) : null}
              </span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            </button>
            {menuOpen ? (
              <ThreadMenu
                chats={chats}
                selectedChatId={selectedChatId}
                onSelect={(id) => {
                  setSelectedChatId(id);
                  setMenuOpen(false);
                }}
                onNew={() =>
                  void createDesignChat().finally(() => setMenuOpen(false))
                }
                onRename={(id) =>
                  void renameChat(id)
                    .catch((err: unknown) =>
                      setError(
                        err instanceof Error ? err.message : String(err),
                      ),
                    )
                    .finally(() => setMenuOpen(false))
                }
                onDelete={(id) =>
                  void deleteChat(id)
                    .catch((err: unknown) =>
                      setError(
                        err instanceof Error ? err.message : String(err),
                      ),
                    )
                    .finally(() => setMenuOpen(false))
                }
              />
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => void createDesignChat()}
            className="rounded border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900"
            title="New design chat"
          >
            <MessageSquarePlus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => selectedChatId && onOpenFull(selectedChatId)}
            disabled={!selectedChatId}
            className="rounded border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-800 dark:hover:bg-slate-900"
            title="Open in Assistant view"
            aria-label="Open in Assistant view"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-100 dark:border-slate-800 dark:hover:bg-slate-900"
            title="Close chat"
            aria-label="Close chat"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <ModelSelectorPill
            providers={providers}
            providerId={providerId}
            onProviderChange={(id) => {
              chooseChatMode("local");
              setProviderId(id);
            }}
            model={model}
            onModelChange={setModel}
            models={models}
            onRefreshModels={() =>
              void refreshChatModels().catch((err: unknown) =>
                setError(err instanceof Error ? err.message : String(err)),
              )
            }
            presets={[]}
            promptPresetId={promptPresetId}
            onPresetChange={setPromptPresetId}
            selectedProvider={selectedProvider}
            align="left"
            cloudAvailable={cloudModeAvailable}
            cloudSelected={effectiveMode === "cloud"}
            onSelectCloud={() => chooseChatMode("cloud")}
          />
          {toolCount !== null ? (
            <span
              className="inline-flex shrink-0 items-center gap-1 rounded-control border border-slate-200 px-1.5 py-1 text-[10px] text-slate-500 dark:border-slate-700"
              title={`${toolCount} grounded tools`}
            >
              <Wrench className="h-3 w-3 text-status-success" />
              {toolCount}
            </span>
          ) : null}
          <span className="ml-auto shrink-0 text-[10px] text-slate-500">
            {relativeTime(
              selectedChat?.lastMessageAt ?? selectedChat?.updatedAt ?? null,
            )}
          </span>
        </div>
      </div>
      <div
        ref={scroll.scrollRef}
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain"
      >
        <div ref={topSentinelRef} className="h-px" />
        {messagesPage.loadingOlder ? (
          <div className="p-2 text-center text-xs text-slate-500">
            Loading older messages…
          </div>
        ) : null}
        {error ? (
          <div className="m-3 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {error}
          </div>
        ) : null}
        {effectiveMode === "cloud" && cloudLinked === false ? (
          <div className="m-3 flex items-center justify-between gap-2 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
            <span>Sync this design to the cloud to use Cloud Copilot.</span>
            <button
              type="button"
              onClick={() => void linkDesignForCloud()}
              disabled={linking || !cloudActionHeaders}
              className="shrink-0 rounded-control bg-amber-600 px-2 py-1 font-medium text-white hover:bg-amber-500 disabled:opacity-50"
            >
              {linking ? "Syncing…" : "Sync design"}
            </button>
          </div>
        ) : null}
        {messages.length === 0 ? (
          <div className="p-4 text-sm text-slate-500">
            Ask about the active design, components, nets, ERC, or PCB layout.
          </div>
        ) : (
          (() => {
            const visible = messages.filter(
              (message) =>
                message.role !== "tool" &&
                message.metadata?.ai?.internal !== true,
            );
            const lastAssistantIdx = (() => {
              for (let i = visible.length - 1; i >= 0; i--) {
                if (visible[i]!.role === "assistant") return i;
              }
              return -1;
            })();
            return visible.map((message, idx) => (
              <MessageCard
                key={message.id}
                message={message}
                toolEvents={toolEventsByMessage.get(message.id) ?? []}
                assistantBaseUrl={assistantBase}
                backendURL={backendURL}
                writeProposals={writeProposals}
                onProposalChanged={(change) => {
                  if (selectedChatId) void refreshMessages(selectedChatId);
                  onDesignChanged(change);
                }}
                runState={
                  selectedRun?.assistantMessageId === message.id
                    ? selectedRun
                    : null
                }
                onStopRun={(run) =>
                  void stopRun(run).catch((err: unknown) =>
                    setError(err instanceof Error ? err.message : String(err)),
                  )
                }
                onSendPrompt={
                  selectedRun || loading
                    ? undefined
                    : (prompt) => void submit(undefined, prompt)
                }
                onMentionClick={(mention) =>
                  navigateFromMention(mention, navigateToModule)
                }
                loading={
                  loading &&
                  idx === lastAssistantIdx &&
                  message.role === "assistant"
                }
                compact
              />
            ));
          })()
        )}
        {selectedChatId && selectedCloudRun && cloudActionHeaders && assistantBase ? (
          <div className="p-2">
            <CopilotPlanCard
              assistantBase={assistantBase}
              chatId={selectedChatId}
              cloudRunId={selectedCloudRun.cloudRunId}
              refreshKey={selectedCloudRun.refreshKey}
              cloudHeaders={cloudActionHeaders}
              onError={setError}
            />
          </div>
        ) : null}
      </div>
      <div className="shrink-0 border-t border-slate-200 p-2.5 dark:border-slate-800">
        {budgetHit ? (
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200">
            <span className="flex-1">
              Out of Cloud AI credits — this run may stop early.
            </span>
            <button
              type="button"
              onClick={openDashboardBilling}
              className="inline-flex shrink-0 items-center gap-1 rounded bg-amber-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-amber-700"
            >
              <ExternalLink className="h-3 w-3" /> Top up in dashboard
            </button>
          </div>
        ) : null}
        <ChatComposer
          value={input}
          onChange={setInput}
          onSubmit={() => void submit()}
          onStop={
            selectedRun
              ? () =>
                  void stopRun(selectedRun).catch((err: unknown) =>
                    setError(err instanceof Error ? err.message : String(err)),
                  )
              : undefined
          }
          busy={loading}
          placeholder="Ask about this design…"
          toolCount={toolCount ?? undefined}
          contextBudgetKb={contextBudgetKb(settings?.contextSizePreference)}
          quickActions={QUICK_ACTIONS}
          backendURL={backendURL}
          workspaceId="default"
          chatId={selectedChatId ?? undefined}
          creditsRemaining={
            effectiveMode === "cloud" ? (credits?.remaining ?? null) : null
          }
          lowBalance={credits?.low ?? false}
          compact
        />
      </div>
    </aside>
  );
}

function EmptyDock({
  onClose,
  message,
}: {
  onClose(): void;
  message: string;
}): ReactElement {
  return (
    <aside className="flex h-full w-full min-w-0 flex-col overflow-hidden border-l border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-center justify-between border-b border-slate-200 p-3 dark:border-slate-800">
        <div className="text-sm font-semibold">Chat</div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-900"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-slate-500">
        {message}
      </div>
    </aside>
  );
}

function ThreadMenu({
  chats,
  selectedChatId,
  onSelect,
  onNew,
  onRename,
  onDelete,
}: {
  chats: AssistantChat[];
  selectedChatId: string | null;
  onSelect(id: string): void;
  onNew(): void;
  onRename(id: string): void;
  onDelete(id: string): void;
}): ReactElement {
  return (
    <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-auto rounded border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-800 dark:bg-slate-950">
      <button
        type="button"
        onClick={onNew}
        className="w-full rounded px-2 py-1.5 text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-900"
      >
        New chat for this design
      </button>
      {chats.map((chat) => (
        <div
          key={chat.id}
          className={`rounded px-2 py-1.5 text-xs hover:bg-slate-100 dark:hover:bg-slate-900 ${chat.id === selectedChatId ? "bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-200" : ""}`}
        >
          <button
            type="button"
            onClick={() => onSelect(chat.id)}
            className="w-full text-left"
          >
            <div className="truncate">{chat.title}</div>
            <div className="truncate text-[10px] text-slate-500">
              {chat.model}
            </div>
          </button>
          <div className="mt-1 flex gap-2 text-[10px]">
            <button
              type="button"
              onClick={() => onRename(chat.id)}
              className="text-slate-500 hover:text-violet-600"
            >
              Rename
            </button>
            <button
              type="button"
              onClick={() => onDelete(chat.id)}
              className="text-red-500 hover:text-red-600"
            >
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function relativeTime(iso: string | null): string {
  if (!iso) return "new";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}
