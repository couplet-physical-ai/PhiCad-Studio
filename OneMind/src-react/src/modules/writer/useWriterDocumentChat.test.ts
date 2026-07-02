import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWriterDocumentChat } from "@modules/writer/react/hooks/useWriterDocumentChat";

const hoisted = vi.hoisted(() => ({
  submitMessageMock: vi.fn(),
  loadMessagesMock: vi.fn(),
  abortMock: vi.fn(),
  resetStateMock: vi.fn(),
  updateChatMock: vi.fn(),
  streamMessages: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/hooks/useStreamChat", () => ({
  useStreamChat: () => ({
    messages: hoisted.streamMessages,
    status: "ready",
    error: null,
    isLoading: false,
    modelLoadingState: null,
    submitMessage: hoisted.submitMessageMock,
    abort: hoisted.abortMock,
    loadMessages: hoisted.loadMessagesMock,
    clearMessages: vi.fn(),
    resetState: hoisted.resetStateMock,
  }),
}));

vi.mock("@/stores/app-store", () => ({
  useAppStore: (selector: (state: { activeWorkspaceId: string }) => unknown) =>
    selector({ activeWorkspaceId: "ws-1" }),
}));

vi.mock("@/stores/chat-store", () => ({
  useChatStore: (selector: (state: { pendingModelSelection: { provider: "openai"; model: string } }) => unknown) =>
    selector({
      pendingModelSelection: {
        provider: "openai",
        model: "gpt-4o-mini-2024-07-18",
      },
    }),
}));

vi.mock("@/contexts/BackendURLContext", () => ({
  useBackendURL: () => ({ backendURL: "http://backend.local", isReady: true }),
}));

vi.mock("@/lib/api/chat-api", () => ({
  updateChat: hoisted.updateChatMock,
}));

