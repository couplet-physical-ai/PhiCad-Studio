import { useState } from "react";
import { X, FileText, Copy, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBrainstormApi } from "../hooks/useBrainstormApi";
import { useToast } from "@/components/ui/use-toast";

interface GenerateDocumentModalProps {
  boardId: string;
  onClose: () => void;
}

export function GenerateDocumentModal({
  boardId,
  onClose,
}: GenerateDocumentModalProps) {
  const api = useBrainstormApi();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const result = await api.generateDocument(boardId);
      setContent(result.content);
      toast({ title: "Success", description: "Document generated successfully" });
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to generate document",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!content) return;
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Copied", description: "Content copied to clipboard" });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex h-auto max-h-[85vh] w-[600px] flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Generate Specification Document
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-2 hover:bg-muted"
            title="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {!content ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="mb-4 rounded-full bg-primary/10 p-4">
                <FileText className="h-12 w-12 text-primary" />
              </div>
              <h3 className="mb-2 text-lg font-medium">Ready to Export</h3>
              <p className="mb-6 max-w-md text-muted-foreground">
                Generate a comprehensive Markdown document from your brainstorming board, including all ideas, connections, and details.
              </p>
              <Button onClick={handleGenerate} disabled={loading} size="lg">
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <FileText className="mr-2 h-4 w-4" />
                    Generate Document
                  </>
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-muted-foreground">
                  Generated Content (Markdown)
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopy}
                  className="h-8"
                >
                  {copied ? (
                    <>
                      <Check className="mr-2 h-3.5 w-3.5" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="mr-2 h-3.5 w-3.5" />
                      Copy to Clipboard
                    </>
                  )}
                </Button>
              </div>
              <textarea
                className="h-[400px] w-full rounded-md border border-input bg-muted/50 p-4 font-mono text-sm focus:border-primary focus:outline-none"
                readOnly
                value={content}
              />
            </div>
          )}
        </div>

        {content && (
            <div className="flex items-center justify-end border-t border-border px-6 py-4">
                <Button onClick={onClose}>Done</Button>
            </div>
        )}
      </div>
    </div>
  );
}
