import { eq, and, isNull, desc, sql, inArray } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import {
  brainstorm_board,
  brainstorm_node,
  brainstorm_edge,
  brainstorm_comment,
  brainstorm_ai_job,
  type DbBoard,
  type DbNode,
  type DbEdge,
  type DbComment,
  type DbAIJob,
  type NewDbBoard,
  type NewDbNode,
  type NewDbEdge,
  type NewDbComment,
  type NewDbAIJob,
  type NewDbArtifact,
  type DbArtifact,
  brainstorm_artifacts,
} from "../schema";
import type {
  BrainstormBoard,
  BrainstormNode,
  BrainstormEdge,
  Comment,
  AIJob,
} from "../../../shared/types";

type DbInstance = BunSQLiteDatabase<Record<string, unknown>>;

function dbBoardToApi(row: DbBoard): BrainstormBoard {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    projectId: row.project_id ?? null,
    title: row.title,
    description: row.description ?? undefined,
    systemPromptValidation: row.system_prompt_validation ?? undefined,
    createdAt: row.created_at.getTime(),
    updatedAt: row.updated_at.getTime(),
    deletedAt: row.deleted_at?.getTime(),
  };
}

function dbNodeToApi(row: DbNode): BrainstormNode {
  return {
    id: row.id,
    boardId: row.board_id,
    type: row.type,
    title: row.title,
    summaryRich: row.summary_rich ?? undefined,
    contentRich: row.content_rich ?? undefined,
    systemPromptValidation: row.system_prompt_validation ?? undefined,
    tags: row.tags_json ?? undefined,
    attachments: row.attachments_json ?? undefined,
    color: row.color ?? undefined,
    parentId: row.parent_id ?? undefined,
    position: { x: row.position_x, y: row.position_y },
    version: row.version,
    reviewedParentVersion: row.reviewed_parent_version ?? undefined,
    isStarred: row.is_starred ?? false,
    isPinned: row.is_pinned ?? false,
    isDeleted: row.is_deleted ?? false,
    childCount: row.child_count ?? 0,
    commentCount: row.comment_count ?? 0,
    validation: row.validation_json ?? undefined,
    aiJobIds: row.ai_job_ids_json ?? undefined,
    createdAt: row.created_at.getTime(),
    updatedAt: row.updated_at.getTime(),
  };
}

function dbEdgeToApi(row: DbEdge): BrainstormEdge {
  return {
    id: row.id,
    boardId: row.board_id,
    from: row.from_node,
    to: row.to_node,
    type: row.type,
    label: row.label ?? undefined,
    createdAt: row.created_at.getTime(),
  };
}

function dbCommentToApi(row: DbComment): Comment {
  return {
    id: row.id,
    nodeId: row.node_id,
    author: row.author,
    body: row.body,
    parentCommentId: row.parent_comment_id ?? undefined,
    createdAt: row.created_at.getTime(),
    updatedAt: row.updated_at.getTime(),
  };
}

function dbAIJobToApi(row: DbAIJob): AIJob {
  return {
    id: row.id,
    boardId: row.board_id,
    nodeId: row.node_id ?? undefined,
    kind: row.kind as AIJob["kind"],
    status: row.status as AIJob["status"],
    inputSnapshot: row.input_snapshot_json ?? undefined,
    output: row.output_json ?? undefined, // Correct field mapping
    error: row.error ?? undefined,
    createdAt: row.created_at.getTime(),
    updatedAt: row.updated_at.getTime(),
  };
}

export class BrainstormRepository {
  constructor(private db: DbInstance) {}

  async createBoard(data: NewDbBoard): Promise<BrainstormBoard> {
    const [board] = await this.db
      .insert(brainstorm_board)
      .values(data)
      .returning();
    return dbBoardToApi(board!);
  }

  async findBoardById(id: string): Promise<BrainstormBoard | null> {
    const [board] = await this.db
      .select()
      .from(brainstorm_board)
      .where(
        and(eq(brainstorm_board.id, id), isNull(brainstorm_board.deleted_at)),
      );
    return board ? dbBoardToApi(board) : null;
  }

  async findBoardsByWorkspace(
    workspaceId: string,
    projectId?: string | null,
  ): Promise<BrainstormBoard[]> {
    const conditions = [
      eq(brainstorm_board.workspace_id, workspaceId),
      isNull(brainstorm_board.deleted_at),
    ];

    if (projectId === null) {
      conditions.push(isNull(brainstorm_board.project_id));
    } else if (projectId !== undefined) {
      conditions.push(eq(brainstorm_board.project_id, projectId));
    }

    const boards = await this.db
      .select()
      .from(brainstorm_board)
      .where(and(...conditions))
      .orderBy(desc(brainstorm_board.updated_at));
    return boards.map(dbBoardToApi);
  }

  async updateBoard(
    id: string,
    updates: Partial<NewDbBoard>,
  ): Promise<BrainstormBoard> {
    const [board] = await this.db
      .update(brainstorm_board)
      .set(updates)
      .where(eq(brainstorm_board.id, id))
      .returning();
    return dbBoardToApi(board!);
  }

