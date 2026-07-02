import { setSessionCookie, clearSessionCookie } from "../../middleware/auth.ts";
import type { AppContext } from "../../context.ts";

export async function handleAdminLogin(request: Request, ctx: AppContext): Promise<Response> {
  try {
    const body = (await request.json()) as { password?: string };

    if (body.password !== ctx.config.adminPassword) {
      return new Response(JSON.stringify({ success: false, message: "Invalid password" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const sessionId = await ctx.sessionService.create();

    return new Response(JSON.stringify({ success: true, message: "Login successful" }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": setSessionCookie(sessionId),
      },
    });
  } catch {
    return new Response(JSON.stringify({ success: false, message: "Invalid request" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function handleAdminLogout(): Promise<Response> {
  return new Response(JSON.stringify({ success: true, message: "Logout successful" }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": clearSessionCookie(),
    },
  });
}
