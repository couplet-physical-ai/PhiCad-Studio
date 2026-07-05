// Cloud credential encryption for the assistant.cloud-chat task payload (S6).
//
// The renderer sends x-cloud-bearer / x-cloud-api-url / x-cloud-copilot-url per
// request; the executor runs detached from the request, so the credentials must
// ride the task payload — which lands in SQLite. They are AES-256-GCM encrypted
// with a key generated on first use next to the app database.
//
// Threat-model honesty: the key sits on the same disk as the ciphertext, so
// this protects against casual reads of the DB file (backups, log bundles,
// support dumps), NOT against a compromised host. Accepted because GoTrue
// bearers expire in ~1h and BYO provider API keys already live in this SQLite
// in plaintext — this is strictly stronger than the existing practice.

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export interface CloudCredentials {
  bearer: string;
  apiUrl: string;
  copilotUrl: string;
}

const ALGO = "aes-256-gcm";
const KEY_FILE = "cloud-creds.key";

// Mirrors core/backend/db/sqlite-client.ts resolveDbPath() so the key lives
// beside the database it protects (modules must not import core internals).
function dataDir(): string {
  const explicit = process.env.OPENPCB_DB_PATH;
  if (explicit && explicit.length > 0) return path.dirname(explicit);
  if (process.env.NODE_ENV === "development") {
    return path.resolve(process.cwd(), "dev-data");
  }
  return path.join(os.homedir(), ".openpcb");
}

let cachedKey: Buffer | null = null;

function loadKey(): Buffer {
  if (cachedKey) return cachedKey;
  const dir = dataDir();
  const file = path.join(dir, KEY_FILE);
  if (existsSync(file)) {
    cachedKey = Buffer.from(readFileSync(file, "utf8").trim(), "base64");
    if (cachedKey.length !== 32) {
      throw new Error("cloud-creds key file corrupt — delete it to regenerate");
    }
    return cachedKey;
  }
  mkdirSync(dir, { recursive: true });
  const key = randomBytes(32);
  writeFileSync(file, key.toString("base64"), { mode: 0o600 });
  chmodSync(file, 0o600);
  cachedKey = key;
  return key;
}

/** Encrypt credentials for the task payload. Format: base64(iv|tag|ciphertext). */
export function sealCloudCredentials(creds: CloudCredentials): string {
  const key = loadKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([
    cipher.update(JSON.stringify(creds), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

/** Decrypt payload credentials. Throws on tamper/corrupt/foreign-key data. */
export function openCloudCredentials(sealed: string): CloudCredentials {
  const key = loadKey();
  const raw = Buffer.from(sealed, "base64");
  if (raw.length < 12 + 16 + 2) throw new Error("sealed credentials truncated");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ct = raw.subarray(28);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ct), decipher.final()]);
  const creds = JSON.parse(plain.toString("utf8")) as CloudCredentials;
  if (!creds.bearer || !creds.copilotUrl) {
    throw new Error("sealed credentials missing fields");
  }
  return creds;
}

/** Test seam: reset the cached key (and optionally point at a temp dir). */
export function _resetKeyCacheForTests(): void {
  cachedKey = null;
}
