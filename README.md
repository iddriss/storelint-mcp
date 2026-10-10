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

## Tests

```sh
pnpm test
```

`node --test` covers: `/health` and the landing page, `storelint_checks` listing the spec's ids, `storelint_scan`
on a tiny in-memory fixture zip (plus traversal / symlink / bad URL rejection), the payment gate returning
402 when `X402_PAY_TO` is set (against a local mock facilitator, no network), and `POST /x402/scan` in both
modes including the Bazaar block in its 402 (validated with `@x402/extensions`' own validators).

## Deploy (Coolify)

Dockerfile-based app: `node:22-slim`, git installed for `repoUrl` clones, runs as the non-root `node` user,
`EXPOSE 3000`, `HEALTHCHECK` on `/health`. Set the environment variables above in Coolify.
