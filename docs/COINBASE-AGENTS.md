# Coinbase agents: setup, listing, and a paid test call

How to make `https://storelint-mcp.embracetech.org` payable and discoverable for agents that pay
through Coinbase's "Coinbase for Agents" MCP (`https://agents.coinbase.com/mcp`, tools
`coinbase_x402_resources`, `coinbase_x402_fetch`, `coinbase_x402_pay`), and how to check it worked.

Written 2026-10-10 against the official CDP docs (links in `docs/RESEARCH.md`, section
"2026-10-10: discovery (Bazaar) and Coinbase for Agents"). Anything the docs did not state outright
is marked **VERIFY:**. Nothing here was executed with real keys, wallets or funds.

## What the server exposes

| Route | Who it is for | Payment |
| --- | --- | --- |
| `POST /mcp` | MCP clients (Claude Code, Cursor, `@x402/fetch`-wrapped transports). Tool `storelint_scan`. | x402, $0.05 USDC on Base, only for `tools/call` of `storelint_scan`. |
| `POST /x402/scan` | Plain-HTTP x402 buyers: Coinbase for Agents (`coinbase_x402_fetch`), `@x402/fetch`, curl. Body `{"repoUrl": "..."}` or `{"zipBase64": "..."}`; response is the Report JSON. | Same x402 gate, same price. Its 402 carries Bazaar discovery metadata (`extensions.bazaar`: method, JSON body schema, output schema and example). |

Why the HTTP route exists: `coinbase_x402_fetch` takes a resource URL plus flat `input` and performs
the HTTP request itself from the resource's discovery schema. It does not speak MCP JSON-RPC, so the
MCP endpoint alone is not something a Coinbase agent can pay for. `/mcp` is unchanged.

## (a) Owner setup

### 1. Create the CDP Secret API key (facilitator credentials)

1. Sign in at `https://portal.cdp.coinbase.com` (create the free CDP account / project if you have
   none; **VERIFY:** the first-run project-creation screen, the docs only describe the key page).
2. Open `https://portal.cdp.coinbase.com/api-keys/secret`.
3. Select the project in the top drop-down, open the **Secret API Keys** tab, click **Create API key**.
4. Name it (for example `storelint-mcp-facilitator`). Optional settings on that form:
   - **IP allowlist**: leave empty unless you know the Coolify host's egress IP; a wrong allowlist
     makes every verify/settle fail with 403.
   - **Permission restrictions**: leave the default (**VERIFY:** the docs list no x402-specific
     permission; the facilitator page says only that it "authenticates with your CDP API key ID and secret").
   - **Signature algorithm**: Ed25519 (recommended by the docs; `@coinbase/x402` signs its JWTs with it).
5. Click **Create**. Copy the **API key ID** (a UUID) and the **API key secret** (a base64 string)
   now; the secret is shown once.

There is no separate "enable x402" switch, no allowlisting of your domain, and no registration form
for the Bazaar: the facilitator page lists no onboarding step beyond the key, and the discovery page
says "There is no registration form or separate API call."

Cost: the first 1,000 on-chain facilitator transactions per month are free, then $0.001 each;
verification is always free (facilitator page, confirmed 2026-10-10).

### 2. Pick the receiving address

`X402_PAY_TO` is any Base-mainnet address you control (USDC lands there). A Coinbase account's
Base USDC receive address works, as does any EOA. Do not use a CDP "API Key Wallet" unless you also
want to manage `CDP_WALLET_SECRET`; this server never needs it.

### 3. Set the variables on the Coolify app `storelint-mcp`

Coolify (`coolify.iraaj.com`) -> Projects -> the `storelint-mcp` application -> **Environment
Variables**. Add:

| Variable | Value |
| --- | --- |
| `CDP_API_KEY_ID` | the UUID from step 1 (mark it as a runtime variable, not a build variable) |
| `CDP_API_KEY_SECRET` | the base64 secret from step 1 (same) |
| `X402_PAY_TO` | your Base address, `0x` + 40 hex characters |
| `PUBLIC_URL` | `https://storelint-mcp.embracetech.org` |

`PUBLIC_URL` is not optional any more once payments are on: the 402 challenge and the Bazaar index
use it as the resource URL. Without it the middleware advertises the request URL, which behind
Coolify's proxy is the internal `http://` one, and the Bazaar would index that.

Leave the defaults for `X402_PRICE` (`$0.05`), `X402_NETWORK` (`eip155:8453`) and
`X402_FACILITATOR_URL` (`https://api.cdp.coinbase.com/platform/v2/x402`).

