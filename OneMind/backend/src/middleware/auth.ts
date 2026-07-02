import type { AppContext } from "../context.ts";

export function getSessionIdFromCookie(request: Request): string | null {
  const cookie = request.headers.get("cookie");
  if (!cookie) return null;
  const match = cookie.match(/session=([^;]+)/);
  return match?.[1] ?? null;
}

export function setSessionCookie(sessionId: string): string {
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toUTCString();
  return `session=${sessionId}; Path=/admin; HttpOnly; SameSite=Strict; Expires=${expires}`;
}

export function clearSessionCookie(): string {
  return `session=; Path=/admin; HttpOnly; SameSite=Strict; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

export async function isAuthenticated(request: Request, ctx: AppContext): Promise<boolean> {
  const sessionId = getSessionIdFromCookie(request);
  if (!sessionId) return false;
  return ctx.sessionService.validate(sessionId);
}

export function requireApiKey(request: Request, ctx: AppContext): boolean {
  if (!ctx.config.apiKey) return true; // no key configured = allow all
  const key = request.headers.get("X-API-Key");
  return key === ctx.config.apiKey;
}
