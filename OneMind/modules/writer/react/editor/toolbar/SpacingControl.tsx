import type { Editor } from "@tiptap/react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ArrowUpDown } from "lucide-react";
import { LINE_SPACINGS } from "./constants";
import { useState } from "react";

interface SpacingControlProps {
  editor: Editor;
  currentSpacing: string;
}

export function SpacingControl({ editor, currentSpacing }: SpacingControlProps) {
  const [open, setOpen] = useState(false);
  const activeValue = currentSpacing || "1";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
              <ArrowUpDown className="h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          Line spacing
        </TooltipContent>
      </Tooltip>
      <PopoverContent className="w-36 p-1" align="start">
        <div className="flex flex-col">
          {LINE_SPACINGS.map((s) => (
            <button
              key={s.value}
              className={`px-3 py-1.5 text-xs text-left rounded hover:bg-accent ${
                activeValue === s.value ? "bg-accent font-medium" : ""
              }`}
              onClick={() => {
                editor.chain().focus().setLineHeight(s.value).run();
                setOpen(false);
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
