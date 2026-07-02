export type NodeType = "root" | "idea" | "chat_reference" | "project_portal";

export type EdgeType =
  | "follows_from"
  | "supports"
  | "conflicts"
  | "relates"
  | "source";

export type ValidationStatus = "none" | "ok" | "warning" | "risk";

export type AIJobKind =
  | "validate"
  | "improve"
  | "subideas"
  | "validate_cluster"
  | "export"
  | "feedback"
  | "questions";

export type AIJobStatus = "queued" | "running" | "done" | "error";

export interface Attachment {
  id: string;
  kind: "audio" | "file";
  mimeType: string;
  url: string;
  name?: string;
  durationMs?: number;
  transcript?: string;
  createdAt: number;
}

export interface ValidationReport {
  status: ValidationStatus;
  score?: number;
  strengths: string[];
  risks: string[];
  unknowns: string[];
  nextChecks: string[];
  updatedAt: number;
}

export interface BrainstormNode {
  id: string;
  boardId: string;
  type: NodeType;
  title: string;
  summaryRich?: unknown;
  contentRich?: unknown;
  systemPromptValidation?: string;
  tags?: string[];

  attachments?: Attachment[];
  color?: string;
  parentId?: string;
  position: { x: number; y: number };
  version: number;
  reviewedParentVersion?: number;
  isStarred?: boolean;
  isPinned?: boolean;
  isDeleted?: boolean;
  childCount: number;
  commentCount: number;
  validation?: ValidationReport;
  aiJobIds?: string[];
  chatId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface BrainstormEdge {
  id: string;
  boardId: string;
  from: string;
  to: string;
  type: EdgeType;
  label?: string;
  createdAt: number;
}

export interface BrainstormBoard {
  id: string;
  workspaceId: string;
  projectId?: string | null;
  title: string;
  description?: string;
  systemPromptValidation?: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface Comment {
  id: string;
  nodeId: string;
  author: string;
  body: string;
  parentCommentId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface AIJob {
  id: string;
  boardId: string;
  nodeId?: string;
  kind: AIJobKind;
  status: AIJobStatus;
  inputSnapshot?: unknown;
  output?: unknown;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export interface BrainstormArtifact {
  id: string;
  boardId: string;
  nodeId?: string;
  type: string;
  content: string;
  createdAt: number;
}

export interface CreateBoardParams {
  workspaceId: string;
  projectId?: string | null;
  title: string;
  description?: string;
  systemPromptValidation?: string;
}

export interface CreateNodeParams {
  boardId: string;
  type: NodeType;
  title: string;
  summaryRich?: unknown;
  contentRich?: unknown;
  tags?: string[];
  parentId?: string;
  position: { x: number; y: number };
  color?: string;
}

export interface UpdateNodeParams {
  title?: string;
  summaryRich?: unknown;
  contentRich?: unknown;
  systemPromptValidation?: string;
  tags?: string[];
  color?: string;
  position?: { x: number; y: number };
  isStarred?: boolean;
  isPinned?: boolean;
}

export interface UpdateNodePositionParams {
  position: { x: number; y: number };
}

export interface BulkUpdatePositionsParams {
  positions: Array<{ nodeId: string; position: { x: number; y: number } }>;
}

export interface CreateEdgeParams {
  boardId: string;
  from: string;
  to: string;
  type: EdgeType;
  label?: string;
}

export interface UpdateEdgeParams {
  type?: EdgeType;
  label?: string;
}

export interface ReactFlowNodeData {
  node: BrainstormNode;
  isStale: boolean;
  onExpand: (nodeId: string) => void;
  onContextMenu: (event: React.MouseEvent, nodeId: string) => void;
}

export interface ReactFlowEdgeData {
  edge: BrainstormEdge;
  onContextMenu: (event: React.MouseEvent, edgeId: string) => void;
}
