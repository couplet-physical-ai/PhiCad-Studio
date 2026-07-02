#!/usr/bin/env bun
import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  watch,
  type FSWatcher,
} from "node:fs";
import path from "node:path";

const DEV_CORELIB_VERSION = "999.0.0-dev";
const DEV_CORELIB_CHANNEL = "nightly";
const DEBOUNCE_MS = 350;
const WATCH_ROOTS = [
  "components",
  "symbols",
  "footprints",
  "3d",
  "schemas",
  "tools",
] as const;

const repoRoot = path.resolve(import.meta.dir, "..");
const coreLibraryRoot = path.resolve(repoRoot, "..", "CoreLibrary");
const packScript = path.join(coreLibraryRoot, "tools", "pack.ts");
const distDir = path.join(coreLibraryRoot, "dist");
const finalPath = path.join(
  distDir,
  `openpcb-core-library-${DEV_CORELIB_VERSION}.opclib`,
);
const watchMode = process.argv.includes("--watch");

type Timer = ReturnType<typeof setTimeout> & { unref?: () => void };

function ensureCoreLibrary(): void {
  if (existsSync(packScript)) return;
  console.error(
    `[corelib:pack:dev] missing sibling CoreLibrary at ${coreLibraryRoot}`,
  );
  console.error(
    "[corelib:pack:dev] expected ../CoreLibrary/tools/pack.ts; clone CoreLibrary beside OpenPCB and run `bun install` there.",
  );
  process.exit(1);
}

function spawnPack(outDir: string): Promise<void> {
  const child = spawn(
    "bun",
    [
      "tools/pack.ts",
      `--version=${DEV_CORELIB_VERSION}`,
      `--channel=${DEV_CORELIB_CHANNEL}`,
      `--out=${outDir}`,
    ],
    { cwd: coreLibraryRoot, stdio: "inherit" },
  );
  return new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`pack failed with status ${code ?? "unknown"}`));
    });
  });
}

async function runPack(): Promise<void> {
  mkdirSync(distDir, { recursive: true });
  const tempDir = mkdtempSync(path.join(distDir, ".tmp-dev-pack-"));
  const tempPath = path.join(
    tempDir,
    `openpcb-core-library-${DEV_CORELIB_VERSION}.opclib`,
  );
  try {
    console.log(
      `[corelib:pack:dev] packing ${coreLibraryRoot} as ${DEV_CORELIB_VERSION}`,
    );
    await spawnPack(tempDir);
    renameSync(tempPath, finalPath);
    console.log(`[corelib:pack:dev] wrote ${finalPath}`);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function collectDirectories(root: string): string[] {
  if (!existsSync(root)) return [];
  const stats = statSync(root);
  if (!stats.isDirectory()) return [];
  const dirs = [root];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    dirs.push(...collectDirectories(path.join(root, entry.name)));
  }
  return dirs;
}

function watchDirectories(): FSWatcher[] {
  const dirs = WATCH_ROOTS.flatMap((name) =>
    collectDirectories(path.join(coreLibraryRoot, name)),
  );
  return dirs.map((dir) => watch(dir, { persistent: true }, schedulePack));
}

let timer: Timer | null = null;
let packing = false;
let queued = false;

function schedulePack(): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void runQueuedPack();
  }, DEBOUNCE_MS) as Timer;
  timer.unref?.();
}

async function runQueuedPack(): Promise<void> {
  if (packing) {
    queued = true;
    return;
  }
  packing = true;
  try {
    await runPack();
  } catch (error) {
    console.error(
      `[corelib:watch:dev] ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    packing = false;
    if (queued) {
      queued = false;
      schedulePack();
    }
  }
}

async function runWatch(): Promise<never> {
  await runPack();
  const watchers = watchDirectories();
  console.log(
    `[corelib:watch:dev] watching ${watchers.length} CoreLibrary directories`,
  );
  const shutdown = () => {
    for (const watcher of watchers) watcher.close();
    process.exit(0);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  return new Promise<never>(() => undefined);
}

ensureCoreLibrary();

if (watchMode) {
  await runWatch();
} else {
  await runPack();
}
