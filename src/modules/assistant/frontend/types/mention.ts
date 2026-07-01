export interface MentionEntity {
  id: string;
  entityType: string;
  displayText: string;
  icon?: string;
  description?: string;
  workspaceId: string;
  navigationPath: string;
  updatedAt: string;
}

export interface MentionReference {
  entityType: string;
  entityId: string;
  displayText: string;
  raw: string;
  position: number;
}

export interface MentionSearchResponse {
  results: MentionEntity[];
  hasMore: boolean;
}

export interface MentionNavigateResponse {
  path: string | null;
}
