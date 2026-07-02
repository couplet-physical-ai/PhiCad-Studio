/**
 * Feedback type enum - matches frontend expectations
 */
export type FeedbackType = "idea" | "bug" | "critique" | "other";

export type FeedbackStatus = "new" | "reviewed" | "resolved" | "archived";

/**
 * System context from frontend
 */
export interface SystemContext {
  activeWorkspaceId?: string;
  activeProjectId?: string;
  currentScreen?: string;
  windowSize: { width: number; height: number };
  screenResolution: { width: number; height: number };
  language: string;
  platform: string;
  onlineStatus: boolean;
}

/**
 * Feedback metadata stored on disk (legacy format, used for migration)
 */
export interface FeedbackMetadata {
  id: string;
  email?: string;
  type: FeedbackType;
  message: string;
  timestamp: string;
  appVersion: string;
  userAgent: string;
  systemContext?: SystemContext;
  files: {
    images: string[];
    frontendLogs?: string;
    backendLogs?: string;
  };
  receivedAt: string;
}

/**
 * API response shape
 */
export interface FeedbackResponse {
  success: boolean;
  id?: string;
  message?: string;
}

/**
 * Health check response
 */
export interface HealthResponse {
  status: "ok";
  timestamp: string;
}

/**
 * Paginated feedback list response
 */
export interface FeedbackListResponse {
  success: boolean;
  feedbacks: any[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

/**
 * Single feedback detail response
 */
export interface FeedbackDetailResponse {
  success: boolean;
  feedback: any;
}

/**
 * Analytics event input
 */
export interface AnalyticsEventInput {
  eventName: string;
  eventCategory: string;
  sessionId?: string;
  appVersion: string;
  platform: string;
  properties?: Record<string, any>;
  timestamp: string;
}

/**
 * Feedback filter params
 */
export interface FeedbackFilters {
  type?: FeedbackType;
  status?: FeedbackStatus;
  platform?: string;
  appVersion?: string;
  email?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  page: number;
  perPage: number;
  sortBy: string;
  sortOrder: "asc" | "desc";
}
