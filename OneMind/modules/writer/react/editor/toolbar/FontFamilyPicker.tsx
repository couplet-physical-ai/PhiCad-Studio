import type { Editor } from "@tiptap/react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FONT_FAMILIES } from "./constants";

const DEFAULT_KEY = "__default__";

interface FontFamilyPickerProps {
  editor: Editor;
  currentFont: string;
}

export function FontFamilyPicker({ editor, currentFont }: FontFamilyPickerProps) {
  const matched = FONT_FAMILIES.find((f) => f.value === currentFont);
  const selectValue = matched ? (matched.value || DEFAULT_KEY) : DEFAULT_KEY;

  const handleChange = (value: string) => {
    if (value === DEFAULT_KEY) {
      editor.chain().focus().unsetFontFamily().run();
    } else {
      editor.chain().focus().setFontFamily(value).run();
    }
  };

  return (
    <Select value={selectValue} onValueChange={handleChange}>
      <SelectTrigger className="h-7 w-[120px] text-xs border-none shadow-none hover:bg-accent">
        <SelectValue placeholder="Font" />
      </SelectTrigger>
      <SelectContent>
        {FONT_FAMILIES.map((f) => (
          <SelectItem key={f.label} value={f.value || DEFAULT_KEY} className="text-xs">
            <span style={{ fontFamily: f.value || "inherit" }}>{f.label}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
