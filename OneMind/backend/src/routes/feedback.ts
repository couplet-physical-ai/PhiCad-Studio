import { CORS_HEADERS } from "../middleware/cors.ts";
import { parseSystemContext } from "../services/file-storage.ts";
import type { AppContext } from "../context.ts";
import type { FeedbackType } from "../types.ts";

const VALID_TYPES: FeedbackType[] = ["idea", "bug", "critique", "other"];

function validateFeedbackFields(formData: globalThis.FormData): { valid: boolean; error?: string; missing?: string[] } {
  const required = ["type", "message", "timestamp", "appVersion", "userAgent", "systemContext"];
  const missing: string[] = [];

  for (const field of required) {
    const value = formData.get(field);
    if (!value || (typeof value === "string" && value.trim() === "")) {
      missing.push(field);
    }
  }

  if (missing.length > 0) {
    return { valid: false, error: `Missing required fields: ${missing.join(", ")}`, missing };
  }

  const type = formData.get("type") as string;
  if (!VALID_TYPES.includes(type as FeedbackType)) {
    return { valid: false, error: `Invalid type. Must be one of: ${VALID_TYPES.join(", ")}` };
  }

  return { valid: true };
}

export async function handleFeedback(request: Request, ctx: AppContext): Promise<Response> {
  try {
    const formData = (await request.formData()) as globalThis.FormData;

    const validation = validateFeedbackFields(formData);
    if (!validation.valid) {
      return new Response(
        JSON.stringify({ success: false, message: validation.error }),
        { status: 400, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
      );
    }

    // Save files first (need feedback ID)
    const systemContextJson = formData.get("systemContext") as string;
    const systemContext = parseSystemContext(systemContextJson);
    const platform = systemContext?.platform ?? null;

    // Create DB record
    const id = await ctx.feedbackService.create({
      email: (formData.get("email") as string) || null,
      type: formData.get("type") as string,
      message: formData.get("message") as string,
      timestamp: formData.get("timestamp") as string,
      app_version: formData.get("appVersion") as string,
      user_agent: formData.get("userAgent") as string,
      system_context: systemContextJson || null,
      platform,
      received_at: new Date().toISOString(),
      files: null, // set after saving files
      notes: null,
      reviewed_at: null,
      deleted_at: null,
    });

    // Save attachment files
    const fileInfo = await ctx.fileStorage.saveFeedbackFiles(id, formData);

    // Update files column
    await ctx.db
      .updateTable("feedback")
      .set({ files: JSON.stringify(fileInfo) })
      .where("id", "=", id)
      .execute();

    return new Response(
      JSON.stringify({ success: true, id, message: "Feedback received successfully" }),
      { status: 200, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
    );
  } catch (error) {
    console.error("Error processing feedback:", error);
    return new Response(
      JSON.stringify({ success: false, message: "Internal server error processing feedback" }),
      { status: 500, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
    );
  }
}
