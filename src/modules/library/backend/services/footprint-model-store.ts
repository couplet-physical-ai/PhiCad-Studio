import { createHash, randomUUID } from "node:crypto";
import { link, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const SHA256_HEX = /^[a-fA-F0-9]{64}$/;

export type ModelAssetKind = "source" | "glb";

export interface StoredModelAsset {
  relativePath: string;
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

function normalizeSha256(sha256: string): string {
  if (!SHA256_HEX.test(sha256)) {
    throw new Error("Expected a 64-character hex SHA-256 hash");
  }
  return sha256.toLowerCase();
}

function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function assertHashMatches(bytes: Uint8Array, sha256: string): void {
  const actual = hashBytes(bytes);
  if (actual !== sha256) {
    throw new Error(`SHA-256 mismatch: expected ${sha256}, received ${actual}`);
  }
}

function getAssetPaths(kind: ModelAssetKind, sha256: string): {
  absolutePath: string;
  relativePath: string;
} {
  const normalized = normalizeSha256(sha256);
  const extension = kind === "source" ? "step" : "glb";
  const relativePath = path.posix.join(
    "models",
    kind,
    `${normalized}.${extension}`,
  );
  const absolutePath = path.resolve(resolveUserDataRoot(), relativePath);
  const modelRoot = path.resolve(resolveUserDataRoot(), "models");

  if (!absolutePath.startsWith(`${modelRoot}${path.sep}`)) {
    throw new Error("Model path must stay inside the model storage root");
  }

  return { absolutePath, relativePath };
}

export function modelAssetRelativePath(
  kind: ModelAssetKind,
  sha256: string,
): string {
  return getAssetPaths(kind, sha256).relativePath;
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

async function writeAsset(
  kind: ModelAssetKind,
  bytes: Uint8Array,
  sha256: string,
): Promise<StoredModelAsset> {
  const normalized = normalizeSha256(sha256);
  assertHashMatches(bytes, normalized);

  const { absolutePath, relativePath } = getAssetPaths(kind, normalized);
  const existingHash = await readExistingHash(absolutePath);
  if (existingHash !== null) {
    if (existingHash !== normalized) {
      throw new Error(`Stored model hash mismatch at ${relativePath}`);
    }
    return {
      absolutePath,
      relativePath,
      sha256: normalized,
      byteSize: bytes.byteLength,
      deduped: true,
    };
  }

  await mkdir(path.dirname(absolutePath), { recursive: true });
  // Publish atomically: write a private temp file, then hard-link it into place.
  // link() fails with EEXIST instead of overwriting, and the target only ever
  // appears complete, so two concurrent writes of the same content-addressed
  // asset (e.g. two footprints uploading an identical GLB at once) both
  // succeed: the loser re-verifies the winner's file and reports it deduped.
  const tempPath = `${absolutePath}.${randomUUID()}.tmp`;
  await writeFile(tempPath, bytes, { flag: "wx" });
  let deduped = false;
  try {
    await link(tempPath, absolutePath);
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) {
      throw error;
    }
    if ((await readExistingHash(absolutePath)) !== normalized) {
      throw new Error(`Stored model hash mismatch at ${relativePath}`);
    }
    deduped = true;
  } finally {
    await rm(tempPath, { force: true });
  }
  return {
    absolutePath,
    relativePath,
    sha256: normalized,
    byteSize: bytes.byteLength,
    deduped,
  };
}

async function readAsset(
  kind: ModelAssetKind,
  sha256: string,
): Promise<Uint8Array> {
  const normalized = normalizeSha256(sha256);
  const { absolutePath } = getAssetPaths(kind, normalized);
  const bytes = await readFile(absolutePath);
  assertHashMatches(bytes, normalized);
  return bytes;
}

export async function writeSourceStep(
  bytes: Uint8Array,
  sha256: string,
): Promise<StoredModelAsset> {
  return writeAsset("source", bytes, sha256);
}

export async function writeGlb(
  bytes: Uint8Array,
  sha256: string,
): Promise<StoredModelAsset> {
  return writeAsset("glb", bytes, sha256);
}

export async function readSourceStep(sha256: string): Promise<Uint8Array> {
  return readAsset("source", sha256);
}

export async function readGlb(sha256: string): Promise<Uint8Array> {
  return readAsset("glb", sha256);
}

export async function deleteModel(sha256: string): Promise<void> {
  const normalized = normalizeSha256(sha256);
  await Promise.all([
    rm(getAssetPaths("source", normalized).absolutePath, { force: true }),
    rm(getAssetPaths("glb", normalized).absolutePath, { force: true }),
  ]);
}

export async function dedupeCheck(sha256: string): Promise<boolean> {
  const normalized = normalizeSha256(sha256);
  const [sourceHash, glbHash] = await Promise.all([
    readExistingHash(getAssetPaths("source", normalized).absolutePath),
    readExistingHash(getAssetPaths("glb", normalized).absolutePath),
  ]);
  return sourceHash === normalized || glbHash === normalized;
}
