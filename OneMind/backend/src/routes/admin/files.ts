import { file } from "bun";
import type { AppContext } from "../../context.ts";

export async function handleServeFile(_request: Request, ctx: AppContext, feedbackId: string, filename: string): Promise<Response> {
  const filePath = await ctx.fileStorage.getFilePath(feedbackId, filename);

  if (!filePath) {
    return new Response("File not found", { status: 404 });
  }

  const fileObj = file(filePath);
  return new Response(fileObj);
}
