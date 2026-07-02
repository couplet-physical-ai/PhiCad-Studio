import { create } from "zustand";
import type {
  BrainstormNode,
  BrainstormEdge,
  BrainstormBoard,
  AIJob,
} from "../../shared/types";
import type { Node, Edge } from "@xyflow/react";

interface HistorySnapshot {
  nodes: BrainstormNode[];
  edges: BrainstormEdge[];
}

const MAX_HISTORY_SIZE = 50;

export interface BrainstormState {
  boards: BrainstormBoard[];
  currentBoardId: string | null;
  nodes: BrainstormNode[];
  edges: BrainstormEdge[];
  jobs: Record<string, AIJob>;
  selectedNodeIds: string[];
  expandedNodeId: string | null;
  expandedNodeIds: Set<string>;
  loading: boolean;
  error: string | null;

  history: HistorySnapshot[];
  historyIndex: number;
  canUndo: boolean;
  canRedo: boolean;

  // Computed
  reactFlowNodes: Node[];

  setBoards: (boards: BrainstormBoard[]) => void;
  setCurrentBoardId: (id: string | null) => void;
  setNodes: (nodes: BrainstormNode[]) => void;
  setEdges: (edges: BrainstormEdge[]) => void;
  setJobs: (jobs: Record<string, AIJob>) => void;
  updateJob: (job: AIJob) => void;
  addNode: (node: BrainstormNode) => void;
  updateNode: (id: string, updates: Partial<BrainstormNode>) => void;
  removeNode: (id: string) => void;
  addEdge: (edge: BrainstormEdge) => void;
  removeEdge: (id: string) => void;
  setSelectedNodeIds: (ids: string[]) => void;
  setExpandedNodeId: (id: string | null) => void;
  toggleNodeExpanded: (id: string) => void;
  setNodeExpanded: (id: string, expanded: boolean) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  pushToHistory: () => void;
  undo: () => void;
  redo: () => void;
  clearHistory: () => void;
}

export const useBrainstormStore = create<BrainstormState>((set, get) => ({
  boards: [],
  currentBoardId: null,
  nodes: [],
  edges: [],
  jobs: {},
  selectedNodeIds: [],
  expandedNodeId: null,
  expandedNodeIds: new Set<string>(),
  loading: false,
  error: null,

  history: [],
  historyIndex: -1,
  canUndo: false,
  canRedo: false,

  reactFlowNodes: [],

  setBoards: (boards) => set({ boards }),
  setCurrentBoardId: (currentBoardId) => {
    set({ currentBoardId });
    get().clearHistory();
    set({ expandedNodeIds: new Set<string>(), expandedNodeId: null });
  },
  setNodes: (nodes) => set((state) => ({ 
    nodes,
    reactFlowNodes: toReactFlowNodes(nodes, state.jobs, state.expandedNodeIds)
  })),
  setEdges: (edges) => set({ edges }),
  setJobs: (jobs) => set((state) => ({ 
    jobs,
    reactFlowNodes: toReactFlowNodes(state.nodes, jobs, state.expandedNodeIds)
  })),
  updateJob: (job) =>
    set((state) => {
      const newJobs = { ...state.jobs, [job.id]: job };
      return {
        jobs: newJobs,
        reactFlowNodes: toReactFlowNodes(state.nodes, newJobs, state.expandedNodeIds)
      };
    }),

  addNode: (node) => {
    get().pushToHistory();
    set((state) => {
        const newNodes = [...state.nodes, node];
        return { 
            nodes: newNodes,
            reactFlowNodes: toReactFlowNodes(newNodes, state.jobs, state.expandedNodeIds)
        };
    });
  },

  updateNode: (id, updates) =>
    set((state) => {
      const newNodes = state.nodes.map((n) => (n.id === id ? { ...n, ...updates } : n));
      return {
        nodes: newNodes,
        reactFlowNodes: toReactFlowNodes(newNodes, state.jobs, state.expandedNodeIds)
      };
    }),

  removeNode: (id) => {
    get().pushToHistory();
    set((state) => {
      const newNodes = state.nodes.filter((n) => n.id !== id);
      const nextExpanded = new Set(state.expandedNodeIds);
      nextExpanded.delete(id);
      return {
        nodes: newNodes,
        edges: state.edges.filter((e) => e.from !== id && e.to !== id),
        expandedNodeIds: nextExpanded,
        reactFlowNodes: toReactFlowNodes(newNodes, state.jobs, nextExpanded)
      };
    });
  },

  addEdge: (edge) => {
    get().pushToHistory();
    set((state) => ({ edges: [...state.edges, edge] }));
  },

  removeEdge: (id) => {
    get().pushToHistory();
    set((state) => ({ edges: state.edges.filter((e) => e.id !== id) }));
  },

  setSelectedNodeIds: (selectedNodeIds) => set({ selectedNodeIds }),
  setExpandedNodeId: (expandedNodeId) => set({ expandedNodeId }),
  toggleNodeExpanded: (id) =>
    set((state) => {
      const nextExpanded = new Set(state.expandedNodeIds);
      if (nextExpanded.has(id)) {
        nextExpanded.delete(id);
      } else {
        nextExpanded.add(id);
      }
      return {
        expandedNodeIds: nextExpanded,
        reactFlowNodes: toReactFlowNodes(state.nodes, state.jobs, nextExpanded),
      };
    }),
  setNodeExpanded: (id, expanded) =>
    set((state) => {
      const nextExpanded = new Set(state.expandedNodeIds);
      if (expanded) {
        nextExpanded.add(id);
      } else {
        nextExpanded.delete(id);
      }
      return {
        expandedNodeIds: nextExpanded,
        reactFlowNodes: toReactFlowNodes(state.nodes, state.jobs, nextExpanded),
      };
    }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),

  pushToHistory: () => {
    const state = get();
    const snapshot: HistorySnapshot = {
      nodes: [...state.nodes],
      edges: [...state.edges],
    };

    const newHistory = state.history.slice(0, state.historyIndex + 1);
    newHistory.push(snapshot);

    if (newHistory.length > MAX_HISTORY_SIZE) {
      newHistory.shift();
    }

    set({
      history: newHistory,
      historyIndex: newHistory.length - 1,
      canUndo: newHistory.length > 0,
      canRedo: false,
    });
  },

  undo: () => {
    const state = get();
    if (state.historyIndex < 0) return;

    const currentSnapshot: HistorySnapshot = {
      nodes: [...state.nodes],
      edges: [...state.edges],
    };

    const targetSnapshot = state.history[state.historyIndex];
    if (!targetSnapshot) return;

    const newHistory = [...state.history];
    if (state.historyIndex === state.history.length - 1) {
      newHistory.push(currentSnapshot);
    }

    const newIndex = state.historyIndex - 1;

    set({
      nodes: targetSnapshot.nodes,
      edges: targetSnapshot.edges,
      history: newHistory,
      historyIndex: newIndex,
      canUndo: newIndex >= 0,
      canRedo: true,
      reactFlowNodes: toReactFlowNodes(
        targetSnapshot.nodes,
        state.jobs,
        state.expandedNodeIds,
      ),
    });
  },

  redo: () => {
    const state = get();
    const nextIndex = state.historyIndex + 2;

    if (nextIndex >= state.history.length) return;

    const targetSnapshot = state.history[nextIndex];
    if (!targetSnapshot) return;

    set({
      nodes: targetSnapshot.nodes,
      edges: targetSnapshot.edges,
      historyIndex: state.historyIndex + 1,
      canUndo: true,
      canRedo: nextIndex + 1 < state.history.length,
      reactFlowNodes: toReactFlowNodes(
        targetSnapshot.nodes,
        state.jobs,
        state.expandedNodeIds,
      ),
    });
  },

  clearHistory: () => {
    set({
      history: [],
      historyIndex: -1,
      canUndo: false,
      canRedo: false,
    });
  },
}));

