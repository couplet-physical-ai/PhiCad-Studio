import type { EditorContent } from "../shared/types";

const ALLOWED_UPDATE_KEYS = new Set(["title", "content", "content_json", "project_id"]);

function normalizeNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function isEditorContent(value: unknown): value is EditorContent {
  if (!value || typeof value !== "object") return false;
  const record = value as { engine?: unknown; version?: unknown; data?: unknown };
  return (
    record.engine === "tiptap" &&
    typeof record.version === "number" &&
    "data" in record
  );
}

function hasOwnProperty(target: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(target, key);
}

export interface ParsedDocumentUpdatePayload {
  title?: string;
  content?: EditorContent;
  hasProjectId: boolean;
  project_id: string | null;
  usedLegacyContentJson: boolean;
}

export type ParseDocumentUpdatePayloadResult =
  | { ok: true; payload: ParsedDocumentUpdatePayload }
  | { ok: false; status: number; error: string };

export function parseDocumentUpdatePayload(
  body: unknown,
): ParseDocumentUpdatePayloadResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, status: 400, error: "invalid request body" };
  }

  const payload = body as Record<string, unknown>;
  const keys = Object.keys(payload);

  if (keys.length === 0) {
    return { ok: false, status: 400, error: "at least one updatable field required" };
  }

  const unknownKeys = keys.filter((key) => !ALLOWED_UPDATE_KEYS.has(key));
  if (unknownKeys.length > 0) {
    return {
      ok: false,
      status: 400,
      error: `unknown fields: ${unknownKeys.join(", ")}`,
    };
  }

  const hasTitle = hasOwnProperty(payload, "title");
  const hasContent = hasOwnProperty(payload, "content");
  const hasLegacyContent = hasOwnProperty(payload, "content_json");
  const hasProjectId = hasOwnProperty(payload, "project_id");

  if (!hasTitle && !hasContent && !hasLegacyContent && !hasProjectId) {
    return { ok: false, status: 400, error: "at least one updatable field required" };
  }

  const parsed: ParsedDocumentUpdatePayload = {
    hasProjectId,
    project_id: null,
    usedLegacyContentJson: false,
  };

  if (hasTitle) {
    const title = normalizeNonEmptyString(payload.title);
    if (!title) {
      return { ok: false, status: 400, error: "title must be non-empty" };
    }
    parsed.title = title;
  }

  if (hasProjectId) {
    const rawProjectId = payload.project_id;
    if (rawProjectId === null || rawProjectId === undefined) {
      parsed.project_id = null;
    } else {
      const normalized = normalizeNonEmptyString(rawProjectId);
      if (normalized === null) {
        return { ok: false, status: 400, error: "project_id must be a string or null" };
      }
      parsed.project_id = normalized;
    }
  }

  if (hasContent || hasLegacyContent) {
    const candidate = hasContent ? payload.content : payload.content_json;
    if (!isEditorContent(candidate)) {
      return { ok: false, status: 400, error: "INVALID_CONTENT" };
    }
    parsed.content = candidate;
    parsed.usedLegacyContentJson = !hasContent && hasLegacyContent;
  }

  if (
    parsed.title === undefined &&
    parsed.content === undefined &&
    !parsed.hasProjectId
  ) {
    return { ok: false, status: 400, error: "at least one updatable field required" };
  }

  return { ok: true, payload: parsed };
}
