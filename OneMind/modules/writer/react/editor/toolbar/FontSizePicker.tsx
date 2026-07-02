import { useState, useRef, useEffect } from "react";
import type { Editor } from "@tiptap/react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ChevronDown } from "lucide-react";
import { FONT_SIZES } from "./constants";

interface FontSizePickerProps {
  editor: Editor;
  currentSize: string;
}

function parseSizeValue(raw: string): string {
  if (!raw) return "";
  // "16px" → "16", "1.5rem" → "1.5rem" (pass-through), "14" → "14"
  const match = raw.match(/^(\d+(?:\.\d+)?)\s*px?$/);
  return match?.[1] ?? raw;
}

export function FontSizePicker({ editor, currentSize }: FontSizePickerProps) {
  const displayValue = parseSizeValue(currentSize);
  const [inputValue, setInputValue] = useState(displayValue);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setInputValue(displayValue);
  }, [displayValue]);

  const applySize = (size: string) => {
    const num = parseInt(size, 10);
    if (isNaN(num) || num < 1 || num > 200) return;
    editor.chain().focus().setFontSize(`${num}px`).run();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      applySize(inputValue);
      inputRef.current?.blur();
    }
  };

  const handleBlur = () => {
    if (inputValue && inputValue !== displayValue) {
      applySize(inputValue);
    } else {
      setInputValue(displayValue);
    }
  };

  return (
    <div className="flex items-center">
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        className="h-7 w-10 text-center text-xs border border-transparent rounded-l hover:border-border focus:border-border focus:outline-none bg-transparent"
        placeholder="—"
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="h-7 w-5 p-0 rounded-l-none">
            <ChevronDown className="h-3 w-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-20 p-1" align="start">
          <div className="flex flex-col">
            {FONT_SIZES.map((size) => (
              <button
                key={size}
                className={`px-2 py-1 text-xs text-left rounded hover:bg-accent ${
                  displayValue === String(size) ? "bg-accent font-medium" : ""
                }`}
                onClick={() => {
                  applySize(String(size));
                  setOpen(false);
                }}
              >
                {size}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
