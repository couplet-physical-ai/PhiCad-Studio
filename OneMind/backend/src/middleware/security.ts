export const SECURITY_HEADERS: Record<string, string> = {
  "X-Frame-Options": "SAMEORIGIN",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

export const STATIC_CACHE_HEADERS: Record<string, string> = {
  "Cache-Control": "public, max-age=604800, immutable",
};
