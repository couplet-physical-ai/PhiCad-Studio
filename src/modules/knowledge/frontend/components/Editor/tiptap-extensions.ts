import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import type { Extensions } from "@tiptap/react";

/**
 * The single source of truth for the knowledge page editor schema. Both the
 * live editor (TiptapEditor) and the markdown importer (generateJSON) build
 * from this so imported docs and typed docs share one node/mark set.
 * Returns fresh instances each call — Tiptap extension instances should not be
 * reused across editor lifecycles.
 */
export function createKnowledgeEditorExtensions(): Extensions {
  return [
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
  ];
}
