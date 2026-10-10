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

## 2026-10-10: discovery (Bazaar) and Coinbase for Agents

Checked on 2026-10-10 against the official CDP docs (read first, per the owner), the installed
`@x402/*@2.28.0` sources, and the x402 extension spec. No accounts, keys or payments were used; the
discovery endpoints below are documented as unauthenticated but were not called.

### How discovery works

- The index is the **x402 Bazaar**, run by the CDP facilitator. Public read APIs (no CDP key):
  `GET https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources?type=http|mcp&limit&offset`,
  `GET .../v2/x402/discovery/search?query&network&payTo&urlSubstring&maxUsdPrice&tags&curatedOnly&limit(<=20)`,
  a merchant listing by `payTo`, and an MCP server at `https://api.cdp.coinbase.com/platform/v2/x402/discovery/mcp`
  (tools `search_resources`, `proxy_tool_call`, `validate_endpoint`). Items carry `resource`, `type`
  (`http` or `mcp`), `x402Version`, `accepts[]`, `description`, `extensions.bazaar`, `serviceName`,
  `tags`, `quality` (30-day calls, unique payers, last call), `curated`.
- **Getting listed** (seller "Get discovered" page): no registration form, no portal step. The route's
  402 must carry `extensions.bazaar` (built with `declareDiscoveryExtension` from `@x402/extensions/bazaar`),
  verify/settle must go through the CDP facilitator, and the facilitator indexes the resource **after
  the first settled payment** whose payload echoes `extensions.bazaar` and `resource` (up to 15 min).
  Route descriptions over 500 characters make the facilitator reject verify/settle. Resources with no
  settlement for 30 days are removed; ranking is recomputed every 6 hours. Curation (what Coinbase
  calls "curated catalog") additionally needs mainnet payments, 99% 30-day availability, health
  probes and a passing validation. Shared tunnel domains are down-weighted.
- **Preflight without paying**: `POST https://api.cdp.coinbase.com/platform/v2/x402/validate`
  `{"resource": "<https url>", "method": "GET"|"POST"}` (no key) returns `valid`, `preflight[]`
  (`reachable`, `returns_402`, `has_bazaar_extension`, `parse`), `bazaarExtension`, `simulation.outcome`
  and `index`. Localhost, plain HTTP and endpoints behind an authenticating proxy are not indexed.
- The x402.org facilitator keeps its own catalogue, which is not the CDP Bazaar. `https://agentic.market`
  is Coinbase's public browser over the same Bazaar (the owner's "Agent.market"); no separate submission.
  No other index needs a submission for Coinbase agents.

### What the Coinbase MCP can pay for

- `https://agents.coinbase.com/mcp` (OAuth with a Coinbase account; Claude Code:
  `claude mcp add coinbase --transport http https://agents.coinbase.com/mcp`, then `/mcp` -> Authenticate).
- `coinbase_x402_resources`: "Discover curated x402 services", free; returns URLs, input schemas,
  advisory prices. `coinbase_x402_fetch(resource, input, max_amount)`: pays and fetches in one call,
  "accepts curated catalog resources and x402 v2 challenges", "not an unrestricted web-fetch tool".
  `coinbase_x402_pay`: authorizes and returns the `PAYMENT-SIGNATURE` (v2) / `X-PAYMENT` (v1) header only.
- USDC on Base only, **5 USDC cap per payment**, `max_amount` in atomic units can only lower the
  ceiling, settled payments are irreversible, UUID `idempotency_key` to reuse on timeouts.
- The buyer supplies a resource URL plus flat `input`; the tool builds the HTTP request from the
  resource's discovery schema. It does not wrap MCP JSON-RPC, so a Coinbase agent cannot call
  `tools/call` on `/mcp`. Hence `POST /x402/scan`: a plain x402 HTTP resource with the same input,
  limits, price and Report, declared as `bodyType: "json"` in its Bazaar block.
- The Bazaar's `mcp` resource type (spec: `info.input.type: "mcp"`, `toolName`, `inputSchema`, optional
  `transport` `streamable-http`|`sse`, catalogued by `(resource.url, toolName)`) describes a paid MCP tool
  regardless of whether the 402 travels as an HTTP status or as the MCP transport's `_meta["x402/payment"]`.
  Since 2026-10-10 `/mcp` declares it too (`mcpDiscoveryExtension()` in `src/discovery.ts`), so the tool
  can be listed as `type: mcp` once a payment settles. Open question (README, "Get discovered"): the CDP
  validate endpoint probes with an empty or example body and its required preflight checks include
  `bazaar.info.input.method` (seen 2026-10-10), so `/mcp` is expected to fail the validator while still
  being indexable through a settled payment that echoes the block.
- Library quirk (`@x402/extensions@2.28.0`): `validateBazaarRouteExtensions` runs `withSyntheticMethod`, which
  adds `method` to the mcp-type info before validating it against a schema with `additionalProperties: false`,
  so startup logs `x402: Route "POST /mcp" has an invalid bazaar extension: /input: must NOT have additional
  properties`. Warning only; `enrichDeclaration` returns mcp declarations unchanged and the served block passes
  `validateDiscoveryExtension` and `validateDiscoveryExtensionSpec`.
