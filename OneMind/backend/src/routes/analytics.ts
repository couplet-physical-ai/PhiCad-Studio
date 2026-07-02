import { CORS_HEADERS } from "../middleware/cors.ts";
import { requireApiKey } from "../middleware/auth.ts";
import { checkRateLimit } from "../middleware/rate-limit.ts";
import type { AppContext } from "../context.ts";
import type { AnalyticsEventInput } from "../types.ts";

function getClientIP(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

function json(data: any, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function validateEvent(e: any): e is AnalyticsEventInput {
  return (
    typeof e === "object" &&
    typeof e.eventName === "string" &&
    typeof e.eventCategory === "string" &&
    typeof e.appVersion === "string" &&
    typeof e.platform === "string" &&
    typeof e.timestamp === "string"
  );
}

export async function handleIngestEvent(request: Request, ctx: AppContext): Promise<Response> {
  if (!requireApiKey(request, ctx)) {
    return json({ success: false, message: "Invalid API key" }, 401);
  }

  const ip = getClientIP(request);
  const rateLimit = checkRateLimit(ip);
  if (!rateLimit.allowed) {
    return json({ success: false, message: "Rate limit exceeded" }, 429);
  }

  try {
    const body = await request.json();
    if (!validateEvent(body)) {
      return json({ success: false, message: "Invalid event payload" }, 400);
    }

    const id = await ctx.analyticsService.ingest(body);
    return json({ success: true, id });
  } catch {
    return json({ success: false, message: "Invalid request body" }, 400);
  }
}

export async function handleIngestBatch(request: Request, ctx: AppContext): Promise<Response> {
  if (!requireApiKey(request, ctx)) {
    return json({ success: false, message: "Invalid API key" }, 401);
  }

  const ip = getClientIP(request);
  const rateLimit = checkRateLimit(ip);
  if (!rateLimit.allowed) {
    return json({ success: false, message: "Rate limit exceeded" }, 429);
  }

  try {
    const body = await request.json();
    if (!Array.isArray(body)) {
      return json({ success: false, message: "Expected array of events" }, 400);
    }

    const validEvents = body.filter(validateEvent);
    if (validEvents.length === 0) {
      return json({ success: false, message: "No valid events in batch" }, 400);
    }

    const count = await ctx.analyticsService.ingestBatch(validEvents);
    return json({ success: true, count, skipped: body.length - validEvents.length });
  } catch {
    return json({ success: false, message: "Invalid request body" }, 400);
  }
}
