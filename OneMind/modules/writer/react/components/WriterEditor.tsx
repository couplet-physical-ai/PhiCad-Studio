import { useState, useEffect, useCallback, useRef } from "react";
import { useBackendURL } from "@/contexts/BackendURLContext";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2 } from "lucide-react";
import type { Editor } from "@tiptap/react";
import { TiptapEditor } from "../editor/TiptapEditor";
import { MenuBar } from "../editor/toolbar/MenuBar";
import { FormattingToolbar } from "../editor/toolbar/FormattingToolbar";
import { LinkDialog } from "../editor/LinkDialog";
import type { EditorContent } from "../editor/types";

type SaveStatus = "idle" | "saving" | "saved" | "error";
type PageMode = "pageless" | "paged";
type AiEditState = "idle" | "running";

interface WriterEditorProps {
  documentId: string;
  onBack?: () => void;
  externalRefreshToken?: number;
  aiEditState?: AiEditState;
}

export function WriterEditor({
  documentId,
  onBack,
  externalRefreshToken,
  aiEditState = "idle",
}: WriterEditorProps) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState<EditorContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [pageMode, setPageMode] = useState<PageMode>("pageless");
  const titleSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingTitleRef = useRef<string | null>(null);
  const pendingContentRef = useRef<EditorContent | null>(null);
  const contentSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const titleSaveAbortControllerRef = useRef<AbortController | null>(null);
  const contentSaveAbortControllerRef = useRef<AbortController | null>(null);
  const flushPendingSavesRef = useRef<() => Promise<void>>(async () => {});
  const isMountedRef = useRef(true);
  const suppressLocalSaveRef = useRef(false);
  const aiEditRunningRef = useRef(aiEditState === "running");
  const fetchSequenceRef = useRef(0);
  const lastRefreshTokenRef = useRef<number | null>(null);
  const previousAiEditStateRef = useRef<AiEditState>(aiEditState);
  const { backendURL, isReady } = useBackendURL();
  const isAiEditRunning = aiEditState === "running";

  const setSaveStatusSafe = useCallback((status: SaveStatus) => {
    if (isMountedRef.current) {
      setSaveStatus(status);
    }
  }, []);

  const getErrorMessage = useCallback(async (res: Response, fallback: string) => {
    try {
      const data = (await res.json()) as { error?: string };
      return data.error || fallback;
    } catch {
      return fallback;
    }
  }, []);

  const clearTitleSaveTimeout = useCallback(() => {
    if (titleSaveTimeoutRef.current) {
      clearTimeout(titleSaveTimeoutRef.current);
      titleSaveTimeoutRef.current = null;
    }
  }, []);

  const abortInFlightSaves = useCallback(() => {
    titleSaveAbortControllerRef.current?.abort();
    titleSaveAbortControllerRef.current = null;
    contentSaveAbortControllerRef.current?.abort();
    contentSaveAbortControllerRef.current = null;
  }, []);

  const discardPendingLocalChanges = useCallback(() => {
    clearTitleSaveTimeout();
    pendingTitleRef.current = null;
    pendingContentRef.current = null;
    contentSaveQueueRef.current = Promise.resolve();
    setSaveStatusSafe("idle");
  }, [clearTitleSaveTimeout, setSaveStatusSafe]);

  const discardLocalEditsNow = useCallback(() => {
    abortInFlightSaves();
    discardPendingLocalChanges();
  }, [abortInFlightSaves, discardPendingLocalChanges]);

  const saveTitleNow = useCallback(
    async (rawTitle: string): Promise<boolean> => {
      if (!backendURL || !isReady) return false;
      if (aiEditRunningRef.current || suppressLocalSaveRef.current) return true;
      const normalizedTitle = rawTitle.trim() || "Untitled Document";
      setSaveStatusSafe("saving");
      const abortController = new AbortController();
      titleSaveAbortControllerRef.current?.abort();
      titleSaveAbortControllerRef.current = abortController;
      try {
        const res = await fetch(
          `${backendURL}/api/modules/writer/documents/${documentId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: normalizedTitle }),
            signal: abortController.signal,
          },
        );
        if (!res.ok) throw new Error(await getErrorMessage(res, "Failed to save title"));
        setSaveStatusSafe("saved");
        return true;
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return true;
        }
        setSaveStatusSafe("error");
        return false;
      } finally {
        if (titleSaveAbortControllerRef.current === abortController) {
          titleSaveAbortControllerRef.current = null;
        }
      }
    },
    [documentId, backendURL, getErrorMessage, isReady, setSaveStatusSafe],
  );

  const savePendingTitle = useCallback(async (): Promise<void> => {
    if (aiEditRunningRef.current || suppressLocalSaveRef.current) {
      return;
    }
    const pendingTitle = pendingTitleRef.current;
    if (pendingTitle === null) return;
    pendingTitleRef.current = null;
    const saved = await saveTitleNow(pendingTitle);
    if (!saved) {
      pendingTitleRef.current = pendingTitle;
    }
  }, [saveTitleNow]);

  const saveContentNow = useCallback(
    async (nextContent: EditorContent): Promise<boolean> => {
      if (!backendURL || !isReady) return false;
      if (aiEditRunningRef.current || suppressLocalSaveRef.current) return true;
      setSaveStatusSafe("saving");
      const abortController = new AbortController();
      contentSaveAbortControllerRef.current?.abort();
      contentSaveAbortControllerRef.current = abortController;
      try {
        const res = await fetch(
          `${backendURL}/api/modules/writer/documents/${documentId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: nextContent }),
            signal: abortController.signal,
          },
        );
        if (!res.ok) throw new Error(await getErrorMessage(res, "Failed to save content"));
        setSaveStatusSafe("saved");
        return true;
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return true;
        }
        setSaveStatusSafe("error");
        return false;
      } finally {
        if (contentSaveAbortControllerRef.current === abortController) {
          contentSaveAbortControllerRef.current = null;
        }
      }
    },
    [documentId, backendURL, getErrorMessage, isReady, setSaveStatusSafe],
  );

  const enqueueContentSave = useCallback(
    (nextContent: EditorContent): Promise<void> => {
      if (aiEditRunningRef.current || suppressLocalSaveRef.current) {
        return Promise.resolve();
      }
      pendingContentRef.current = nextContent;
      setSaveStatusSafe("saving");
      contentSaveQueueRef.current = contentSaveQueueRef.current.then(async () => {
        while (pendingContentRef.current !== null) {
          const contentToSave = pendingContentRef.current;
          pendingContentRef.current = null;
          const saved = await saveContentNow(contentToSave);
          if (!saved) {
            pendingContentRef.current = contentToSave;
            break;
          }
        }
      });
      return contentSaveQueueRef.current;
    },
    [saveContentNow, setSaveStatusSafe],
  );

  const flushPendingSaves = useCallback(async (): Promise<void> => {
    if (aiEditRunningRef.current || suppressLocalSaveRef.current) {
      discardPendingLocalChanges();
      return;
    }
    clearTitleSaveTimeout();

    const titleSavePromise = savePendingTitle();

    if (editor && !editor.isDestroyed) {
      const snapshot: EditorContent = {
        engine: "tiptap",
        version: 1,
        data: editor.getJSON(),
      };
      await enqueueContentSave(snapshot);
    }

    await Promise.allSettled([titleSavePromise, contentSaveQueueRef.current]);
  }, [editor, enqueueContentSave, savePendingTitle, clearTitleSaveTimeout, discardPendingLocalChanges]);

  useEffect(() => {
    flushPendingSavesRef.current = flushPendingSaves;
  }, [flushPendingSaves]);

  // Flush when tab/window loses focus
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        void flushPendingSaves();
      }
    };
    const handleBlur = () => {
      void flushPendingSaves();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleBlur);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleBlur);
    };
  }, [flushPendingSaves]);

  // Flush on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      clearTitleSaveTimeout();
      abortInFlightSaves();
      void flushPendingSavesRef.current();
    };
  }, [abortInFlightSaves, clearTitleSaveTimeout]);

  const applyServerDocument = useCallback(
    (
      document: {
        title?: string | null;
        content_json?: EditorContent | null;
      },
      options?: {
        discardLocalDrafts?: boolean;
      },
    ) => {
      if (options?.discardLocalDrafts) {
        discardLocalEditsNow();
      }
      suppressLocalSaveRef.current = true;
      setTitle((document.title ?? "Untitled Document").trim() || "Untitled Document");
      setContent(document.content_json ?? null);
      pendingTitleRef.current = null;
      pendingContentRef.current = null;
      setSaveStatusSafe("idle");
      queueMicrotask(() => {
        suppressLocalSaveRef.current = false;
      });
    },
    [discardLocalEditsNow, setSaveStatusSafe],
  );

  const fetchDocumentSnapshot = useCallback(
    async ({
      background,
      discardLocalDrafts,
      signal,
    }: {
      background: boolean;
      discardLocalDrafts: boolean;
      signal: AbortSignal;
    }) => {
      if (!documentId) {
        if (!background) {
          setLoading(false);
        }
        return;
      }

      if (!backendURL || !isReady) {
        if (!background) {
          setError("Backend is not ready yet");
          setLoading(false);
        }
        return;
      }

      const fetchSeq = ++fetchSequenceRef.current;

      if (!background) {
        setLoading(true);
        setError(null);
        setEditor(null);
        discardLocalEditsNow();
      }

      try {
        const res = await fetch(`${backendURL}/api/modules/writer/documents/${documentId}`, {
          signal,
        });
        if (!res.ok) {
          throw new Error(await getErrorMessage(res, "Failed to load document"));
        }
        const data = (await res.json()) as {
          document?: {
            title?: string | null;
            content_json?: EditorContent | null;
          };
        };

        if (fetchSeq !== fetchSequenceRef.current || signal.aborted) {
          return;
        }

        if (data.document) {
          applyServerDocument(data.document, {
            discardLocalDrafts,
          });
        }
      } catch (err: unknown) {
        if (signal.aborted || (err instanceof DOMException && err.name === "AbortError")) {
          return;
        }
        if (!background) {
          setError(err instanceof Error ? err.message : "Failed to load document");
        }
      } finally {
        if (!background && fetchSeq === fetchSequenceRef.current) {
          setLoading(false);
        }
      }
    },
    [
      documentId,
      backendURL,
      isReady,
      getErrorMessage,
      applyServerDocument,
      discardLocalEditsNow,
    ],
  );

  useEffect(() => {
    aiEditRunningRef.current = isAiEditRunning;
  }, [isAiEditRunning]);

  useEffect(() => {
    lastRefreshTokenRef.current =
      typeof externalRefreshToken === "number" ? externalRefreshToken : null;
  }, [documentId]);

  // Initial/primary load (full loading UX)
  useEffect(() => {
    const controller = new AbortController();
    void fetchDocumentSnapshot({
      background: false,
      discardLocalDrafts: true,
      signal: controller.signal,
    });
    return () => controller.abort();
  }, [documentId, fetchDocumentSnapshot]);

  // Explicit external refresh (background only, no spinner/editor reset)
  useEffect(() => {
    if (typeof externalRefreshToken !== "number") {
      return;
    }

    if (lastRefreshTokenRef.current === null) {
      lastRefreshTokenRef.current = externalRefreshToken;
      return;
    }

    if (externalRefreshToken === lastRefreshTokenRef.current) {
      return;
    }
    lastRefreshTokenRef.current = externalRefreshToken;

    const controller = new AbortController();
    void fetchDocumentSnapshot({
      background: true,
      discardLocalDrafts: true,
      signal: controller.signal,
    });
    return () => controller.abort();
  }, [externalRefreshToken, fetchDocumentSnapshot]);

  // Lock policy: AI wins immediately.
  useEffect(() => {
    if (!isAiEditRunning) {
      return;
    }
    discardLocalEditsNow();
  }, [discardLocalEditsNow, isAiEditRunning]);

  // While AI edit is running, poll the server for live visual updates with backoff.
  useEffect(() => {
    if (!isAiEditRunning) {
      return;
    }
    const controller = new AbortController();
    let polling = false;
    let delay = 500;
    let timer: ReturnType<typeof setTimeout>;
    const MAX_DELAY = 2000;

    const pollOnce = async () => {
      if (polling || controller.signal.aborted) {
        return;
      }
      polling = true;
      try {
        await fetchDocumentSnapshot({
          background: true,
          discardLocalDrafts: true,
          signal: controller.signal,
        });
      } finally {
        polling = false;
        if (!controller.signal.aborted) {
          timer = setTimeout(() => void pollOnce(), delay);
          delay = Math.min(delay * 2, MAX_DELAY);
        }
      }
    };

    void pollOnce();

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [fetchDocumentSnapshot, isAiEditRunning]);

  // On AI edit completion/failure, fetch once to ensure final server state.
  useEffect(() => {
    const previousState = previousAiEditStateRef.current;
    previousAiEditStateRef.current = aiEditState;

    if (previousState !== "running" || aiEditState !== "idle") {
      return;
    }

    const controller = new AbortController();
    void fetchDocumentSnapshot({
      background: true,
      discardLocalDrafts: true,
      signal: controller.signal,
    });

    return () => controller.abort();
  }, [aiEditState, fetchDocumentSnapshot]);

  const handleTitleChange = useCallback(
    (newTitle: string) => {
      if (aiEditRunningRef.current || suppressLocalSaveRef.current) {
        return;
      }
      setTitle(newTitle);
      pendingTitleRef.current = newTitle;
      setSaveStatusSafe("saving");

      clearTitleSaveTimeout();

      titleSaveTimeoutRef.current = setTimeout(() => {
        void savePendingTitle();
      }, 300);
    },
    [clearTitleSaveTimeout, savePendingTitle, setSaveStatusSafe],
  );

  const handleContentChange = useCallback(
    (newContent: EditorContent) => {
      if (aiEditRunningRef.current || suppressLocalSaveRef.current) {
        return;
      }
      void enqueueContentSave(newContent);
    },
    [enqueueContentSave],
  );

  const handleBack = useCallback(() => {
    void flushPendingSaves().finally(() => {
      onBack?.();
    });
  }, [flushPendingSaves, onBack]);

  // Loading state
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading document...</span>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-center">
          <p className="text-destructive font-medium">{error}</p>
          {onBack && (
            <Button variant="outline" size="sm" onClick={handleBack}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          )}
        </div>
      </div>
    );
  }

  const openLinkDialog = () => setLinkDialogOpen(true);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Menu bar + Formatting toolbar */}
      {editor && (
        <div className={`flex flex-col shrink-0 ${isAiEditRunning ? "pointer-events-none opacity-80" : ""}`}>
          <MenuBar
            editor={editor}
            onLinkClick={openLinkDialog}
            pageMode={pageMode}
            onPageModeChange={setPageMode}
            saveStatus={saveStatus}
            title={title}
            onTitleChange={handleTitleChange}
            onBack={onBack ? handleBack : undefined}
          />
          <FormattingToolbar
            editor={editor}
            onLinkClick={openLinkDialog}
          />
        </div>
      )}

      {isAiEditRunning && (
        <div
          data-testid="writer-ai-edit-running"
          className="flex items-center gap-2 px-3 py-1.5 border-b border-border text-xs text-muted-foreground bg-background"
        >
          <Loader2 className="h-3 w-3 animate-spin" />
          Applying AI edits live...
        </div>
      )}

      {/* Document canvas — gray background like Google Docs */}
      <div className="flex-1 overflow-auto bg-neutral-100 dark:bg-neutral-800">
        {/* Centering wrapper */}
        <div style={{ display: "flex", justifyContent: "center", padding: "24px 16px 48px" }}>
          {/* Paper — A4 at 96 PPI */}
          <div
            style={{
              width: 794,
              minHeight: 1123,
              backgroundColor: "#fff",
              color: "#000",
              padding: 96,
              boxShadow: "0 1px 3px 1px rgba(60,64,67,.15)",
              flexShrink: 0,
              ...(pageMode === "paged" ? {
                backgroundImage: "repeating-linear-gradient(to bottom, transparent 0px, transparent 1122px, rgba(60,64,67,.15) 1122px, rgba(60,64,67,.15) 1123px)",
                backgroundSize: "100% 1123px",
              } : {}),
            }}
          >
            {/* Editor */}
            <div style={{ minHeight: 400, ["--foreground" as string]: "0 0% 0%" }}>
              <TiptapEditor
                key={documentId}
                initialContent={content ?? undefined}
                onChange={handleContentChange}
                onReady={(nextEditor) => setEditor(nextEditor)}
                onLinkClick={openLinkDialog}
                debounceMs={1000}
                readOnly={isAiEditRunning}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Link dialog */}
      {editor && (
        <LinkDialog
          editor={editor}
          open={linkDialogOpen}
          onOpenChange={setLinkDialogOpen}
        />
      )}
    </div>
  );
}
