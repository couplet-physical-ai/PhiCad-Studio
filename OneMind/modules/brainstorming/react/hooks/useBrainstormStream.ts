import { useEffect, useRef } from "react";
import { useBrainstormStore } from "../stores/brainstorm-store";
import { getBackendURL } from "../../../../src-ts/shared/sdk/mutator";
import type { BrainstormNode, AIJob } from "../../shared/types";

export function useBrainstormStream(boardId: string | null) {
    const eventSourceRef = useRef<EventSource | null>(null);
    const updateNode = useBrainstormStore((state) => state.updateNode);
    const updateJob = useBrainstormStore((state) => state.updateJob);

    useEffect(() => {
        if (!boardId) return;

        let eventSource: EventSource | null = null;
        console.log("[useBrainstormStream] Connecting with boardId:", boardId);
        let retryTimeout: ReturnType<typeof setTimeout> | null = null;
        let retryCount = 0;

        const handleNodeUpdated = (event: MessageEvent) => {
            try {
                const node = JSON.parse(event.data) as BrainstormNode;
                if (node?.id) {
                    updateNode(node.id, node);
                }
            } catch (error) {
                console.error("Failed to parse node update", error);
            }
        };

        const handleJobUpdated = (event: MessageEvent) => {
            try {
                const job = JSON.parse(event.data) as AIJob;
                if (job?.id) {
                    updateJob(job);
                }
            } catch (error) {
                console.error("Failed to parse job update", error);
            }
        };

        const handleBoardRefresh = () => {
            console.log("[useBrainstormStream] Board refresh requested");
        };

        const connect = () => {
            const url = `${getBackendURL()}/api/modules/brainstorming/stream/${boardId}`;
            eventSource = new EventSource(url);
            eventSourceRef.current = eventSource;

            eventSource.onopen = () => {
                retryCount = 0; // Reset retry count on successful connection
            };

            eventSource.addEventListener("node_updated", handleNodeUpdated);
            eventSource.addEventListener("job_updated", handleJobUpdated);
            eventSource.addEventListener("board_refresh", handleBoardRefresh);

            eventSource.onerror = (error) => {
                console.error("[useBrainstormStream] SSE error for boardId:", boardId, error);
                eventSource?.close();

                // Retry logic
                const delay = Math.min(1000 * Math.pow(2, retryCount), 10000); // Max 10s
                retryCount++;
                retryTimeout = setTimeout(connect, delay);
            };
        };

        connect();

        return () => {
            if (eventSource) {
                eventSource.removeEventListener("node_updated", handleNodeUpdated);
                eventSource.removeEventListener("job_updated", handleJobUpdated);
                eventSource.removeEventListener("board_refresh", handleBoardRefresh);
                eventSource.close();
            }
            if (retryTimeout) clearTimeout(retryTimeout);
        };
    }, [boardId, updateNode, updateJob]);
}
