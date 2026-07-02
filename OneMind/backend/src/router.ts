import type { AppContext } from "./context.ts";
import { handleCorsPreflght, CORS_HEADERS } from "./middleware/cors.ts";
import { isAuthenticated, requireApiKey } from "./middleware/auth.ts";
import { checkRateLimit } from "./middleware/rate-limit.ts";
import { handleHealth, handleReady } from "./routes/health.ts";
import {
  serveLandingPage,
  serveStaticFile,
  serveAdminPage,
  isStaticAsset,
} from "./routes/static.ts";
import { handleFeedback } from "./routes/feedback.ts";
import { handleIngestEvent, handleIngestBatch } from "./routes/analytics.ts";
import { handleAdminLogin, handleAdminLogout } from "./routes/admin/auth.ts";
import {
  handleListFeedbacks,
  handleGetFeedback,
  handleUpdateFeedback,
  handleDeleteFeedback,
  handleBulkFeedbacks,
  handleExportFeedbacks,
  handleFilterOptions,
} from "./routes/admin/feedbacks.ts";
import {
  handleAnalyticsOverview,
  handleAnalyticsDaily,
  handleAnalyticsTopEvents,
  handleAnalyticsVersions,
  handleAnalyticsPlatforms,
  handleAnalyticsErrors,
} from "./routes/admin/analytics.ts";
import { handleServeFile } from "./routes/admin/files.ts";
import {
  handleConsumeMagicLink,
  handleIssueMagicLink,
} from "./routes/auth/magic-link.ts";
import {
  handleIssueEntitlement,
  handleRefreshEntitlement,
  handleRevokeEntitlement,
} from "./routes/license/entitlement.ts";
import { handleAlphaRegister } from "./routes/auth/alpha-register.ts";

