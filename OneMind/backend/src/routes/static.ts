import { file } from "bun";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { SECURITY_HEADERS, STATIC_CACHE_HEADERS } from "../middleware/security.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = resolve(__dirname, "../../public");

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
};

function getExtension(path: string): string {
  const match = path.match(/(\.[^.]+)$/);
  return match?.[1] ?? "";
}

export function isStaticAsset(pathname: string): boolean {
  const ext = getExtension(pathname);
  return ext in MIME_TYPES && ext !== ".html";
}

export async function serveStaticFile(pathname: string): Promise<Response | null> {
  const safePath = pathname.replace(/\.\./g, "");
  const filePath = join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) return null;

  const bunFile = file(filePath);
  if (!(await bunFile.exists())) return null;

  const ext = getExtension(pathname);
  const contentType = MIME_TYPES[ext] || "application/octet-stream";
  const cacheHeaders = isStaticAsset(pathname) ? STATIC_CACHE_HEADERS : {};

  return new Response(bunFile, {
    headers: {
      "Content-Type": contentType,
      ...SECURITY_HEADERS,
      ...cacheHeaders,
    },
  });
}

export async function serveLandingPage(): Promise<Response> {
  const indexFile = file(join(PUBLIC_DIR, "index.html"));
  return new Response(indexFile, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      ...SECURITY_HEADERS,
    },
  });
}

export async function serveAdminPage(): Promise<Response> {
  const adminFile = file(join(PUBLIC_DIR, "admin/index.html"));
  if (!(await adminFile.exists())) {
    return new Response("Admin UI not found", { status: 404 });
  }
  return new Response(adminFile, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      ...SECURITY_HEADERS,
    },
  });
}