  async deleteBoard(id: string): Promise<void> {
    await this.db
      .update(brainstorm_board)
      .set({ deleted_at: new Date() })
      .where(eq(brainstorm_board.id, id));
  }

  async createNode(data: NewDbNode): Promise<BrainstormNode> {
    const [node] = await this.db
      .insert(brainstorm_node)
      .values(data)
      .returning();
    return dbNodeToApi(node!);
  }

  async findNodeById(id: string): Promise<BrainstormNode | null> {
    const [node] = await this.db
      .select()
      .from(brainstorm_node)
      .where(
        and(eq(brainstorm_node.id, id), eq(brainstorm_node.is_deleted, false)),
      );
    return node ? dbNodeToApi(node) : null;
  }

  async findNodesByBoard(boardId: string): Promise<BrainstormNode[]> {
    const nodes = await this.db
      .select()
      .from(brainstorm_node)
      .where(
        and(
          eq(brainstorm_node.board_id, boardId),
          eq(brainstorm_node.is_deleted, false),
        ),
      );
    return nodes.map(dbNodeToApi);
  }

  async updateNode(
    id: string,
    updates: Partial<NewDbNode>,
  ): Promise<BrainstormNode> {
    const [node] = await this.db
      .update(brainstorm_node)
      .set(updates)
      .where(eq(brainstorm_node.id, id))
      .returning();
    return dbNodeToApi(node!);
  }

  async updateNodePosition(id: string, x: number, y: number): Promise<void> {
    await this.db
      .update(brainstorm_node)
      .set({ position_x: x, position_y: y })
      .where(eq(brainstorm_node.id, id));
  }

  async bulkUpdatePositions(
    positions: Array<{ nodeId: string; x: number; y: number }>,
  ): Promise<void> {
    for (const pos of positions) {
      await this.db
        .update(brainstorm_node)
        .set({ position_x: pos.x, position_y: pos.y })
        .where(eq(brainstorm_node.id, pos.nodeId));
    }
  }

  async incrementNodeVersion(id: string): Promise<void> {
    await this.db
      .update(brainstorm_node)
      .set({ version: sql`${brainstorm_node.version} + 1` })
      .where(eq(brainstorm_node.id, id));
  }

  async incrementChildCount(parentId: string): Promise<void> {
    await this.db
      .update(brainstorm_node)
      .set({ child_count: sql`${brainstorm_node.child_count} + 1` })
      .where(eq(brainstorm_node.id, parentId));
  }

  async markNodeReviewed(id: string, parentVersion: number): Promise<void> {
    await this.db
      .update(brainstorm_node)
      .set({ reviewed_parent_version: parentVersion })
      .where(eq(brainstorm_node.id, id));
  }

  async softDeleteNode(id: string): Promise<void> {
    await this.db
      .update(brainstorm_node)
      .set({ is_deleted: true })
      .where(eq(brainstorm_node.id, id));
  }

  async createEdge(data: NewDbEdge): Promise<BrainstormEdge> {
    const [edge] = await this.db
      .insert(brainstorm_edge)
      .values(data)
      .returning();
    return dbEdgeToApi(edge!);
  }

  async findEdgesByBoard(boardId: string): Promise<BrainstormEdge[]> {
    const edges = await this.db
      .select()
      .from(brainstorm_edge)
      .where(eq(brainstorm_edge.board_id, boardId));
    return edges.map(dbEdgeToApi);
  }

  async findEdgeById(id: string): Promise<BrainstormEdge | null> {
    const [edge] = await this.db
      .select()
      .from(brainstorm_edge)
      .where(eq(brainstorm_edge.id, id));
    return edge ? dbEdgeToApi(edge) : null;
  }

  async updateEdge(
    id: string,
    updates: Partial<NewDbEdge>,
  ): Promise<BrainstormEdge> {
    const [edge] = await this.db
      .update(brainstorm_edge)
      .set(updates)
      .where(eq(brainstorm_edge.id, id))
      .returning();
    return dbEdgeToApi(edge!);
  }

  async reverseEdge(id: string): Promise<BrainstormEdge> {
    const existing = await this.findEdgeById(id);
    if (!existing) throw new Error("EDGE_NOT_FOUND");

    const [edge] = await this.db
      .update(brainstorm_edge)
      .set({ from_node: existing.to, to_node: existing.from })
      .where(eq(brainstorm_edge.id, id))
      .returning();
    return dbEdgeToApi(edge!);
  }

  async deleteEdge(id: string): Promise<void> {
    await this.db.delete(brainstorm_edge).where(eq(brainstorm_edge.id, id));
  }

  async createComment(data: NewDbComment): Promise<Comment> {
    const [comment] = await this.db
      .insert(brainstorm_comment)
      .values(data)
      .returning();
    return dbCommentToApi(comment!);
  }

