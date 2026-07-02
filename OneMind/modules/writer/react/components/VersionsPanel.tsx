import { useState } from "react";
import { History, RotateCcw, Save, Eye, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWriterVersions } from "../hooks/useWriterVersions";
import { cn } from "@/lib/utils";

interface VersionsPanelProps {
  documentId: string;
  onPreview?: (content: unknown) => void;
}

const SOURCE_LABELS: Record<string, string> = {
  manual: "Manual save",
  ai_apply: "AI applied",
  pre_restore: "Before restore",
};

export function VersionsPanel({ documentId, onPreview }: VersionsPanelProps) {
  const { versions, loading, createVersion, restoreVersion } = useWriterVersions(documentId);
  const [previewingId, setPreviewingId] = useState<string | null>(null);

  const handleCreateManualVersion = async () => {
    await createVersion("manual", "Manual snapshot");
  };

  const handlePreview = (versionId: string) => {
    const version = versions.find((v) => v.id === versionId);
    if (version && onPreview) {
      onPreview(version.content_snapshot);
      setPreviewingId(versionId);
    }
  };

  const handleClearPreview = () => {
    setPreviewingId(null);
    if (onPreview) {
      onPreview(null);
    }
  };

  const handleRestore = async (versionId: string) => {
    if (window.confirm("Restore this version? Current content will be saved as a snapshot first.")) {
      await restoreVersion(versionId);
      handleClearPreview();
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading versions...</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-2 border-b border-border">
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={handleCreateManualVersion}
        >
          <Save className="h-3.5 w-3.5 mr-1.5" />
          Save Version
        </Button>
      </div>

      {previewingId && (
        <div className="p-2 bg-amber-500/10 border-b border-amber-500/20 flex items-center justify-between">
          <span className="text-xs text-amber-600 dark:text-amber-400">Previewing version</span>
          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={handleClearPreview}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {versions.length === 0 ? (
          <div className="flex items-center justify-center h-full p-4">
            <div className="text-center text-muted-foreground">
              <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No versions yet</p>
              <p className="text-xs mt-1 opacity-70">
                Save a version to track changes
              </p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {versions.map((version) => (
              <div
                key={version.id}
                className={cn(
                  "p-3 hover:bg-accent/50 transition-colors group cursor-pointer",
                  previewingId === version.id && "bg-accent"
                )}
                onClick={() => handlePreview(version.id)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">
                      {version.title || SOURCE_LABELS[version.source] || version.source}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(version.created_at).toLocaleString()}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span
                        className={cn(
                          "inline-block text-xs px-1.5 py-0.5 rounded",
                          version.source === "manual" && "bg-blue-500/10 text-blue-500",
                          version.source === "ai_apply" && "bg-purple-500/10 text-purple-500",
                          version.source === "pre_restore" && "bg-amber-500/10 text-amber-500"
                        )}
                      >
                        {version.source}
                      </span>
                      {version.thread_id && (
                        <span className="text-xs text-muted-foreground">linked</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePreview(version.id);
                      }}
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRestore(version.id);
                      }}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
