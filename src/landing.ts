import { CHECKS } from "./checks.js";
import { CHECKS_TOOL, SCAN_TOOL } from "./mcp.js";

export interface LandingInfo {
  mcpUrl: string;
  priceLabel: string;
  paymentsEnabled: boolean;
  network: string;
  payTo?: string;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] as string);
}

export function landingPage(info: LandingInfo): string {
  const clientConfig = JSON.stringify({ mcpServers: { storelint: { type: "http", url: info.mcpUrl } } }, null, 2);
  const checkRows = CHECKS.map(
    (c) => `<tr><td><code>${esc(c.id)}</code></td><td>${esc(c.platform)}</td><td>${esc(c.severity)}</td><td>${esc(c.catches)}</td></tr>`,
  ).join("\n");
  const paymentNote = info.paymentsEnabled
    ? `<p><strong>Price:</strong> ${esc(info.priceLabel)} per <code>${SCAN_TOOL}</code> call, paid with <a href="https://www.x402.org/">x402</a> (HTTP 402 + <code>PAYMENT-SIGNATURE</code> header) on network <code>${esc(info.network)}</code> to <code>${esc(info.payTo ?? "")}</code>. <code>${CHECKS_TOOL}</code> is free.</p>`
    : `<p><strong>Price:</strong> payments are currently disabled on this deployment, so <code>${SCAN_TOOL}</code> is free (normally ${esc(info.priceLabel)} per call via x402, USDC on Base).</p>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>StoreLint MCP</title>
<style>
  body { font: 16px/1.5 system-ui, sans-serif; max-width: 860px; margin: 2rem auto; padding: 0 1rem; color: #1b1b1b; }
  code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.92em; }
  pre { background: #f4f4f4; padding: 0.75rem 1rem; overflow-x: auto; border-radius: 6px; }
  table { border-collapse: collapse; width: 100%; font-size: 0.9em; }
  th, td { text-align: left; padding: 0.3rem 0.5rem; border-bottom: 1px solid #ddd; vertical-align: top; }
  a { color: #0b57d0; }
</style>
</head>
<body>
<h1>StoreLint MCP</h1>
<p>An <a href="https://modelcontextprotocol.io/">MCP</a> server that lets AI agents run <a href="https://storelint.iraaj.com">StoreLint</a>:
a scanner that finds everything that would get a Flutter, React Native or Expo app rejected or blocked on Google Play and the Apple App Store.</p>

<h2>Endpoint</h2>
<p>Streamable HTTP (stateless): <code>POST ${esc(info.mcpUrl)}</code></p>
<pre>${esc(clientConfig)}</pre>

<h2>Tools</h2>
<ul>
  <li><code>${CHECKS_TOOL}</code> (free): list of check ids and what each one catches.</li>
  <li><code>${SCAN_TOOL}</code>: <code>{ zipBase64?: string, repoUrl?: string }</code> &rarr; StoreLint Report JSON (schemaVersion 1). Pass a base64 zip of the project (max 50 MB) or a public GitHub repo URL (shallow clone, 60 s, 200 MB cap).</li>
</ul>
${paymentNote}
<p>Paying clients: wrap the MCP client's <code>fetch</code> with an x402 client (for example <code>@x402/fetch</code>) holding a wallet with USDC on Base; it reads the 402 challenge, signs the payment and retries automatically.</p>

<h2>Checks</h2>
<table>
<thead><tr><th>id</th><th>platform</th><th>severity</th><th>catches</th></tr></thead>
<tbody>
${checkRows}
</tbody>
</table>

<p>Free CLI and web scans, plus the done-for-you release service: <a href="https://storelint.iraaj.com">storelint.iraaj.com</a>.</p>
</body>
</html>
`;
}
