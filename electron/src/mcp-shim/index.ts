/**
 * `openpcb-mcp` — stdio ⇄ Streamable HTTP bridge.
 *
 * Claude Desktop (and any client that only speaks stdio) cannot reach the
 * Streamable HTTP endpoint the backend serves, so this process sits between
 * them. It is a dumb pipe at the transport level: whatever arrives on stdin is
 * forwarded to the HTTP transport and vice versa. Session semantics
 * (`Mcp-Session-Id`, resumption) are entirely the HTTP transport's business,
 * and stdio has none, so there is nothing to translate.
 *
 * The app must already be running — see `discoverPortfile`. There is no
 * headless fallback on purpose: two writers on one SQLite file is a worse
 * failure mode than a clear "start OpenPCB" message.
 */

import { StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { existsSync, readFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";

interface Portfile {
  version: number;
  url: string;
  port: number;
  token: string;
  pid: number;
  appVersion: string;
}

const SUPPORTED_PORTFILE_VERSION = 1;
const PORTFILE_NAME = "mcp.json";
const CLIENT_NAME = "openpcb-mcp-shim";

/** Electron's `app.getPath("userData")` locations, reproduced without Electron. */
function userDataDirs(): string[] {
  const home = homedir();
  const names = ["OpenPCB", "openpcb-electron"];
  switch (platform()) {
    case "darwin":
      return names.map((n) => join(home, "Library", "Application Support", n));
    case "win32": {
      const appData = process.env.APPDATA ?? join(home, "AppData", "Roaming");
      return names.map((n) => join(appData, n));
    }
    default: {
      const config = process.env.XDG_CONFIG_HOME ?? join(home, ".config");
      return names.map((n) => join(config, n));
    }
  }
}

/**
 * Candidate portfile paths, most likely first. The `dev` subdirectory is where
 * an unpackaged run puts its data (`backend-server.ts:getAppDataDir`), so a
 * developer running `npm run dev:electron` is found too.
 */
function candidatePaths(): string[] {
  const override = process.env.OPENPCB_MCP_PORTFILE;
  if (override) return [override];
  return userDataDirs().flatMap((dir) => [
    join(dir, PORTFILE_NAME),
    join(dir, "dev", PORTFILE_NAME),
  ]);
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means the process exists but belongs to another user — alive.
    // Only ESRCH ("no such process") proves it is gone.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

function fail(message: string): never {
  // stdout is the JSON-RPC channel — diagnostics must go to stderr or they
  // corrupt the protocol stream.
  process.stderr.write(`openpcb-mcp: ${message}\n`);
  process.exit(1);
}

function discoverPortfile(): Portfile {
  const checked: string[] = [];
  for (const path of candidatePaths()) {
    checked.push(path);
    if (!existsSync(path)) continue;
    let parsed: Portfile;
    try {
      parsed = JSON.parse(readFileSync(path, "utf8")) as Portfile;
    } catch {
      continue;
    }
    if (parsed.version !== SUPPORTED_PORTFILE_VERSION) {
      fail(
        `portfile at ${path} is version ${parsed.version}, this shim understands ${SUPPORTED_PORTFILE_VERSION}. Update OpenPCB or your MCP client config.`,
      );
    }
    // A file left by a crashed run points at a dead port; treating it as live
    // produces a confusing connection error instead of a useful one.
    if (!processAlive(parsed.pid)) continue;
    return parsed;
  }
  fail(
    `OpenPCB is not running (no live portfile found). Start OpenPCB, then retry.\nLooked in:\n  ${checked.join("\n  ")}`,
  );
}

async function main(): Promise<void> {
  const portfile = discoverPortfile();

  const http = new StreamableHTTPClientTransport(new URL(portfile.url), {
    requestInit: {
      headers: {
        authorization: `Bearer ${portfile.token}`,
        // Identifies this client to the server, which uses it to pick the
        // backing assistant chat. Must be stable across requests.
        "x-openpcb-mcp-client": process.env.OPENPCB_MCP_CLIENT ?? CLIENT_NAME,
      },
    },
  });
  const stdio = new StdioServerTransport();

  let closing = false;
  const shutdown = (code: number) => {
    if (closing) return;
    closing = true;
    void Promise.allSettled([http.close(), stdio.close()]).then(() => {
      process.exit(code);
    });
  };

  http.onmessage = (message) => {
    void stdio.send(message).catch((error: unknown) => {
      process.stderr.write(`openpcb-mcp: stdout write failed: ${String(error)}\n`);
      shutdown(1);
    });
  };
  stdio.onmessage = (message) => {
    void http.send(message).catch((error: unknown) => {
      process.stderr.write(`openpcb-mcp: forward failed: ${String(error)}\n`);
    });
  };

  // A closed app (or a client that went away) ends the bridge; neither half is
  // useful alone.
  http.onclose = () => shutdown(0);
  stdio.onclose = () => shutdown(0);
  http.onerror = (error) => {
    process.stderr.write(`openpcb-mcp: transport error: ${error.message}\n`);
  };
  stdio.onerror = (error) => {
    process.stderr.write(`openpcb-mcp: stdio error: ${error.message}\n`);
  };

  await http.start();
  await stdio.start();

  process.on("SIGINT", () => shutdown(0));
  process.on("SIGTERM", () => shutdown(0));
}

main().catch((error: unknown) => {
  fail(error instanceof Error ? error.message : String(error));
});
