import type { MiddlewareHandler } from "hono";
import { paymentMiddleware, x402ResourceServer, type Network } from "@x402/hono";
import { HTTPFacilitatorClient, type FacilitatorConfig, type RoutesConfig } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { createFacilitatorConfig } from "@coinbase/x402";
import { DEFAULT_FACILITATOR_URL, type AppConfig } from "./config.js";
import {
  mcpDiscoveryExtension,
  SCAN_HTTP_DESCRIPTION,
  SCAN_HTTP_PATH,
  SCAN_MCP_DESCRIPTION,
  scanDiscoveryExtension,
  SERVICE_NAME,
  SERVICE_TAGS,
} from "./discovery.js";
import { validateScanInput, type InputLimits } from "./inputs.js";
import { SCAN_TOOL } from "./mcp.js";
import { readScanBody } from "./scanRoute.js";

const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
export const MCP_PATH = "/mcp";

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
 * Route table handed to `@x402/hono`. Both paid routes share price, network, pay-to and service metadata.
 *
 * `resource` pins the URL advertised in the 402 (and indexed by the Bazaar) to PUBLIC_URL; without
 * it the middleware uses the request URL, which behind a reverse proxy is the internal http:// one.
 * Both routes declare Bazaar metadata: `/mcp` as the Bazaar "mcp" resource type (toolName + the
 * tool's arguments schema, catalogued per tool), `/x402/scan` as an "http" resource (POST, JSON body).
 */
export function buildRoutes(cfg: AppConfig): RoutesConfig {
  const accepts = [{ scheme: "exact", price: cfg.price, network: cfg.network as Network, payTo: cfg.payTo as string }];
  const publicResource = (path: string) => (cfg.publicUrl ? `${cfg.publicUrl}${path}` : undefined);
  const shared = { accepts, mimeType: "application/json", serviceName: SERVICE_NAME, tags: SERVICE_TAGS };
  return {
    [`POST ${MCP_PATH}`]: {
      ...shared,
      resource: publicResource(MCP_PATH),
      description: SCAN_MCP_DESCRIPTION,
      extensions: mcpDiscoveryExtension(),
    },
    [`POST ${SCAN_HTTP_PATH}`]: {
      ...shared,
      resource: publicResource(SCAN_HTTP_PATH),
      description: SCAN_HTTP_DESCRIPTION,
      extensions: scanDiscoveryExtension(),
    },
  };
}

export interface PaymentGates {
  /** For `POST /mcp`: charges only `tools/call` of `storelint_scan` with valid arguments. */
  mcp: MiddlewareHandler;
  /** For `POST /x402/scan`: charges valid bodies; answers bad input with 4xx before any 402. */
  scan: MiddlewareHandler;
}

/**
 * Builds the x402 payment gates for both paid routes. Returns null in free mode (no X402_PAY_TO).
 */
export function createPaymentGates(cfg: AppConfig, limits: InputLimits, maxBodyBytes: number): PaymentGates | null {
  if (!cfg.payTo) {
    console.warn(`[storelint-mcp] X402_PAY_TO is not set: running in FREE mode, ${SCAN_TOOL} and POST ${SCAN_HTTP_PATH} are not payment-gated.`);
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
  const x402 = paymentMiddleware(buildRoutes(cfg), resourceServer);

  console.log(
    `[storelint-mcp] x402 enabled: ${cfg.price} per ${SCAN_TOOL} call (POST ${MCP_PATH}, POST ${SCAN_HTTP_PATH}) on ${cfg.network}, payTo ${cfg.payTo}, facilitator ${cfg.facilitatorUrl}` +
      (cfg.publicUrl ? `, resource base ${cfg.publicUrl}` : ", PUBLIC_URL unset: 402 advertises the request URL"),
  );

  return {
    mcp: async (c, next) => {
      let body: unknown;
      try {
        body = await c.req.raw.clone().json();
      } catch {
        return next(); // not JSON: let the MCP transport produce the proper error
      }
      if (!(await isPaidToolCall(body, limits))) return next();
      return x402(c, next);
    },
    scan: async (c, next) => {
      const parsed = await readScanBody(c.req.raw.clone(), limits, maxBodyBytes);
      if (parsed.kind === "invalid") return c.json({ error: parsed.error }, parsed.status);
      // valid input, or an empty probe that only wants the challenge
      return x402(c, next);
    },
  };
}
