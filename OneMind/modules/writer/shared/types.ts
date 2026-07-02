/**
 * Writer Module - Shared Types
 *
 * Type definitions shared between React frontend and TypeScript backend.
 */

export const VERSION_SOURCES = ["manual", "ai_apply", "pre_restore"] as const;
export type VersionSource = (typeof VERSION_SOURCES)[number];

export interface EditorContent {
  engine: "tiptap";
  version: number;
  data: unknown;
}

export interface WriterDocument {
  id: string;
  workspace_id: string;
  title: string;
  content_engine: string;
  content_version: number;
  content_json: EditorContent;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  project_id: string | null;
}

export interface WriterVersion {
  id: string;
  document_id: string;
  source: VersionSource;
  title: string | null;
  content_snapshot: EditorContent;
  thread_id: string | null;
  message_id: string | null;
  edit_id: string | null;
  created_at: Date;
}

export interface WriterThreadLink {
  id: string;
  document_id: string;
  chat_id: string;
  is_pinned: boolean;
  is_closed: boolean;
  display_order: number;
  created_at: Date;
  updated_at: Date;
}

export interface DocumentListItem {
  id: string;
  title: string;
  updated_at: Date;
}

export interface VersionListItem {
  id: string;
  source: VersionSource;
  title: string | null;
  thread_id: string | null;
  created_at: Date;
}

export interface ThreadListItem {
  id: string;
  chat_id: string;
  chat_title: string;
  is_pinned: boolean;
  is_closed: boolean;
  display_order: number;
  created_at: Date;
}

export interface CreateDocumentParams {
  workspace_id: string;
  title: string;
}

export interface UpdateDocumentParams {
  title?: string;
  content?: EditorContent;
}

export interface CreateVersionParams {
  document_id: string;
  source: VersionSource;
  title?: string;
  thread_id?: string;
  message_id?: string;
  edit_id?: string;
}

export interface CreateThreadParams {
  document_id: string;
  title?: string;
}

export interface UpdateThreadParams {
  title?: string;
  is_pinned?: boolean;
  is_closed?: boolean;
}

export interface RestoreVersionParams {
  version_id: string;
}

export interface SearchDocumentsParams {
  workspace_id: string;
  query: string;
  limit?: number;
}

export type WriterErrorCode =
  | "DOCUMENT_NOT_FOUND"
  | "DOCUMENT_DELETED"
  | "VERSION_NOT_FOUND"
  | "THREAD_NOT_FOUND"
  | "INVALID_CONTENT"
  | "RESTORE_FAILED";
