import { useState, useEffect, useCallback } from "react";
import { useBackendURL } from "@/contexts/BackendURLContext";

export interface WriterDocument {
  id: string;
  workspace_id: string;
  title: string;
  content_engine: string;
  content_version: number;
  content_json: unknown;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  project_id: string | null;
}

export function useWriterDocuments(workspaceId: string | null) {
  const [documents, setDocuments] = useState<WriterDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { backendURL, isReady } = useBackendURL();

  const isBackendReady = Boolean(backendURL && isReady);

  const getErrorMessage = async (res: Response, fallback: string) => {
    try {
      const data = (await res.json()) as { error?: string };
      return data.error || fallback;
    } catch {
      return fallback;
    }
  };

  const sortByUpdatedAtDesc = (items: WriterDocument[]) =>
    [...items].sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );

  const fetchDocuments = useCallback(async () => {
    if (!workspaceId || !isBackendReady) {
      setDocuments([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${backendURL}/api/modules/writer/documents?workspace_id=${encodeURIComponent(workspaceId)}`
      );
      if (!res.ok) {
        throw new Error(await getErrorMessage(res, "Failed to fetch documents"));
      }
      const data = await res.json();
      setDocuments(sortByUpdatedAtDesc((data.documents ?? []) as WriterDocument[]));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [workspaceId, isBackendReady, backendURL]);

  useEffect(() => {
    void fetchDocuments();
  }, [fetchDocuments]);

  const createDocument = useCallback(
    async (title: string, projectId?: string): Promise<WriterDocument | null> => {
      if (!workspaceId) {
        setError("Please select a workspace first");
        return null;
      }
      if (!isBackendReady) {
        setError("Backend is not ready yet");
        return null;
      }

      try {
        setError(null);
        const res = await fetch(`${backendURL}/api/modules/writer/documents`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspace_id: workspaceId, title, project_id: projectId }),
        });
        if (!res.ok) {
          throw new Error(await getErrorMessage(res, "Failed to create document"));
        }

        const data = await res.json();
        const created = data.document as WriterDocument;
        setDocuments((prev) => {
          const withoutCreated = prev.filter((doc) => doc.id !== created.id);
          return sortByUpdatedAtDesc([created, ...withoutCreated]);
        });

        void fetchDocuments();
        return created;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
        return null;
      }
    },
    [workspaceId, isBackendReady, backendURL, fetchDocuments]
  );

  const updateDocument = useCallback(
    async (documentId: string, updates: { title?: string; project_id?: string | null }): Promise<boolean> => {
      if (!isBackendReady) {
        setError("Backend is not ready yet");
        return false;
      }
      try {
        const res = await fetch(
          `${backendURL}/api/modules/writer/documents/${documentId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updates),
          }
        );
        if (!res.ok) {
          throw new Error(await getErrorMessage(res, "Failed to update document"));
        }
        await fetchDocuments();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
        return false;
      }
    },
    [isBackendReady, backendURL, fetchDocuments]
  );

  const deleteDocument = useCallback(
    async (documentId: string): Promise<boolean> => {
      if (!isBackendReady) {
        setError("Backend is not ready yet");
        return false;
      }
      try {
        const res = await fetch(
          `${backendURL}/api/modules/writer/documents/${documentId}`,
          { method: "DELETE" }
        );
        if (!res.ok) {
          throw new Error(await getErrorMessage(res, "Failed to delete document"));
        }
        await fetchDocuments();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
        return false;
      }
    },
    [isBackendReady, backendURL, fetchDocuments]
  );

  const deleteDocuments = useCallback(
    async (documentIds: string[]): Promise<boolean> => {
      if (!isBackendReady) {
        setError("Backend is not ready yet");
        return false;
      }
      if (documentIds.length === 0) {
        return true;
      }
      try {
        const res = await fetch(
          `${backendURL}/api/modules/writer/documents/bulk-delete`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids: documentIds }),
          }
        );
        if (!res.ok) {
          throw new Error(await getErrorMessage(res, "Failed to delete documents"));
        }
        await fetchDocuments();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
        return false;
      }
    },
    [isBackendReady, backendURL, fetchDocuments]
  );

  return {
    documents,
    loading,
    error,
    isBackendReady,
    refresh: fetchDocuments,
    createDocument,
    updateDocument,
    deleteDocument,
    deleteDocuments,
  };
}
