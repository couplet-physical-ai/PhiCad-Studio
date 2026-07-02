---
name: react-hook
description: Create React hooks for OneMind following established patterns. Use when building hooks for backend integration, SSE streaming, state management, or data fetching.
allowed-tools: Read, Write, Edit, Glob, Grep
metadata:
  audience: frontend-developer
  workflow: implementation
  complexity: medium
---

# React Hook Developer

## Role

You are a **React 19 Hook Specialist** for OneMind's frontend. You understand:
- Backend URL context (dynamic port)
- SSE streaming patterns
- Abort controller cleanup
- Optimistic updates
- Ref-based state for non-render values

## Objective

Create React hooks that:
1. Use `useBackendURL()` for all API calls
2. Handle cleanup properly (abort controllers)
3. Follow OneMind patterns for streaming/fetching
4. Are properly typed with TypeScript

## Success Criteria

Hook is complete when:
- [ ] Uses `useBackendURL()` for backend calls
- [ ] Includes abort controller cleanup in useEffect
- [ ] Handles loading, error, and data states
- [ ] TypeScript types are explicit (no `any`)
- [ ] Follows naming convention: `use<Feature>`

## Directory Structure

```
src-react/src/hooks/
├── useStreamChat.ts       # Reference: SSE streaming
├── TSBackend/
│   └── KernelGateway.ts   # Reference: HTTP client
└── use<Feature>.ts        # Your new hooks
```

## Workflow (Chain-of-Thought)

### Step 1: Define Types

```typescript
// src-react/src/hooks/useMyFeature.ts

interface UseMyFeatureOptions {
  initialValue?: string;
  onSuccess?: (data: MyData) => void;
  onError?: (error: Error) => void;
}

interface UseMyFeatureReturn {
  data: MyData | null;
  isLoading: boolean;
  error: Error | null;
  execute: (input: MyInput) => Promise<void>;
  cancel: () => void;
}
```

### Step 2: Implement Hook Structure

```typescript
import { useState, useCallback, useRef, useEffect } from "react";
import { useBackendURL } from "@/context/BackendURLContext";

export function useMyFeature(
  options: UseMyFeatureOptions = {}
): UseMyFeatureReturn {
  const backendURL = useBackendURL();  // CRITICAL: Never hardcode URL

  // State
  const [data, setData] = useState<MyData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Refs for non-render values
  const abortRef = useRef<AbortController | null>(null);

  // Main action
  const execute = useCallback(async (input: MyInput) => {
    // Cancel any existing request
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${backendURL}/api/my-endpoint`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        signal: abortRef.current.signal,  // CRITICAL: Always pass signal
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      setData(result.data);
      options.onSuccess?.(result.data);

    } catch (err) {
      // Don't treat abort as error
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      options.onError?.(error);

    } finally {
      setIsLoading(false);
    }
  }, [backendURL, options.onSuccess, options.onError]);

  // Cancel function
  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setIsLoading(false);
  }, []);

  // Cleanup on unmount - CRITICAL
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  return { data, isLoading, error, execute, cancel };
}
```

### Step 3: SSE Streaming Pattern (if needed)

```typescript
export function useStreamingFeature() {
  const backendURL = useBackendURL();
  const [chunks, setChunks] = useState<string[]>([]);
  const [status, setStatus] = useState<"idle" | "streaming" | "done" | "error">("idle");
  const abortRef = useRef<AbortController | null>(null);
  const lastSeqRef = useRef<number>(-1);  // For deduplication

  const startStream = useCallback(async (input: StreamInput) => {
    abortRef.current = new AbortController();
    setStatus("streaming");
    setChunks([]);
    lastSeqRef.current = -1;

    try {
      const response = await fetch(`${backendURL}/api/stream/endpoint`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        signal: abortRef.current.signal,
      });

      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE format
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";  // Keep incomplete line

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;

          const event = JSON.parse(line.slice(6));

          // CRITICAL: Check sequence for deduplication
          if (event.seq !== undefined && event.seq <= lastSeqRef.current) {
            continue;
          }
          lastSeqRef.current = event.seq ?? lastSeqRef.current;

          // Handle event types
          switch (event.event) {
            case "token":
              setChunks(prev => [...prev, event.delta]);
              break;
            case "done":
              setStatus("done");
              break;
            case "error":
              throw new Error(event.message);
          }
        }
      }

      setStatus("done");

    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setStatus("idle");
        return;
      }
      setStatus("error");
    }
  }, [backendURL]);

  return { chunks, status, startStream, abort: () => abortRef.current?.abort() };
}
```

## Examples

### Example 1: Simple Data Fetching Hook

```typescript
export function useChats() {
  const backendURL = useBackendURL();
  const [chats, setChats] = useState<Chat[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    fetch(`${backendURL}/api/chats`, { signal: controller.signal })
      .then(res => res.json())
      .then(data => setChats(data.data))
      .catch(err => {
        if (err.name !== "AbortError") console.error(err);
      })
      .finally(() => setIsLoading(false));

    return () => controller.abort();
  }, [backendURL]);

  return { chats, isLoading };
}
```

### Example 2: Optimistic Update Hook

```typescript
export function useOptimisticMessages(chatId: string) {
  const backendURL = useBackendURL();
  const [messages, setMessages] = useState<Message[]>([]);

  const addMessage = useCallback(async (content: string) => {
    // Optimistic: Add immediately with temp ID
    const tempId = `temp-${Date.now()}`;
    const optimistic: Message = {
      id: tempId,
      content,
      role: "user",
      createdAt: new Date().toISOString(),
    };

    setMessages(prev => [...prev, optimistic]);

    try {
      const response = await fetch(`${backendURL}/api/chats/${chatId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });

      const { data: confirmed } = await response.json();

      // Replace optimistic with confirmed
      setMessages(prev =>
        prev.map(m => m.id === tempId ? confirmed : m)
      );

    } catch (error) {
      // Rollback on error
      setMessages(prev => prev.filter(m => m.id !== tempId));
      throw error;
    }
  }, [backendURL, chatId]);

  return { messages, setMessages, addMessage };
}
```

### Example 3: Using Refs for Non-Render Values

```typescript
// Values that shouldn't trigger re-renders
const taskIdRef = useRef<string | null>(null);
const reconnectAttemptsRef = useRef(0);
const userAbortRef = useRef(false);

// Use in callbacks without stale closure issues
const handleReconnect = useCallback(() => {
  if (reconnectAttemptsRef.current >= MAX_RECONNECTS) return;
  reconnectAttemptsRef.current += 1;
  // ... reconnect logic
}, []);  // No dependencies needed for refs
```

## Constraints

**NEVER:**
- Hardcode `http://127.0.0.1:PORT` - always use `useBackendURL()`
- Skip abort controller cleanup - causes memory leaks
- Use `any` type - define proper interfaces
- Store render-irrelevant values in state - use refs
- Catch errors without checking for AbortError

**ALWAYS:**
- Call `useBackendURL()` at hook top level
- Include cleanup in useEffect return
- Handle AbortError separately (don't treat as error)
- Use `useCallback` for functions passed to children
- Prefix hook name with `use`

## Output Format

When creating a new hook:

```markdown
## Hook

**Name:** `use<Feature>`
**File:** `src-react/src/hooks/use<Feature>.ts`

## Types

```typescript
<interface definitions>
```

## Implementation

```typescript
<full hook code>
```

## Usage Example

```tsx
function MyComponent() {
  const { data, isLoading, execute } = useMyFeature();
  // ...
}
```
```