- Contradiction noted: `/x402/agentic-accounts/coinbase-for-agents` (and a search snippet of it)
  reads as if x402 in Coinbase for Agents were "coming soon" and points to Agentic Wallet, while the
  Coinbase MCP page documents the three tools as available. The MCP page is the more specific and is
  followed here; the Agentic Wallet remains the fallback buyer.

### Library facts (read from `@x402/hono@2.28.0`, `@x402/core@2.28.0`, `@x402/extensions@2.28.0`)

- `RouteConfig` fields: `accepts`, `resource`, `description`, `mimeType`, `serviceName`, `tags`,
  `iconUrl`, `customPaywallHtml`, `unpaidResponseBody`, `settlementFailedResponseBody`, `extensions`.
  There is no `discoverable` flag in v2 (that was the v1 `outputSchema`/`extra` convention); v2
  discoverability is the presence of `extensions.bazaar`.
- `paymentMiddleware` calls `checkIfBazaarNeeded(routes)`; when any route has `extensions.bazaar` it
  lazily imports `@x402/extensions/bazaar`, registers `bazaarResourceServerExtension` on the resource
  server and runs `validateBazaarRouteExtensions` (warnings only). `@x402/extensions` therefore has
  to be a direct dependency (added, 2.28.0; it was already a peer of `@coinbase/x402`).
- `declareDiscoveryExtension({ bodyType, input, inputSchema, output: { example, schema } })` for
  POST/PUT/PATCH puts `input` into `info.input.body` and `inputSchema` into
  `schema.properties.input.properties.body`; the method is filled in from the request by the server
  extension's `enrichDeclaration` at 402 time. The facilitator validates `info` against `schema` with
  Ajv (`strict: false`), so the example body must satisfy the input schema and the example report the
  output schema (tests assert both with the package's own `validateDiscoveryExtension`).
- The 402 `resource.url` is `routeConfig.resource || request URL` (`HonoAdapter.getUrl()` =
  `c.req.url`). Behind a reverse proxy that is the internal URL, so `resource` is set from `PUBLIC_URL`.
- Declared extensions are included in the 402 regardless of the facilitator's `/supported`
  `extensions` list, so the test mock facilitator needs no change.
- CDP Secret API key: `https://portal.cdp.coinbase.com/api-keys/secret` -> project drop-down ->
  "Secret API Keys" tab -> "Create API key" -> name, optional IP allowlist and permission restrictions,
  Ed25519 recommended -> Create. Key id is a UUID, secret is base64. No x402-specific onboarding or
  allowlisting is documented. Facilitator pricing confirmed: first 1,000 on-chain transactions per
  month free, $0.001 each after; verification free.

### Sources

- x402 welcome: https://docs.cdp.coinbase.com/x402/welcome
- Seller quickstart: https://docs.cdp.coinbase.com/x402/seller/quickstart
- CDP facilitator (auth, networks, pricing): https://docs.cdp.coinbase.com/x402/seller/facilitator
- Get discovered (Bazaar listing rules, validate curl, curation): https://docs.cdp.coinbase.com/x402/seller/get-discovered
- Production configuration: https://docs.cdp.coinbase.com/x402/seller/production-configuration
- Seller MCP payments (x402 MCP transport): https://docs.cdp.coinbase.com/x402/seller/mcp-payments
- Buyer discovery (SDK and REST): https://docs.cdp.coinbase.com/x402/buyer/discover-services
- Bazaar page: https://docs.cdp.coinbase.com/x402/bazaar
- Buyer MCP payments (Bazaar MCP server): https://docs.cdp.coinbase.com/x402/buyer/mcp-payments
- Buyer client configuration (spend limits): https://docs.cdp.coinbase.com/x402/buyer/client-configuration
- Troubleshooting (indexing requirements, 15 min, env var names): https://docs.cdp.coinbase.com/x402/support/troubleshooting
- Coinbase MCP (tools, caps, setup commands): https://docs.cdp.coinbase.com/ai-agents/coinbase-for-agents/coinbase-mcp
- Coinbase for Agents skill file (fetch scope, idempotency): https://docs.cdp.coinbase.com/coinbase-for-agents/skill.md
- Coinbase for Agents x402 overview: https://docs.cdp.coinbase.com/x402/agentic-accounts/coinbase-for-agents
- REST: list resources https://docs.cdp.coinbase.com/api-reference/v2/rest-api/x402-facilitator/list-x402-resources
- REST: search https://docs.cdp.coinbase.com/api-reference/v2/rest-api/x402-facilitator/search-x402-resources
- REST: validate https://docs.cdp.coinbase.com/api-reference/v2/rest-api/x402-facilitator/validate-x402-endpoint
- CDP API keys: https://docs.cdp.coinbase.com/get-started/authentication/cdp-api-keys
- Bazaar extension spec: https://github.com/x402-foundation/x402/blob/main/specs/extensions/bazaar.md
- `@x402/extensions` bazaar README: https://github.com/x402-foundation/x402/blob/main/typescript/packages/extensions/src/bazaar/README.md
- CDP SDK Express/Hono examples (no bazaar declaration in them): https://github.com/coinbase/cdp-sdk/tree/main/examples/typescript/x402/servers
- npm: https://www.npmjs.com/package/@x402/extensions (2.28.0, 2026-09-29)
