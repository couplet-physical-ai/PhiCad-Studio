import { useState, useEffect, useCallback } from "react";
import { useBackendURL } from "@/contexts/BackendURLContext";
import type { VersionSource } from "../../shared/types";

interface WriterVersion {
  id: string;
  document_id: string;
  source: VersionSource;
  title: string | null;
  content_snapshot: unknown;
  thread_id: string | null;
  message_id: string | null;
  edit_id: string | null;
  created_at: string;
}

export function useWriterVersions(documentId: string | null) {
  const [versions, setVersions] = useState<WriterVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { backendURL } = useBackendURL();

  const fetchVersions = useCallback(async () => {
    if (!documentId || !backendURL) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${backendURL}/api/modules/writer/documents/${documentId}/versions`
      );
      if (!res.ok) throw new Error("Failed to fetch versions");
      const data = await res.json();
      setVersions(data.versions ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [documentId, backendURL]);

  useEffect(() => {
    fetchVersions();
  }, [fetchVersions]);

  const createVersion = useCallback(
    async (source: VersionSource, title?: string): Promise<WriterVersion | null> => {
      if (!documentId || !backendURL) return null;
      try {
        const res = await fetch(
          `${backendURL}/api/modules/writer/documents/${documentId}/versions`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ document_id: documentId, source, title }),
          }
        );
        if (!res.ok) throw new Error("Failed to create version");
        const data = await res.json();
        await fetchVersions();
        return data.version;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
        return null;
      }
    },
    [documentId, backendURL, fetchVersions]
  );

  const restoreVersion = useCallback(
    async (versionId: string): Promise<boolean> => {
      if (!backendURL) return false;
      try {
        const res = await fetch(
          `${backendURL}/api/modules/writer/versions/${versionId}/restore`,
          { method: "POST" }
        );
        if (!res.ok) throw new Error("Failed to restore version");
        await fetchVersions();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
        return false;
      }
    },
    [backendURL, fetchVersions]
  );

  return {
    versions,
    loading,
    error,
    refresh: fetchVersions,
    createVersion,
    restoreVersion,
  };
}
