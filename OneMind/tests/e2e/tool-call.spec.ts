import { test, expect } from "@playwright/test";

const shouldRun =
  process.env.E2E_RUN === "1" && Boolean(process.env.E2E_BACKEND_URL);
const backendUrl = process.env.E2E_BACKEND_URL ?? "";

test.skip(!shouldRun, "E2E_RUN=1 and E2E_BACKEND_URL required");

test.beforeEach(async ({ page }) => {
  if (!backendUrl) return;

  await page.addInitScript(
    ({ backendUrl: initBackendUrl }) => {
      window.location.hash = "#chat-test";
      const parsedUrl = new URL(initBackendUrl);
      const port = Number(parsedUrl.port || "0");
      const startupPayload = {
        url: initBackendUrl,
        port,
        startupContractVersion: 1,
        startupLicenseState: "active",
        startupLicenseCode: "TOKEN_VALID",
      };
      const callbackStore = new Map<number, (event: { payload: typeof startupPayload; id: number }) => void>();
      let nextCallbackId = 1;
      const transformCallback = (cb: (event: { payload: typeof startupPayload; id: number }) => void) => {
        const callbackId = nextCallbackId++;
        callbackStore.set(callbackId, cb);
        return callbackId;
      };
      const invoke = async (cmd: string, args?: { [key: string]: unknown }) => {
        if (cmd === "plugin:event|listen") {
          const handlerId = (args as { handler?: number })?.handler;
          if (handlerId && (args as { event?: string })?.event === "backend-ready") {
            const handler = callbackStore.get(handlerId);
            if (handler) {
              setTimeout(() => {
                handler({ payload: startupPayload, id: handlerId });
              }, 0);
            }
          }
          return handlerId;
        }
        if (cmd === "bridge_invoke") {
          return { status: "ok", result: startupPayload };
        }
        return { status: "ok" };
      };
      const currentWindow = {
        isFullscreen: async () => false,
        onResized: async () => () => {},
      };

      const tauriShim = {
        invoke,
        transformCallback,
        event: {
          listen: async (
            eventName: string,
            handler: (event: { payload: typeof startupPayload }) => void,
          ) => {
            if (eventName === "backend-ready") {
              setTimeout(() => {
                handler({ payload: startupPayload });
              }, 0);
            }
            return () => {};
          },
        },
        window: {
          getCurrentWindow: () => currentWindow,
          currentWindow,
        },
      };
      const tauriInternals = {
        invoke,
        transformCallback,
        event: tauriShim.event,
        window: {
          currentWindow,
        },
        metadata: {
          currentWindow: {
            label: "main",
          },
        },
      };
      const typedWindow = window as typeof window & {
        __TAURI__?: typeof tauriShim;
        __TAURI_INTERNALS__?: typeof tauriInternals;
        __TAURI_EVENT_PLUGIN_INTERNALS__?: {
          unregisterListener: (event: string, eventId: number) => void;
        };
      };
      (window as typeof window & { __ONEMIND_E2E_BACKEND_URL__?: string }).__ONEMIND_E2E_BACKEND_URL__ =
        initBackendUrl;
      (window as typeof window & { __ONEMIND_E2E_BYPASS__?: boolean }).__ONEMIND_E2E_BYPASS__ = true;

      typedWindow.__TAURI__ = tauriShim;
      typedWindow.__TAURI_INTERNALS__ = tauriInternals;
      typedWindow.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
        unregisterListener: () => {},
      };
    },
    { backendUrl },
  );
});

// Learning: plugin event listeners rely on callback IDs, so the shim stores handlers before emitting backend-ready.

test("renders tool call/result blocks", async ({ page }) => {
  const toolCallId = "test-tool-call";
  const toolName = "mock-tool";

  await page.route("**/api/**", async (route) => {
    const { pathname } = new URL(route.request().url());
    if (!pathname.startsWith("/api/")) {
      return route.continue();
    }
    const json = (payload: unknown) =>
      route.fulfill({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

    switch (pathname) {
      case "/api/health":
        return json({ ok: true, data: { status: "ok" } });
      case "/api/stream/chat": {
        const events = [
          {
            event: "start",
            chatId: "test-chat",
            taskId: "test-task",
            messageId: "assistant-msg",
          },
          {
            event: "tool_call",
            toolCall: {
              id: toolCallId,
              name: toolName,
              args: { query: "Playwright" },
            },
          },
          {
            event: "tool_result",
            toolCallId,
            name: toolName,
            result: { answer: "Mock result" },
          },
          { event: "done" },
        ];

        const body = events
          .map((event) => `data: ${JSON.stringify(event)}\n\n`)
          .join("");

        return route.fulfill({
          status: 200,
          headers: {
            "content-type": "text/event-stream",
            "cache-control": "no-cache",
          },
          body,
        });
      }
      case "/api/providers":
        return json({
          ok: true,
          data: {
            providers: [
              {
                id: "openai",
                name: "OpenAI",
                requiresApiKey: true,
                available: true,
                status: {
                  available: true,
                  checkedAt: new Date().toISOString(),
                },
              },
            ],
          },
        });
      case "/api/providers/openai":
        return json({
          ok: true,
          data: {
            provider: {
              id: "openai",
              name: "OpenAI",
              requiresApiKey: true,
              available: true,
              status: {
                available: true,
                checkedAt: new Date().toISOString(),
              },
              models: [
                {
                  id: "gpt-4o",
                  providerId: "openai",
                  name: "GPT-4o",
                  description: "Mock model",
                  contextWindow: 128000,
                  capabilities: {
                    supportsVision: true,
                    supportsStreaming: true,
                    supportsReasoning: false,
                  },
                },
              ],
            },
          },
        });
      case "/api/workspaces":
        return json({
          ok: true,
          data: { workspaces: [{ id: "ws-1", name: "E2E", settings: {} }] },
        });
      case "/api/projects":
        return json({ ok: true, data: { projects: [] } });
      case "/api/chats/test":
        return json({
          ok: true,
          data: {
            chat: {
              id: "test",
              title: "E2E",
              config: { provider: "openai", model: "gpt-4o" },
              projectId: null,
              workspaceId: "ws-1",
            },
          },
        });
      case "/api/chats/test/messages":
        return json({ ok: true, data: { messages: [] } });
      case "/api/chats/test/active-task":
        return route.fulfill({ status: 204 });
      default:
        return route.continue();
    }
  });

  await page.goto("/#chat-test");

  await page.evaluate(() => {
    if (!window.location.hash.startsWith("#chat-")) {
      window.location.hash = "#chat-test";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    }
  });

  await page.waitForFunction(() => window.location.hash.startsWith("#chat-"));


  const promptInput = page.getByRole("textbox").first();
  await expect(promptInput).toBeVisible({ timeout: 15000 });

  await promptInput.fill("Trigger tool call and result blocks.");
  await promptInput.press("Enter");

  await expect(page.getByText(`Tool call: ${toolName}`)).toBeVisible({
    timeout: 60000,
  });
  await expect(page.getByText(`Tool result: ${toolName}`)).toBeVisible({
    timeout: 60000,
  });
});