function unauthorized(): Response {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

function getClientIp(request: Request): string {
  return (
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ??
    request.headers.get("X-Real-IP") ??
    "unknown"
  );
}

function rateLimitResponse(result: {
  remaining: number;
  resetAt: number;
}): Response {
  return new Response(
    JSON.stringify({
      success: false,
      error: { code: "RATE_LIMITED", message: "Too many requests" },
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "X-RateLimit-Remaining": String(result.remaining),
        "X-RateLimit-Reset": String(result.resetAt),
        ...CORS_HEADERS,
      },
    },
  );
}

function notFound(): Response {
  return new Response(JSON.stringify({ error: "Not found" }), {
    status: 404,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

async function adminGuard(
  request: Request,
  ctx: AppContext,
  handler: () => Promise<Response>,
): Promise<Response> {
  if (!(await isAuthenticated(request, ctx))) return unauthorized();
  return handler();
}

export async function handleRequest(
  request: Request,
  ctx: AppContext,
): Promise<Response> {
  const url = new URL(request.url);
  const method = request.method;
  const path = url.pathname;

  // CORS preflight
  const origin = request.headers.get("Origin");
  if (method === "OPTIONS") return handleCorsPreflght(origin);

  // Landing page
  if (path === "/" && method === "GET") return serveLandingPage();

  // Static assets
  if (method === "GET" && isStaticAsset(path)) {
    const resp = await serveStaticFile(path);
    if (resp) return resp;
  }

  // Health
  if (path === "/health" && method === "GET") return handleHealth();
  if (path === "/ready" && method === "GET") return handleReady();

  // Feedback (API key required)
  if (path === "/v1/feedback" && method === "POST") {
    if (!requireApiKey(request, ctx)) {
      return new Response(
        JSON.stringify({ success: false, message: "Invalid API key" }),
        {
          status: 401,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS },
        },
      );
    }
    return handleFeedback(request, ctx);
  }

  // Analytics ingestion (API key required)
  if (path === "/v1/events" && method === "POST")
    return handleIngestEvent(request, ctx);
  if (path === "/v1/events/batch" && method === "POST")
    return handleIngestBatch(request, ctx);

  // Alpha register (public, no API key)
  if (path === "/v1/auth/alpha-register" && method === "POST") {
    const ip = getClientIp(request);
    const rl = checkRateLimit(ip + ":alpha", 5, 60_000);
    if (!rl.allowed) return rateLimitResponse(rl);
    return handleAlphaRegister(request, ctx);
  }

  // Auth & License (API key required)
  if (
    (path.startsWith("/v1/auth/") || path.startsWith("/v1/license/")) &&
    !requireApiKey(request, ctx)
  ) {
    return new Response(
      JSON.stringify({ success: false, message: "Invalid API key" }),
      {
        status: 401,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      },
    );
  }
  if (path === "/v1/auth/magic-link/issue" && method === "POST") {
    const ip = getClientIp(request);
    const rl = checkRateLimit(ip + ":magic-issue", 5, 60_000);
    if (!rl.allowed) return rateLimitResponse(rl);
    return handleIssueMagicLink(request, ctx);
  }
  if (path === "/v1/auth/magic-link/consume" && method === "POST") {
    const ip = getClientIp(request);
    const rl = checkRateLimit(ip + ":magic-consume", 10, 60_000);
    if (!rl.allowed) return rateLimitResponse(rl);
    return handleConsumeMagicLink(request, ctx);
  }
  if (path === "/v1/license/entitlements/issue" && method === "POST") {
    const ip = getClientIp(request);
    const rl = checkRateLimit(ip + ":license", 20, 60_000);
    if (!rl.allowed) return rateLimitResponse(rl);
    return handleIssueEntitlement(request, ctx);
  }
  if (path === "/v1/license/entitlements/refresh" && method === "POST") {
    const ip = getClientIp(request);
    const rl = checkRateLimit(ip + ":license", 20, 60_000);
    if (!rl.allowed) return rateLimitResponse(rl);
    return handleRefreshEntitlement(request, ctx);
  }
  if (path === "/v1/license/entitlements/revoke" && method === "POST") {
    const ip = getClientIp(request);
    const rl = checkRateLimit(ip + ":license", 20, 60_000);
    if (!rl.allowed) return rateLimitResponse(rl);
    return handleRevokeEntitlement(request, ctx);
  }

  // Admin page
  if (path === "/admin" && method === "GET") return serveAdminPage();

  // Admin auth
  if (path === "/admin/login" && method === "POST")
    return handleAdminLogin(request, ctx);
  if (path === "/admin/logout" && method === "POST") return handleAdminLogout();

  // Admin API - feedbacks
  if (path === "/admin/api/feedbacks/export" && method === "GET") {
    return adminGuard(request, ctx, () => handleExportFeedbacks(request, ctx));
  }
  if (path === "/admin/api/feedbacks/bulk" && method === "POST") {
    return adminGuard(request, ctx, () => handleBulkFeedbacks(request, ctx));
  }
  if (path === "/admin/api/feedbacks/filters" && method === "GET") {
    return adminGuard(request, ctx, () => handleFilterOptions(request, ctx));
  }
  if (path === "/admin/api/feedbacks" && method === "GET") {
    return adminGuard(request, ctx, () => handleListFeedbacks(request, ctx));
  }

  // Admin API - single feedback CRUD
  const feedbackMatch = path.match(/^\/admin\/api\/feedbacks\/([^/]+)$/);
  if (feedbackMatch) {
    const id = feedbackMatch[1]!;
    if (method === "GET")
      return adminGuard(request, ctx, () =>
        handleGetFeedback(request, ctx, id),
      );
    if (method === "PATCH")
      return adminGuard(request, ctx, () =>
        handleUpdateFeedback(request, ctx, id),
      );
    if (method === "DELETE")
      return adminGuard(request, ctx, () =>
        handleDeleteFeedback(request, ctx, id),
      );
  }

  // Admin API - analytics
  if (path === "/admin/api/analytics/overview" && method === "GET") {
    return adminGuard(request, ctx, () =>
      handleAnalyticsOverview(request, ctx),
    );
  }
  if (path === "/admin/api/analytics/daily" && method === "GET") {
    return adminGuard(request, ctx, () => handleAnalyticsDaily(request, ctx));
  }
  if (path === "/admin/api/analytics/events" && method === "GET") {
    return adminGuard(request, ctx, () =>
      handleAnalyticsTopEvents(request, ctx),
    );
  }
  if (path === "/admin/api/analytics/versions" && method === "GET") {
    return adminGuard(request, ctx, () =>
      handleAnalyticsVersions(request, ctx),
    );
  }
  if (path === "/admin/api/analytics/platforms" && method === "GET") {
    return adminGuard(request, ctx, () =>
      handleAnalyticsPlatforms(request, ctx),
    );
  }
  if (path === "/admin/api/analytics/errors" && method === "GET") {
    return adminGuard(request, ctx, () => handleAnalyticsErrors(request, ctx));
  }

  // Admin file serving
  const fileMatch = path.match(/^\/admin\/files\/([^/]+)\/(.+)$/);
  if (fileMatch && method === "GET") {
    const [, feedbackId, filename] = fileMatch;
    return adminGuard(request, ctx, () =>
      handleServeFile(request, ctx, feedbackId!, filename!),
    );
  }

  return notFound();
}
