import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { inArray } from "drizzle-orm";
import { BrainstormRepository } from "../db/repositories/brainstorm-repository";
import { brainstorm_node, brainstorm_edge } from "../db/schema";
import type { BrainstormBoard } from "../../shared/types";

type DbInstance = BunSQLiteDatabase<Record<string, unknown>>;

export class ProjectService {
  constructor(private db: DbInstance) {}

  async extractCluster(
    nodeIds: string[],
    sourceBoardId: string,
    newBoardTitle: string
  ): Promise<BrainstormBoard> {
    return this.db.transaction(async (tx) => {
      // Create a repo instance scoped to this transaction
      const repo = new BrainstormRepository(tx as unknown as DbInstance);

      // 1. Create new Board
      const sourceBoard = await repo.findBoardById(sourceBoardId);
      if (!sourceBoard) throw new Error("SOURCE_BOARD_NOT_FOUND");

      const newBoard = await repo.createBoard({
        workspace_id: sourceBoard.workspaceId,
        title: newBoardTitle,
        description: `Extracted from ${sourceBoard.title}`,
      });

      // 2. Create Root Node in New Board
      const newRoot = await repo.createNode({
        board_id: newBoard.id,
        type: "root",
        title: newBoardTitle,
        position_x: 0,
        position_y: 0,
      });

      // 3. Identify Top Nodes (nodes in selection whose parent is NOT in selection)
      const nodes = await repo.findNodesByBoard(sourceBoardId);
      const selectedNodes = nodes.filter((n) => nodeIds.includes(n.id));
      const topNodes = selectedNodes.filter(
        (n) => !n.parentId || !nodeIds.includes(n.parentId)
      );

      // 4. Create Portal Node in Old Board (at position of first top node)
      const firstTop = topNodes[0];
      const portalPos = firstTop
        ? firstTop.position
        : { x: 0, y: 0 };

      const portal = await repo.createNode({
        board_id: sourceBoardId,
        type: "project_portal",
        title: newBoardTitle,
        position_x: portalPos.x,
        position_y: portalPos.y,
        summary_rich: JSON.stringify({ linkedBoardId: newBoard.id }),
      });

      // 5. Connect Old Parents to Portal
      const parentIds = new Set<string>();
      for (const node of topNodes) {
        if (node.parentId) {
          parentIds.add(node.parentId);
        }
      }

      for (const parentId of parentIds) {
        // Verify parent is still in old board (it should be, as it's not in nodeIds)
        await repo.createEdge({
          board_id: sourceBoardId,
          from_node: parentId,
          to_node: portal.id,
          type: "follows_from",
        });
      }

      // 6. Move Nodes (Batch Update)
      const nodesToMoveToNewRoot = selectedNodes.filter(n => topNodes.includes(n)).map(n => n.id);
      const nodesToMoveKeepParent = selectedNodes.filter(n => !topNodes.includes(n)).map(n => n.id);

      if (nodesToMoveToNewRoot.length > 0) {
        await tx
            .update(brainstorm_node)
            .set({ board_id: newBoard.id, parent_id: newRoot.id })
            .where(inArray(brainstorm_node.id, nodesToMoveToNewRoot));
      }

      if (nodesToMoveKeepParent.length > 0) {
        await tx
            .update(brainstorm_node)
            .set({ board_id: newBoard.id })
            .where(inArray(brainstorm_node.id, nodesToMoveKeepParent));
      }

      // 7. Move Internal Edges (Batch Update)
      const internalEdges = await repo.findInternalEdges(sourceBoardId, nodeIds);
      const internalEdgeIds = internalEdges.map(e => e.id);
      
      if (internalEdgeIds.length > 0) {
        await tx
            .update(brainstorm_edge)
            .set({ board_id: newBoard.id })
            .where(inArray(brainstorm_edge.id, internalEdgeIds));
      }

      return newBoard;
    });
  }
}