describe("useWriterDocumentChat", () => {
  beforeEach(() => {
    hoisted.streamMessages.length = 0;
    hoisted.submitMessageMock.mockReset();
    hoisted.loadMessagesMock.mockReset();
    hoisted.loadMessagesMock.mockResolvedValue(undefined);
    hoisted.abortMock.mockReset();
    hoisted.resetStateMock.mockReset();
    hoisted.updateChatMock.mockReset();
    hoisted.updateChatMock.mockResolvedValue({});

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            document: {
              id: "doc-1",
              title: "Plan",
              updated_at: "2026-02-18T10:00:00.000Z",
              content_json: {
                engine: "tiptap",
                version: 1,
                data: {
                  type: "doc",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "Initial content." }],
                    },
                  ],
                },
              },
            },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends writer tools and syncs prompt before submit", async () => {
    const { result } = renderHook(() =>
      useWriterDocumentChat({ documentId: "doc-1", chatId: "chat-1" }),
    );

    await act(async () => {
      await result.current.submitMessage({ text: "Rewrite intro" });
    });

    expect(hoisted.updateChatMock).toHaveBeenCalledWith(
      "chat-1",
      expect.objectContaining({
        config: expect.objectContaining({
          provider: "openai",
          model: "gpt-4o-mini-2024-07-18",
          systemPrompt: expect.stringContaining("TOOL RULES (follow strictly)"),
        }),
      }),
    );

    expect(hoisted.submitMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: "chat-1",
        toolChoice: "auto",
        allowedTools: ["writer.read_document", "writer.document_info", "edit_content"],
        activeContext: {
          workspaceId: "ws-1",
          activeTarget: {
            targetType: "writer.document",
            targetId: "doc-1",
          },
        },
      }),
    );
  });

  it("loads messages for active chat", () => {
    renderHook(() => useWriterDocumentChat({ documentId: "doc-1", chatId: "chat-1" }));
    expect(hoisted.resetStateMock).toHaveBeenCalledTimes(1);
    expect(hoisted.loadMessagesMock).toHaveBeenCalledWith("chat-1");
  });

  it("waits for hydration barrier before submitting", async () => {
    let resolveLoad: (() => void) | null = null;
    hoisted.loadMessagesMock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveLoad = resolve;
        }),
    );

    const { result } = renderHook(() =>
      useWriterDocumentChat({ documentId: "doc-1", chatId: "chat-1" }),
    );

    let submitPromise: Promise<void> | null = null;
    await act(async () => {
      submitPromise = result.current.submitMessage({ text: "Rewrite intro" });
      await Promise.resolve();
    });

    expect(hoisted.submitMessageMock).not.toHaveBeenCalled();
    if (!submitPromise) {
      throw new Error("submit promise was not created");
    }

    await act(async () => {
      resolveLoad?.();
      await submitPromise;
    });

    expect(hoisted.submitMessageMock).toHaveBeenCalledTimes(1);
  });

  it("emits lifecycle started/completed/failed for new events and ignores historical replay", async () => {
    let resolveLoad: (() => void) | null = null;
    hoisted.loadMessagesMock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveLoad = resolve;
        }),
    );

    const onEditApplied = vi.fn();
    const onEditLifecycleEvent = vi.fn();
    const { rerender } = renderHook(() =>
      useWriterDocumentChat({
        documentId: "doc-1",
        chatId: "chat-1",
        onEditApplied,
        onEditLifecycleEvent,
      }),
    );

    hoisted.streamMessages = [
      {
        id: "assistant-1",
        role: "assistant",
        parts: [
          {
            type: "tool-call",
            toolCallId: "call-historical",
            toolName: "edit_content",
            args: { mode: "replace" },
          },
          {
            type: "tool-result",
            toolCallId: "call-historical",
            toolName: "edit_content",
            result: { success: true, editId: "edit-old" },
          },
        ],
      },
    ];

    rerender();

    await act(async () => {
      resolveLoad?.();
      await Promise.resolve();
      await Promise.resolve();
    });

    rerender();
    expect(onEditApplied).not.toHaveBeenCalled();
    expect(onEditLifecycleEvent).not.toHaveBeenCalled();

    hoisted.streamMessages = [
      ...hoisted.streamMessages,
      {
        id: "assistant-2",
        role: "assistant",
        parts: [
          {
            type: "tool-call",
            toolCallId: "call-failed",
            toolName: "edit_content",
            args: { mode: "replace" },
          },
          {
            type: "tool-result",
            toolCallId: "call-failed",
            toolName: "edit_content",
            result: { success: false, editId: "edit-failed" },
          },
        ],
      },
      {
        id: "assistant-3",
        role: "assistant",
        parts: [
          {
            type: "tool-call",
            toolCallId: "call-live",
            toolName: "edit_content",
            args: { mode: "replace" },
          },
          {
            type: "tool-result",
            toolCallId: "call-live",
            toolName: "edit_content",
            result: { success: true, editId: "edit-live" },
          },
        ],
      },
    ];
    rerender();

    await waitFor(() => {
      expect(onEditApplied).toHaveBeenCalledTimes(1);
    });

    expect(onEditLifecycleEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: "chat-1",
        documentId: "doc-1",
        toolCallId: "call-live",
        status: "started",
      }),
    );
    expect(onEditLifecycleEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: "chat-1",
        documentId: "doc-1",
        toolCallId: "call-live",
        status: "completed",
      }),
    );
    expect(onEditLifecycleEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: "chat-1",
        documentId: "doc-1",
        toolCallId: "call-failed",
        status: "failed",
      }),
    );

    expect(onEditApplied).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: "chat-1",
        documentId: "doc-1",
        toolCallId: "call-live",
        editId: "edit-live",
      }),
    );
  });

  it("does not suppress distinct tool events when providers reuse toolCallId values", async () => {
    const onEditApplied = vi.fn();
    const onEditLifecycleEvent = vi.fn();

    const { rerender } = renderHook(() =>
      useWriterDocumentChat({
        documentId: "doc-1",
        chatId: "chat-1",
        onEditApplied,
        onEditLifecycleEvent,
      }),
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    hoisted.streamMessages = [
      {
        id: "assistant-1",
        role: "assistant",
        parts: [
          {
            type: "tool-call",
            toolCallId: "call_0",
            toolName: "edit_content",
            args: { mode: "replace" },
          },
          {
            type: "tool-result",
            toolCallId: "call_0",
            toolName: "edit_content",
            result: { success: true, editId: "edit-1" },
          },
        ],
      },
    ];
    rerender();

    await waitFor(() => {
      expect(onEditApplied).toHaveBeenCalledTimes(1);
    });

    hoisted.streamMessages = [
      ...hoisted.streamMessages,
      {
        id: "assistant-2",
        role: "assistant",
        parts: [
          {
            type: "tool-call",
            toolCallId: "call_0",
            toolName: "edit_content",
            args: { mode: "replace" },
          },
          {
            type: "tool-result",
            toolCallId: "call_0",
            toolName: "edit_content",
            result: { success: true, editId: "edit-2" },
          },
        ],
      },
    ];
    rerender();

    await waitFor(() => {
      expect(onEditApplied).toHaveBeenCalledTimes(2);
    });

    expect(onEditLifecycleEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        toolCallId: "call_0",
        status: "completed",
        editId: "edit-1",
      }),
    );
    expect(onEditLifecycleEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        toolCallId: "call_0",
        status: "completed",
        editId: "edit-2",
      }),
    );
  });
});
