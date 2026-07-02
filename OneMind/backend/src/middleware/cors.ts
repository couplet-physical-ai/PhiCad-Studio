const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "tauri://localhost",
  "https://tauri.localhost",
];

function resolveAllowedOrigins(): Set<string> {
  const raw = process.env.ONEMIND_BACKEND_ALLOWED_ORIGINS;
  if (!raw || raw.trim().length === 0) {
    return new Set(DEFAULT_ALLOWED_ORIGINS);
  }

  const parsed = raw
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  return new Set(parsed.length > 0 ? parsed : DEFAULT_ALLOWED_ORIGINS);
}

const ALLOWED_ORIGINS = resolveAllowedOrigins();

const CORS_BASE_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-API-Key",
  Vary: "Origin",
};

export const CORS_HEADERS: Record<string, string> = CORS_BASE_HEADERS;

function buildCorsHeaders(origin: string | null): Record<string, string> {
  if (!origin || !ALLOWED_ORIGINS.has(origin)) {
    return CORS_BASE_HEADERS;
  }

  return {
    ...CORS_BASE_HEADERS,
    "Access-Control-Allow-Origin": origin,
  };
}

export function handleCorsPreflght(origin?: string | null): Response {
  return new Response(null, { status: 204, headers: buildCorsHeaders(origin ?? null) });
}

export function withCorsHeaders(response: Response, origin: string | null): Response {
  const headers = new Headers(response.headers);
  const corsHeaders = buildCorsHeaders(origin);
  for (const [key, value] of Object.entries(corsHeaders)) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
