import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";

export interface EditorToolbarState {
  isBold: boolean;
  isItalic: boolean;
  isUnderline: boolean;
  isStrike: boolean;
  isCode: boolean;
  isSuperscript: boolean;
  isSubscript: boolean;
  isLink: boolean;
  isBulletList: boolean;
  isOrderedList: boolean;
  isTaskList: boolean;
  isBlockquote: boolean;
  isCodeBlock: boolean;
  headingLevel: 0 | 1 | 2 | 3;
  textAlign: "left" | "center" | "right" | "justify";
  fontFamily: string;
  fontSize: string;
  lineHeight: string;
  canUndo: boolean;
  canRedo: boolean;
}

const EMPTY_STATE: EditorToolbarState = {
  isBold: false, isItalic: false, isUnderline: false, isStrike: false,
  isCode: false, isSuperscript: false, isSubscript: false, isLink: false,
  isBulletList: false, isOrderedList: false, isTaskList: false,
  isBlockquote: false, isCodeBlock: false,
  headingLevel: 0, textAlign: "left",
  fontFamily: "", fontSize: "", lineHeight: "",
  canUndo: false, canRedo: false,
};

export function useEditorToolbarState(editor: Editor | null): EditorToolbarState | null {
  return useEditorState({
    editor,
    selector: (ctx): EditorToolbarState => {
      const e = ctx.editor;
      if (!e) return EMPTY_STATE;
      return {
        isBold: e.isActive("bold"),
        isItalic: e.isActive("italic"),
        isUnderline: e.isActive("underline"),
        isStrike: e.isActive("strike"),
        isCode: e.isActive("code"),
        isSuperscript: e.isActive("superscript"),
        isSubscript: e.isActive("subscript"),
        isLink: e.isActive("link"),
        isBulletList: e.isActive("bulletList"),
        isOrderedList: e.isActive("orderedList"),
        isTaskList: e.isActive("taskList"),
        isBlockquote: e.isActive("blockquote"),
        isCodeBlock: e.isActive("codeBlock"),
        headingLevel: (
          e.isActive("heading", { level: 1 }) ? 1 :
          e.isActive("heading", { level: 2 }) ? 2 :
          e.isActive("heading", { level: 3 }) ? 3 : 0
        ) as 0 | 1 | 2 | 3,
        textAlign: (
          e.isActive({ textAlign: "center" }) ? "center" :
          e.isActive({ textAlign: "right" }) ? "right" :
          e.isActive({ textAlign: "justify" }) ? "justify" : "left"
        ) as "left" | "center" | "right" | "justify",
        fontFamily: (e.getAttributes("textStyle").fontFamily as string) || "",
        fontSize: (e.getAttributes("textStyle").fontSize as string) || "",
        lineHeight: (e.getAttributes("paragraph").lineHeight as string) || "",
        canUndo: e.can().undo(),
        canRedo: e.can().redo(),
      };
    },
  });
}