Redeploy. The startup log must show:

```
[storelint-mcp] x402 enabled: $0.05 per storelint_scan call (POST /mcp, POST /x402/scan) on eip155:8453, payTo 0x..., facilitator https://api.cdp.coinbase.com/platform/v2/x402, resource base https://storelint-mcp.embracetech.org
```

and must not show `CDP_API_KEY_ID / CDP_API_KEY_SECRET are not set` or
`Failed to load bazaar extension`.

### 4. Check the challenge yourself (no payment involved)

```sh
curl -s -D - -o /dev/null https://storelint-mcp.embracetech.org/x402/scan \
  -H 'content-type: application/json' \
  -d '{"repoUrl":"https://github.com/flutter/samples"}' \
| grep -i '^payment-required:' | cut -d' ' -f2 | base64 -d | jq .
```

Expected: `x402Version: 2`, `resource.url` = `https://storelint-mcp.embracetech.org/x402/scan`,
`accepts[0]` = `exact` / `eip155:8453` / `amount "50000"` / your `payTo`, and
`extensions.bazaar.info.input` = `{ type: "http", method: "POST", bodyType: "json", body: {...} }`.

## (b) Verify the listing in the discovery index

Two stages, both without a CDP key (the discovery APIs are public).

**Stage 1, preflight (works immediately after deploy).** Coinbase's validator fetches the resource,
checks it returns 402 with a parseable Bazaar block, and simulates a payment:

```sh
curl -s -X POST https://api.cdp.coinbase.com/platform/v2/x402/validate \
  -H 'content-type: application/json' \
  -d '{"resource":"https://storelint-mcp.embracetech.org/x402/scan","method":"POST"}' | jq .
```

Expected: `valid: true`, every `preflight[]` entry (`reachable`, `returns_402`,
`has_bazaar_extension`, `parse`) `passed: true`, `simulation.outcome: "accepted"`, and
`bazaarExtension` echoing the block above. `index` stays `null` until stage 2. (The server answers an
empty-body POST with the 402 on purpose so this probe passes; a malformed body gets a 400 instead.)

