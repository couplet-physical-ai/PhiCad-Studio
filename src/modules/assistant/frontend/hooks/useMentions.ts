import { useState, useCallback, useRef, useEffect } from "react";
import type {
  MentionEntity,
  MentionSearchResponse,
} from "../types/mention";

interface UseMentionsOptions {
  backendURL: string | null;
  workspaceId: string;
  chatId?: string;
  limit?: number;
}

interface UseMentionsReturn {
  suggestions: MentionEntity[];
  isLoading: boolean;
  error: string | null;
  search: (query: string) => Promise<void>;
  clear: () => void;
}

export function useMentions(options: UseMentionsOptions): UseMentionsReturn {
  const [suggestions, setSuggestions] = useState<MentionEntity[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    return () => {
      requestIdRef.current = -1;
    };
  }, []);

  const search = useCallback(
    async (query: string) => {
      if (!options.backendURL) {
        setError("Backend not connected");
        return;
      }

      const currentRequestId = ++requestIdRef.current;

      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `${options.backendURL}/api/mentions/search`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              query,
              workspaceId: options.workspaceId,
              ...(options.chatId ? { chatId: options.chatId } : {}),
              limit: options.limit ?? 10,
            }),
          },
        );

        if (requestIdRef.current !== currentRequestId) {
          return;
        }

        if (!response.ok) {
          throw new Error(`Search failed: ${response.status}`);
        }

        const payload = (await response.json()) as {
          ok: boolean;
          data?: MentionSearchResponse;
        };

        if (payload.ok && payload.data) {
          setSuggestions(payload.data.results);
        } else {
          setSuggestions([]);
        }
      } catch (err) {
        if (requestIdRef.current === currentRequestId) {
          setError(err instanceof Error ? err.message : "Search failed");
          setSuggestions([]);
        }
      } finally {
        if (requestIdRef.current === currentRequestId) {
          setIsLoading(false);
        }
      }
    },
    [
      options.backendURL,
      options.workspaceId,
      options.chatId,
      options.limit,
    ],
  );

  const clear = useCallback(() => {
    requestIdRef.current++;
    setSuggestions([]);
    setError(null);
  }, []);

  return { suggestions, isLoading, error, search, clear };
}
