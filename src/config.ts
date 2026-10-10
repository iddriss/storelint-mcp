/** Coinbase CDP facilitator (x402 v2). The only public facilitator that settles on Base mainnet; needs CDP API keys. */
export const DEFAULT_FACILITATOR_URL = "https://api.cdp.coinbase.com/platform/v2/x402";
/** Base mainnet, CAIP-2 form used by x402 v2 ("base" was the v1 name). */
export const DEFAULT_NETWORK = "eip155:8453";
export const DEFAULT_PRICE = "$0.05";

export interface AppConfig {
  port: number;
  /** Public base URL used on the landing page; falls back to the request origin. */
  publicUrl?: string;
  /** EVM address that receives USDC. Unset = free mode. */
  payTo?: string;
  /** Price per storelint_scan call, e.g. "$0.05". */
  price: string;
  /** x402 v2 network id, e.g. "eip155:8453". */
  network: string;
  facilitatorUrl: string;
  cdpApiKeyId?: string;
  cdpApiKeySecret?: string;
  cloneTimeoutMs: number;
  maxRepoBytes: number;
  maxZipBytes: number;
  maxExtractBytes: number;
}

function positiveInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function optional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    port: positiveInt(env.PORT, 3000),
    publicUrl: optional(env.PUBLIC_URL)?.replace(/\/+$/, ""),
    payTo: optional(env.X402_PAY_TO),
    price: optional(env.X402_PRICE) ?? DEFAULT_PRICE,
    network: optional(env.X402_NETWORK) ?? DEFAULT_NETWORK,
    facilitatorUrl: (optional(env.X402_FACILITATOR_URL) ?? DEFAULT_FACILITATOR_URL).replace(/\/+$/, ""),
    cdpApiKeyId: optional(env.CDP_API_KEY_ID),
    cdpApiKeySecret: optional(env.CDP_API_KEY_SECRET),
    cloneTimeoutMs: positiveInt(env.CLONE_TIMEOUT_MS, 60_000),
    maxRepoBytes: positiveInt(env.MAX_REPO_BYTES, 200 * 1024 * 1024),
    maxZipBytes: positiveInt(env.MAX_ZIP_BYTES, 50 * 1024 * 1024),
    maxExtractBytes: positiveInt(env.MAX_EXTRACT_BYTES, 200 * 1024 * 1024),
  };
}
