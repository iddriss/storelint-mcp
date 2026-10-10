# Research notes (October 2026)

What was checked before choosing the stack, with sources. Live checks were done on 2026-10-10
with `npm view` and read-only `GET /supported` calls (no funds, no accounts).

## x402 server library for Node + Hono

| Package | Version / last publish | Verdict |
| --- | --- | --- |
| `@x402/hono` + `@x402/core` + `@x402/evm` | 2.28.0, 2026-09-29 | **Chosen.** Official x402 v2 packages (x402 Foundation / Coinbase repo). Plain Hono middleware, runs on Node 22 on any VPS. |
| `x402-hono` / `x402` | 1.2.0, 2026-04-16 | Legacy v1 API (`paymentMiddleware(payTo, routes, facilitator)`, network names like `"base"`). Not updated since April; superseded by `@x402/*` v2. |
| `@coinbase/x402` | 2.1.0, 2025-12-23 | Not a middleware: only the CDP facilitator auth helper (`createFacilitatorConfig`, `createCdpAuthHeaders`). Used here for CDP authentication. |
| Cloudflare Agents SDK `paidTool` / `withX402` | - | Designed for `McpAgent` on Cloudflare Workers (Durable Objects); not a fit for a Hono app on a VPS. |
| "Vercel x402-mcp" | - | No official npm package by that name was found; the names in circulation (`x402node-mcp`, `@civic/x402-mcp`, `cipher-x402-mcp`) are third-party and mostly client-side. |

Sources:
- Coinbase seller quickstart (lists `@x402/hono`, `@x402/core`, `@x402/evm`, Node 22+): https://docs.cdp.coinbase.com/x402/quickstart-for-sellers
- `@x402/hono` README (API used verbatim: `HTTPFacilitatorClient`, `x402ResourceServer().register(network, new ExactEvmScheme())`, `paymentMiddleware(routes, server)`): https://www.npmjs.com/package/@x402/hono
- Hono example in the x402 repo: https://github.com/x402-foundation/x402/tree/main/examples/typescript/servers/hono
- Cloudflare paid MCP tools (for comparison): https://developers.cloudflare.com/agents/x402/charge-for-mcp-tools/
- Third-party MCP wrappers (not used): https://glama.ai/mcp/servers/x402node/x402-mcp

How the middleware behaves (read from `@x402/hono@2.28.0` source):
- On creation it syncs `GET {facilitator}/supported` (`syncFacilitatorOnStart`, default true). If that fails,
  protected requests get a 502 "facilitator" error, not a 402.
- Without a `PAYMENT-SIGNATURE` (or legacy `X-PAYMENT`) header it returns HTTP 402 with a base64 JSON
  `PAYMENT-REQUIRED` header (`x402Version: 2`, `accepts[]` with `amount` in token base units, `asset`, `payTo`).
- With a header it calls facilitator `/verify` before the handler and `/settle` after; a handler response with status >= 400 cancels settlement.
- `$0.05` on `eip155:8453` resolves to `amount: "50000"` of USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (verified locally against a mock facilitator).

## Facilitator for Base mainnet

| Facilitator | URL | Base mainnet (`eip155:8453`)? | Keys? |
| --- | --- | --- | --- |
| Coinbase CDP | `https://api.cdp.coinbase.com/platform/v2/x402` | Yes (exact, upto, batch-settlement) | **Yes**: CDP API key id + secret (JWT). `GET /supported` without auth answers 401. |
| x402.org (Coinbase-run, signup-free) | `https://x402.org/facilitator` | No: testnets only (`eip155:84532` Base Sepolia, Solana devnet, ...) | No |
| x402.rs (third party) | `https://facilitator.x402.rs` | Not any more as of 2026-10-10 (`/supported` lists Sepolia, Polygon Amoy, Monad, etc., but no `eip155:8453`) | No |

So the default here is the CDP facilitator with `CDP_API_KEY_ID` / `CDP_API_KEY_SECRET`; `X402_FACILITATOR_URL` can
point at x402.org (with `X402_NETWORK=eip155:84532`) for a free testnet dry run.

CDP pricing per the docs: verification free; first 1,000 on-chain settlements per month free, then $0.001 each.

Sources:
- CDP facilitator (auth, networks, pricing): https://docs.cdp.coinbase.com/x402/seller/facilitator
- Network support table: https://docs.cdp.coinbase.com/x402/network-support
- Production configuration (`createCdpFacilitatorClient`, `eip155:8453`): https://docs.cdp.coinbase.com/x402/seller/production-configuration
- `@coinbase/x402` README (env vars `CDP_API_KEY_ID`, `CDP_API_KEY_SECRET`; verify/settle need auth): https://www.npmjs.com/package/@coinbase/x402
- x402 FAQ (no facilitator fee): https://docs.cdp.coinbase.com/x402/support/faq

## Network naming

x402 v2 uses CAIP-2 ids: Base mainnet = `eip155:8453`, Base Sepolia = `eip155:84532`. `"base"` / `"base-sepolia"`
are the v1 names (still present in `@x402/evm` as a chain-id lookup table, but the v2 server API takes CAIP-2).

## MCP Streamable HTTP

- `@modelcontextprotocol/sdk` 1.32.1 (2026-10-05) ships `WebStandardStreamableHTTPServerTransport`
  (`server/webStandardStreamableHttp.js`), which takes a Fetch `Request` and returns a `Response`, so it plugs
  straight into Hono: `app.all('/mcp', c => transport.handleRequest(c.req.raw))`. Stateless mode =
  `sessionIdGenerator: undefined`; `enableJsonResponse: true` returns plain JSON instead of SSE.
  Default `maxRequestBodySize` is 4 MiB (raised here to fit 50 MB base64 zips).
- Stateless servers create a new server + transport per request to avoid request-id collisions; GET/DELETE
  (notification stream, session close) are answered 405.
- The SDK's `registerTool` accepts zod v3.25+ or v4 shapes; `structuredContent` is validated against
  `outputSchema` when one is declared.

Sources:
- SDK v2 example index (Hono + stateless examples): https://ts.sdk.modelcontextprotocol.io/v2/documents/examples_server_README.html
- Sessions, state and scaling: https://ts.sdk.modelcontextprotocol.io/v2/serving/sessions-state-scaling.html
- Stateless-server write-up for the 2026 spec: https://www.rabinarayanpatra.com/blogs/build-stateless-mcp-server-2026-07-28-spec
- npm: https://www.npmjs.com/package/@modelcontextprotocol/sdk

## Design decision: gate the tool, not the endpoint

`paymentMiddleware` is route based (`"POST /mcp"`). Gating the whole route would also charge for
`initialize`, `tools/list` and the free `storelint_checks` tool. The gate here clones the request, parses the JSON-RPC
body and only invokes the x402 middleware when it is a `tools/call` of `storelint_scan` with syntactically valid
arguments. The 402 is therefore a real HTTP-level x402 challenge (what `@x402/fetch` or any x402 client expects),
and MCP clients pay by wrapping the transport's `fetch`.
