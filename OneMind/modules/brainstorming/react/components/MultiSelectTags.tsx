import { useMemo, useState } from "react";
import { MultiSelectPropertyEditor } from "../../../../modules/knowledge/react/components/Properties/MultiSelectPropertyEditor";

interface MultiSelectTagsProps {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
}

export function MultiSelectTags({ value, onChange, placeholder }: MultiSelectTagsProps) {
  const [options, setOptions] = useState<string[]>(value);
  const mergedOptions = useMemo(() => Array.from(new Set([...options, ...value])), [options, value]);

  return (
    <MultiSelectPropertyEditor
      value={value}
      options={mergedOptions}
      onChange={onChange}
      onOptionsChange={setOptions}
      placeholder={placeholder ?? "Add tag"}
    />
  );
}
