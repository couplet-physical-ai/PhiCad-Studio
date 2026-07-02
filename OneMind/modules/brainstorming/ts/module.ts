import { createModuleV2 } from "../../_kit/createModule";
import { BrainstormRepository } from "./db/repositories/brainstorm-repository";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { BrainstormAIService } from "./services/brainstorm-ai-service";
import { BrainstormStreamService } from "./services/brainstorm-stream-service";
import { ExportService } from "./services/export-service";
import { ProjectService } from "./services/project-service";
import type {
  CreateBoardParams,
  CreateNodeParams,
  UpdateNodeParams,
  CreateEdgeParams,
  UpdateEdgeParams,
  BulkUpdatePositionsParams,
  AIJobKind,
} from "../shared/types";

export const brainstormingModule = createModuleV2("brainstorming", {
  label: "Brainstorming",
  namespace: "space.brainstorming",
  version: "1.0.0",
  kind: "space",

  async onActivate(ctx) {
    ctx.logger.info("Brainstorming module activating...");
    ctx.logger.info("Endpoints available at /api/modules/brainstorming/*");
  },

  async onDeactivate(ctx) {
    ctx.logger.info("Brainstorming module deactivated");
  },

  endpoints(ctx, http, _ws) {
    const db = ctx.db.getRawDb() as BunSQLiteDatabase<Record<string, unknown>>;
    const repo = new BrainstormRepository(db);
    const aiService = new BrainstormAIService(repo);
    const streamService = new BrainstormStreamService();
    const exportService = new ExportService(repo);
    const projectService = new ProjectService(db);

    // Helper for auth checks
    const ensureBoardAccess = async (_req: unknown, boardId: string) => {
      // 1. Check board existence
      const board = await repo.findBoardById(boardId);
      if (!board) {
        throw new Error("BOARD_NOT_FOUND");
      }

      return board;
    };

    // --- Board Endpoints ---

    http.post("/boards", async ({ req }) => {
      try {
        const params = (await req.json()) as CreateBoardParams;
        const board = await repo.createBoard({
          workspace_id: params.workspaceId,
          project_id: params.projectId ?? null,
          title: params.title,
          description: params.description,
          system_prompt_validation: params.systemPromptValidation,
        });
        return Response.json({ board }, { status: 201 });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return Response.json({ error: message }, { status: 400 });
      }
    });

    http.get("/boards", async ({ query }) => {
      try {
        const workspaceId = query.get("workspace_id");
        if (!workspaceId) {
          return Response.json(
            { error: "workspace_id required" },
            { status: 400 },
          );
        }
        const projectIdParam = query.get("project_id");
        const projectId =
          projectIdParam === null
            ? undefined
            : projectIdParam === "null"
              ? null
              : projectIdParam;
        const boards = await repo.findBoardsByWorkspace(workspaceId, projectId);
        return Response.json({ boards });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return Response.json({ error: message }, { status: 500 });
      }
    });

    http.get("/boards/:boardId", async ({ req, params }) => {
      try {
        const boardId = params.getOrThrow("boardId");
        await ensureBoardAccess(req, boardId);
        const board = await repo.findBoardById(boardId);
        if (!board) {
          return Response.json({ error: "BOARD_NOT_FOUND" }, { status: 404 });
        }
        return Response.json({ board });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return Response.json({ error: message }, { status: 500 });
      }
    });

    http.patch("/boards/:boardId", async ({ req, params }) => {
      try {
        const boardId = params.getOrThrow("boardId");
        await ensureBoardAccess(req, boardId);
        const updates = (await req.json()) as {
          title?: string;
          description?: string;
          systemPromptValidation?: string;
        };
        const dbUpdates: Record<string, unknown> = {};
        if (updates.title !== undefined) dbUpdates.title = updates.title;
        if (updates.description !== undefined) dbUpdates.description = updates.description;
        if (updates.systemPromptValidation !== undefined) {
          dbUpdates.system_prompt_validation = updates.systemPromptValidation;
        }
        const board = await repo.updateBoard(boardId, dbUpdates);
        return Response.json({ board });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return Response.json({ error: message }, { status: 400 });
      }
    });

    http.delete("/boards/:boardId", async ({ req, params }) => {
      try {
        const boardId = params.getOrThrow("boardId");
        await ensureBoardAccess(req, boardId);
        await repo.deleteBoard(boardId);
        return new Response(null, { status: 204 });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return Response.json({ error: message }, { status: 500 });
      }
    });

    // --- Node Endpoints ---

    http.post("/nodes", async ({ req }) => {
      try {
        const params = (await req.json()) as CreateNodeParams;
        await ensureBoardAccess(req, params.boardId);

        const node = await repo.createNode({
          board_id: params.boardId,
          type: params.type,
          title: params.title,
          summary_rich: params.summaryRich,
          content_rich: params.contentRich,
          tags_json: params.tags,
          parent_id: params.parentId,
          position_x: params.position.x,
          position_y: params.position.y,
          color: params.color,
        });

        if (params.parentId) {
          await repo.incrementChildCount(params.parentId);
          // Notify parent update? Maybe overkill for now.
        }

        streamService.publish(params.boardId, "node_created", { node });
        return Response.json({ node }, { status: 201 });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return Response.json({ error: message }, { status: 400 });
      }
    });

    http.get("/boards/:boardId/nodes", async ({ req, params }) => {
      try {
        const boardId = params.getOrThrow("boardId");
        await ensureBoardAccess(req, boardId);
        const nodes = await repo.findNodesByBoard(boardId);
        return Response.json({ nodes });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return Response.json({ error: message }, { status: 500 });
      }
    });

    http.patch("/nodes/:nodeId", async ({ req, params }) => {
      try {
        const nodeId = params.getOrThrow("nodeId");

        // Check access via node -> board
        const existingNode = await repo.findNodeById(nodeId);
        if (!existingNode) return Response.json({ error: "NODE_NOT_FOUND" }, { status: 404 });
        await ensureBoardAccess(req, existingNode.boardId);

        const updates = (await req.json()) as UpdateNodeParams;

        const dbUpdates: Record<string, unknown> = {};
        let meaningfulEdit = false;

        if (updates.title !== undefined) {
          dbUpdates.title = updates.title;
          meaningfulEdit = true;
        }
        if (updates.summaryRich !== undefined) {
          dbUpdates.summary_rich = updates.summaryRich;
          meaningfulEdit = true;
        }
        if (updates.contentRich !== undefined) {
          dbUpdates.content_rich = updates.contentRich;
          meaningfulEdit = true;
        }
        if (updates.systemPromptValidation !== undefined) {
          dbUpdates.system_prompt_validation = updates.systemPromptValidation;
        }
        if (updates.tags !== undefined) {
          dbUpdates.tags_json = updates.tags;
        }
        if (updates.color !== undefined) {
          dbUpdates.color = updates.color;
        }
        if (updates.position !== undefined) {
          dbUpdates.position_x = updates.position.x;
          dbUpdates.position_y = updates.position.y;
        }
        if (updates.isStarred !== undefined) {
          dbUpdates.is_starred = updates.isStarred;
        }
        if (updates.isPinned !== undefined) {
          dbUpdates.is_pinned = updates.isPinned;
        }

        if (!meaningfulEdit && Object.keys(dbUpdates).length === 0) {
          return Response.json({ node: existingNode });
        }

        const node = await repo.updateNode(nodeId, dbUpdates);

        if (meaningfulEdit) {
          await repo.incrementNodeVersion(nodeId);
        }

        streamService.publish(node.boardId, "node_updated", { node });
        return Response.json({ node });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return Response.json({ error: message }, { status: 400 });
      }
    });

    http.post("/nodes/bulk-positions", async ({ req }) => {
      try {
        const { positions } = (await req.json()) as BulkUpdatePositionsParams;
        const firstPosition = positions[0];
        if (firstPosition) {
          const firstNode = await repo.findNodeById(firstPosition.nodeId);
          if (firstNode) {
            await ensureBoardAccess(req, firstNode.boardId);
          }
        }

        await repo.bulkUpdatePositions(
          positions.map((p) => ({
            nodeId: p.nodeId,
            x: p.position.x,
            y: p.position.y,
          })),
        );

        // We should ideally publish updates for all nodes, but that's heavy.
        // Maybe a bulk event?
        // For now, let's just return success. The client likely updated optimistically.
        // Or we can fetch the boardId from one node and send a "refresh" event?
        // We don't have boardId easily here without querying.

        return Response.json({ updated: positions.length });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return Response.json({ error: message }, { status: 400 });
      }
    });

    http.delete("/nodes/:nodeId", async ({ req, params }) => {
      try {
        const nodeId = params.getOrThrow("nodeId");
        const node = await repo.findNodeById(nodeId);
        if (node) {
          await ensureBoardAccess(req, node.boardId);
          await repo.softDeleteNode(nodeId);
          streamService.publish(node.boardId, "node_deleted", { nodeId });
        }
        return new Response(null, { status: 204 });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return Response.json({ error: message }, { status: 500 });
      }
    });

    http.post("/nodes/:nodeId/mark-reviewed", async ({ req, params }) => {
      try {
        const nodeId = params.getOrThrow("nodeId");
        const node = await repo.findNodeById(nodeId);

        if (!node) return Response.json({ error: "NODE_NOT_FOUND" }, { status: 404 });
        await ensureBoardAccess(req, node.boardId);

        if (!node?.parentId) {
          return Response.json({ error: "NO_PARENT" }, { status: 400 });
        }

        const parent = await repo.findNodeById(node.parentId);
        if (!parent) {
          return Response.json({ error: "PARENT_NOT_FOUND" }, { status: 404 });
        }

        await repo.markNodeReviewed(nodeId, parent.version);

        // Fetch updated node to publish
        const updatedNode = await repo.findNodeById(nodeId);
        if (updatedNode) {
          streamService.publish(updatedNode.boardId, "node_updated", { node: updatedNode });
        }

        return Response.json({ reviewedParentVersion: parent.version });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return Response.json({ error: message }, { status: 500 });
      }
    });

    // --- Edge Endpoints ---

    http.post("/edges", async ({ req }) => {
      try {
        const params = (await req.json()) as CreateEdgeParams;
        await ensureBoardAccess(req, params.boardId);
        const edge = await repo.createEdge({
          board_id: params.boardId,
          from_node: params.from,
          to_node: params.to,
          type: params.type,
          label: params.label,
        });
        streamService.publish(params.boardId, "edge_created", { edge });
        return Response.json({ edge }, { status: 201 });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return Response.json({ error: message }, { status: 400 });
      }
    });

    http.get("/boards/:boardId/edges", async ({ req, params }) => {
      try {
        const boardId = params.getOrThrow("boardId");
        await ensureBoardAccess(req, boardId);
        const edges = await repo.findEdgesByBoard(boardId);
        return Response.json({ edges });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return Response.json({ error: message }, { status: 500 });
      }
    });

    http.patch("/edges/:edgeId", async ({ req, params }) => {
      try {
        const edgeId = params.getOrThrow("edgeId");
        const existingEdge = await repo.findEdgeById(edgeId);
        if (!existingEdge) return Response.json({ error: "EDGE_NOT_FOUND" }, { status: 404 });
        await ensureBoardAccess(req, existingEdge.boardId);

        const updates = (await req.json()) as UpdateEdgeParams;
        const edge = await repo.updateEdge(edgeId, updates);
        streamService.publish(edge.boardId, "edge_updated", { edge });
        return Response.json({ edge });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return Response.json({ error: message }, { status: 400 });
      }
    });

    http.delete("/edges/:edgeId", async ({ req, params }) => {
      try {
        const edgeId = params.getOrThrow("edgeId");
        const edge = await repo.findEdgeById(edgeId);
        if (edge) {
          await ensureBoardAccess(req, edge.boardId);
          await repo.deleteEdge(edgeId);
          streamService.publish(edge.boardId, "edge_deleted", { edgeId });
        }
        return new Response(null, { status: 204 });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return Response.json({ error: message }, { status: 500 });
      }
    });

    http.post("/edges/:edgeId/reverse", async ({ req, params }) => {
      try {
        const edgeId = params.getOrThrow("edgeId");
        const existingEdge = await repo.findEdgeById(edgeId);
        if (!existingEdge) return Response.json({ error: "EDGE_NOT_FOUND" }, { status: 404 });
        await ensureBoardAccess(req, existingEdge.boardId);

        const edge = await repo.reverseEdge(edgeId);
        streamService.publish(edge.boardId, "edge_updated", { edge });
        return Response.json({ edge });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return Response.json({ error: message }, { status: 500 });
      }
    });

    // --- Comment Endpoints ---

    http.post("/comments", async ({ req }) => {
      try {
        const { nodeId, author, body, parentCommentId } =
          (await req.json()) as {
            nodeId: string;
            author: string;
            body: string;
            parentCommentId?: string;
          };

        const node = await repo.findNodeById(nodeId);
        if (!node) return Response.json({ error: "NODE_NOT_FOUND" }, { status: 404 });
        await ensureBoardAccess(req, node.boardId);

        if (!body?.trim()) {
          return Response.json(
            { error: "Comment body cannot be empty" },
            { status: 400 },
          );
        }
        const comment = await repo.createComment({
          node_id: nodeId,
          author,
          body: body.trim(),
          parent_comment_id: parentCommentId,
        });
        await repo.incrementCommentCount(nodeId);

        // Notify about comment? Maybe.
        // We need boardId.
        streamService.publish(node.boardId, "comment_created", { comment });

        // Also node updated (comment count)
        const updatedNode = await repo.findNodeById(nodeId);
        if (updatedNode) {
          streamService.publish(node.boardId, "node_updated", { node: updatedNode });
        }

        return Response.json({ comment }, { status: 201 });

      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return Response.json({ error: message }, { status: 400 });
      }
    });

    http.get("/nodes/:nodeId/comments", async ({ req, params }) => {
      try {
        const nodeId = params.getOrThrow("nodeId");
        const node = await repo.findNodeById(nodeId);
        if (!node) return Response.json({ error: "NODE_NOT_FOUND" }, { status: 404 });
        await ensureBoardAccess(req, node.boardId);

        const comments = await repo.findCommentsByNode(nodeId);
        return Response.json({ comments });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return Response.json({ error: message }, { status: 500 });
      }
    });

    http.patch("/comments/:commentId", async ({ req, params }) => {
      try {
        const commentId = params.getOrThrow("commentId");
        const existingComment = await repo.findCommentById(commentId);
        if (!existingComment) return Response.json({ error: "COMMENT_NOT_FOUND" }, { status: 404 });
        const node = await repo.findNodeById(existingComment.nodeId);
        if (node) await ensureBoardAccess(req, node.boardId);

        const { body } = (await req.json()) as { body: string };
        const comment = await repo.updateComment(commentId, body);
        return Response.json({ comment });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return Response.json({ error: message }, { status: 400 });
      }
    });

    http.delete("/comments/:commentId", async ({ req, params }) => {
      try {
        const commentId = params.getOrThrow("commentId");
        const comment = await repo.findCommentById(commentId);
        if (!comment) {
          return Response.json({ error: "COMMENT_NOT_FOUND" }, { status: 404 });
        }
        const node = await repo.findNodeById(comment.nodeId);
        if (node) await ensureBoardAccess(req, node.boardId);

        await repo.deleteComment(commentId);
        await repo.decrementCommentCount(comment.nodeId);

        if (node) {
          streamService.publish(node.boardId, "comment_deleted", { commentId });
          // Also node updated (comment count)
          const updatedNode = await repo.findNodeById(comment.nodeId);
          if (updatedNode) {
            streamService.publish(node.boardId, "node_updated", { node: updatedNode });
          }
        }

        return new Response(null, { status: 204 });

      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return Response.json({ error: message }, { status: 500 });
      }
    });

    // --- AI & Advanced Endpoints ---

    http.post("/jobs", async ({ req }) => {
      try {
        const { boardId, kind, nodeId, inputSnapshot } = (await req.json()) as {
          boardId: string;
          kind: AIJobKind;
          nodeId?: string;
          inputSnapshot?: unknown;
        };
        await ensureBoardAccess(req, boardId);

        const job = await aiService.createJob(
          boardId,
          kind,
          nodeId,
          inputSnapshot,
        );
        streamService.publish(boardId, "job_created", { job });
        return Response.json({ job }, { status: 201 });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return Response.json({ error: message }, { status: 500 });
      }
    });

    // Alias for compatibility if needed, or just keep /jobs
    http.post("/ai/jobs", async ({ req }) => {
      // Redirect logic or just same handler
      try {
        const { boardId, kind, nodeId, inputSnapshot } = (await req.json()) as {
          boardId: string;
          kind: AIJobKind;
          nodeId?: string;
          inputSnapshot?: unknown;
        };
        await ensureBoardAccess(req, boardId);

        const job = await aiService.createJob(
          boardId,
          kind,
          nodeId,
          inputSnapshot,
        );
        streamService.publish(boardId, "job_created", { job });
        return Response.json({ job }, { status: 201 });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return Response.json({ error: message }, { status: 500 });
      }
    });

    http.get("/ai/jobs/:jobId", async ({ req, params }) => {
      try {
        const jobId = params.getOrThrow("jobId");
        const job = await aiService.getJob(jobId);
        if (!job) {
          return Response.json({ error: "JOB_NOT_FOUND" }, { status: 404 });
        }
        await ensureBoardAccess(req, job.boardId);

        return Response.json({ job });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return Response.json({ error: message }, { status: 500 });
      }
    });

    http.get("/stream/:boardId", async ({ req, params }) => {
      try {
        const boardId = params.getOrThrow("boardId");
        await ensureBoardAccess(req, boardId);

        const stream = streamService.subscribe(boardId);
        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
          },
        });
      } catch (err) {
        // If auth fails, we should close connection. 
        // Returning error response will close it from client side usually.
        const message = err instanceof Error ? err.message : "Unknown error";
        return Response.json({ error: message }, { status: 401 });
      }
    });

    http.post("/export", async ({ req }) => {
      try {
        const { boardId } = (await req.json()) as { boardId: string };
        await ensureBoardAccess(req, boardId);

        const markdown = await exportService.generateMarkdown(boardId);
        return Response.json({ markdown });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return Response.json({ error: message }, { status: 500 });
      }
    });

    http.post("/extract", async ({ req }) => {
      try {
        const { nodeIds, sourceBoardId, newBoardTitle } = (await req.json()) as {
          nodeIds: string[];
          sourceBoardId: string;
          newBoardTitle: string;
        };
        await ensureBoardAccess(req, sourceBoardId);

        const newBoard = await projectService.extractCluster(
          nodeIds,
          sourceBoardId,
          newBoardTitle
        );
        // Notify source board about changes (nodes moved/deleted/portal created)
        // This is complex to stream perfectly, maybe just send a "refresh" event
        streamService.publish(sourceBoardId, "board_refresh", {});

        return Response.json({ newBoard });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return Response.json({ error: message }, { status: 500 });
      }
    });
  },
});

export default brainstormingModule;
