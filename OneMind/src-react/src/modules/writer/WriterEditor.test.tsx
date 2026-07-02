import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WriterEditor } from "@modules/writer/react/components/WriterEditor";

const { editorState } = vi.hoisted(() => ({
  editorState: {
    current: { type: "doc", content: [{ type: "paragraph" }] } as Record<string, unknown>,
  },
}));

vi.mock("@/contexts/BackendURLContext", () => ({
  useBackendURL: () => ({ backendURL: "http://backend.local", isReady: true }),
}));

vi.mock("@modules/writer/react/editor/toolbar/MenuBar", () => ({
  MenuBar: ({ onBack }: { onBack?: () => void }) => (
    <button data-testid="writer-back-button" onClick={onBack}>
      Back
    </button>
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
      onChange,
      onReady,
    }: {
      onChange?: (content: {
        engine: "tiptap";
        version: number;
        data: Record<string, unknown>;
      }) => void;
      onReady?: (editor: unknown) => void;
    }) => {
      React.useEffect(() => {
        onReady?.(mockEditor);
      }, [onReady]);

      return (
        <div>
          <button
            data-testid="emit-content-change"
            onClick={() => {
              editorState.current = {
                type: "doc",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "content-updated" }],
                  },
                ],
              };
              onChange?.({
                engine: "tiptap",
                version: 1,
                data: editorState.current,
              });
            }}
          >
            Emit Change
          </button>
          <button
            data-testid="mutate-editor-only"
            onClick={() => {
              editorState.current = {
                type: "doc",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "unsaved-content" }],
                  },
                ],
              };
            }}
          >
            Mutate Editor
          </button>
        </div>
      );
    },
  };
});

describe("WriterEditor autosave", () => {
  const patchBodies: Array<Record<string, unknown>> = [];

  beforeEach(() => {
    patchBodies.length = 0;
    editorState.current = { type: "doc", content: [{ type: "paragraph" }] };

    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? "GET";

      if (method === "GET") {
        return new Response(
          JSON.stringify({
            document: {
              id: "doc-1",
              title: "Untitled Document",
              content_json: {
                engine: "tiptap",
                version: 1,
                data: editorState.current,
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (method === "PATCH") {
        if (init?.body && typeof init.body === "string") {
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

  it("uses canonical content field for content updates", async () => {
    const user = userEvent.setup();
    render(<WriterEditor documentId="doc-1" onBack={() => {}} />);

    await screen.findByTestId("emit-content-change");
    await user.click(screen.getByTestId("emit-content-change"));

    await waitFor(() => {
      expect(
        patchBodies.some((body) => Object.prototype.hasOwnProperty.call(body, "content")),
      ).toBe(true);
    });

    const contentPatch = patchBodies.find((body) =>
      Object.prototype.hasOwnProperty.call(body, "content"),
    );
    expect(contentPatch).toBeDefined();
    expect(contentPatch).not.toHaveProperty("content_json");
  });

  it("flushes pending editor state on back navigation", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(<WriterEditor documentId="doc-1" onBack={onBack} />);

    await screen.findByTestId("mutate-editor-only");
    await user.click(screen.getByTestId("mutate-editor-only"));
    await user.click(screen.getByTestId("writer-back-button"));

    await waitFor(() => {
      expect(onBack).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(
        patchBodies.some(
          (body) =>
            Object.prototype.hasOwnProperty.call(body, "content") &&
            JSON.stringify(body.content).includes("unsaved-content"),
        ),
      ).toBe(true);
    });
  });

  it("flushes pending editor state on unmount", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<WriterEditor documentId="doc-1" onBack={() => {}} />);

    await screen.findByTestId("mutate-editor-only");
    await user.click(screen.getByTestId("mutate-editor-only"));
    unmount();

    await waitFor(() => {
      expect(
        patchBodies.some(
          (body) =>
            Object.prototype.hasOwnProperty.call(body, "content") &&
            JSON.stringify(body.content).includes("unsaved-content"),
        ),
      ).toBe(true);
    });
  });
});
