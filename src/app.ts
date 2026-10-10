import { Hono } from "hono";
import type { AppConfig } from "./config.js";
import { SCAN_HTTP_PATH } from "./discovery.js";
import { materializeInput, type ScanInput } from "./inputs.js";
import { landingPage } from "./landing.js";
import { handleMcpRequest } from "./mcp.js";
import { createPaymentGates, MCP_PATH } from "./payment.js";
import { runScan, type Report } from "./scanner.js";
import { scanRouteHandler } from "./scanRoute.js";

export interface AppOverrides {
  /** Replace the scanner (tests). Receives the materialized project directory. */
  scanDirectory?: (dir: string) => Promise<Report>;
}

export function priceLabel(cfg: AppConfig): string {
  return cfg.payTo ? `${cfg.price} USDC per call via x402 on ${cfg.network}` : "free";
}

export function createApp(cfg: AppConfig, overrides: AppOverrides = {}): Hono {
  const app = new Hono();
  const scanDirectory = overrides.scanDirectory ?? runScan;
  const limits = {
    maxZipBytes: cfg.maxZipBytes,
    maxExtractBytes: cfg.maxExtractBytes,
    maxRepoBytes: cfg.maxRepoBytes,
    cloneTimeoutMs: cfg.cloneTimeoutMs,
  };
  // base64 inflates by 4/3; leave room for the JSON-RPC envelope.
  const maxBodyBytes = Math.ceil(cfg.maxZipBytes * 1.4) + 1024 * 1024;

  const scan = async (input: ScanInput): Promise<Report> => {
    const { dir, cleanup } = await materializeInput(input, limits);
    try {
      return await scanDirectory(dir);
    } finally {
      await cleanup();
    }
  };

  const deps = { scan, priceLabel: priceLabel(cfg), maxBodyBytes };

  app.get("/health", (c) => c.json({ ok: true }));

  app.get("/", (c) => {
    const origin = cfg.publicUrl ?? new URL(c.req.url).origin;
    return c.html(
      landingPage({
        mcpUrl: `${origin}${MCP_PATH}`,
        scanHttpUrl: `${origin}${SCAN_HTTP_PATH}`,
        price: cfg.price,
        paymentsEnabled: Boolean(cfg.payTo),
        network: cfg.network,
        payTo: cfg.payTo,
      }),
    );
  });

  const gates = createPaymentGates(cfg, limits, maxBodyBytes);
  if (gates) {
    app.use(MCP_PATH, gates.mcp);
    app.use(SCAN_HTTP_PATH, gates.scan);
  }

  app.post(MCP_PATH, (c) => handleMcpRequest(c.req.raw, deps));

  app.on(["GET", "DELETE"], MCP_PATH, (c) =>
    c.json(
      { jsonrpc: "2.0", error: { code: -32000, message: "This server is stateless: use POST /mcp (Streamable HTTP, no sessions)." }, id: null },
      405,
    ),
  );

  app.post(SCAN_HTTP_PATH, scanRouteHandler({ scan, limits, maxBodyBytes }));

  app.get(SCAN_HTTP_PATH, (c) =>
    c.json(
      {
        error: `Use POST ${SCAN_HTTP_PATH} with a JSON body: {"repoUrl": "https://github.com/owner/repo"} or {"zipBase64": "..."}`,
        price: priceLabel(cfg),
        mcp: `${MCP_PATH} exposes the same scan as the MCP tool storelint_scan`,
      },
      405,
    ),
  );

  return app;
}
