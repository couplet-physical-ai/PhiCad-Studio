import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DocumentCard } from "@modules/writer/react/components/DocumentCard";
import type { WriterDocument } from "@modules/writer/react/hooks/useWriterDocuments";

const sampleDocument: WriterDocument = {
  id: "doc-1",
  workspace_id: "ws-1",
  title: "My Doc",
  content_engine: "tiptap",
  content_version: 1,
  content_json: { engine: "tiptap", version: 1, data: { type: "doc", content: [] } },
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  deleted_at: null,
  project_id: null,
};

describe("DocumentCard delete behavior", () => {
  it("does not open the document after delete confirmation", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const onDelete = vi.fn(async () => {});

    render(
      <DocumentCard
        document={sampleDocument}
        onOpen={onOpen}
        onRename={() => {}}
        onMoveToProject={() => {}}
        onDelete={onDelete}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Document actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledTimes(1);
    });
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("does not open the document after delete cancellation", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const onDelete = vi.fn(async () => {});

    render(
      <DocumentCard
        document={sampleDocument}
        onOpen={onOpen}
        onRename={() => {}}
        onMoveToProject={() => {}}
        onDelete={onDelete}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Document actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onDelete).not.toHaveBeenCalled();
    expect(onOpen).not.toHaveBeenCalled();
  });
});
