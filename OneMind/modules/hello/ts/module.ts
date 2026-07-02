import { createModuleV2 } from "../../_kit/createModule";

/**
 * Hello Module - Test module for Phase 2
 * Demonstrates HTTP endpoints, WebSocket, EventBus, and Logger
 */
export const helloModule = createModuleV2("hello", {
    label: "Hello",
    namespace: "space.hello",
    version: "0.1.0",
    kind: "space",

    endpoints(ctx, http, ws) {
        // HTTP endpoint: GET /api/modules/hello/greet?name=World
        http.get("/greet", async ({ query }) => {
            const name = query.get("name") || "World";

            ctx.logger.info(`Greeting ${name}`);
            await ctx.events.emit("greeted", { name, timestamp: new Date().toISOString() });

            return new Response(
                JSON.stringify({
                    message: `Hello, ${name} from OneMind!`,
                    timestamp: new Date().toISOString(),
                }),
                {
                    headers: { "Content-Type": "application/json" },
                }
            );
        });

        // HTTP endpoint: GET /api/modules/hello/status
        http.get("/status", async () => {
            return new Response(
                JSON.stringify({
                    module: "hello",
                    status: "running",
                    timestamp: new Date().toISOString(),
                }),
                {
                    headers: { "Content-Type": "application/json" },
                }
            );
        });

        // WebSocket: Echo message
        ws.on("echo", async (msg, client) => {
            ctx.logger.info("Echo message received:", msg.payload);
            client.send({
                type: "echo",
                payload: msg.payload,
            });
        });

        // WebSocket: Subscribe to events
        ws.on("subscribe", async (msg, client) => {
            ctx.logger.info("Client subscribed to events");
            ctx.logger.info(msg);

            // Forward all "greeted" events to this client
            ctx.events.on("greeted", (data) => {
                client.send({
                    type: "event",
                    channel: "greeted",
                    payload: data,
                });
            });
        });

        // WebSocket: Ping/Pong
        ws.on("ping", async (msg, client) => {
            client.send({
                type: "pong",
                payload: { timestamp: new Date().toISOString(), message: msg.payload },
            });
        });
    },

    onActivate(ctx) {
        ctx.logger.info("Hello module activated");
        ctx.logger.info("Available endpoints:");
        ctx.logger.info("  - GET /api/modules/hello/greet?name=<name>");
        ctx.logger.info("  - GET /api/modules/hello/status");
        ctx.logger.info("  - WS /ws/modules/hello (echo, subscribe, ping)");
    },

    onDeactivate(ctx) {
        ctx.logger.info("Hello module deactivated");
    },
});

export default helloModule;
