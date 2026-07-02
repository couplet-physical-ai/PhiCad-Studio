import {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
  type ReactElement,
} from "react";
import {
  ReactFlow,
  Background,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type OnConnect,
  type OnNodesChange,
  type ReactFlowInstance,
  BackgroundVariant,
  ConnectionLineType,
  Panel,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { BrainstormNodeType } from "./components/BrainstormNode";
import {
  CanvasContextMenu,
  NodeContextMenu,
  EdgeContextMenu,
  SelectionContextMenu,
} from "./components/ContextMenus";
import { NodeDetail } from "./components/NodeDetail";
import { BoardListSidebar } from "./components/BoardListSidebar";
import { BoardMetaSidebar } from "./components/BoardMetaSidebar";
import {
  CanvasToolbar,
  type ViewMode,
} from "./components/CanvasToolbar";
import { SubIdeasPickerModal, type SubIdea } from "./components/SubIdeasPickerModal";
import { useBrainstormApi } from "./hooks/useBrainstormApi";
import { useBrainstormStream } from "./hooks/useBrainstormStream";
import {
  useBrainstormStore,
  toReactFlowNodes,
  toReactFlowEdges,
} from "./stores/brainstorm-store";
import type {
  BrainstormNode as BrainstormNodeType_,
  BrainstormBoard,
  EdgeType,
  AIJobKind,
} from "../shared/types";
import { useAppStore } from "@/stores/app-store";
import { useProjects } from "@/hooks/useProjects";
import { useToast } from "@/components/ui/use-toast";
import { useRegisterSidebarButtons } from "@/contexts/SidebarButtonsContext";
import { Button } from "@/components/ui/button";
import {
  FolderGit2,
  HardDrive,
  Loader2,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";

const nodeTypes = {
  brainstorm: BrainstormNodeType,
};

const MIN_DISTANCE = 150;
const TEMP_EDGE_STYLE = {
  stroke: "#94a3b8",
  strokeWidth: 1.5,
  strokeDasharray: "4 4",
};

interface ContextMenuState {
  type: "canvas" | "node" | "edge" | "selection" | null;
  position: { x: number; y: number };
  screenPosition: { x: number; y: number };
  targetId?: string;
}

export function Space(): ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const reactFlowRef = useRef<{ fitView: () => void } | null>(null);
  const reactFlowInstance = useRef<ReactFlowInstance | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("canvas");
  const [searchQuery, setSearchQuery] = useState("");
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [showBoardDetails, setShowBoardDetails] = useState(true);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    type: null,
    position: { x: 0, y: 0 },
    screenPosition: { x: 0, y: 0 },
  });

  // AI Sub-ideas state
  const [subIdeasCandidates, setSubIdeasCandidates] = useState<SubIdea[] | null>(null);
  const [subIdeasParentId, setSubIdeasParentId] = useState<string | null>(null);

  const api = useBrainstormApi();
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const { projects } = useProjects();
  const { toast } = useToast();
  const { setRightTopButtons, clearButtons } = useRegisterSidebarButtons();
  const {
    boards,
    currentBoardId,
    nodes: brainstormNodes,
    edges: brainstormEdges,
    jobs,
    loading,
    setBoards,
    setCurrentBoardId,
    setNodes: setBrainstormNodes,
    setEdges: setBrainstormEdges,
    addNode: addBrainstormNode,
    updateNode: updateBrainstormNode,
    removeNode: removeBrainstormNode,
    addEdge: addBrainstormEdge,
    removeEdge: removeBrainstormEdge,
    setLoading,
    setError,
    selectedNodeIds,
    setSelectedNodeIds,
    expandedNodeId,
    setExpandedNodeId,
    expandedNodeIds,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useBrainstormStore();

  useBrainstormStream(currentBoardId);

  const currentBoard = useMemo(
    () => boards.find((b) => b.id === currentBoardId),
    [boards, currentBoardId],
  );

  const visibleProjects = useMemo(() => {
    return [...projects].sort((a, b) => {
      const orderA = a.sortOrder ?? 0;
      const orderB = b.sortOrder ?? 0;
      if (orderA !== orderB) return orderA - orderB;
      return a.name.localeCompare(b.name);
    });
  }, [projects]);

  const boardsByProject = useMemo(() => {
    const workspaceBoards: BrainstormBoard[] = [];
    const projectBoards = new Map<string, BrainstormBoard[]>();

    for (const board of boards) {
      if (!board.projectId) {
        workspaceBoards.push(board);
        continue;
      }
      const list = projectBoards.get(board.projectId) ?? [];
      list.push(board);
      projectBoards.set(board.projectId, list);
    }

    return { workspaceBoards, projectBoards };
  }, [boards]);

  useEffect(() => {
    const icon = showBoardDetails ? (
      <PanelRightClose className="h-4 w-4" />
    ) : (
      <PanelRightOpen className="h-4 w-4" />
    );
    setRightTopButtons([
      <Button
        key="brainstorming-board-details-toggle"
        variant="ghost"
        size="icon"
        className="rounded-lg"
        aria-label={
          showBoardDetails ? "Hide board details" : "Show board details"
        }
        onClick={() => setShowBoardDetails((prev) => !prev)}
      >
        {icon}
      </Button>,
    ]);
    return () => clearButtons();
  }, [setRightTopButtons, clearButtons, showBoardDetails]);

  const reactFlowNodes = useMemo(
    () => toReactFlowNodes(brainstormNodes, jobs, expandedNodeIds),
    [brainstormNodes, jobs, expandedNodeIds],
  );
  const reactFlowEdges = useMemo(
    () => toReactFlowEdges(brainstormEdges),
    [brainstormEdges],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(reactFlowNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(reactFlowEdges);

  const filteredListNodes = useMemo(() => {
    if (!searchQuery.trim()) return brainstormNodes;
    const query = searchQuery.toLowerCase();
    return brainstormNodes.filter((n) => n.title.toLowerCase().includes(query));
  }, [brainstormNodes, searchQuery]);

  useEffect(() => {
    setNodes(reactFlowNodes);
  }, [reactFlowNodes, setNodes]);

  useEffect(() => {
    setEdges(reactFlowEdges);
  }, [reactFlowEdges, setEdges]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const isMeta = e.metaKey || e.ctrlKey;

      if (isMeta && e.key === "z" && !e.shiftKey && canUndo) {
        e.preventDefault();
        undo();
      }

      if (isMeta && e.key === "z" && e.shiftKey && canRedo) {
        e.preventDefault();
        redo();
      }

      if (isMeta && e.key === "y" && canRedo) {
        e.preventDefault();
        redo();
      }

      if (isMeta && e.key === "f") {
        e.preventDefault();
        const searchInput = document.querySelector<HTMLInputElement>(
          "[data-brainstorm-search]",
        );
        searchInput?.focus();
      }

      if (e.key === "Enter" && !editingNodeId) {
        const selectedNodes = nodes.filter((n) => n.selected);
        if (selectedNodes.length === 1) {
          e.preventDefault();
          const node = brainstormNodes.find(
            (n) => n.id === selectedNodes[0].id,
          );
          if (node) {
            setEditingNodeId(node.id);
            setEditingTitle(node.title);
          }
        }
      }

      if (e.key === "Escape" && editingNodeId) {
        setEditingNodeId(null);
        setEditingTitle("");
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedNodeIds.length > 0 && !expandedNodeId) {
          e.preventDefault();
          handleDeleteSelected();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    undo,
    redo,
    canUndo,
    canRedo,
    nodes,
    brainstormNodes,
    editingNodeId,
    selectedNodeIds,
    expandedNodeId,
  ]);

  useEffect(() => {
    if (!activeWorkspaceId) return;

    async function loadBoards() {
      setLoading(true);
      try {
        const loadedBoards = await api.getBoards(activeWorkspaceId);
        setBoards(loadedBoards);

        // Don't auto-select first board - let user see the board list first
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load boards");
      } finally {
        setLoading(false);
      }
    }

    loadBoards();
  }, [
    activeWorkspaceId,
    api,
    setBoards,
    setCurrentBoardId,
    setLoading,
    setError,
    currentBoardId,
  ]);

  useEffect(() => {
    if (!currentBoardId) return;

    async function loadBoardData() {
      setLoading(true);
      try {
        const boardId = currentBoardId!;
        const [loadedNodes, loadedEdges] = await Promise.all([
          api.getNodes(boardId),
          api.getEdges(boardId),
        ]);
        setBrainstormNodes(loadedNodes);
        setBrainstormEdges(loadedEdges);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load board data",
        );
      } finally {
        setLoading(false);
      }
    }

    loadBoardData();
  }, [
    currentBoardId,
    api,
    setBrainstormNodes,
    setBrainstormEdges,
    setLoading,
    setError,
  ]);

  const persistEdge = useCallback(
    async (source: string, target: string) => {
      if (!currentBoardId) return;
      if (brainstormEdges.some((edge) => edge.from === source && edge.to === target)) {
        return;
      }

      try {
        const edge = await api.createEdge({
          boardId: currentBoardId,
          from: source,
          to: target,
          type: "follows_from",
        });
        addBrainstormEdge(edge);
      } catch (err) {
        toast({
          title: "Error",
          description: "Failed to create connection",
          variant: "destructive",
        });
      }
    },
    [currentBoardId, brainstormEdges, api, addBrainstormEdge, toast],
  );

  const onConnect: OnConnect = useCallback(
    (connection) => {
      if (!connection.source || !connection.target) return;
      void persistEdge(connection.source, connection.target);
    },
    [persistEdge],
  );

  const getClosestEdge = useCallback((node: Node) => {
    const instance = reactFlowInstance.current;
    if (!instance) return null;

    const internalNode = instance.getInternalNode(node.id);
    if (!internalNode) return null;

    const allNodes = instance.getNodes();
    let closest: { node: Node; distance: number; x: number } | null = null;

    allNodes.forEach((candidate) => {
      if (candidate.id === node.id) return;

      const candidateInternal = instance.getInternalNode(candidate.id);
      if (!candidateInternal) return;

      const dx =
        candidateInternal.internals.positionAbsolute.x -
        internalNode.internals.positionAbsolute.x;
      const dy =
        candidateInternal.internals.positionAbsolute.y -
        internalNode.internals.positionAbsolute.y;
      const distance = Math.hypot(dx, dy);

      if (distance < MIN_DISTANCE && (!closest || distance < closest.distance)) {
        closest = {
          node: candidate,
          distance,
          x: candidateInternal.internals.positionAbsolute.x,
        };
      }
    });

    if (!closest) return null;

    const closeNodeIsSource =
      closest.x < internalNode.internals.positionAbsolute.x;

    return {
      source: closeNodeIsSource ? closest.node.id : node.id,
      target: closeNodeIsSource ? node.id : closest.node.id,
    };
  }, []);

  const handleNodeDrag = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const closeEdge = getClosestEdge(node);

      setEdges((es) => {
        const nextEdges = es.filter((e) => e.className !== "temp");

        if (!closeEdge) {
          return nextEdges;
        }

        if (
          !nextEdges.find(
            (edge) =>
              edge.source === closeEdge.source && edge.target === closeEdge.target,
          )
        ) {
          nextEdges.push({
            id: `temp-${closeEdge.source}-${closeEdge.target}`,
            source: closeEdge.source,
            target: closeEdge.target,
            className: "temp",
            style: TEMP_EDGE_STYLE,
            markerEnd: { type: "arrowclosed" as const },
          });
        }

        return nextEdges;
      });
    },
    [getClosestEdge, setEdges],
  );

  const handleNodeDragStop = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const closeEdge = getClosestEdge(node);

      setEdges((es) => es.filter((e) => e.className !== "temp"));

      if (closeEdge) {
        void persistEdge(closeEdge.source, closeEdge.target);
      }
    },
    [getClosestEdge, persistEdge, setEdges],
  );

  const handleNodesChange: OnNodesChange = useCallback(
    (changes) => {
      onNodesChange(changes);

      const positionChanges = changes.filter(
        (c) => c.type === "position" && c.dragging === false && c.position,
      );

      if (positionChanges.length > 0) {
        const positions = positionChanges.map((c) => {
          const change = c as {
            id: string;
            position: { x: number; y: number };
          };
          return {
            nodeId: change.id,
            position: change.position,
          };
        });

        api.bulkUpdatePositions({ positions }).catch(() => {
          toast({
            title: "Error",
            description: "Failed to save node positions",
            variant: "destructive",
          });
        });

        positions.forEach(({ nodeId, position }) => {
          updateBrainstormNode(nodeId, { position });
        });
      }
    },
    [onNodesChange, api, updateBrainstormNode, toast],
  );

  const handlePaneContextMenu = useCallback(
    (event: React.MouseEvent | MouseEvent) => {
      event.preventDefault();
      const clientX = "clientX" in event ? event.clientX : 0;
      const clientY = "clientY" in event ? event.clientY : 0;
      setContextMenu({
        type: "canvas",
        position: { x: clientX, y: clientY },
        screenPosition: { x: clientX, y: clientY },
      });
    },
    [],
  );

  const handleNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.preventDefault();
      setContextMenu({
        type: "node",
        position: { x: event.clientX, y: event.clientY },
        screenPosition: { x: event.clientX, y: event.clientY },
        targetId: node.id,
      });
    },
    [],
  );

  const handleEdgeContextMenu = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      event.preventDefault();
      setContextMenu({
        type: "edge",
        position: { x: event.clientX, y: event.clientY },
        screenPosition: { x: event.clientX, y: event.clientY },
        targetId: edge.id,
      });
    },
    [],
  );


  const handleSelectionContextMenu = useCallback(
    (event: React.MouseEvent | MouseEvent) => {
      event.preventDefault();
      const selected = nodes.filter((n) => n.selected);
      if (selected.length > 1) {
        const clientX = "clientX" in event ? event.clientX : 0;
        const clientY = "clientY" in event ? event.clientY : 0;
        setContextMenu({
          type: "selection",
          position: { x: clientX, y: clientY },
          screenPosition: { x: clientX, y: clientY },
        });
        setSelectedNodeIds(selected.map((n) => n.id));
      }
    },
    [nodes, setSelectedNodeIds],
  );

  const closeContextMenu = useCallback(() => {
    setContextMenu({ type: null, position: { x: 0, y: 0 }, screenPosition: { x: 0, y: 0 } });
  }, []);

  const handleAddNode = useCallback(async () => {
    if (!currentBoardId) return;

    let position = { x: 100, y: 100 };

    if (reactFlowInstance.current) {
      position = reactFlowInstance.current.screenToFlowPosition({
        x: contextMenu.screenPosition.x,
        y: contextMenu.screenPosition.y,
      });
    }

    try {
      const node = await api.createNode({
        boardId: currentBoardId,
        type: "idea",
        title: "New Idea",
        position,
      });
      addBrainstormNode(node);
      toast({ title: "Idea created", description: "New idea added to canvas" });
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to create node",
        variant: "destructive",
      });
    }
  }, [currentBoardId, contextMenu.screenPosition, api, addBrainstormNode, toast]);

  const handleDeleteNode = useCallback(async () => {
    if (!contextMenu.targetId) return;

    try {
      await api.deleteNode(contextMenu.targetId);
      removeBrainstormNode(contextMenu.targetId);
      toast({ title: "Deleted", description: "Node removed" });
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to delete node",
        variant: "destructive",
      });
    }
  }, [contextMenu.targetId, api, removeBrainstormNode, toast]);

  const handleDeleteEdge = useCallback(async () => {
    if (!contextMenu.targetId) return;

    try {
      await api.deleteEdge(contextMenu.targetId);
      removeBrainstormEdge(contextMenu.targetId);
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to delete edge",
        variant: "destructive",
      });
    }
  }, [contextMenu.targetId, api, removeBrainstormEdge, toast]);

  const handleReverseEdge = useCallback(async () => {
    if (!contextMenu.targetId) return;

    try {
      const updated = await api.reverseEdge(contextMenu.targetId);
      removeBrainstormEdge(contextMenu.targetId);
      addBrainstormEdge(updated);
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to reverse edge",
        variant: "destructive",
      });
    }
  }, [
    contextMenu.targetId,
    api,
    removeBrainstormEdge,
    addBrainstormEdge,
    toast,
  ]);

  const handleChangeEdgeType = useCallback(
    async (type: EdgeType) => {
      if (!contextMenu.targetId) return;

      try {
        const updated = await api.updateEdge(contextMenu.targetId, { type });
        removeBrainstormEdge(contextMenu.targetId);
        addBrainstormEdge(updated);
      } catch (err) {
        toast({
          title: "Error",
          description: "Failed to update edge",
          variant: "destructive",
        });
      }
    },
    [contextMenu.targetId, api, removeBrainstormEdge, addBrainstormEdge, toast],
  );

  const handleToggleStar = useCallback(async () => {
    if (!contextMenu.targetId) return;
    const node = brainstormNodes.find((n) => n.id === contextMenu.targetId);
    if (!node) return;

    try {
      await api.updateNode(contextMenu.targetId, {
        isStarred: !node.isStarred,
      });
      updateBrainstormNode(contextMenu.targetId, {
        isStarred: !node.isStarred,
      });
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to toggle star",
        variant: "destructive",
      });
    }
  }, [contextMenu.targetId, brainstormNodes, api, updateBrainstormNode, toast]);

  const handleTogglePin = useCallback(async () => {
    if (!contextMenu.targetId) return;
    const node = brainstormNodes.find((n) => n.id === contextMenu.targetId);
    if (!node) return;

    try {
      await api.updateNode(contextMenu.targetId, { isPinned: !node.isPinned });
      updateBrainstormNode(contextMenu.targetId, { isPinned: !node.isPinned });
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to toggle pin",
        variant: "destructive",
      });
    }
  }, [contextMenu.targetId, brainstormNodes, api, updateBrainstormNode, toast]);

  const handleEditDescription = useCallback(() => {
    if (!contextMenu.targetId) return;
    setExpandedNodeId(contextMenu.targetId);
  }, [contextMenu.targetId, setExpandedNodeId]);

  const handleChangeColor = useCallback(
    async (color: string) => {
      if (!contextMenu.targetId) return;
      try {
        await api.updateNode(contextMenu.targetId, { color });
        updateBrainstormNode(contextMenu.targetId, { color });
      } catch (err) {
        toast({
          title: "Error",
          description: "Failed to change color",
          variant: "destructive",
        });
      }
    },
    [contextMenu.targetId, api, updateBrainstormNode, toast],
  );

  const handleDisconnectNode = useCallback(async () => {
    if (!contextMenu.targetId) return;
    const edgesToDelete = brainstormEdges.filter(
      (edge) => edge.from === contextMenu.targetId || edge.to === contextMenu.targetId,
    );

    if (edgesToDelete.length === 0) return;

    try {
      await Promise.all(edgesToDelete.map((edge) => api.deleteEdge(edge.id)));
      edgesToDelete.forEach((edge) => removeBrainstormEdge(edge.id));
      toast({ title: "Disconnected", description: "Connections removed" });
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to disconnect node",
        variant: "destructive",
      });
    }
  }, [contextMenu.targetId, brainstormEdges, api, removeBrainstormEdge, toast]);

  const handleMarkReviewed = useCallback(async () => {
    if (!contextMenu.targetId) return;

    try {
      const reviewedVersion = await api.markNodeReviewed(contextMenu.targetId);
      updateBrainstormNode(contextMenu.targetId, {
        reviewedParentVersion: reviewedVersion,
      });
      toast({ title: "Reviewed", description: "Node marked as reviewed" });
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to mark reviewed",
        variant: "destructive",
      });
    }
  }, [contextMenu.targetId, api, updateBrainstormNode, toast]);

  const handleDeleteSelected = useCallback(async () => {
    let deleted = 0;
    let failed = 0;
    for (const nodeId of selectedNodeIds) {
      try {
        await api.deleteNode(nodeId);
        removeBrainstormNode(nodeId);
        deleted++;
      } catch (err) {
        failed++;
      }
    }
    setSelectedNodeIds([]);
    if (deleted > 0) {
      toast({ title: "Deleted", description: `${deleted} node(s) removed` });
    }
    if (failed > 0) {
      toast({
        title: "Error",
        description: `Failed to delete ${failed} node(s)`,
        variant: "destructive",
      });
    }
  }, [selectedNodeIds, api, removeBrainstormNode, setSelectedNodeIds, toast]);

  const handleMoveToProject = useCallback(async () => {
    if (!currentBoardId || selectedNodeIds.length === 0) return;
    const newBoardTitle = window.prompt("New project title", "New Project");
    if (!newBoardTitle?.trim()) return;

    try {
      await api.extractProject({
        nodeIds: selectedNodeIds,
        sourceBoardId: currentBoardId,
        newBoardTitle: newBoardTitle.trim(),
      });

      const [loadedNodes, loadedEdges] = await Promise.all([
        api.getNodes(currentBoardId),
        api.getEdges(currentBoardId),
      ]);
      setBrainstormNodes(loadedNodes);
      setBrainstormEdges(loadedEdges);
      setSelectedNodeIds([]);
      toast({
        title: "Project created",
        description: "Cluster moved to new project",
      });
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to move selection to new project",
        variant: "destructive",
      });
    }
  }, [
    currentBoardId,
    selectedNodeIds,
    api,
    setBrainstormNodes,
    setBrainstormEdges,
    setSelectedNodeIds,
    toast,
  ]);

  const handleSaveInlineTitle = useCallback(async () => {
    if (!editingNodeId || !editingTitle.trim()) {
      setEditingNodeId(null);
      setEditingTitle("");
      return;
    }

    try {
      await api.updateNode(editingNodeId, { title: editingTitle.trim() });
      updateBrainstormNode(editingNodeId, { title: editingTitle.trim() });
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to rename node",
        variant: "destructive",
      });
    } finally {
      setEditingNodeId(null);
      setEditingTitle("");
    }
  }, [editingNodeId, editingTitle, api, updateBrainstormNode, toast]);

  const handleCreateBoard = useCallback(async (projectId?: string | null) => {
    if (!activeWorkspaceId) return;

    try {
      const board = await api.createBoard({
        workspaceId: activeWorkspaceId,
        projectId: projectId ?? null,
        title: "New Brainstorming Board",
      });
      setBoards([...boards, board]);
      setCurrentBoardId(board.id);
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to create board",
        variant: "destructive",
      });
    }
  }, [activeWorkspaceId, api, boards, setBoards, setCurrentBoardId, toast]);

  const handleDeleteBoard = useCallback(
    async (boardId: string) => {
      try {
        await api.deleteBoard(boardId);
        const remaining = boards.filter((b) => b.id !== boardId);
        setBoards(remaining);
        if (currentBoardId === boardId) {
          setCurrentBoardId(remaining.length > 0 ? remaining[0].id : null);
        }
        toast({ title: "Deleted", description: "Board removed" });
      } catch (err) {
        toast({
          title: "Error",
          description: "Failed to delete board",
          variant: "destructive",
        });
      }
    },
    [api, boards, currentBoardId, setBoards, setCurrentBoardId, toast],
  );

  const handleRenameBoard = useCallback(
    async (boardId: string, title: string) => {
      try {
        const updated = await api.updateBoard(boardId, { title });
        setBoards(boards.map((b) => (b.id === boardId ? updated : b)));
      } catch (err) {
        toast({
          title: "Error",
          description: "Failed to rename board",
          variant: "destructive",
        });
      }
    },
    [api, boards, setBoards, toast],
  );

  const handleUpdateBoard = useCallback(
    async (updates: { title?: string; description?: string; systemPromptValidation?: string }) => {
      if (!currentBoardId) return;
      try {
        const updated = await api.updateBoard(currentBoardId, updates);
        setBoards(boards.map((b) => (b.id === currentBoardId ? updated : b)));
      } catch (err) {
        toast({
          title: "Error",
          description: "Failed to update board",
          variant: "destructive",
        });
      }
    },
    [api, boards, currentBoardId, setBoards, toast],
  );

  const handleConfirmSubIdeas = useCallback(
    async (selected: SubIdea[]) => {
      if (!currentBoardId || !subIdeasParentId) return;

      const parentNode = brainstormNodes.find(n => n.id === subIdeasParentId);
      if (!parentNode) return;

      let createdCount = 0;
      // Position new nodes in a circle around parent
      const radius = 250;
      const startAngle = Math.random() * Math.PI * 2;

      for (let i = 0; i < selected.length; i++) {
        const idea = selected[i];
        const angle = startAngle + (i / selected.length) * Math.PI * 2;
        const x = parentNode.position.x + Math.cos(angle) * radius;
        const y = parentNode.position.y + Math.sin(angle) * radius;

        try {
          const node = await api.createNode({
            boardId: currentBoardId,
            type: "idea",
            title: idea.title,
            summaryRich: idea.description,
            parentId: subIdeasParentId,
            position: { x, y },
          });

          addBrainstormNode(node);

          const edge = await api.createEdge({
            boardId: currentBoardId,
            from: subIdeasParentId,
            to: node.id,
            type: "follows_from",
          });
          addBrainstormEdge(edge);
          createdCount++;
        } catch (e) {
          console.error("Failed to create sub-idea", e);
        }
      }

      toast({ title: "Created", description: `${createdCount} sub-ideas created` });
      setSubIdeasCandidates(null);
      setSubIdeasParentId(null);
    },
    [currentBoardId, subIdeasParentId, brainstormNodes, api, addBrainstormNode, addBrainstormEdge, toast]
  );

  const handleAIAction = useCallback(
    async (nodeId: string, kind: AIJobKind, loadingMessage: string) => {
      if (!currentBoardId) return;
      try {
        toast({ title: "Working...", description: loadingMessage });
        const job = await api.triggerAIJob({
          boardId: currentBoardId,
          kind,
          nodeId,
        });

        const poll = setInterval(async () => {
          try {
            const updated = await api.getAIJob(job.id);
            if (updated.status === "done") {
              clearInterval(poll);
              // Refresh to get updates
              const nodes = await api.getNodes(currentBoardId);
              setBrainstormNodes(nodes);
              toast({
                title: "Completed",
                description: "AI action finished successfully.",
              });

              if (kind === "subideas" && Array.isArray(updated.output)) {
                setSubIdeasCandidates(updated.output as SubIdea[]);
                setSubIdeasParentId(nodeId);
              }

            } else if (updated.status === "error") {
              clearInterval(poll);
              toast({
                title: "Error",
                description: updated.error || "AI action failed",
                variant: "destructive",
              });
            }
          } catch (e) {
            clearInterval(poll);
          }
        }, 1000);

        setTimeout(() => clearInterval(poll), 60000);
      } catch (err) {
        toast({
          title: "Error",
          description: "Failed to start AI action",
          variant: "destructive",
        });
      }
    },
    [api, currentBoardId, setBrainstormNodes, toast],
  );

  const handleValidateNode = useCallback(
    (nodeId?: string) => {
      const targetId = nodeId || contextMenu.targetId;
      if (targetId) handleAIAction(targetId, "validate", "Validating idea...");
    },
    [contextMenu.targetId, handleAIAction],
  );

  const handleGenerateFeedback = useCallback(
    (nodeId?: string) => {
      const targetId = nodeId || contextMenu.targetId;
      if (targetId)
        handleAIAction(targetId, "feedback", "Generating feedback...");
    },
    [contextMenu.targetId, handleAIAction],
  );

  const handleAskQuestions = useCallback(
    (nodeId?: string) => {
      const targetId = nodeId || contextMenu.targetId;
      if (targetId)
        handleAIAction(targetId, "questions", "Generating questions...");
    },
    [contextMenu.targetId, handleAIAction],
  );

  const handleSuggestImprovements = useCallback(
    (nodeId?: string) => {
      const targetId = nodeId || contextMenu.targetId;
      if (targetId)
        handleAIAction(targetId, "improve", "Suggesting improvements...");
    },
    [contextMenu.targetId, handleAIAction],
  );

  const handleGenerateSubIdeas = useCallback(
    async (nodeId: string) => {
      return handleAIAction(nodeId, "subideas", "Generating sub-ideas...");
    },
    [handleAIAction],
  );

  const selectedNode = contextMenu.targetId
    ? brainstormNodes.find((n) => n.id === contextMenu.targetId)
    : null;

  const parentNode = selectedNode?.parentId
    ? brainstormNodes.find((n) => n.id === selectedNode.parentId)
    : null;

  const isStale =
    selectedNode && parentNode
      ? (selectedNode.reviewedParentVersion ?? 0) < parentNode.version
      : false;

  if (!activeWorkspaceId) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">No workspace selected</p>
      </div>
    );
  }

  const handleFocusNode = useCallback(
    (nodeId: string) => {
      setFocusedNodeId(nodeId);
      setNodes((nds) =>
        nds.map((n) => ({
          ...n,
          selected: n.id === nodeId,
        })),
      );
    },
    [setNodes],
  );

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      handleFocusNode(node.id);
    },
    [handleFocusNode],
  );

  if (!currentBoardId) {
    return (
      <div className="flex h-full w-full bg-background text-foreground">
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-4xl mx-auto space-y-8">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-bold">Brainstorming Boards</h1>
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-8">
                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <HardDrive className="h-4 w-4 text-muted-foreground" />
                      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                        Workspace
                      </h2>
                    </div>
                    <Button onClick={() => handleCreateBoard()} size="sm">
                      New Board
                    </Button>
                  </div>
                  {boardsByProject.workspaceBoards.length === 0 ? (
                    <div className="text-center py-10">
                      <p className="text-muted-foreground">No workspace boards yet.</p>
                    </div>
                  ) : (
                    <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                      {boardsByProject.workspaceBoards.map((board) => (
                        <div
                          key={board.id}
                          onClick={() => setCurrentBoardId(board.id)}
                          className="group relative p-4 rounded-lg border border-border bg-card hover:bg-accent cursor-pointer transition-colors"
                        >
                          <h3 className="font-medium truncate">{board.title}</h3>
                          {board.description && (
                            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                              {board.description}
                            </p>
                          )}
                          <div className="text-xs text-muted-foreground mt-2">
                            Created {new Date(board.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section className="space-y-3">
                  <div className="flex items-center gap-2">
                    <FolderGit2 className="h-4 w-4 text-muted-foreground" />
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                      Projects
                    </h2>
                  </div>
                  {visibleProjects.length === 0 ? (
                    <div className="text-center py-10">
                      <p className="text-muted-foreground">No projects yet.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {visibleProjects.map((project) => {
                        const projectBoards =
                          boardsByProject.projectBoards.get(project.id) ?? [];
                        return (
                          <div
                            key={project.id}
                            className="rounded-lg border border-border bg-card"
                          >
                            <div className="flex items-center justify-between border-b border-border px-3 py-2">
                              <div className="flex items-center gap-2">
                                <span
                                  className="h-2 w-2 rounded-full"
                                  style={{
                                    backgroundColor:
                                      project.color || "var(--color-primary)",
                                  }}
                                />
                                <span className="text-sm font-medium">
                                  {project.name}
                                </span>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleCreateBoard(project.id)}
                              >
                                New Board
                              </Button>
                            </div>
                            <div className="p-3">
                              {projectBoards.length === 0 ? (
                                <p className="text-xs text-muted-foreground">
                                  No boards yet.
                                </p>
                              ) : (
                                <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
                                  {projectBoards.map((board) => (
                                    <div
                                      key={board.id}
                                      onClick={() => setCurrentBoardId(board.id)}
                                      className="group relative p-4 rounded-lg border border-border bg-background hover:bg-accent cursor-pointer transition-colors"
                                    >
                                      <h3 className="font-medium truncate">
                                        {board.title}
                                      </h3>
                                      {board.description && (
                                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                          {board.description}
                                        </p>
                                      )}
                                      <div className="text-xs text-muted-foreground mt-2">
                                        Created {new Date(board.createdAt).toLocaleDateString()}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  const handleGoHome = () => {
    setCurrentBoardId(null);
  };

  return (
    <div
      ref={containerRef}
      className="relative flex h-full w-full bg-background text-foreground"
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <CanvasToolbar
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onSearch={setSearchQuery}
          onFitView={() => reactFlowRef.current?.fitView()}
          onHome={handleGoHome}
        />

        <div className="relative flex-1 overflow-hidden">
          {loading && brainstormNodes.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : viewMode === "canvas" ? (
            <div className="h-full w-full">
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={handleNodesChange}
                onEdgesChange={onEdgesChange}
                onNodeDrag={handleNodeDrag}
                onNodeDragStop={handleNodeDragStop}
                onConnect={onConnect}
                onInit={(instance) => {
                  reactFlowInstance.current = instance;
                  reactFlowRef.current = instance;
                }}
                onPaneContextMenu={handlePaneContextMenu}
                onNodeContextMenu={handleNodeContextMenu}
                onNodeClick={handleNodeClick}
                onEdgeContextMenu={handleEdgeContextMenu}
                onSelectionContextMenu={handleSelectionContextMenu}
                nodeTypes={nodeTypes}
                defaultEdgeOptions={{ type: "bezier" }}
                connectionLineType={ConnectionLineType.Bezier}
                className="bg-muted/40"
                fitView
                snapToGrid
                snapGrid={[20, 20]}
                deleteKeyCode={["Backspace", "Delete"]}
                multiSelectionKeyCode={["Meta", "Control"]}
                selectionKeyCode={["Shift"]}
                panOnScroll
                selectionOnDrag
              >
                <Background
                  variant={BackgroundVariant.Dots}
                  gap={24}
                  size={1}
                  color="var(--border)"
                />
                <Panel
                  position="bottom-left"
                  className="text-xs text-muted-foreground"
                >
                  {brainstormNodes.length} nodes · {brainstormEdges.length}{" "}
                  connections
                </Panel>
              </ReactFlow>
            </div>
          ) : (
            <div className="flex-1 overflow-auto p-4">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-border text-left text-sm text-muted-foreground">
                    <th className="pb-2 font-medium">Title</th>
                    <th className="pb-2 font-medium w-20">Star</th>
                    <th className="pb-2 font-medium w-20">Status</th>
                    <th className="pb-2 font-medium w-24">Validation</th>
                    <th className="pb-2 font-medium w-24">Comments</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredListNodes
                    .filter((n) => !n.parentId)
                    .map((node) => (
                      <ListViewRow
                        key={node.id}
                        node={node}
                        level={0}
                        allNodes={filteredListNodes}
                      />
                    ))}
                </tbody>
              </table>
            </div>
          )}

          {contextMenu.type === "canvas" && (
            <CanvasContextMenu
              position={contextMenu.position}
              onClose={closeContextMenu}
              onAddNode={handleAddNode}
              onPaste={() => { }}
            />

          )}

          {contextMenu.type === "node" && selectedNode && (
            <NodeContextMenu
              position={contextMenu.position}
              nodeId={selectedNode.id}
              isStale={isStale}
              isStarred={selectedNode.isStarred ?? false}
              isPinned={selectedNode.isPinned ?? false}
              onClose={closeContextMenu}
              onRename={() => {
                setEditingNodeId(selectedNode.id);
                setEditingTitle(selectedNode.title);
                closeContextMenu();
              }}
              onEditDescription={handleEditDescription}
              onChangeColor={handleChangeColor}
              onValidate={() => handleValidateNode()}
              onGenerateFeedback={() => handleGenerateFeedback()}
              onAskQuestions={() => handleAskQuestions()}
              onSuggestImprovements={() => handleSuggestImprovements()}
              onGenerateSubIdeas={() => handleGenerateSubIdeas(selectedNode.id)}
              onMarkReviewed={handleMarkReviewed}
              onToggleStar={handleToggleStar}
              onTogglePin={handleTogglePin}
              onDelete={handleDeleteNode}
              onDisconnect={handleDisconnectNode}
            />
          )}

          {contextMenu.type === "edge" && (
            <EdgeContextMenu
              position={contextMenu.position}
              edgeId={contextMenu.targetId!}
              onClose={closeContextMenu}
              onReverse={handleReverseEdge}
              onChangeType={handleChangeEdgeType}
              onDelete={handleDeleteEdge}
            />
          )}

          {contextMenu.type === "selection" && (
            <SelectionContextMenu
              position={contextMenu.position}
              selectedCount={selectedNodeIds.length}
              onClose={closeContextMenu}
              onMoveToProject={handleMoveToProject}
              onDelete={handleDeleteSelected}
            />
          )}

          {editingNodeId &&
            (() => {
              const editingNode = nodes.find((n) => n.id === editingNodeId);
              if (!editingNode) return null;
              return (
                <div
                  className="fixed z-50 bg-background border border-primary rounded-lg shadow-xl p-2"
                  style={{
                    left: editingNode.position.x + 100,
                    top: editingNode.position.y + 25,
                    transform: "translate(-50%, -50%)",
                  }}
                >
                  <input
                    type="text"
                    value={editingTitle}
                    onChange={(e) => setEditingTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleSaveInlineTitle();
                      }
                      if (e.key === "Escape") {
                        setEditingNodeId(null);
                        setEditingTitle("");
                      }
                    }}
                    onBlur={handleSaveInlineTitle}
                    autoFocus
                    className="w-48 px-2 py-1 text-sm border border-input rounded focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              );
            })()}
        </div>
      </div>

      {expandedNodeId ? (
        (() => {
          const expandedNode = brainstormNodes.find(
            (n) => n.id === expandedNodeId,
          );
          if (!expandedNode) return null;

          const parentNode = expandedNode.parentId
            ? brainstormNodes.find((n) => n.id === expandedNode.parentId)
            : null;
          const isExpandedNodeStale = parentNode
            ? (expandedNode.reviewedParentVersion ?? 0) < parentNode.version
            : false;

          return (
            <NodeDetail
              node={expandedNode}
              isStale={isExpandedNodeStale}
              onClose={() => setExpandedNodeId(null)}
              onUpdateNode={async (id, updates) => {
                try {
                  await api.updateNode(id, updates);
                  updateBrainstormNode(id, updates);
                } catch (err) {
                  toast({
                    title: "Error",
                    description: "Failed to update node",
                    variant: "destructive",
                  });
                }
              }}
              onGenerateSubIdeas={handleGenerateSubIdeas}
              onMarkReviewed={async (nodeId) => {
                try {
                  const reviewedVersion = await api.markNodeReviewed(nodeId);
                  updateBrainstormNode(nodeId, {
                    reviewedParentVersion: reviewedVersion,
                  });
                } catch (err) {
                  toast({
                    title: "Error",
                    description: "Failed to mark reviewed",
                    variant: "destructive",
                  });
                }
              }}
              onGetComments={api.getComments}
              onCreateComment={async (params) => {
                const comment = await api.createComment(params);
                updateBrainstormNode(params.nodeId, {
                  commentCount: (expandedNode.commentCount || 0) + 1,
                });
                return comment;
              }}
              onUpdateComment={api.updateComment}
              onDeleteComment={async (commentId, nodeId) => {
                try {
                  await api.deleteComment(commentId, nodeId);
                  updateBrainstormNode(nodeId, {
                    commentCount: Math.max(
                      (expandedNode.commentCount || 1) - 1,
                      0,
                    ),
                  });
                } catch (err) {
                  toast({
                    title: "Error",
                    description: "Failed to delete comment",
                    variant: "destructive",
                  });
                  throw err;
                }
              }}
            />
          );
        })()
      ) : showBoardDetails ? (
        <BoardMetaSidebar
          board={currentBoard}
          nodes={brainstormNodes}
          edges={brainstormEdges}
          onUpdateBoard={handleUpdateBoard}
          onUpdateNode={async (nodeId, updates) => {
            try {
              await api.updateNode(nodeId, updates);
              updateBrainstormNode(nodeId, updates);
            } catch (err) {
              toast({
                title: "Error",
                description: "Failed to update node",
                variant: "destructive",
              });
            }
          }}
          selectedNodeId={focusedNodeId}
          onSelectNode={handleFocusNode}
          onFocusNode={handleFocusNode}
          searchQuery={searchQuery}
        />
      ) : null}

      {subIdeasCandidates && (
        <SubIdeasPickerModal
          candidates={subIdeasCandidates}
          onClose={() => {
            setSubIdeasCandidates(null);
            setSubIdeasParentId(null);
          }}
          onConfirm={handleConfirmSubIdeas}
        />
      )}
    </div>
  );
}

function ListViewRow({
  node,
  level,
  allNodes,
}: {
  node: BrainstormNodeType_;
  level: number;
  allNodes: BrainstormNodeType_[];
}) {
  const children = allNodes.filter((n) => n.parentId === node.id);
  const parentNode = node.parentId
    ? allNodes.find((n) => n.id === node.parentId)
    : null;
  const isStale = parentNode
    ? (node.reviewedParentVersion ?? 0) < parentNode.version
    : false;

  return (
    <>
      <tr className="border-b border-border hover:bg-muted/50">
        <td className="py-2" style={{ paddingLeft: `${level * 24 + 8}px` }}>
          <span className="font-medium">{node.title}</span>
        </td>
        <td className="py-2">
          {node.isStarred && <span className="text-yellow-500">★</span>}
        </td>
        <td className="py-2">
          <span
            className={
              isStale ? "text-xs text-amber-600" : "text-xs text-green-600"
            }
          >
            {isStale ? "Stale" : "Fresh"}
          </span>
        </td>
        <td className="py-2">
          {node.validation?.status && (
            <span className="text-xs">{node.validation.status}</span>
          )}
        </td>
        <td className="py-2">
          <span className="text-xs text-muted-foreground">
            {node.commentCount}
          </span>
        </td>
      </tr>
      {children.map((child) => (
        <ListViewRow
          key={child.id}
          node={child}
          level={level + 1}
          allNodes={allNodes}
        />
      ))}
    </>
  );
}

export default Space;
