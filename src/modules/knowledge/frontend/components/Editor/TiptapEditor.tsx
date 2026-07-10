import { useEffect, useRef } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import type { EditorContent as EditorContentType } from "../../../shared/types";

interface TiptapEditorProps {
  initialContent?: EditorContentType;
  onChange?: (content: EditorContentType) => void;
  onReady?: (editor: Editor) => void;
  readOnly?: boolean;
}

function isEmptyContent(content?: EditorContentType): boolean {
  if (!content?.data) return true;
  const data = content.data as { type?: string; content?: unknown[] };
  if (!data || typeof data !== "object") return true;
  if (data.type === "doc") {
    if (!Array.isArray(data.content) || data.content.length === 0) return true;
    if (data.content.length === 1) {
      const first = data.content[0] as { type?: string; content?: unknown[] };
      if (first.type === "paragraph" && !first.content?.length) return true;
    }
  }
  return false;
}

export function TiptapEditor({
  initialContent,
  onChange,
  onReady,
  readOnly = false,
}: TiptapEditorProps) {
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Placeholder.configure({
        placeholder: "Start typing...",
        emptyEditorClass: "tiptap-is-empty",
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Image.configure({ inline: false, allowBase64: true }),
      Link.configure({ openOnClick: false }),
    ],
    content: (() => {
      const data = initialContent?.data;
      if (data && typeof data === "object" && "type" in data) {
        return data as object;
      }
      return { type: "doc", content: [{ type: "paragraph" }] };
    })(),
    editable: !readOnly,
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    onUpdate: ({ editor }) => {
      onChangeRef.current?.({ engine: "tiptap", version: 1, data: editor.getJSON() });
    },
    onCreate: ({ editor }) => {
      onReady?.(editor);
    },
    editorProps: {
      attributes: {
        class:
          "prose prose-sm dark:prose-invert focus:outline-none mx-auto max-w-[46rem] px-6 py-8 min-h-[200px]",
      },
    },
  });

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const newData = initialContent?.data;
    const currentData = editor.getJSON();
    if (JSON.stringify(newData) !== JSON.stringify(currentData)) {
      queueMicrotask(() => {
        if (!editor.isDestroyed) {
          editor.commands.setContent(
            (newData as object) || {
              type: "doc",
              content: [{ type: "paragraph" }],
            },
            { emitUpdate: false },
          );
        }
      });
    }
  }, [initialContent, editor]);

  useEffect(() => {
    if (editor) {
      editor.setEditable(!readOnly);
    }
  }, [editor, readOnly]);

  useEffect(() => {
    return () => {
      editor?.destroy();
    };
  }, [editor]);

  if (!editor) {
    return null;
  }

  return (
    <div className="h-full w-full">
      <EditorContent editor={editor} />
    </div>
  );
}

export { isEmptyContent };
