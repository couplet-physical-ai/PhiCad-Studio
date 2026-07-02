import type { Editor } from "@tiptap/react";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Superscript,
  Subscript,
  Link as LinkIcon,
  List,
  ListOrdered,
  CheckSquare,
  Undo,
  Redo,
  Highlighter,
  Palette,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { ToolbarButton } from "./ToolbarButton";
import { StyleSelector } from "./StyleSelector";
import { FontFamilyPicker } from "./FontFamilyPicker";
import { FontSizePicker } from "./FontSizePicker";
import { AlignmentGroup } from "./AlignmentGroup";
import { SpacingControl } from "./SpacingControl";
import { ColorPicker, type ColorOption } from "../ColorPicker";
import { useEditorToolbarState } from "./useEditorForceUpdate";

interface FormattingToolbarProps {
  editor: Editor;
  onLinkClick: () => void;
}

export function FormattingToolbar({ editor, onLinkClick }: FormattingToolbarProps) {
  const state = useEditorToolbarState(editor);
  if (!state) return null;

  const handleColorChange = (color: ColorOption, mode: "text" | "background") => {
    if (mode === "text") {
      if (color.name === "Default") {
        editor.chain().focus().unsetColor().run();
      } else {
        editor.chain().focus().setColor(color.textColor).run();
      }
    } else {
      if (color.name === "Default") {
        editor.chain().focus().unsetHighlight().run();
      } else {
        editor.chain().focus().setHighlight({ color: color.bgColor }).run();
      }
    }
  };

  return (
    <div className="flex items-center gap-0.5 px-2 h-9 border-b border-border bg-background shrink-0 overflow-x-auto">
      {/* Undo / Redo */}
      <ToolbarButton icon={Undo} onClick={() => editor.chain().focus().undo().run()} disabled={!state.canUndo} tooltip="Undo (Cmd+Z)" />
      <ToolbarButton icon={Redo} onClick={() => editor.chain().focus().redo().run()} disabled={!state.canRedo} tooltip="Redo (Cmd+Shift+Z)" />

      <Separator orientation="vertical" className="mx-1 h-5" />

      {/* Style / Font / Size */}
      <StyleSelector editor={editor} headingLevel={state.headingLevel} />
      <FontFamilyPicker editor={editor} currentFont={state.fontFamily} />
      <FontSizePicker editor={editor} currentSize={state.fontSize} />

      <Separator orientation="vertical" className="mx-1 h-5" />

      {/* Inline formatting */}
      <ToolbarButton icon={Bold} onClick={() => editor.chain().focus().toggleBold().run()} active={state.isBold} tooltip="Bold (Cmd+B)" />
      <ToolbarButton icon={Italic} onClick={() => editor.chain().focus().toggleItalic().run()} active={state.isItalic} tooltip="Italic (Cmd+I)" />
      <ToolbarButton icon={Underline} onClick={() => editor.chain().focus().toggleUnderline().run()} active={state.isUnderline} tooltip="Underline (Cmd+U)" />
      <ToolbarButton icon={Strikethrough} onClick={() => editor.chain().focus().toggleStrike().run()} active={state.isStrike} tooltip="Strikethrough" />
      <ToolbarButton icon={Superscript} onClick={() => editor.chain().focus().toggleSuperscript().run()} active={state.isSuperscript} tooltip="Superscript (Cmd+.)" />
      <ToolbarButton icon={Subscript} onClick={() => editor.chain().focus().toggleSubscript().run()} active={state.isSubscript} tooltip="Subscript (Cmd+,)" />

      <Separator orientation="vertical" className="mx-1 h-5" />

      {/* Color */}
      <ColorPicker onColorChange={handleColorChange} asChild>
        <button className="h-7 w-7 p-0 inline-flex items-center justify-center rounded-md hover:bg-accent" title="Text color">
          <Palette className="h-3.5 w-3.5" />
        </button>
      </ColorPicker>
      <ColorPicker onColorChange={(c) => handleColorChange(c, "background")} asChild>
        <button className="h-7 w-7 p-0 inline-flex items-center justify-center rounded-md hover:bg-accent" title="Highlight color">
          <Highlighter className="h-3.5 w-3.5" />
        </button>
      </ColorPicker>

      {/* Link */}
      <ToolbarButton icon={LinkIcon} onClick={onLinkClick} active={state.isLink} tooltip="Insert link" />

      <Separator orientation="vertical" className="mx-1 h-5" />

      {/* Alignment */}
      <AlignmentGroup editor={editor} currentAlign={state.textAlign} />
      <SpacingControl editor={editor} currentSpacing={state.lineHeight} />

      <Separator orientation="vertical" className="mx-1 h-5" />

      {/* Lists */}
      <ToolbarButton icon={List} onClick={() => editor.chain().focus().toggleBulletList().run()} active={state.isBulletList} tooltip="Bullet list" />
      <ToolbarButton icon={ListOrdered} onClick={() => editor.chain().focus().toggleOrderedList().run()} active={state.isOrderedList} tooltip="Numbered list" />
      <ToolbarButton icon={CheckSquare} onClick={() => editor.chain().focus().toggleTaskList().run()} active={state.isTaskList} tooltip="Checklist" />
    </div>
  );
}
