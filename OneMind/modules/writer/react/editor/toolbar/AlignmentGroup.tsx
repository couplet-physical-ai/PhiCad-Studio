import type { Editor } from "@tiptap/react";
import { AlignLeft, AlignCenter, AlignRight, AlignJustify } from "lucide-react";
import { ToolbarButton } from "./ToolbarButton";

const ALIGNMENTS = [
  { value: "left", icon: AlignLeft, tooltip: "Align left (Cmd+Shift+L)" },
  { value: "center", icon: AlignCenter, tooltip: "Center (Cmd+Shift+E)" },
  { value: "right", icon: AlignRight, tooltip: "Align right (Cmd+Shift+R)" },
  { value: "justify", icon: AlignJustify, tooltip: "Justify (Cmd+Shift+J)" },
] as const;

interface AlignmentGroupProps {
  editor: Editor;
  currentAlign: string;
}

export function AlignmentGroup({ editor, currentAlign }: AlignmentGroupProps) {
  return (
    <div className="flex items-center">
      {ALIGNMENTS.map((a) => (
        <ToolbarButton
          key={a.value}
          icon={a.icon}
          active={currentAlign === a.value}
          tooltip={a.tooltip}
          onClick={() => editor.chain().focus().setTextAlign(a.value).run()}
        />
      ))}
    </div>
  );
}
