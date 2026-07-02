import { cn } from "@/lib/utils";
import { FileText } from "lucide-react";

interface Document {
  id: string;
  title: string;
  updated_at: string;
}

interface DocumentListProps {
  documents: Document[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function DocumentList({ documents, selectedId, onSelect }: DocumentListProps) {
  if (documents.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <p className="text-sm text-muted-foreground text-center">
          No documents yet
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {documents.map((doc) => (
        <button
          key={doc.id}
          onClick={() => onSelect(doc.id)}
          className={cn(
            "w-full flex items-center gap-2 px-3 py-2 text-left text-sm",
            "hover:bg-accent/50 transition-colors",
            selectedId === doc.id && "bg-accent"
          )}
        >
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{doc.title}</span>
        </button>
      ))}
    </div>
  );
}