export function toReactFlowNodes(
  nodes: BrainstormNode[],
  jobs: Record<string, AIJob>,
  expandedNodeIds: Set<string> = new Set<string>(),
): Node[] {
  const parentVersionMap = new Map<string, number>();
  nodes.forEach((n) => parentVersionMap.set(n.id, n.version));

  return nodes.map((node) => {
    const parentVersion = node.parentId
      ? parentVersionMap.get(node.parentId)
      : undefined;
    const isStale =
      parentVersion !== undefined &&
      node.reviewedParentVersion !== undefined &&
      parentVersion > node.reviewedParentVersion;

    const activeJob = node.aiJobIds?.find((jobId) => {
      const job = jobs[jobId];
      return job && (job.status === "queued" || job.status === "running");
    });
    const isWorking = !!activeJob;
    const isExpanded = expandedNodeIds.has(node.id);

    return {
      id: node.id,
      type: "brainstorm",
      position: node.position,
      data: {
        node,
        isStale,
        isWorking,
        isExpanded,
      },
      selected: false,
    };
  });
}

export function toReactFlowEdges(edges: BrainstormEdge[]): Edge[] {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.from,
    target: edge.to,
    type: "brainstorm",
    data: { edge },
    animated: edge.type === "follows_from",
    style: getEdgeStyle(edge.type),
    markerEnd: { type: "arrowclosed" as const },
  }));
}

function getEdgeStyle(type: string): React.CSSProperties {
  switch (type) {
    case "supports":
      return { stroke: "#22c55e", strokeWidth: 2 };
    case "conflicts":
      return { stroke: "#ef4444", strokeWidth: 2, strokeDasharray: "5,5" };
    case "relates":
      return { stroke: "#8b5cf6", strokeWidth: 2, strokeDasharray: "3,3" };
    case "source":
      return { stroke: "#f59e0b", strokeWidth: 2 };
    default:
      return { stroke: "#64748b", strokeWidth: 2 };
  }
}
