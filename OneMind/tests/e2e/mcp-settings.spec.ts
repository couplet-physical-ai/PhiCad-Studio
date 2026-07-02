import { test, expect } from "@playwright/test";

const shouldRun = process.env.E2E_RUN === "1" && Boolean(process.env.E2E_BACKEND_URL);
const backendUrl = process.env.E2E_BACKEND_URL ?? "";

const isBun = typeof process.versions.bun !== "undefined";

if (!isBun || shouldRun) {
  test.describe("MCP Settings E2E", () => {
    test.skip(!shouldRun, "E2E_RUN=1 and E2E_BACKEND_URL required");

    test.beforeEach(async ({ page }) => {
      if (!backendUrl) return;

      await page.addInitScript(
        ({ backendUrl: initBackendUrl }) => {
          window.location.hash = "#chat-test";
          const parsedUrl = new URL(initBackendUrl);
          const port = Number(parsedUrl.port || "0");
          
          const invoke = async (cmd: string, args?: any) => {
            if (cmd === "plugin:event|listen") return 1;
            if (cmd === "bridge_invoke") return { status: "ok", result: { url: initBackendUrl, port } };
            return { status: "ok" };
          };

          const tauriShim = {
            invoke,
            event: { listen: async () => () => {} },
            window: { getCurrentWindow: () => ({ isFullscreen: async () => false }) },
          };

          (window as any).__TAURI__ = tauriShim;
          (window as any).__TAURI_INTERNALS__ = tauriShim;
          (window as any).__ONEMIND_E2E_BACKEND_URL__ = initBackendUrl;
          (window as any).__ONEMIND_E2E_BYPASS__ = true;
        },
        { backendUrl },
      );
    });

    test("MCP Settings Panel: CRUD and Connect", async ({ page }) => {
      let servers: any[] = [];

      await page.route("**/api/**", async (route) => {
        const url = new URL(route.request().url());
        const method = route.request().method();
        
        const json = (data: any, status = 200) => 
          route.fulfill({ status, body: JSON.stringify(data), headers: { "content-type": "application/json" } });

        if (url.pathname === "/api/mcp/servers") {
          if (method === "GET") {
            return json({ ok: true, data: { servers } });
          }
          if (method === "POST") {
            const body = route.request().postDataJSON();
            const newServer = { 
               id: "server-" + Date.now(), 
               ...body, 
               status: "disconnected", 
               toolCount: 0,
               resourceCount: 0,
               promptCount: 0,
               createdAt: new Date().toISOString(),
               updatedAt: new Date().toISOString()
            };
            servers.push(newServer);
            return json({ ok: true, data: { server: newServer } }, 201);
          }
        }
        
        if (url.pathname.match(/\/api\/mcp\/servers\/[^/]+$/)) {
            const id = url.pathname.split("/").pop();
            if (method === "DELETE") {
                servers = servers.filter(s => s.id !== id);
                return json({ ok: true, data: { deleted: true } });
            }
        }
        
        if (url.pathname.endsWith("/connect")) {
             const id = url.pathname.split("/")[4];
             const server = servers.find(s => s.id === id);
             if (server) {
                 server.status = "connected";
                 server.toolCount = 5;
                 return json({ ok: true, data: { connected: true, toolCount: 5 } });
             }
             return json({ ok: false, error: { message: "Not found" } }, 404);
        }
        
        if (url.pathname.endsWith("/disconnect")) {
             const id = url.pathname.split("/")[4];
             const server = servers.find(s => s.id === id);
             if (server) {
                 server.status = "disconnected";
                 return json({ ok: true, data: { disconnected: true } });
             }
             return json({ ok: false, error: { message: "Not found" } }, 404);
        }

        if (url.pathname.startsWith("/api/health")) return json({ ok: true, data: { status: "ok" } });
        return json({ ok: true, data: {} });
      });

      await page.goto("/");

      await page.getByLabel("Open settings").click();
      
      await page.getByRole("tab", { name: "MCP Servers" }).click();

      await expect(page.getByText("No MCP servers configured")).toBeVisible();

      await page.getByRole("button", { name: "Add Server" }).click();
      
      await page.getByLabel("Alias (ID)").fill("test-server");
      await page.getByLabel("Display Name").fill("Test Server");
      await page.getByLabel("Command").fill("node");
      await page.getByLabel("Arguments").fill("index.js");
      
      await page.getByRole("button", { name: "Save" }).click();
      
      await expect(page.getByText("Test Server")).toBeVisible();
      await expect(page.getByText("Disconnected")).toBeVisible();
      
      await page.getByRole("button", { name: "Connect" }).click();
      
      await expect(page.getByText("Connected")).toBeVisible();
      await expect(page.getByText("Tools:")).toBeVisible();
      await expect(page.getByText("5")).toBeVisible();

      await page.getByRole("button", { name: "Disconnect" }).click();
      await expect(page.getByText("Disconnected")).toBeVisible();

      page.on('dialog', dialog => dialog.accept());
      await page.getByRole("button", { name: "Delete" }).click();
      
      await expect(page.getByText("No MCP servers configured")).toBeVisible();
    });
  });
}
