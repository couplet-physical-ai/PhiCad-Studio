import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  _resetKeyCacheForTests,
  openCloudCredentials,
  sealCloudCredentials,
} from "./token-crypto";

const CREDS = {
  bearer: "eyJ.test.token",
  apiUrl: "http://localhost:3000",
  copilotUrl: "http://localhost:3001",
};

let tmp: string;
let prevDbPath: string | undefined;

beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), "token-crypto-"));
  prevDbPath = process.env.OPENPCB_DB_PATH;
  process.env.OPENPCB_DB_PATH = path.join(tmp, "data.sqlite");
  _resetKeyCacheForTests();
});

afterEach(() => {
  if (prevDbPath === undefined) delete process.env.OPENPCB_DB_PATH;
  else process.env.OPENPCB_DB_PATH = prevDbPath;
  _resetKeyCacheForTests();
  rmSync(tmp, { recursive: true, force: true });
});

describe("token-crypto", () => {
  test("seal/open round-trip", () => {
    const sealed = sealCloudCredentials(CREDS);
    expect(sealed).not.toContain(CREDS.bearer); // never plaintext
    expect(openCloudCredentials(sealed)).toEqual(CREDS);
  });

  test("distinct ciphertexts per call (fresh IV)", () => {
    expect(sealCloudCredentials(CREDS)).not.toBe(sealCloudCredentials(CREDS));
  });

  test("tampered ciphertext rejected (GCM auth)", () => {
    const sealed = sealCloudCredentials(CREDS);
    const raw = Buffer.from(sealed, "base64");
    raw[raw.length - 1] ^= 0xff;
    expect(() => openCloudCredentials(raw.toString("base64"))).toThrow();
  });

  test("truncated payload rejected", () => {
    expect(() => openCloudCredentials("AAAA")).toThrow(/truncated/);
  });

  test("key persists across cache resets (same dir)", () => {
    const sealed = sealCloudCredentials(CREDS);
    _resetKeyCacheForTests(); // simulates backend restart
    expect(openCloudCredentials(sealed)).toEqual(CREDS);
  });
});
