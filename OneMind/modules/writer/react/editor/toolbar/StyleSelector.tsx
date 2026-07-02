import type { Editor } from "@tiptap/react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const STYLES = [
  { label: "Normal text", value: "paragraph" },
  { label: "Heading 1", value: "h1" },
  { label: "Heading 2", value: "h2" },
  { label: "Heading 3", value: "h3" },
] as const;

interface StyleSelectorProps {
  editor: Editor;
  headingLevel: 0 | 1 | 2 | 3;
}

export function StyleSelector({ editor, headingLevel }: StyleSelectorProps) {
  const currentValue = headingLevel === 0 ? "paragraph" : `h${headingLevel}`;

  const handleChange = (value: string) => {
    const chain = editor.chain().focus();
    switch (value) {
      case "paragraph":
        chain.setNode("paragraph").run();
        break;
      case "h1":
        chain.toggleHeading({ level: 1 }).run();
        break;
      case "h2":
        chain.toggleHeading({ level: 2 }).run();
        break;
      case "h3":
        chain.toggleHeading({ level: 3 }).run();
        break;
    }
  };

  return (
    <Select value={currentValue} onValueChange={handleChange}>
      <SelectTrigger className="h-7 w-[130px] text-xs border-none shadow-none hover:bg-accent">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {STYLES.map((s) => (
          <SelectItem key={s.value} value={s.value} className="text-xs">
            <span
              className={
                s.value === "h1" ? "text-lg font-bold" :
                s.value === "h2" ? "text-base font-semibold" :
                s.value === "h3" ? "text-sm font-semibold" : "text-sm"
              }
            >
              {s.label}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
