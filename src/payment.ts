import type { MiddlewareHandler } from "hono";
import { paymentMiddleware, x402ResourceServer, type Network } from "@x402/hono";
import { HTTPFacilitatorClient, type FacilitatorConfig, type RoutesConfig } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { createFacilitatorConfig } from "@coinbase/x402";
import { DEFAULT_FACILITATOR_URL, type AppConfig } from "./config.js";
import { validateScanInput, type InputLimits } from "./inputs.js";
import { SCAN_TOOL } from "./mcp.js";

const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/**
 * True when a JSON-RPC body (single message or batch) contains a `tools/call` for the paid tool
 * whose arguments pass pre-payment validation (shape, URL, zip structure). Anything else falls
 * through unpaid and the tool answers with an ordinary MCP tool error.
 */
export async function isPaidToolCall(body: unknown, limits: InputLimits): Promise<boolean> {
  const messages = Array.isArray(body) ? body : [body];
  for (const msg of messages) {
    if (typeof msg !== "object" || msg === null) continue;
    const { method, params } = msg as { method?: unknown; params?: { name?: unknown; arguments?: unknown } };
    if (method !== "tools/call" || params?.name !== SCAN_TOOL) continue;
    if ((await validateScanInput(params.arguments ?? {}, limits)) === null) return true;
  }
  return false;
}

/**
 * Facilitator selection:
 *  - default URL (Coinbase CDP) + CDP keys  -> authenticated CDP client (`@coinbase/x402`)
 *  - default URL without keys               -> unauthenticated (402 challenges still work; verify/settle will 401)
 *  - any other URL                          -> plain HTTPFacilitatorClient (x402.org testnet facilitator, self-hosted, mock)
 */
export function buildFacilitatorConfig(cfg: AppConfig): FacilitatorConfig {
  if (cfg.facilitatorUrl === DEFAULT_FACILITATOR_URL) {
    if (cfg.cdpApiKeyId && cfg.cdpApiKeySecret) {
      return createFacilitatorConfig(cfg.cdpApiKeyId, cfg.cdpApiKeySecret);
    }
    console.warn(
      "[storelint-mcp] X402_FACILITATOR_URL is the Coinbase CDP facilitator but CDP_API_KEY_ID / CDP_API_KEY_SECRET are not set; payment verification and settlement will be rejected (401).",
    );
  }
  return { url: cfg.facilitatorUrl };
}

/**
 * Returns Hono middleware that applies the x402 payment requirement to `POST <routePath>`
 * only when the JSON-RPC body is a `tools/call` of `storelint_scan`. Returns null in free mode.
 */
export function createPaymentGate(cfg: AppConfig, limits: InputLimits, routePath = "/mcp"): MiddlewareHandler | null {
  if (!cfg.payTo) {
    console.warn(`[storelint-mcp] X402_PAY_TO is not set: running in FREE mode, ${SCAN_TOOL} is not payment-gated.`);
    return null;
  }
  if (!EVM_ADDRESS_RE.test(cfg.payTo)) {
    throw new Error("X402_PAY_TO must be a 0x-prefixed 20-byte EVM address");
  }
  if (!cfg.network.startsWith("eip155:")) {
    throw new Error(`X402_NETWORK must be an EVM CAIP-2 id like eip155:8453, got ${cfg.network}`);
  }

  const facilitator = new HTTPFacilitatorClient(buildFacilitatorConfig(cfg));
  const resourceServer = new x402ResourceServer(facilitator).register(cfg.network as Network, new ExactEvmScheme());
  const routes: RoutesConfig = {
    [`POST ${routePath}`]: {
      accepts: [{ scheme: "exact", price: cfg.price, network: cfg.network as Network, payTo: cfg.payTo }],
      description: `StoreLint scan (MCP tool ${SCAN_TOOL})`,
      mimeType: "application/json",
    },
  };
  const x402 = paymentMiddleware(routes, resourceServer);

  console.log(
    `[storelint-mcp] x402 enabled: ${cfg.price} per ${SCAN_TOOL} call on ${cfg.network}, payTo ${cfg.payTo}, facilitator ${cfg.facilitatorUrl}`,
  );

  return async (c, next) => {
    let body: unknown;
    try {
      body = await c.req.raw.clone().json();
    } catch {
      return next(); // not JSON: let the MCP transport produce the proper error
    }
    if (!(await isPaidToolCall(body, limits))) return next();
    return x402(c, next);
  };
}
