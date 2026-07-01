import { useCallback, useRef, useEffect, useState } from "react";
import type { EditorContent } from "../../shared/types";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

interface UseAutosaveOptions {
  saveKey: string;
  debounceMs?: number;
  onSave: (content: EditorContent, saveKey: string) => Promise<void>;
  onError?: (error: Error) => void;
}

interface UseAutosaveReturn {
  status: SaveStatus;
  triggerSave: (content: EditorContent) => void;
  flushSave: () => void;
  resetPending: () => void;
  hasUnsavedChanges: boolean;
}

export function useAutosave({
  saveKey,
  debounceMs = 1000,
  onSave,
  onError,
}: UseAutosaveOptions): UseAutosaveReturn {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const pendingRef = useRef<EditorContent | null>(null);
  const saveKeyRef = useRef(saveKey);
  const isSavingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (idleTimerRef.current !== null) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  const performSave = useCallback(async () => {
    if (!pendingRef.current || isSavingRef.current) return;

    const content = pendingRef.current;
    if (saveKeyRef.current !== saveKey) {
      pendingRef.current = null;
      return;
    }

    pendingRef.current = null;
    isSavingRef.current = true;
    setStatus("saving");

    try {
      await onSave(content, saveKeyRef.current);
      if (saveKeyRef.current !== saveKey) return;
      setStatus("saved");
      clearTimers();
      idleTimerRef.current = setTimeout(() => setStatus("idle"), 2000);
    } catch (error) {
      if (saveKeyRef.current !== saveKey) return;
      setStatus("error");
      onError?.(error instanceof Error ? error : new Error(String(error)));
    } finally {
      isSavingRef.current = false;
      if (pendingRef.current && saveKeyRef.current === saveKey) {
        timerRef.current = setTimeout(() => void performSave(), debounceMs);
      }
    }
  }, [saveKey, debounceMs, onSave, onError, clearTimers]);

  const triggerSave = useCallback(
    (content: EditorContent) => {
      pendingRef.current = content;
      clearTimers();
      setStatus("idle");
      timerRef.current = setTimeout(() => void performSave(), debounceMs);
    },
    [performSave, debounceMs, clearTimers],
  );

  const flushSave = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    void performSave();
  }, [performSave]);

  const resetPending = useCallback(() => {
    pendingRef.current = null;
    clearTimers();
    if (!isSavingRef.current) {
      setStatus("idle");
    }
  }, [clearTimers]);

  useEffect(() => {
    if (saveKeyRef.current === saveKey) return;
    saveKeyRef.current = saveKey;
    pendingRef.current = null;
    clearTimers();
    if (!isSavingRef.current) {
      setStatus("idle");
    }
  }, [saveKey, clearTimers]);

  useEffect(() => {
    return () => {
      if (pendingRef.current) {
        void performSave();
      }
      clearTimers();
    };
  }, [performSave, clearTimers]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushSave();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [flushSave]);

  return {
    status,
    triggerSave,
    flushSave,
    resetPending,
    hasUnsavedChanges: pendingRef.current !== null,
  };
}
