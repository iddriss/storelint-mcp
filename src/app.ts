import { Hono } from "hono";
import type { AppConfig } from "./config.js";
import { materializeInput, type ScanInput } from "./inputs.js";
import { landingPage } from "./landing.js";
import { handleMcpRequest } from "./mcp.js";
import { createPaymentGate } from "./payment.js";
import { runScan, type Report } from "./scanner.js";

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

  const scan = async (input: ScanInput): Promise<Report> => {
    const { dir, cleanup } = await materializeInput(input, limits);
    try {
      return await scanDirectory(dir);
    } finally {
      await cleanup();
    }
  };

  const deps = {
    scan,
    priceLabel: priceLabel(cfg),
    // base64 inflates by 4/3; leave room for the JSON-RPC envelope.
    maxBodyBytes: Math.ceil(cfg.maxZipBytes * 1.4) + 1024 * 1024,
  };

  app.get("/health", (c) => c.json({ ok: true }));

  app.get("/", (c) => {
    const origin = cfg.publicUrl ?? new URL(c.req.url).origin;
    return c.html(
      landingPage({
        mcpUrl: `${origin}/mcp`,
        priceLabel: `${cfg.price} USDC`,
        paymentsEnabled: Boolean(cfg.payTo),
        network: cfg.network,
        payTo: cfg.payTo,
      }),
    );
  });

  const gate = createPaymentGate(cfg, limits, "/mcp");
  if (gate) app.use("/mcp", gate);

  app.post("/mcp", (c) => handleMcpRequest(c.req.raw, deps));

  app.on(["GET", "DELETE"], "/mcp", (c) =>
    c.json(
      { jsonrpc: "2.0", error: { code: -32000, message: "This server is stateless: use POST /mcp (Streamable HTTP, no sessions)." }, id: null },
      405,
    ),
  );

  return app;
}