  async findCommentsByNode(nodeId: string): Promise<Comment[]> {
    const comments = await this.db
      .select()
      .from(brainstorm_comment)
      .where(eq(brainstorm_comment.node_id, nodeId))
      .orderBy(brainstorm_comment.created_at);
    return comments.map(dbCommentToApi);
  }

  async updateComment(id: string, body: string): Promise<Comment> {
    const [comment] = await this.db
      .update(brainstorm_comment)
      .set({ body })
      .where(eq(brainstorm_comment.id, id))
      .returning();
    return dbCommentToApi(comment!);
  }

  async findCommentById(id: string): Promise<Comment | null> {
    const [comment] = await this.db
      .select()
      .from(brainstorm_comment)
      .where(eq(brainstorm_comment.id, id));
    return comment ? dbCommentToApi(comment) : null;
  }

  async deleteComment(id: string): Promise<void> {
    await this.db
      .delete(brainstorm_comment)
      .where(eq(brainstorm_comment.id, id));
  }

  async incrementCommentCount(nodeId: string): Promise<void> {
    await this.db
      .update(brainstorm_node)
      .set({ comment_count: sql`${brainstorm_node.comment_count} + 1` })
      .where(eq(brainstorm_node.id, nodeId));
  }

  async decrementCommentCount(nodeId: string): Promise<void> {
    await this.db
      .update(brainstorm_node)
      .set({
        comment_count: sql`CASE WHEN ${brainstorm_node.comment_count} > 0 THEN ${brainstorm_node.comment_count} - 1 ELSE 0 END`,
      })
      .where(eq(brainstorm_node.id, nodeId));
  }

  async createAIJob(data: NewDbAIJob): Promise<AIJob> {
    const [job] = await this.db
      .insert(brainstorm_ai_job)
      .values(data)
      .returning();
    return dbAIJobToApi(job!);
  }

  async updateAIJob(
    id: string,
    updates: Partial<NewDbAIJob>
  ): Promise<AIJob> {
    const [job] = await this.db
      .update(brainstorm_ai_job)
      .set(updates)
      .where(eq(brainstorm_ai_job.id, id))
      .returning();
    return dbAIJobToApi(job!);
  }

  async findAIJobById(id: string): Promise<AIJob | null> {
    const [job] = await this.db
      .select()
      .from(brainstorm_ai_job)
      .where(eq(brainstorm_ai_job.id, id));
    return job ? dbAIJobToApi(job) : null;
  }

  async addJobIdToNode(nodeId: string, jobId: string): Promise<void> {
    const node = await this.findNodeById(nodeId);
    if (!node) return;

    const jobIds = node.aiJobIds || [];
    if (!jobIds.includes(jobId)) {
      jobIds.push(jobId);
      await this.db
        .update(brainstorm_node)
        .set({ ai_job_ids_json: jobIds })
        .where(eq(brainstorm_node.id, nodeId));
    }
  }

  async createArtifact(data: NewDbArtifact): Promise<DbArtifact> {
    const [artifact] = await this.db
      .insert(brainstorm_artifacts)
      .values(data)
      .returning();
    return artifact!;
  }

  async findArtifactsByBoard(boardId: string): Promise<DbArtifact[]> {
    return this.db
      .select()
      .from(brainstorm_artifacts)
      .where(eq(brainstorm_artifacts.board_id, boardId));
  }

  async updateNodeBoard(
    nodeId: string,
    newBoardId: string,
    newParentId?: string
  ): Promise<void> {
    const updates: Partial<NewDbNode> = { board_id: newBoardId };
    if (newParentId !== undefined) {
      updates.parent_id = newParentId;
    }
    await this.db
      .update(brainstorm_node)
      .set(updates)
      .where(eq(brainstorm_node.id, nodeId));
  }

  async updateEdgeBoard(edgeId: string, newBoardId: string): Promise<void> {
    await this.db
      .update(brainstorm_edge)
      .set({ board_id: newBoardId })
      .where(eq(brainstorm_edge.id, edgeId));
  }

  async findInternalEdges(
    boardId: string,
    nodeIds: string[]
  ): Promise<BrainstormEdge[]> {
    // This might be heavy if nodeIds is large, but for a cluster it's okay.
    // We find all edges in the board, then filter.
    // Or we can use inArray if supported.
    // SQLite has limits on variables.
    // Let's just fetch all edges for the board and filter in memory for now,
    // assuming board size isn't massive.
    // Or better: select where board_id = X AND from IN (...) AND to IN (...)
    // But Drizzle inArray might hit limits.
    // Let's try inArray.

    if (nodeIds.length === 0) return [];

    const edges = await this.db
      .select()
      .from(brainstorm_edge)
      .where(
        and(
          eq(brainstorm_edge.board_id, boardId),
          inArray(brainstorm_edge.from_node, nodeIds),
          inArray(brainstorm_edge.to_node, nodeIds)
        )
      );
    return edges.map(dbEdgeToApi);
  }
}
