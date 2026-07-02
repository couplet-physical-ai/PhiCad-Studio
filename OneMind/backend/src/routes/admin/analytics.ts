import type { AppContext } from "../../context.ts";

function json(data: any, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function handleAnalyticsOverview(_request: Request, ctx: AppContext): Promise<Response> {
  const overview = await ctx.analyticsService.overview();
  return json({ success: true, ...overview });
}

export async function handleAnalyticsDaily(request: Request, ctx: AppContext): Promise<Response> {
  const url = new URL(request.url);
  const days = Math.min(90, Math.max(1, parseInt(url.searchParams.get("days") || "30", 10)));
  const daily = await ctx.analyticsService.dailyCounts(days);
  return json({ success: true, daily });
}

export async function handleAnalyticsTopEvents(request: Request, ctx: AppContext): Promise<Response> {
  const url = new URL(request.url);
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10)));
  const events = await ctx.analyticsService.topEvents(limit);
  return json({ success: true, events });
}

export async function handleAnalyticsVersions(_request: Request, ctx: AppContext): Promise<Response> {
  const versions = await ctx.analyticsService.versionDistribution();
  return json({ success: true, versions });
}

export async function handleAnalyticsPlatforms(_request: Request, ctx: AppContext): Promise<Response> {
  const platforms = await ctx.analyticsService.platformDistribution();
  return json({ success: true, platforms });
}

export async function handleAnalyticsErrors(request: Request, ctx: AppContext): Promise<Response> {
  const url = new URL(request.url);
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10)));
  const errors = await ctx.analyticsService.recentErrors(limit);
  return json({ success: true, errors });
}
