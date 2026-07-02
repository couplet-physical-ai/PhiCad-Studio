import { createModuleV2 } from "../../_kit/createModule";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { v7 as uuidv7 } from "uuid";
import { DocumentRepository } from "./db/repositories/document-repository";
import { VersionRepository } from "./db/repositories/version-repository";
import { ThreadLinkRepository } from "./db/repositories/thread-link-repository";
import { WriterDocumentTarget } from "./adapters/writer-document-target";
import { readDocumentToolSpec, createReadDocumentToolHandler } from "./tools/read-document-tool";
import { documentInfoToolSpec, createDocumentInfoToolHandler } from "./tools/document-info-tool";
import { parseDocumentUpdatePayload } from "./update-document-payload";
import type {
  EditorContent,
  CreateVersionParams,
  CreateThreadParams,
  UpdateThreadParams,
  VersionSource,
} from "../shared/types";

function normalizeNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export const writerModule = createModuleV2("writer", {
  label: "Writer",
  namespace: "space.writer",
  version: "1.0.0",
  kind: "space",

  async onActivate(ctx) {
    ctx.logger.info("Writer module activating...");

    // Defensive schema bootstrap: keeps writer usable when a DB is missing
    // writer tables (for example after migration drift or DB resets).
    await ctx.db.createTable(
      "document",
      `
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      title TEXT NOT NULL,
      content_engine TEXT NOT NULL DEFAULT 'tiptap',
      content_version INTEGER NOT NULL DEFAULT 1,
      content_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER,
      project_id TEXT
    `
    );

    // Defensive: add project_id column if missing (existing DBs)
    try {
      await ctx.db.execute(
        "ALTER TABLE $table ADD COLUMN project_id TEXT",
        "document"
      );
    } catch {
      // Column already exists — ignore
    }

    await ctx.db.createTable(
      "version",
      `
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL REFERENCES module_writer_document(id) ON DELETE CASCADE,
      source TEXT NOT NULL,
      title TEXT,
      content_snapshot TEXT NOT NULL,
      thread_id TEXT,
      message_id TEXT,
      edit_id TEXT,
      created_at INTEGER NOT NULL
    `
    );

    await ctx.db.createTable(
      "thread_link",
      `
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL REFERENCES module_writer_document(id) ON DELETE CASCADE,
      chat_id TEXT NOT NULL,
      is_pinned INTEGER NOT NULL DEFAULT 0,
      is_closed INTEGER NOT NULL DEFAULT 0,
      display_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    `
    );

    const db = ctx.db.getRawDb() as BunSQLiteDatabase<Record<string, unknown>>;
    const documentRepo = new DocumentRepository(db);
    const writerTarget = new WriterDocumentTarget(documentRepo);

    if (ctx.core.contentEditor) {
      ctx.core.contentEditor.registerTarget(writerTarget);
      ctx.logger.info("Registered WriterDocumentTarget for content editing");
    }

    if (ctx.core.toolRegistry) {
      const readHandler = createReadDocumentToolHandler(writerTarget);
      ctx.core.toolRegistry.registerTool(readDocumentToolSpec, readHandler);
      ctx.logger.info("Registered writer.read_document tool");

      const infoHandler = createDocumentInfoToolHandler(writerTarget);
      ctx.core.toolRegistry.registerTool(documentInfoToolSpec, infoHandler);
      ctx.logger.info("Registered writer.document_info tool");
    }

    ctx.logger.info("Writer module activated");
    ctx.logger.info("Endpoints available at /api/modules/writer/*");
  },

  async onDeactivate(ctx) {
    ctx.logger.info("Writer module deactivated");
  },

  endpoints(ctx, http, _ws) {
    const db = ctx.db.getRawDb() as BunSQLiteDatabase<Record<string, unknown>>;
    const documentRepo = new DocumentRepository(db);
    const versionRepo = new VersionRepository(db);
    const threadLinkRepo = new ThreadLinkRepository(db);

    const defaultContent: EditorContent = {
      engine: "tiptap",
      version: 1,
      data: { type: "doc", content: [{ type: "paragraph" }] },
    };

    http.get("/health", async () => {
      return Response.json({ ok: true, module: "writer" });
    });

    http.post("/documents", async ({ req }) => {
      try {
        const body = (await req.json()) as {
          workspace_id?: unknown;
          title?: unknown;
          project_id?: unknown;
        };
        const workspaceId = normalizeNonEmptyString(body.workspace_id);
        if (!workspaceId) {
          return Response.json({ error: "workspace_id required" }, { status: 400 });
        }
        const title = normalizeNonEmptyString(body.title) ?? "Untitled Document";
        const projectId = normalizeNonEmptyString(body.project_id);
        const doc = await documentRepo.create({
          id: uuidv7(),
          workspace_id: workspaceId,
          title,
          content_json: defaultContent,
          content_engine: "tiptap",
          content_version: 1,
          created_at: new Date(),
          updated_at: new Date(),
          project_id: projectId,
        });
        return Response.json({ document: doc }, { status: 201 });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return Response.json({ error: message }, { status: 400 });
      }
    });

    http.get("/documents", async ({ query }) => {
      try {
        const workspaceId = normalizeNonEmptyString(query.get("workspace_id"));
        if (!workspaceId) {
          return Response.json({ error: "workspace_id required" }, { status: 400 });
        }
        const documents = await documentRepo.findByWorkspace(workspaceId);
        return Response.json({ documents });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return Response.json({ error: message }, { status: 500 });
      }
    });

    http.get("/documents/search", async ({ query }) => {
      try {
        const workspaceId = normalizeNonEmptyString(query.get("workspace_id"));
        const q = query.get("q") ?? "";
        const limit = parseInt(query.get("limit") ?? "20", 10);
        if (!workspaceId) {
          return Response.json({ error: "workspace_id required" }, { status: 400 });
        }
        const documents = await documentRepo.search(workspaceId, q, limit);
        return Response.json({ documents });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return Response.json({ error: message }, { status: 500 });
      }
    });

    http.get("/documents/:documentId", async ({ params }) => {
      try {
        const documentId = params.getOrThrow("documentId");
        const doc = await documentRepo.findById(documentId);
        if (!doc) {
          return Response.json({ error: "DOCUMENT_NOT_FOUND" }, { status: 404 });
        }
        return Response.json({ document: doc });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return Response.json({ error: message }, { status: 500 });
      }
    });

    http.patch("/documents/:documentId", async ({ req, params }) => {
      try {
        const documentId = params.getOrThrow("documentId");
        const rawBody = (await req.json()) as unknown;
        const parsedUpdate = parseDocumentUpdatePayload(rawBody);
        if (!parsedUpdate.ok) {
          return Response.json({ error: parsedUpdate.error }, { status: parsedUpdate.status });
        }
        const updates = parsedUpdate.payload;
        const doc = await documentRepo.findById(documentId);
        if (!doc) {
          return Response.json({ error: "DOCUMENT_NOT_FOUND" }, { status: 404 });
        }
        if (updates.usedLegacyContentJson) {
          ctx.logger.warn(
            "Writer PATCH /documents received legacy content_json payload; use content instead."
          );
        }
        let updated = doc;
        if (updates.title !== undefined) {
          updated = await documentRepo.updateTitle(documentId, updates.title);
        }
        if (updates.content !== undefined) {
          updated = await documentRepo.updateContent(documentId, updates.content);
        }
        if (updates.hasProjectId) {
          updated = await documentRepo.updateProjectId(documentId, updates.project_id);
        }
        return Response.json({ document: updated });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return Response.json({ error: message }, { status: 400 });
      }
    });

    http.delete("/documents/:documentId", async ({ params }) => {
      try {
        const documentId = params.getOrThrow("documentId");
        const doc = await documentRepo.findById(documentId);
        if (!doc) {
          return Response.json({ error: "DOCUMENT_NOT_FOUND" }, { status: 404 });
        }
        await documentRepo.softDelete(documentId);
        return Response.json({ deleted: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return Response.json({ error: message }, { status: 500 });
      }
    });

    http.post("/documents/bulk-delete", async ({ req }) => {
      try {
        const body = (await req.json()) as { ids?: string[] };
        const ids = body.ids ?? [];
        if (!Array.isArray(ids) || ids.length === 0) {
          return Response.json({ error: "ids array required" }, { status: 400 });
        }
        const count = await documentRepo.softDeleteMany(ids);
        return Response.json({ deleted: count });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return Response.json({ error: message }, { status: 500 });
      }
    });

    http.get("/documents/:documentId/versions", async ({ params }) => {
      try {
        const documentId = params.getOrThrow("documentId");
        const versions = await versionRepo.findByDocument(documentId);
        return Response.json({ versions });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return Response.json({ error: message }, { status: 500 });
      }
    });

    http.post("/documents/:documentId/versions", async ({ req, params }) => {
      try {
        const documentId = params.getOrThrow("documentId");
        const body = (await req.json()) as CreateVersionParams;
        const doc = await documentRepo.findById(documentId);
        if (!doc) {
          return Response.json({ error: "DOCUMENT_NOT_FOUND" }, { status: 404 });
        }
        const version = await versionRepo.create({
          id: uuidv7(),
          document_id: documentId,
          source: body.source,
          title: body.title ?? null,
          content_snapshot: doc.content_json as EditorContent,
          thread_id: body.thread_id ?? null,
          message_id: body.message_id ?? null,
          edit_id: body.edit_id ?? null,
          created_at: new Date(),
        });
        return Response.json({ version }, { status: 201 });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return Response.json({ error: message }, { status: 400 });
      }
    });

    http.get("/versions/:versionId", async ({ params }) => {
      try {
        const versionId = params.getOrThrow("versionId");
        const version = await versionRepo.findById(versionId);
        if (!version) {
          return Response.json({ error: "VERSION_NOT_FOUND" }, { status: 404 });
        }
        return Response.json({ version });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return Response.json({ error: message }, { status: 500 });
      }
    });

    http.post("/versions/:versionId/restore", async ({ params }) => {
      try {
        const versionId = params.getOrThrow("versionId");
        const version = await versionRepo.findById(versionId);
        if (!version) {
          return Response.json({ error: "VERSION_NOT_FOUND" }, { status: 404 });
        }
        const doc = await documentRepo.findById(version.document_id);
        if (!doc) {
          return Response.json({ error: "DOCUMENT_NOT_FOUND" }, { status: 404 });
        }

        const preRestoreSnapshot = await versionRepo.create({
          id: uuidv7(),
          document_id: version.document_id,
          source: "pre_restore" as VersionSource,
          title: null,
          content_snapshot: doc.content_json as EditorContent,
          thread_id: null,
          message_id: null,
          edit_id: null,
          created_at: new Date(),
        });

        await documentRepo.updateContent(
          version.document_id,
          version.content_snapshot as EditorContent
        );

        return Response.json({
          restored: true,
          pre_restore_version_id: preRestoreSnapshot.id,
          restored_content: version.content_snapshot,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return Response.json({ error: message }, { status: 500 });
      }
    });

    http.get("/documents/:documentId/threads", async ({ params, query }) => {
      try {
        const documentId = params.getOrThrow("documentId");
        const includeClosed = query.get("include_closed") === "true";
        const threads = await threadLinkRepo.findByDocument(documentId, includeClosed);
        return Response.json({ threads });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return Response.json({ error: message }, { status: 500 });
      }
    });

    http.post("/documents/:documentId/threads", async ({ req, params }) => {
      try {
        const documentId = params.getOrThrow("documentId");
        const body = (await req.json()) as CreateThreadParams & { chat_id: string };
        const doc = await documentRepo.findById(documentId);
        if (!doc) {
          return Response.json({ error: "DOCUMENT_NOT_FOUND" }, { status: 404 });
        }
        const displayOrder = await threadLinkRepo.getNextDisplayOrder(documentId);
        const link = await threadLinkRepo.create({
          id: uuidv7(),
          document_id: documentId,
          chat_id: body.chat_id,
          is_pinned: false,
          is_closed: false,
          display_order: displayOrder,
          created_at: new Date(),
          updated_at: new Date(),
        });
        return Response.json({ thread: link }, { status: 201 });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return Response.json({ error: message }, { status: 400 });
      }
    });

    http.patch("/threads/:threadId", async ({ req, params }) => {
      try {
        const threadId = params.getOrThrow("threadId");
        const updates = (await req.json()) as UpdateThreadParams;
        const link = await threadLinkRepo.findById(threadId);
        if (!link) {
          return Response.json({ error: "THREAD_NOT_FOUND" }, { status: 404 });
        }
        const updated = await threadLinkRepo.update(threadId, {
          is_pinned: updates.is_pinned,
          is_closed: updates.is_closed,
        });
        return Response.json({ thread: updated });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return Response.json({ error: message }, { status: 400 });
      }
    });

    http.delete("/threads/:threadId", async ({ params }) => {
      try {
        const threadId = params.getOrThrow("threadId");
        const link = await threadLinkRepo.findById(threadId);
        if (!link) {
          return Response.json({ error: "THREAD_NOT_FOUND" }, { status: 404 });
        }
        await threadLinkRepo.delete(threadId);
        return Response.json({ deleted: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return Response.json({ error: message }, { status: 500 });
      }
    });
  },
});

export default writerModule;
