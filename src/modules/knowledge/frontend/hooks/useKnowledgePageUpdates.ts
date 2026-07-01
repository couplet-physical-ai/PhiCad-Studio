import { useState, useEffect, useRef } from "react";
import type { PageUpdateEvent } from "../../shared/types";

const DEFAULT_WORKSPACE = "default";

export function useKnowledgePageUpdates(
  backendURL: string | null,
  moduleId: string,
  onPageUpdate: (event: PageUpdateEvent) => void,
  onReconnectAfterOutage?: () => void,
): { isConnected: boolean } {
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelayRef = useRef<number>(1000);
  const onPageUpdateRef = useRef(onPageUpdate);
  const onReconnectAfterOutageRef = useRef(onReconnectAfterOutage);
  const hasLoggedErrorRef = useRef(false);
  const [isConnected, setIsConnected] = useState(false);
  const disconnectedAtRef = useRef<number | null>(null);

  useEffect(() => {
    onPageUpdateRef.current = onPageUpdate;
  }, [onPageUpdate]);

  useEffect(() => {
    onReconnectAfterOutageRef.current = onReconnectAfterOutage;
  }, [onReconnectAfterOutage]);

  useEffect(() => {
    const base = backendURL?.replace(/\/$/, "");
    if (!base) {
      return;
    }

    const connect = () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      const url = `${base}/api/modules/${moduleId}/events/pages?workspace_id=${DEFAULT_WORKSPACE}`;
      const es = new EventSource(url);
      eventSourceRef.current = es;

      es.onopen = () => {
        setIsConnected(true);
        hasLoggedErrorRef.current = false;
        reconnectDelayRef.current = 1000;

        if (disconnectedAtRef.current !== null) {
          const duration = Date.now() - disconnectedAtRef.current;
          if (duration > 60000) {
            onReconnectAfterOutageRef.current?.();
          }
          disconnectedAtRef.current = null;
        }
      };

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.event === "ping") return;
          if (data.type && data.pageId && data.workspaceId) {
            onPageUpdateRef.current(data as PageUpdateEvent);
          }
        } catch {
          // ignore parse errors
        }
      };

      es.onerror = () => {
        if (!hasLoggedErrorRef.current) {
          hasLoggedErrorRef.current = true;
        }
        setIsConnected(false);
        if (disconnectedAtRef.current === null) {
          disconnectedAtRef.current = Date.now();
        }
        es.close();
        eventSourceRef.current = null;

        const delay = reconnectDelayRef.current;
        reconnectTimerRef.current = setTimeout(connect, delay);
        reconnectDelayRef.current = Math.min(delay * 2, 30000);
      };
    };

    connect();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };
  }, [backendURL, moduleId]);

  return { isConnected };
}
