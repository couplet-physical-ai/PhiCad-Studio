import {
  describe,
  expect,
  test,
  beforeAll,
  afterAll,
} from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  writePdf,
  readPdf,
  deletePdf,
  pdfAbsolutePath,
} from "../../../modules/knowledge/backend/services/pdf-store";

let tmpDir: string;
let prevDbPath: string | undefined;

beforeAll(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), "openpcb-pdf-store-"));
  prevDbPath = process.env.OPENPCB_DB_PATH;
  // pdf-store roots itself at dirname(OPENPCB_DB_PATH).
  process.env.OPENPCB_DB_PATH = path.join(tmpDir, "data.sqlite");
});

afterAll(async () => {
  if (prevDbPath === undefined) delete process.env.OPENPCB_DB_PATH;
  else process.env.OPENPCB_DB_PATH = prevDbPath;
  await rm(tmpDir, { recursive: true, force: true });
});

const bytes = new TextEncoder().encode("%PDF-1.4 fake pdf body");

describe("pdf-store", () => {
  test("writes, then dedups identical bytes to the same hash", async () => {
    const first = await writePdf(bytes);
    expect(first.deduped).toBe(false);
    expect(first.sha256).toMatch(/^[a-f0-9]{64}$/);

    const second = await writePdf(bytes);
    expect(second.deduped).toBe(true);
    expect(second.sha256).toBe(first.sha256);
  });

  test("round-trips bytes via readPdf", async () => {
    const { sha256 } = await writePdf(bytes);
    const read = await readPdf(sha256);
    expect(new TextDecoder().decode(read)).toBe(
      new TextDecoder().decode(bytes),
    );
  });

  test("keeps the stored path inside the store root", async () => {
    const { sha256 } = await writePdf(bytes);
    const abs = pdfAbsolutePath(sha256);
    expect(abs.startsWith(path.join(tmpDir, "knowledge", "pdf"))).toBe(true);
    expect(abs.endsWith(`${sha256}.pdf`)).toBe(true);
  });

  test("rejects non-hex hashes (path-traversal guard)", () => {
    expect(() => pdfAbsolutePath("../../etc/passwd")).toThrow();
    expect(() => pdfAbsolutePath("nothex")).toThrow();
  });

  test("deletePdf removes the file", async () => {
    const { sha256 } = await writePdf(bytes);
    await deletePdf(sha256);
    await expect(readPdf(sha256)).rejects.toThrow();
  });
});
