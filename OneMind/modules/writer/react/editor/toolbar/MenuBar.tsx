import type { Editor } from "@tiptap/react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuShortcut,
} from "@/components/ui/dropdown-menu";
import { ArrowLeft } from "lucide-react";

type PageMode = "pageless" | "paged";
type SaveStatus = "idle" | "saving" | "saved" | "error";

interface MenuBarProps {
  editor: Editor;
  onLinkClick: () => void;
  pageMode: PageMode;
  onPageModeChange: (mode: PageMode) => void;
  saveStatus: SaveStatus;
  title: string;
  onTitleChange: (title: string) => void;
  onBack?: () => void;
}

export function MenuBar({
  editor,
  onLinkClick,
  pageMode,
  onPageModeChange,
  saveStatus,
  title,
  onTitleChange,
  onBack,
}: MenuBarProps) {
  return (
    <div className="flex items-center h-8 px-1 border-b border-border bg-background shrink-0 text-xs">
      {/* Back button */}
      {onBack && (
        <Button variant="ghost" size="sm" onClick={onBack} className="h-6 w-6 p-0 mr-1">
          <ArrowLeft className="h-3.5 w-3.5" />
        </Button>
      )}

      {/* File menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">File</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[180px]">
          <DropdownMenuItem onClick={() => window.print()}>
            Print
            <DropdownMenuShortcut>Cmd+P</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Edit menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">Edit</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[180px]">
          <DropdownMenuItem onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}>
            Undo
            <DropdownMenuShortcut>Cmd+Z</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}>
            Redo
            <DropdownMenuShortcut>Cmd+Shift+Z</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => editor.chain().focus().selectAll().run()}>
            Select all
            <DropdownMenuShortcut>Cmd+A</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* View menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">View</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[180px]">
          <DropdownMenuCheckboxItem
            checked={pageMode === "pageless"}
            onCheckedChange={() => onPageModeChange("pageless")}
          >
            Pageless
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={pageMode === "paged"}
            onCheckedChange={() => onPageModeChange("paged")}
          >
            Paged
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Insert menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">Insert</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[180px]">
          <DropdownMenuItem onClick={() => {
            const url = window.prompt("Image URL:");
            if (url) editor.chain().focus().setImage({ src: url }).run();
          }}>
            Image
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onLinkClick}>
            Link
            <DropdownMenuShortcut>Cmd+K</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => editor.chain().focus().setHorizontalRule().run()}>
            Horizontal rule
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Callout</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem onClick={() => editor.chain().focus().setCallout("info").run()}>
                Info
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => editor.chain().focus().setCallout("warning").run()}>
                Warning
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => editor.chain().focus().setCallout("error").run()}>
                Error
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => editor.chain().focus().setCallout("success").run()}>
                Success
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem onClick={() => editor.chain().focus().setToggle().run()}>
            Toggle
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Format menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">Format</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[200px]">
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Text</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem onClick={() => editor.chain().focus().toggleBold().run()}>
                Bold
                <DropdownMenuShortcut>Cmd+B</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => editor.chain().focus().toggleItalic().run()}>
                Italic
                <DropdownMenuShortcut>Cmd+I</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => editor.chain().focus().toggleUnderline().run()}>
                Underline
                <DropdownMenuShortcut>Cmd+U</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => editor.chain().focus().toggleStrike().run()}>
                Strikethrough
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => editor.chain().focus().toggleSuperscript().run()}>
                Superscript
                <DropdownMenuShortcut>Cmd+.</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => editor.chain().focus().toggleSubscript().run()}>
                Subscript
                <DropdownMenuShortcut>Cmd+,</DropdownMenuShortcut>
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Heading</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem onClick={() => editor.chain().focus().setNode("paragraph").run()}>
                Normal text
                <DropdownMenuShortcut>Cmd+Alt+0</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
                Heading 1
                <DropdownMenuShortcut>Cmd+Alt+1</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
                Heading 2
                <DropdownMenuShortcut>Cmd+Alt+2</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
                Heading 3
                <DropdownMenuShortcut>Cmd+Alt+3</DropdownMenuShortcut>
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Align</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem onClick={() => editor.chain().focus().setTextAlign("left").run()}>
                Left
                <DropdownMenuShortcut>Cmd+Shift+L</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => editor.chain().focus().setTextAlign("center").run()}>
                Center
                <DropdownMenuShortcut>Cmd+Shift+E</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => editor.chain().focus().setTextAlign("right").run()}>
                Right
                <DropdownMenuShortcut>Cmd+Shift+R</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => editor.chain().focus().setTextAlign("justify").run()}>
                Justify
                <DropdownMenuShortcut>Cmd+Shift+J</DropdownMenuShortcut>
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Spacing</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem onClick={() => editor.chain().focus().setLineHeight("1").run()}>
                Single
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => editor.chain().focus().setLineHeight("1.15").run()}>
                1.15
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => editor.chain().focus().setLineHeight("1.5").run()}>
                1.5
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => editor.chain().focus().setLineHeight("2").run()}>
                Double
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}>
            Clear formatting
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Tools menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">Tools</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[180px]">
          <DropdownMenuItem disabled>Word count</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Document title */}
      <input
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        placeholder="Untitled document"
        className="flex-1 min-w-0 h-6 px-2 text-xs border border-transparent rounded hover:border-border focus:border-border focus:outline-none bg-transparent truncate"
      />

      {/* Save status */}
      <SaveStatusBadge status={saveStatus} />
    </div>
  );
}

function SaveStatusBadge({ status }: { status: SaveStatus }) {
  if (status === "idle") return null;

  const text =
    status === "saving" ? "Saving..." :
    status === "saved" ? "Saved" :
    "Save failed";

  const color =
    status === "saving" ? "text-muted-foreground" :
    status === "saved" ? "text-green-500" :
    "text-destructive";

  return <span className={`text-[10px] px-2 ${color}`}>{text}</span>;
}
