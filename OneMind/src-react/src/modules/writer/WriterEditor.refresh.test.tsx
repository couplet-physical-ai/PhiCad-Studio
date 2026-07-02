import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WriterEditor } from "@modules/writer/react/components/WriterEditor";

const { editorState } = vi.hoisted(() => ({
  editorState: {
    current: { type: "doc", content: [{ type: "paragraph" }] } as Record<string, unknown>,
  },
}));

function buildTiptapData(text: string) {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text }],
      },
    ],
  };
}

vi.mock("@/contexts/BackendURLContext", () => ({
  useBackendURL: () => ({ backendURL: "http://backend.local", isReady: true }),
}));

vi.mock("@modules/writer/react/editor/toolbar/MenuBar", () => ({
  MenuBar: ({ title, onBack }: { title: string; onBack?: () => void }) => (
    <div>
      <div data-testid="menu-title">{title}</div>
      <button data-testid="writer-back-button" onClick={onBack}>
        Back
      </button>
    </div>
  ),
}));

vi.mock("@modules/writer/react/editor/toolbar/FormattingToolbar", () => ({
  FormattingToolbar: () => <div data-testid="formatting-toolbar" />,
}));

vi.mock("@modules/writer/react/editor/LinkDialog", () => ({
  LinkDialog: () => null,
}));

vi.mock("@modules/writer/react/editor/TiptapEditor", async () => {
  const React = await import("react");

  const mockEditor = {
    isDestroyed: false,
    getJSON: () => editorState.current,
  };

  return {
    TiptapEditor: ({
      initialContent,
      onReady,
      readOnly,
    }: {
      initialContent?: { data?: Record<string, unknown> };
      onReady?: (editor: unknown) => void;
      readOnly?: boolean;
    }) => {
      React.useEffect(() => {
        onReady?.(mockEditor);
      }, [onReady]);

      const [preview, setPreview] = React.useState(() => JSON.stringify(editorState.current));

      React.useEffect(() => {
        if (initialContent?.data) {
          editorState.current = initialContent.data;
          setPreview(JSON.stringify(editorState.current));
        }
      }, [initialContent]);

      return (
        <div>
          <div data-testid="editor-preview">{preview}</div>
          <div data-testid="editor-readonly">{String(Boolean(readOnly))}</div>
          <button
            data-testid="mutate-editor-only"
            onClick={() => {
              editorState.current = buildTiptapData("unsaved-content");
              setPreview(JSON.stringify(editorState.current));
            }}
          >
            Mutate Editor
          </button>
        </div>
      );
    },
  };
});

describe("WriterEditor AI refresh integration", () => {
  const patchBodies: Array<Record<string, unknown>> = [];
  let getCallCount = 0;

  beforeEach(() => {
    patchBodies.length = 0;
    getCallCount = 0;
    editorState.current = buildTiptapData("server-initial");

    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? "GET";

      if (method === "GET") {
        getCallCount += 1;
        const isRefresh = getCallCount >= 2;
        const title = isRefresh ? "Updated by AI" : "Initial Title";
        const content = isRefresh ? "server-ai-content" : "server-initial";

        return new Response(
          JSON.stringify({
            document: {
              id: "doc-1",
              title,
              content_json: {
                engine: "tiptap",
                version: 1,
                data: buildTiptapData(content),
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (method === "PATCH") {
        if (typeof init?.body === "string") {
          patchBodies.push(JSON.parse(init.body) as Record<string, unknown>);
        }
        return new Response(
          JSON.stringify({ document: { id: "doc-1" } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      return new Response("unsupported method", { status: 500 });
    });

    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(async () => {
    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 0));
    vi.unstubAllGlobals();
  });

  it("refetches and updates visible content when externalRefreshToken changes", async () => {
    const { rerender } = render(
      <WriterEditor documentId="doc-1" externalRefreshToken={0} aiEditState="idle" onBack={() => {}} />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("menu-title")).toHaveTextContent("Initial Title");
    });
    expect(screen.getByTestId("editor-preview").textContent).toContain("server-initial");

    rerender(<WriterEditor documentId="doc-1" externalRefreshToken={1} aiEditState="idle" onBack={() => {}} />);

    await waitFor(() => {
      expect(screen.getByTestId("menu-title")).toHaveTextContent("Updated by AI");
    });
    expect(screen.getByTestId("editor-preview").textContent).toContain("server-ai-content");
    expect(getCallCount).toBeGreaterThanOrEqual(2);
  });

  it("does not emit stale unsaved content after AI refresh", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <WriterEditor documentId="doc-1" externalRefreshToken={0} aiEditState="idle" onBack={() => {}} />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("menu-title")).toHaveTextContent("Initial Title");
    });

    await user.click(screen.getByTestId("mutate-editor-only"));
    expect(screen.getByTestId("editor-preview").textContent).toContain("unsaved-content");

    rerender(<WriterEditor documentId="doc-1" externalRefreshToken={0} aiEditState="running" onBack={() => {}} />);

    await waitFor(() => {
      expect(screen.getByTestId("menu-title")).toHaveTextContent("Updated by AI");
    });
    await waitFor(() => {
      expect(screen.getByTestId("editor-preview").textContent).toContain("server-ai-content");
    });
    expect(screen.getByTestId("editor-readonly")).toHaveTextContent("true");
    expect(screen.getByTestId("writer-ai-edit-running")).toBeInTheDocument();

    expect(
      patchBodies.some((body) => JSON.stringify(body).includes("unsaved-content")),
    ).toBe(false);
  });
});
