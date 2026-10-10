import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { configFromEnv } from "./config.js";
import { loadScanner } from "./scanner.js";

const cfg = configFromEnv();
const app = createApp(cfg);

void loadScanner().then((scan) => {
  console.log(`[storelint-mcp] scanner: ${scan ? "storelint package loaded" : "STUB (storelint package not installed)"}`);
});

const server = serve({ fetch: app.fetch, port: cfg.port, hostname: "0.0.0.0" }, (info) => {
  console.log(`[storelint-mcp] listening on http://${info.address}:${info.port} (MCP endpoint: POST /mcp)`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    console.log(`[storelint-mcp] ${signal} received, shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
