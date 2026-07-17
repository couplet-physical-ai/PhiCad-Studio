import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * Content-addressed on-disk store for imported PDFs. Mirrors the footprint
 * model store (src/modules/library/backend/services/footprint-model-store.ts):
 * bytes live at <userDataRoot>/knowledge/pdf/<sha256>.pdf, the DB keeps only the
 * hash inside the page's content_json. Identical files dedupe automatically.
 */

const SHA256_HEX = /^[a-fA-F0-9]{64}$/;
const PDF_STORE_SUBDIR = "pdf";

/** Hard ceiling for a single imported PDF. */
export const PDF_SIZE_LIMIT_BYTES = 50 * 1024 * 1024;

export interface StoredPdfAsset {
  absolutePath: string;
  sha256: string;
  byteSize: number;
  deduped: boolean;
}

function resolveUserDataRoot(): string {
  const explicitDbPath = process.env.OPENPCB_DB_PATH;
  if (explicitDbPath && explicitDbPath.length > 0) {
    return path.dirname(path.resolve(explicitDbPath));
  }
  if (process.env.NODE_ENV === "development") {
    return path.resolve(process.cwd(), "dev-data");
  }
  return path.join(os.homedir(), ".openpcb");
}

function pdfRoot(): string {
  return path.resolve(resolveUserDataRoot(), "knowledge", PDF_STORE_SUBDIR);
}

function normalizeSha256(sha256: string): string {
  if (!SHA256_HEX.test(sha256)) {
    throw new Error("Expected a 64-character hex SHA-256 hash");
  }
  return sha256.toLowerCase();
}

function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Absolute path for a hash, guarded against traversal outside the store root. */
export function pdfAbsolutePath(sha256: string): string {
  const normalized = normalizeSha256(sha256);
  const root = pdfRoot();
  const absolutePath = path.resolve(root, `${normalized}.pdf`);
  if (!absolutePath.startsWith(`${root}${path.sep}`)) {
    throw new Error("PDF path must stay inside the PDF storage root");
  }
  return absolutePath;
}

async function readExistingHash(absolutePath: string): Promise<string | null> {
  try {
    return hashBytes(await readFile(absolutePath));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

/** Hash + write PDF bytes; returns the sha and whether an identical file existed. */
export async function writePdf(bytes: Uint8Array): Promise<StoredPdfAsset> {
  const sha256 = hashBytes(bytes);
  const absolutePath = pdfAbsolutePath(sha256);

  const existingHash = await readExistingHash(absolutePath);
  if (existingHash !== null) {
    if (existingHash !== sha256) {
      throw new Error(`Stored PDF hash mismatch at ${absolutePath}`);
    }
    return { absolutePath, sha256, byteSize: bytes.byteLength, deduped: true };
  }

  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, bytes, { flag: "wx" });
  return { absolutePath, sha256, byteSize: bytes.byteLength, deduped: false };
}

/** Read stored bytes back (used by tests); serve routes stream via the path. */
export async function readPdf(sha256: string): Promise<Uint8Array> {
  const bytes = await readFile(pdfAbsolutePath(sha256));
  if (hashBytes(bytes) !== normalizeSha256(sha256)) {
    throw new Error("Stored PDF hash mismatch");
  }
  return bytes;
}

export async function deletePdf(sha256: string): Promise<void> {
  await rm(pdfAbsolutePath(sha256), { force: true });
}