**Stage 2, the index.** The CDP facilitator indexes a resource only after it has **settled at least
one payment** for it whose payload echoed `extensions.bazaar`; indexing "takes up to 15 minutes".
So the first listing needs one real $0.05 call (see (c), or pay once yourself with `@x402/fetch` or
Coinbase's Agentic Wallet CLI). Then:

```sh
curl -sG https://api.cdp.coinbase.com/platform/v2/x402/discovery/search \
  --data-urlencode 'urlSubstring=storelint-mcp.embracetech.org' | jq '.resources[] | {resource, type, accepts, quality}'
```

or by merchant address:

```sh
curl -sG https://api.cdp.coinbase.com/platform/v2/x402/discovery/search \
  --data-urlencode 'payTo=0xYOUR_PAY_TO' --data-urlencode 'network=eip155:8453' | jq .
```

The full catalogue is `GET https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources?type=http&limit=100&offset=0`.
Resources with no settlement for 30 days are dropped from the catalogue; ranking is recomputed every
six hours from 30-day call volume, unique payers and metadata completeness. The same index also backs
the Bazaar MCP server (`https://api.cdp.coinbase.com/platform/v2/x402/discovery/mcp`, tool
`search_resources`) and the public browser at `https://agentic.market`.

**VERIFY:** whether `coinbase_x402_resources` searches this whole index or only Coinbase's curated
subset. The Coinbase MCP page calls it "Discover curated x402 services" and names the curated
providers (Arkham, Dripstack, Exa, Glassnode, Massive, Nansen, You.com); curation requires mainnet
payments, 99% availability over 30 days, passing health probes and a passing validation. Until
StoreLint is curated, buyers may have to pass the URL to `coinbase_x402_fetch` directly instead of
finding it through `coinbase_x402_resources`.

## (c) Buyer test from Claude Code with the Coinbase MCP

Prerequisites on the buyer side: a Coinbase account holding a little USDC on Base (the agent spends
the retail balance; no separate wallet), and Claude Code.

1. Add and authenticate the Coinbase MCP:

   ```sh
   claude mcp add coinbase --transport http https://agents.coinbase.com/mcp
   claude
   ```

   In the session run `/mcp`, choose **coinbase** -> **Authenticate**; the browser opens the Coinbase
   OAuth screen where you sign in and pick which portfolio the agent may use. (Revoke later at
   Coinbase Account -> Security -> Connections, `https://accounts.coinbase.com/security/connections`.)

2. Ask for the scan, naming the tool and the budget explicitly (the docs recommend saying "use x402
   fetch" and "you have authorization to pay" so the agent routes to the right tool):

   ```
   Use coinbase_x402_fetch with resource "https://storelint-mcp.embracetech.org/x402/scan",
   input {"repoUrl": "https://github.com/<owner>/<repo>"} and max_amount 50000.
   You have authorization to pay up to 0.05 USDC for this one call. Summarise the Report's
   blockers and warnings with their fixes.
   ```

   `max_amount` is in atomic USDC units (`50000` = $0.05); it can only lower the ceiling.
   The fetch tool handles the 402, the payment and the retried request in one call and returns the
   Report JSON.

3. What a successful call looks like on the server: one `POST /x402/scan` answered 402, a second
   one with `PAYMENT-SIGNATURE` answered 200 with a `PAYMENT-RESPONSE` header, and the facilitator's
   `EXTENSION-RESPONSES` header carrying `bazaar: success` or `processing`.

Payment safety, from the Coinbase MCP page: payments use USDC on Base only, are capped at
**5 USDC per payment**, and **settled x402 payments are irreversible** (recorded on Base; a successful
payment does not guarantee the provider returned usable data). The agent should keep a UUID
`idempotency_key` and reuse it if the call times out, otherwise a retry can create a second hold.

**VERIFY:** the Coinbase MCP page says "Fetch supports curated catalog URLs and x402 v2 only" and
"It is not an unrestricted web-fetch tool". Our endpoint is x402 v2, but if `coinbase_x402_fetch`
refuses a URL that is not in the curated catalogue, the fallback on the same MCP is
`coinbase_x402_pay` (returns the `PAYMENT-SIGNATURE` header for a given challenge) followed by a
plain HTTP POST with that header; or pay from a CDP wallet with `@x402/fetch` (README). First-listing
chicken-and-egg: the index needs one settled payment, and that first payment may have to come from a
non-Coinbase-MCP client.

**VERIFY:** that `coinbase_x402_fetch` sends `input` as the JSON body for a `bodyType: "json"` POST
resource (the Bazaar metadata declares exactly that; the Coinbase page does not document the mapping).

Costs after the call: nothing on the seller side beyond the facilitator's free tier; the buyer paid
$0.05 and the on-chain gas was covered by the facilitator (EIP-3009 transfer authorization).

## (d) Free mode and the landing badge

`X402_PAY_TO` unset = **free mode**: the server logs
`X402_PAY_TO is not set: running in FREE mode`, no x402 middleware is mounted, `storelint_scan` and
`POST /x402/scan` run without a 402, and nothing can be indexed (no settlements happen). This is the
state during setup and for local development.

The landing page (`GET /`) reflects the mode next to the endpoint:

- `live · free mode` (amber badge) when `X402_PAY_TO` is unset, with the line "No pay-to address is
  configured on this deployment, so storelint_scan is currently free."
- `live · paid` (green badge) when it is set, with the price, network and pay-to address.

The pricing card and the HTTP-endpoint block change wording accordingly ("once payments are switched
on" is appended in free mode). The badge does not know whether the CDP keys are valid: with
`X402_PAY_TO` set but bad or missing keys the page says "paid", the 402 is still issued, and every
verify/settle fails, so nobody can complete a call. Check the startup log and the validate endpoint
(stage 1 above) after every change to the keys.

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `valid: false`, `reachable` failed | Coolify app down, or `PUBLIC_URL` points somewhere else. The validator needs public HTTPS; localhost and `ngrok.io`-style tunnels are not indexed. |
| `returns_402` failed, got 400 | You validated with `"method": "GET"` or sent a body the server rejects. Use `"method": "POST"` and no body. |
| Facilitator answers 401/403 on verify/settle | Key id/secret mismatch, key deleted, or IP allowlist excludes the host. Recreate the key. |
| 502 from the server on paid calls | The middleware could not reach `GET https://api.cdp.coinbase.com/platform/v2/x402/supported` at startup (needs the keys too). |
| Listed, then gone | No settlement in 30 days. One paid call brings it back. |
| Description rejected by the facilitator | CDP rejects verify/settle when a route description exceeds 500 characters; ours is 456 characters and a test guards the limit. |
