import { useCallback, useMemo } from "react";
import { getBackendURL } from "../../../../src-ts/shared/sdk/mutator";
import type {
  BrainstormBoard,
  BrainstormNode,
  BrainstormEdge,
  Comment,
  CreateBoardParams,
  CreateNodeParams,
  UpdateNodeParams,
  CreateEdgeParams,
  UpdateEdgeParams,
  BulkUpdatePositionsParams,
  AIJob,
  AIJobKind,
} from "../../shared/types";

const getApiBase = () => `${getBackendURL()}/api/modules/brainstorming`;

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: response.statusText }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json();
}

export function useBrainstormApi() {
  const createBoard = useCallback(
    async (params: CreateBoardParams): Promise<BrainstormBoard> => {
      const { board } = await fetchJson<{ board: BrainstormBoard }>(
        `${getApiBase()}/boards`,
        {
          method: "POST",
          body: JSON.stringify(params),
        },
      );
      return board;
    },
    [],
  );

  const getBoards = useCallback(
    async (
      workspaceId: string,
      projectId?: string | null,
    ): Promise<BrainstormBoard[]> => {
      const params = new URLSearchParams({
        workspace_id: workspaceId,
      });
      if (projectId !== undefined) {
        params.set("project_id", projectId === null ? "null" : projectId);
      }
      const { boards } = await fetchJson<{ boards: BrainstormBoard[] }>(
        `${getApiBase()}/boards?${params.toString()}`,
      );
      return boards;
    },
    [],
  );

  const getBoard = useCallback(
    async (boardId: string): Promise<BrainstormBoard> => {
      const { board } = await fetchJson<{ board: BrainstormBoard }>(
        `${getApiBase()}/boards/${boardId}`,
      );
      return board;
    },
    [],
  );

  const updateBoard = useCallback(
    async (
      boardId: string,
      updates: { title?: string; description?: string; systemPromptValidation?: string },
    ): Promise<BrainstormBoard> => {
      const { board } = await fetchJson<{ board: BrainstormBoard }>(
        `${getApiBase()}/boards/${boardId}`,
        {
          method: "PATCH",
          body: JSON.stringify(updates),
        },
      );
      return board;
    },
    [],
  );

  const deleteBoard = useCallback(async (boardId: string): Promise<void> => {
    await fetchJson(`${getApiBase()}/boards/${boardId}`, { method: "DELETE" });
  }, []);

  const createNode = useCallback(
    async (params: CreateNodeParams): Promise<BrainstormNode> => {
      const { node } = await fetchJson<{ node: BrainstormNode }>(
        `${getApiBase()}/nodes`,
        {
          method: "POST",
          body: JSON.stringify(params),
        },
      );
      return node;
    },
    [],
  );

  const getNodes = useCallback(
    async (boardId: string): Promise<BrainstormNode[]> => {
      const { nodes } = await fetchJson<{ nodes: BrainstormNode[] }>(
        `${getApiBase()}/boards/${boardId}/nodes`,
      );
      return nodes;
    },
    [],
  );

  const updateNode = useCallback(
    async (
      nodeId: string,
      updates: UpdateNodeParams,
    ): Promise<BrainstormNode> => {
      const { node } = await fetchJson<{ node: BrainstormNode }>(
        `${getApiBase()}/nodes/${nodeId}`,
        {
          method: "PATCH",
          body: JSON.stringify(updates),
        },
      );
      return node;
    },
    [],
  );

  const bulkUpdatePositions = useCallback(
    async (params: BulkUpdatePositionsParams): Promise<void> => {
      await fetchJson(`${getApiBase()}/nodes/bulk-positions`, {
        method: "POST",
        body: JSON.stringify(params),
      });
    },
    [],
  );

  const deleteNode = useCallback(async (nodeId: string): Promise<void> => {
    await fetchJson(`${getApiBase()}/nodes/${nodeId}`, { method: "DELETE" });
  }, []);

  const markNodeReviewed = useCallback(
    async (nodeId: string): Promise<number> => {
      const { reviewedParentVersion } = await fetchJson<{
        reviewedParentVersion: number;
      }>(`${getApiBase()}/nodes/${nodeId}/mark-reviewed`, { method: "POST" });
      return reviewedParentVersion;
    },
    [],
  );

  const createEdge = useCallback(
    async (params: CreateEdgeParams): Promise<BrainstormEdge> => {
      const { edge } = await fetchJson<{ edge: BrainstormEdge }>(
        `${getApiBase()}/edges`,
        {
          method: "POST",
          body: JSON.stringify(params),
        },
      );
      return edge;
    },
    [],
  );

  const getEdges = useCallback(
    async (boardId: string): Promise<BrainstormEdge[]> => {
      const { edges } = await fetchJson<{ edges: BrainstormEdge[] }>(
        `${getApiBase()}/boards/${boardId}/edges`,
      );
      return edges;
    },
    [],
  );

  const updateEdge = useCallback(
    async (
      edgeId: string,
      updates: UpdateEdgeParams,
    ): Promise<BrainstormEdge> => {
      const { edge } = await fetchJson<{ edge: BrainstormEdge }>(
        `${getApiBase()}/edges/${edgeId}`,
        {
          method: "PATCH",
          body: JSON.stringify(updates),
        },
      );
      return edge;
    },
    [],
  );

  const deleteEdge = useCallback(async (edgeId: string): Promise<void> => {
    await fetchJson(`${getApiBase()}/edges/${edgeId}`, { method: "DELETE" });
  }, []);

  const reverseEdge = useCallback(
    async (edgeId: string): Promise<BrainstormEdge> => {
      const { edge } = await fetchJson<{ edge: BrainstormEdge }>(
        `${getApiBase()}/edges/${edgeId}/reverse`,
        {
          method: "POST",
        },
      );
      return edge;
    },
    [],
  );

  const createComment = useCallback(
    async (params: {
      nodeId: string;
      author: string;
      body: string;
      parentCommentId?: string;
    }): Promise<Comment> => {
      const { comment } = await fetchJson<{ comment: Comment }>(
        `${getApiBase()}/comments`,
        {
          method: "POST",
          body: JSON.stringify(params),
        },
      );
      return comment;
    },
    [],
  );

  const getComments = useCallback(
    async (nodeId: string): Promise<Comment[]> => {
      const { comments } = await fetchJson<{ comments: Comment[] }>(
        `${getApiBase()}/nodes/${nodeId}/comments`,
      );
      return comments;
    },
    [],
  );

  const updateComment = useCallback(
    async (commentId: string, body: string): Promise<Comment> => {
      const { comment } = await fetchJson<{ comment: Comment }>(
        `${getApiBase()}/comments/${commentId}`,
        {
          method: "PATCH",
          body: JSON.stringify({ body }),
        },
      );
      return comment;
    },
    [],
  );

  const deleteComment = useCallback(
    async (commentId: string, nodeId: string): Promise<void> => {
      await fetchJson(
        `${getApiBase()}/comments/${commentId}?node_id=${encodeURIComponent(nodeId)}`,
        { method: "DELETE" },
      );
    },
    [],
  );

  const triggerAIJob = useCallback(
    async (params: {
      boardId: string;
      kind: AIJobKind;
      nodeId?: string;
      inputSnapshot?: unknown;
    }): Promise<AIJob> => {
      const { job } = await fetchJson<{ job: AIJob }>(
        `${getApiBase()}/ai/jobs`,
        {
          method: "POST",
          body: JSON.stringify(params),
        },
      );
      return job;
    },
    [],
  );

  const getAIJob = useCallback(
    async (jobId: string): Promise<AIJob> => {
      const { job } = await fetchJson<{ job: AIJob }>(
        `${getApiBase()}/ai/jobs/${jobId}`,
      );
      return job;
    },
    [],
  );

  const generateDocument = useCallback(
    async (boardId: string): Promise<{ content: string }> => {
      const result = await fetchJson<{ content: string }>(
        `${getApiBase()}/export`,
        {
          method: "POST",
          body: JSON.stringify({ boardId }),
        },
      );
      return result;
    },
    [],
  );

  const extractProject = useCallback(
    async (params: {
      nodeIds: string[];
      sourceBoardId: string;
      newBoardTitle: string;
    }): Promise<BrainstormBoard> => {
      const { newBoard } = await fetchJson<{ newBoard: BrainstormBoard }>(
        `${getApiBase()}/extract`,
        {
          method: "POST",
          body: JSON.stringify(params),
        },
      );
      return newBoard;
    },
    [],
  );

  return useMemo(
    () => ({
      createBoard,
      getBoards,
      getBoard,
      updateBoard,
      deleteBoard,
      createNode,
      getNodes,
      updateNode,
      bulkUpdatePositions,
      deleteNode,
      markNodeReviewed,
      createEdge,
      getEdges,
      updateEdge,
      deleteEdge,
      reverseEdge,
      createComment,
      getComments,
      updateComment,
      deleteComment,
      triggerAIJob,
      getAIJob,
      generateDocument,
      extractProject,
    }),
    [
      createBoard,
      getBoards,
      getBoard,
      updateBoard,
      deleteBoard,
      createNode,
      getNodes,
      updateNode,
      bulkUpdatePositions,
      deleteNode,
      markNodeReviewed,
      createEdge,
      getEdges,
      updateEdge,
      deleteEdge,
      reverseEdge,
      createComment,
      getComments,
      updateComment,
      deleteComment,
      triggerAIJob,
      getAIJob,
      generateDocument,
      extractProject,
    ],
  );
}
