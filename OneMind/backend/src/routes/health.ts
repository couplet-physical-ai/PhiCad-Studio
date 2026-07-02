import { CORS_HEADERS } from "../middleware/cors.ts";

export function handleHealth(): Response {
  return new Response(
    JSON.stringify({ status: "ok", timestamp: new Date().toISOString() }),
    {
      status: 200,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    }
  );
}

export function handleReady(): Response {
  return new Response(
    JSON.stringify({ status: "ready", timestamp: new Date().toISOString() }),
    {
      status: 200,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    }
  );
}
