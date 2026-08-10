import os from "node:os";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { app, ipcMain, shell } from "electron";
import { getCrashDumpsDir } from "./crash.js";
import { getBackendPayload, getMcpPortfilePath } from "./backend-server.js";
import { ensureMcpToken } from "./mcp-portfile.js";

/**
 * Absolute path to the bundled stdio shim launcher, or null when running
 * unpackaged (where it lives in electron/dist and is not laid out as it will
 * be in the app bundle).
 */
function getMcpShimPath(): string | null {
  if (!app.isPackaged) return null;
  return join(
    process.resourcesPath,
    "mcp",
    process.platform === "win32" ? "openpcb-mcp.cmd" : "openpcb-mcp",
  );
}

let registered = false;

export function registerDiagnosticsIpc(): void {
  if (registered) return;
  registered = true;

  ipcMain.handle("diagnostics:open-logs", async () => {
    const dir = app.getPath("logs");
    const err = await shell.openPath(dir);
    return { dir, error: err || null };
  });

  ipcMain.handle("diagnostics:open-crash-dumps", async () => {
    const dir = getCrashDumpsDir();
    const err = await shell.openPath(dir);
    return { dir, error: err || null };
  });

  ipcMain.handle("diagnostics:open-user-data", async () => {
    const dir = app.getPath("userData");
    const err = await shell.openPath(dir);
    return { dir, error: err || null };
  });

  ipcMain.handle("diagnostics:paths", () => ({
    logs: app.getPath("logs"),
    crashDumps: getCrashDumpsDir(),
    userData: app.getPath("userData"),
    appVersion: app.getVersion(),
  }));

  // Everything the Settings panel needs to render a copy-pasteable MCP client
  // config. The shim path is resolved here because only main knows whether the
  // app is packaged and where its resources landed.
  ipcMain.handle("mcp:config", () => {
    const shimPath = getMcpShimPath();
    return {
      shimPath,
      shimAvailable: shimPath !== null && existsSync(shimPath),
      portfilePath: getMcpPortfilePath(),
      url: getBackendPayload()
        ? `${getBackendPayload()?.url}/api/modules/assistant/mcp`
        : null,
      token: ensureMcpToken(),
    };
  });

  ipcMain.handle("app:get-versions", () => ({
    app: app.getVersion(),
    electron: process.versions.electron,
    chromium: process.versions.chrome,
    node: process.versions.node,
    v8: process.versions.v8,
    platform: process.platform,
    arch: process.arch,
    osRelease: os.release(),
  }));
}
