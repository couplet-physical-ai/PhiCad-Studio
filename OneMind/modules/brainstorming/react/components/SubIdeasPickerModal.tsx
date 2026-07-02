import { useState } from "react";
import { X, Check, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface SubIdea {
  title: string;
  description: string;
}

interface SubIdeasPickerModalProps {
  candidates: SubIdea[];
  onConfirm: (selected: SubIdea[]) => void;
  onClose: () => void;
}

export function SubIdeasPickerModal({
  candidates,
  onConfirm,
  onClose,
}: SubIdeasPickerModalProps) {
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(
    new Set(candidates.map((_, i) => i)) // Default select all
  );

  const toggleSelection = (index: number) => {
    const newSelection = new Set(selectedIndices);
    if (newSelection.has(index)) {
      newSelection.delete(index);
    } else {
      newSelection.add(index);
    }
    setSelectedIndices(newSelection);
  };

  const handleConfirm = () => {
    const selected = candidates.filter((_, i) => selectedIndices.has(i));
    onConfirm(selected);
  };

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex h-auto max-h-[90%] w-[600px] flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold">Select Sub-ideas to Add</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-2 hover:bg-muted"
            title="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4">
          <div className="space-y-3">
            {candidates.map((idea, index) => {
              const isSelected = selectedIndices.has(index);
              return (
                <div
                  key={index}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${isSelected
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/50"
                    }`}
                  onClick={() => toggleSelection(index)}
                >
                  <div
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${isSelected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-muted-foreground"
                      }`}
                  >
                    {isSelected && <Check className="h-3.5 w-3.5" />}
                  </div>
                  <div>
                    <h3 className="font-medium">{idea.title}</h3>
                    <p className="text-sm text-muted-foreground">
                      {idea.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-border px-6 py-4">
          <span className="text-sm text-muted-foreground">
            {selectedIndices.size} selected
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleConfirm} disabled={selectedIndices.size === 0}>
              <Plus className="mr-2 h-4 w-4" />
              Add Ideas
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
