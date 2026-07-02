import type { AppContext } from "../../context.ts";
import type { FeedbackFilters, FeedbackStatus } from "../../types.ts";

function json(data: any, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function parseFilters(url: URL): FeedbackFilters {
  return {
    type: (url.searchParams.get("type") as any) || undefined,
    status: (url.searchParams.get("status") as any) || undefined,
    platform: url.searchParams.get("platform") || undefined,
    appVersion: url.searchParams.get("appVersion") || undefined,
    email: url.searchParams.get("email") || undefined,
    search: url.searchParams.get("search") || undefined,
    dateFrom: url.searchParams.get("dateFrom") || undefined,
    dateTo: url.searchParams.get("dateTo") || undefined,
    page: Math.max(1, parseInt(url.searchParams.get("page") || "1", 10)),
    perPage: Math.min(100, Math.max(1, parseInt(url.searchParams.get("perPage") || "20", 10))),
    sortBy: url.searchParams.get("sortBy") || "received_at",
    sortOrder: (url.searchParams.get("sortOrder") as "asc" | "desc") || "desc",
  };
}

export async function handleListFeedbacks(request: Request, ctx: AppContext): Promise<Response> {
  const url = new URL(request.url);
  const filters = parseFilters(url);
  const { feedbacks, total } = await ctx.feedbackService.list(filters);

  return json({
    success: true,
    feedbacks,
    total,
    page: filters.page,
    perPage: filters.perPage,
    totalPages: Math.ceil(total / filters.perPage),
  });
}

export async function handleGetFeedback(request: Request, ctx: AppContext, id: string): Promise<Response> {
  const feedback = await ctx.feedbackService.findById(id);
  if (!feedback) {
    return json({ success: false, message: "Feedback not found" }, 404);
  }
  return json({ success: true, feedback });
}

export async function handleUpdateFeedback(request: Request, ctx: AppContext, id: string): Promise<Response> {
  try {
    const body = (await request.json()) as { status?: FeedbackStatus; notes?: string };

    if (!body.status && body.notes === undefined) {
      return json({ success: false, message: "Nothing to update" }, 400);
    }

    const validStatuses: FeedbackStatus[] = ["new", "reviewed", "resolved", "archived"];
    if (body.status && !validStatuses.includes(body.status)) {
      return json({ success: false, message: "Invalid status" }, 400);
    }

    const updated = await ctx.feedbackService.updateStatus(
      id,
      body.status || "new",
      body.notes
    );

    if (!updated) {
      return json({ success: false, message: "Feedback not found" }, 404);
    }

    return json({ success: true });
  } catch {
    return json({ success: false, message: "Invalid request body" }, 400);
  }
}

export async function handleDeleteFeedback(_request: Request, ctx: AppContext, id: string): Promise<Response> {
  const deleted = await ctx.feedbackService.softDelete(id);
  if (!deleted) {
    return json({ success: false, message: "Feedback not found" }, 404);
  }
  return json({ success: true });
}

export async function handleBulkFeedbacks(request: Request, ctx: AppContext): Promise<Response> {
  try {
    const body = (await request.json()) as {
      action: "update_status" | "delete";
      ids: string[];
      status?: FeedbackStatus;
    };

    if (!Array.isArray(body.ids) || body.ids.length === 0) {
      return json({ success: false, message: "No IDs provided" }, 400);
    }

    if (body.action === "delete") {
      const count = await ctx.feedbackService.bulkDelete(body.ids);
      return json({ success: true, affected: count });
    }

    if (body.action === "update_status" && body.status) {
      const count = await ctx.feedbackService.bulkUpdateStatus(body.ids, body.status);
      return json({ success: true, affected: count });
    }

    return json({ success: false, message: "Invalid action" }, 400);
  } catch {
    return json({ success: false, message: "Invalid request body" }, 400);
  }
}

export async function handleExportFeedbacks(request: Request, ctx: AppContext): Promise<Response> {
  const url = new URL(request.url);
  const format = url.searchParams.get("format") || "json";
  const filters = parseFilters(url);

  const feedbacks = await ctx.feedbackService.exportAll(filters);

  if (format === "csv") {
    const headers = [
      "id", "email", "type", "status", "message", "timestamp", "app_version",
      "platform", "notes", "received_at", "reviewed_at",
    ];
    const csvRows = [headers.join(",")];

    for (const f of feedbacks) {
      const row = headers.map((h) => {
        const val = (f as any)[h];
        if (val === null || val === undefined) return "";
        const str = String(val).replace(/"/g, '""');
        return `"${str}"`;
      });
      csvRows.push(row.join(","));
    }

    return new Response(csvRows.join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="feedbacks-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  // JSON export
  return new Response(JSON.stringify(feedbacks, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="feedbacks-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}

export async function handleFilterOptions(_request: Request, ctx: AppContext): Promise<Response> {
  const options = await ctx.feedbackService.getFilterOptions();
  return json({ success: true, ...options });
}
