# storelint-mcp

MCP server that exposes the [StoreLint](https://storelint.embracetech.org) scanner (Google Play / App Store
readiness checks for Flutter, React Native and Expo apps) as a tool that AI agents pay for per call with
[x402](https://www.x402.org/) (USDC on Base).

- `POST /mcp`: MCP Streamable HTTP endpoint (stateless, JSON responses).
  - `storelint_checks` (free): the check catalogue.
  - `storelint_scan` ($0.05 per call): `{ zipBase64?: string, repoUrl?: string }` -> StoreLint Report JSON.
- `POST /x402/scan`: the same scan as a plain x402 HTTP resource for non-MCP buyers (Coinbase for
  Agents' `coinbase_x402_fetch`, `@x402/fetch`, curl). Body `{"repoUrl": "..."}` or `{"zipBase64": "..."}`,
  response is the Report JSON, same price and limits. Its 402 carries Bazaar discovery metadata so the
  CDP facilitator indexes it after the first settled payment. See `docs/COINBASE-AGENTS.md`.
- `GET /health`: `{ "ok": true }`.
- `GET /`: HTML page with the tool description, price and MCP URL.

Node 22, TypeScript, Hono, `@modelcontextprotocol/sdk`, `@x402/hono`. See `docs/RESEARCH.md` for why these
packages and this facilitator.

## Run

```sh
pnpm install
pnpm build
X402_PAY_TO=0xYourBaseAddress CDP_API_KEY_ID=... CDP_API_KEY_SECRET=... pnpm start
```

Without `X402_PAY_TO` the server runs in free mode (logged as a warning) so it stays useful during setup.

The scanner itself comes from the optional dependency `storelint` (`github:iddriss/storelint`). If it is not
installed, scans return a stub Report with one info finding `app.scanner-unavailable` ("scanner unavailable").

## Environment

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `3000` | Listen port. |
| `PUBLIC_URL` | request origin | Base URL printed on the landing page and used as the resource URL in 402 challenges (and therefore in the Bazaar index). Set it behind a reverse proxy, otherwise the internal `http://` URL is advertised. |
| `X402_PAY_TO` | unset (free mode) | EVM address that receives USDC. |
| `X402_PRICE` | `$0.05` | Price per `storelint_scan` call. |
| `X402_NETWORK` | `eip155:8453` | x402 v2 network id. Base mainnet = `eip155:8453`, Base Sepolia = `eip155:84532`. |
| `X402_FACILITATOR_URL` | `https://api.cdp.coinbase.com/platform/v2/x402` | Facilitator that verifies and settles payments. Coinbase CDP is the only public facilitator that settles on Base mainnet and it needs the two keys below. `https://x402.org/facilitator` works key-less but only for testnets. |
| `CDP_API_KEY_ID`, `CDP_API_KEY_SECRET` | unset | Coinbase Developer Platform API key for the CDP facilitator. Without them the 402 challenge is still issued but verify/settle will be rejected (401), i.e. nobody can complete a paid call. |
| `CLONE_TIMEOUT_MS` | `60000` | `git clone --depth 1` timeout. |
| `MAX_REPO_BYTES` | `209715200` | Max checkout size (200 MB). |
| `MAX_ZIP_BYTES` | `52428800` | Max decoded zip size (50 MB). |
| `MAX_EXTRACT_BYTES` | `209715200` | Max extracted size (200 MB). |

## How the payment gate works

Only `tools/call` requests for `storelint_scan` are gated; `initialize`, `tools/list` and `storelint_checks`
are free. The gate uses `@x402/hono`'s `paymentMiddleware` on `POST /mcp` and follows the x402 v2 flow:

1. The client POSTs the tool call without a `PAYMENT-SIGNATURE` header.
2. The server answers **HTTP 402** with a base64 JSON `PAYMENT-REQUIRED` header listing the accepted payment
   (`exact` scheme, `eip155:8453`, `amount: "50000"` = $0.05 USDC, `payTo`).
3. An x402-aware client (for example `@x402/fetch` wrapping the MCP transport's `fetch`) signs an EIP-3009
   USDC transfer authorization and retries with `PAYMENT-SIGNATURE`.
4. The server asks the facilitator to verify, runs the scan, asks the facilitator to settle on-chain, and returns the
   tool result with a `PAYMENT-RESPONSE` header.

Invalid input is checked before any payment is requested (argument shape, GitHub URL pattern, and a structural
inspection of the zip for traversal, symlinks and size) and answered as an ordinary MCP tool error (`isError`)
with no 402. Failures that can only surface after verification (for example a repository that cannot be cloned
within 60 s / 200 MB) are returned as tool errors but the verified payment is still settled.

### Example: the 402 challenge with curl

```sh
curl -i -s http://localhost:3000/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"storelint_scan","arguments":{"repoUrl":"https://github.com/flutter/samples"}}}'
```

```
HTTP/1.1 402 Payment Required
PAYMENT-REQUIRED: eyJ4NDAyVmVyc2lvbiI6MiwiZXJyb3IiOiJQYXltZW50IHJlcXVpcmVkIiwicmVzb3VyY2UiOnsidXJsIjoiaHR0cDovL2xvY2FsaG9zdDozMDAwL21jcCIsImRlc2NyaXB0aW9uIjoiU3RvcmVMaW50IHNjYW4gKE1DUCB0b29sIHN0b3JlbGludF9zY2FuKSIsIm1pbWVUeXBlIjoiYXBwbGljYXRpb24vanNvbiJ9LCJhY2NlcHRzIjpbeyJzY2hlbWUiOiJleGFjdCIsIm5ldHdvcmsiOiJlaXAxNTU6ODQ1MyIsImFtb3VudCI6IjUwMDAwIiwiYXNzZXQiOiIweDgzMzU4OWZDRDZlRGI2RTA4ZjRjN0MzMkQ0ZjcxYjU0YmRBMDI5MTMiLCJwYXlUbyI6IjB4WW91ckJhc2VBZGRyZXNzIiwibWF4VGltZW91dFNlY29uZHMiOjMwMCwiZXh0cmEiOnsibmFtZSI6IlVTRCBDb2luIiwidmVyc2lvbiI6IjIifX1dfQ==
Content-Type: application/json

{}
```

Decode the header (`base64 -d`) to see:

```json
{
  "x402Version": 2,
  "error": "Payment required",
  "resource": { "url": "http://localhost:3000/mcp", "description": "StoreLint scan (MCP tool storelint_scan)", "mimeType": "application/json" },
  "accepts": [{
    "scheme": "exact", "network": "eip155:8453", "amount": "50000",
    "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "payTo": "0xYourBaseAddress", "maxTimeoutSeconds": 300,
    "extra": { "name": "USD Coin", "version": "2" }
  }]
}
```

Free calls work with plain curl:

```sh
curl -s http://localhost:3000/mcp -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"storelint_checks","arguments":{}}}'
```

### Paying from an MCP client

```ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { wrapFetchWithPayment } from "@x402/fetch";
// build an x402Client with an EVM signer holding USDC on Base, per the @x402/fetch README
const transport = new StreamableHTTPClientTransport(new URL("https://<host>/mcp"), {
  fetch: wrapFetchWithPayment(fetch, x402Client),
});
```

### The plain HTTP endpoint

```sh
curl -s https://storelint-mcp.embracetech.org/x402/scan \
  -H 'content-type: application/json' \
  -d '{"repoUrl":"https://github.com/owner/repo"}'
```

Free mode returns the Report; paid mode returns the same 402 challenge as above plus
`extensions.bazaar` (method `POST`, `bodyType: "json"`, input and output JSON schemas with examples).
Bad input is answered `400 {"error": ...}` before any 402; an empty POST gets the challenge (that is
what the CDP validator sends). Input failures after verification (clone timeout, oversize checkout)
are `422`, which cancels settlement, so the caller is not charged for those on this route.

Discovery, Coinbase agent setup and an end-to-end paid test: `docs/COINBASE-AGENTS.md`.

## Get discovered (x402 Bazaar / Agentic.market)

Coinbase's CDP facilitator keeps a public catalogue of x402 resources, the [x402 Bazaar](https://docs.cdp.coinbase.com/x402/bazaar),
browsed by agents through the CDP discovery API and the Bazaar MCP server and by people at
[agentic.market](https://agentic.market). There is no registration form: a resource is indexed after the facilitator
**settles one payment** whose 402 challenge carried an `extensions.bazaar` block
([Get discovered](https://docs.cdp.coinbase.com/x402/seller/get-discovered)).

### What this server declares

Both paid routes carry Bazaar metadata, built with `declareDiscoveryExtension` from `@x402/extensions/bazaar`
(`src/discovery.ts`, wired into the `paymentMiddleware` route table in `src/payment.ts`):

| Route | Bazaar resource type | Declared |
| --- | --- | --- |
| `POST /mcp` | `mcp` (catalogued per `(resource.url, toolName)`) | `toolName: "storelint_scan"`, `transport: "streamable-http"`, `inputSchema` = the tool's `tools/call` arguments (`repoUrl` or `zipBase64`, `oneOf`), `example` arguments, `output` = Report JSON schema and example. |
| `POST /x402/scan` | `http` | `method: POST`, `bodyType: "json"`, body schema (`repoUrl` / `zipBase64`), example body, `output` = Report JSON schema and example. |

Shared resource metadata on both: a natural-language `description` under the facilitator's 500-character limit,
`mimeType: application/json`, `serviceName: StoreLint`, five `tags`, and `resource.url` pinned to `PUBLIC_URL`.
Free mode (no `X402_PAY_TO`) is unchanged: no 402, so nothing is advertised. The MCP gate is unchanged too: only
`tools/call` of `storelint_scan` with valid arguments gets the challenge.

Decoded `PAYMENT-REQUIRED` for `POST /mcp` in paid mode (schemas abridged):

```json
{
  "x402Version": 2,
  "resource": {
    "url": "https://storelint-mcp.embracetech.org/mcp",
    "description": "StoreLint MCP server (Streamable HTTP). Paid tool storelint_scan: checks a Flutter, React Native or Expo project for Google Play and App Store rejection risks (...) Arguments: exactly one of repoUrl (public GitHub repo) or zipBase64 (base64 zip, max 50 MB). tools/list and storelint_checks are free.",
    "mimeType": "application/json",
    "serviceName": "StoreLint",
    "tags": ["mobile", "app-store", "google-play", "flutter", "react-native"]
  },
  "accepts": [{ "scheme": "exact", "network": "eip155:8453", "amount": "50000", "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", "payTo": "0x...", "maxTimeoutSeconds": 300 }],
  "extensions": {
    "bazaar": {
      "info": {
        "input": {
          "type": "mcp",
          "toolName": "storelint_scan",
          "description": "StoreLint MCP server (...)",
          "transport": "streamable-http",
          "inputSchema": { "type": "object", "properties": { "repoUrl": { "type": "string" }, "zipBase64": { "type": "string" } }, "oneOf": [{ "required": ["repoUrl"] }, { "required": ["zipBase64"] }], "additionalProperties": false },
          "example": { "repoUrl": "https://github.com/acme/my_app" }
        },
        "output": { "type": "json", "example": { "schemaVersion": 1, "scannedAt": "...", "project": {}, "summary": {}, "findings": [] } }
      },
      "schema": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
          "input": { "type": "object", "properties": { "type": { "const": "mcp" }, "toolName": {}, "description": {}, "transport": { "enum": ["streamable-http"] }, "inputSchema": {}, "example": {} }, "required": ["type", "toolName", "inputSchema"], "additionalProperties": false },
          "output": { "type": "object", "properties": { "type": {}, "example": { "type": "object", "properties": { "schemaVersion": {}, "scannedAt": {}, "project": {}, "summary": {}, "findings": {} }, "required": ["schemaVersion", "scannedAt", "project", "summary", "findings"] } }, "required": ["type"] }
        },
        "required": ["input"]
      }
    }
  }
}
```

Startup prints `x402: Route "POST /mcp" has an invalid bazaar extension: /input: must NOT have additional properties`.
That is a warning-only quirk in `@x402/extensions@2.28.0`: its route validator injects a synthetic HTTP `method` into the
declaration before checking it, which an mcp-type schema (`additionalProperties: false`) rejects. The block actually
served is not enriched and passes the package's own `validateDiscoveryExtension` / `validateDiscoveryExtensionSpec`
(asserted in `test/payment.test.ts`).

### What the owner still has to do

1. Create a CDP Secret API key (`https://portal.cdp.coinbase.com/api-keys/secret`) and set `CDP_API_KEY_ID` /
   `CDP_API_KEY_SECRET`; without them the challenge is issued but verify/settle are rejected, so nothing is indexed.
2. Set `X402_PAY_TO` to the Base mainnet address that should receive USDC, and `PUBLIC_URL=https://storelint-mcp.embracetech.org`
   (the index uses `resource.url`; behind the proxy the request URL is the internal one). Leave the default CDP
   facilitator URL. Redeploy.
3. Preflight both resources with Coinbase's public validator (no key, read-only, no payment):

   ```sh
   node scripts/validate-listing.mjs            # /mcp and /x402/scan
   node scripts/validate-listing.mjs https://storelint-mcp.embracetech.org/x402/scan
   ```

   It prints `valid`, each `preflight` check (`returns_402`, `has_bazaar_extension`, `bazaar.info.input.method`, `parse`,
   ...), `simulation.outcome`, the served `bazaarExtension`, `index.quality` once listed, and whether the discovery
   search already lists the URL. The raw call is `POST https://api.cdp.coinbase.com/platform/v2/x402/validate` with
   `{"resource": "<https url>", "method": "POST"}`. Expect `/x402/scan` to pass once payments are on. `/mcp` will
   most likely not: the validator probes with an empty or example body, which is not a `tools/call`, so the MCP
   transport answers (not the 402), and its required checks include `bazaar.info.input.method`, which an mcp-type
   block does not have. The validator is read-only; indexing is triggered by the settled payment, not by it.
4. Make one real paid call through the CDP facilitator (an x402-aware client echoes `extensions.bazaar` in its
   payment payload; `@x402/fetch` and Coinbase's `coinbase_x402_fetch` do). Indexing follows within about 15 minutes;
   ranking recomputes every six hours; a resource with no settlement for 30 days is dropped.

Step-by-step owner notes, including the buyer-side test call, are in `docs/COINBASE-AGENTS.md`.

### Checking the listing and `l30DaysUniquePayers`

The discovery API is public. Search by host (or by `payTo`) and read `quality`:

```sh
curl -sG https://api.cdp.coinbase.com/platform/v2/x402/discovery/search \
  --data-urlencode 'urlSubstring=storelint-mcp.embracetech.org' \
| jq '.resources[] | {resource, type, serviceName, quality}'
```

```json
{
  "resource": "https://storelint-mcp.embracetech.org/mcp",
  "type": "mcp",
  "serviceName": "StoreLint",
  "quality": { "l30DaysTotalCalls": 3, "l30DaysUniquePayers": 2, "lastCalledAt": "2026-10-12T08:41:00Z" }
}
```

`quality.l30DaysUniquePayers` is the number of distinct paying wallets in the rolling 30-day window; `l30DaysTotalCalls`
and `lastCalledAt` sit next to it. The same fields come back under `index.quality` from the validate endpoint, and the
full catalogue is `GET https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources?type=mcp&limit=100&offset=0`
(use `type=http` for `/x402/scan`). An empty `resources` array means not indexed yet (no settled payment) or dropped
after 30 days without one.

## Tests

```sh
pnpm test
```

`node --test` covers: `/health` and the landing page, `storelint_checks` listing the spec's ids, `storelint_scan`
on a tiny in-memory fixture zip (plus traversal / symlink / bad URL rejection), `POST /x402/scan` in free and paid
mode, and the payment gate returning 402 when `X402_PAY_TO` is set (against a local mock facilitator, no network),
including the Bazaar discovery block on both routes (`mcp` type on `/mcp`, `http` on `/x402/scan`) validated with
`@x402/extensions`' own validators.

## Deploy (Coolify)

Dockerfile-based app: `node:22-slim`, git installed for `repoUrl` clones, runs as the non-root `node` user,
`EXPOSE 3000`, `HEALTHCHECK` on `/health`. Set the environment variables above in Coolify.
