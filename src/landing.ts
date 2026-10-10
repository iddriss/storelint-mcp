/**
 * Landing page for GET /. Same design language as storelint-web (docs/DESIGN-T3.md): the
 * stylesheet below is a trimmed copy of storelint-web/public/style.css (only the rules this
 * page uses) inlined because this server has no static file route.
 */
import { CHECKS } from "./checks.js";
import { CHECKS_TOOL, SCAN_TOOL } from "./mcp.js";

export const SITE_NAME = "StoreLint";
export const SITE_URL = "https://storelint.embracetech.org";
export const REPO_URL = "https://github.com/iddriss/storelint-mcp";

export interface LandingInfo {
  /** Absolute MCP endpoint, e.g. https://storelint-mcp.embracetech.org/mcp */
  mcpUrl: string;
  /** Absolute plain-HTTP scan endpoint, e.g. https://storelint-mcp.embracetech.org/x402/scan */
  scanHttpUrl: string;
  /** Configured price per storelint_scan call, e.g. "$0.05". */
  price: string;
  /** False when no pay-to address is configured (free mode). */
  paymentsEnabled: boolean;
  /** x402 v2 network id, e.g. "eip155:8453". */
  network: string;
  payTo?: string;
}

export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Human name for the CAIP-2 ids this server accepts (payment.ts requires eip155:*). */
export function networkLabel(network: string): string {
  if (network === "eip155:8453") return "Base";
  if (network === "eip155:84532") return "Base Sepolia";
  return network;
}

/** "$0.05" -> "50000" (USDC has 6 decimals). Undefined when the price is not a plain dollar amount. */
export function usdcAtomicUnits(price: string): string | undefined {
  const m = /^\$(\d+)(?:\.(\d{1,6}))?$/.exec(price.trim());
  if (!m) return undefined;
  const whole = m[1] as string;
  const frac = (m[2] ?? "").padEnd(6, "0");
  return String(BigInt(whole) * 1_000_000n + BigInt(frac));
}

const ICON = {
  mark: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="2.5" y="2.5" width="19" height="19" rx="5" stroke="currentColor" stroke-width="1.6"/><path d="M7.5 12.5l3 3 6-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  github: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .5A11.5 11.5 0 0 0 .5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2.1c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.76 2.69 1.25 3.35.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.18-3.09-.12-.29-.51-1.46.11-3.04 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.78 0c2.2-1.49 3.17-1.18 3.17-1.18.62 1.58.23 2.75.11 3.04.74.8 1.18 1.83 1.18 3.09 0 4.42-2.7 5.4-5.26 5.68.41.36.78 1.06.78 2.13v3.16c0 .31.2.67.8.56A11.5 11.5 0 0 0 23.5 12 11.5 11.5 0 0 0 12 .5z"/></svg>`,
  arrow: `<svg class="arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`,
  terminal: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 17l6-5-6-5M12 19h8"/></svg>`,
};

const FAVICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#09090b"/><rect x="0.5" y="0.5" width="31" height="31" rx="7.5" fill="none" stroke="#ffffff24"/><path d="M9.5 16.5l4.5 4.5 8.5-9.5" fill="none" stroke="#7b8cff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  );

/* Trimmed from storelint-web/public/style.css. Keep tokens identical to the main site. */
const STYLE = `
:root{--bg:#09090b;--bg-elev:#0c0c0e;--bg-card:#111113;--fg:#fafafa;--fg-muted:#a1a1aa;--fg-dim:#71717a;--fg-faint:#52525b;--border:#ffffff14;--border-strong:#ffffff24;--hover-bg:#ffffff0a;--code-bg:#ffffff0a;--pill-bg:#ffffff05;--grid-line:#ffffff09;--accent-h:250;--accent:oklch(0.68 0.17 var(--accent-h));--accent-dim:oklch(0.68 0.17 var(--accent-h) / 0.15);--ok:oklch(72% 0.16 150);--warn:oklch(76% 0.15 75);--danger:oklch(68% 0.19 25);--radius-sm:8px;--radius:12px;--radius-lg:16px;--pill:999px;--font-sans:"DM Sans",-apple-system,BlinkMacSystemFont,system-ui,sans-serif;--font-mono:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,Monaco,monospace;--shadow-frame:0 20px 48px -16px #000000a6,inset 0 2px #ffffff0a;--shadow-primary:0 8px 24px -8px #ffffff33;--btn-primary-hover:#ffffff}
@media (prefers-color-scheme:dark){html{color-scheme:dark}}
@media (prefers-color-scheme:light){html{color-scheme:light}:root{--bg:#fafafa;--bg-elev:#f4f4f5;--bg-card:#ffffff;--fg:#09090b;--fg-muted:#52525b;--fg-dim:#71717a;--fg-faint:#a1a1aa;--border:#00000014;--border-strong:#00000024;--hover-bg:#0000000a;--code-bg:#0000000a;--pill-bg:#00000005;--grid-line:#00000009;--accent:oklch(0.52 0.19 var(--accent-h));--accent-dim:oklch(0.52 0.19 var(--accent-h) / 0.12);--ok:oklch(55% 0.16 150);--warn:oklch(62% 0.15 75);--danger:oklch(56% 0.19 25);--shadow-frame:0 20px 48px -16px #00000040,inset 0 2px #ffffffcc;--shadow-primary:0 8px 24px -8px #00000040;--btn-primary-hover:#000000}}
*,*::before,*::after{box-sizing:border-box}
html{color-scheme:dark;scroll-behavior:smooth;-webkit-text-size-adjust:100%}
body{margin:0;min-height:100vh;display:flex;flex-direction:column;background:var(--bg);color:var(--fg);font-family:var(--font-sans);font-size:16px;line-height:1.55;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;overflow-x:clip}
main{flex:1}
a{color:inherit;text-decoration:none}
button{font:inherit;color:inherit;background:none;border:0;cursor:pointer}
h1,h2,h3{margin:0;font-weight:500;letter-spacing:-0.02em;line-height:1.15}
p,ul,ol{margin:0}
svg{display:inline-block;vertical-align:middle}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
code,pre{font-family:var(--font-mono)}
code{font-size:13px;white-space:nowrap;background:var(--code-bg);border:1px solid var(--border);border-radius:var(--radius-sm);padding:2px 6px}
.mono{font-family:var(--font-mono)}
.dim{color:var(--fg-dim)}
.small{font-size:13px}
.container{width:100%;max-width:1120px;margin:0 auto;padding:0 16px}
.container.narrow{max-width:760px}
.container.mid{max-width:880px}
@media (min-width:720px){.container{padding:0 24px}}
.eyebrow{font-family:var(--font-mono);font-size:12px;font-weight:500;text-transform:uppercase;letter-spacing:0.12em;color:var(--fg-dim)}
.section{border-top:1px solid var(--border);padding:64px 0}
@media (min-width:720px){.section{padding:96px 0}}
.section-head{max-width:720px;margin-bottom:40px}
@media (min-width:720px){.section-head{margin-bottom:56px}}
.section-head .eyebrow{display:block;margin-bottom:14px}
.section-head h2{font-size:clamp(32px,4vw,48px);letter-spacing:-0.035em;line-height:1.08;text-wrap:balance}
.section-head .lead{margin-top:16px;font-size:17px;color:var(--fg-muted);max-width:600px}
.section-head.center{margin-left:auto;margin-right:auto;text-align:center}
.section-head.center .lead{margin-left:auto;margin-right:auto}
.section-head.tight{margin-bottom:28px}
.section-foot{margin-top:20px;font-size:13px;color:var(--fg-dim)}
.lead{font-size:17px;color:var(--fg-muted)}
.text-link{display:inline-flex;align-items:center;gap:8px;color:var(--fg-muted);font-size:14px;font-weight:500;letter-spacing:-0.01em;transition:color 0.18s}
.text-link:hover{color:var(--fg)}
.text-link .arrow{opacity:0.6;transition:transform 0.18s,opacity 0.18s}
.text-link:hover .arrow{opacity:1;transform:translateX(2px)}
.text-link svg{flex:none}
a.inline{color:var(--fg);text-decoration:underline;text-decoration-color:var(--fg-faint);text-underline-offset:3px}
a.inline:hover{text-decoration-color:var(--fg)}
@keyframes rise{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
[data-rise]{animation:rise 0.7s cubic-bezier(0.2,0.7,0.2,1) both;animation-delay:var(--d,0ms)}
@media (prefers-reduced-motion:reduce){[data-rise]{animation:none}html{scroll-behavior:auto}.btn,.card,.text-link .arrow{transition:none}}
.nav{position:sticky;top:0;z-index:50;border-bottom:1px solid var(--border);background:color-mix(in srgb,var(--bg) 78%,transparent);-webkit-backdrop-filter:blur(18px);backdrop-filter:blur(18px)}
.nav-inner{height:56px;display:flex;align-items:center;justify-content:space-between;gap:12px}
.wordmark{display:inline-flex;align-items:center;gap:9px;font-family:var(--font-mono);font-size:14px;font-weight:500;letter-spacing:-0.01em;color:var(--fg)}
.wordmark svg{flex:none;color:var(--accent)}
.nav-links{display:flex;align-items:center;gap:2px}
.nav-link{color:var(--fg-muted);font-size:13px;letter-spacing:-0.01em;padding:6px 10px;white-space:nowrap;transition:color 0.18s}
.nav-link:hover{color:var(--fg)}
.nav-pill{display:inline-flex;align-items:center;gap:7px;height:34px;padding:0 13px;margin-left:8px;border:1px solid var(--border);border-radius:var(--pill);background:var(--pill-bg);font-family:var(--font-mono);font-size:12px;color:var(--fg-muted);white-space:nowrap;transition:color 0.18s,border-color 0.18s,background 0.18s}
.nav-pill:hover{color:var(--fg);border-color:var(--border-strong);background:var(--hover-bg)}
.nav-pill svg{flex:none}
@media (max-width:640px){.nav-link:not(.nav-link-keep){display:none}.nav-pill{margin-left:4px;padding:0 11px}}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:10px 18px;border-radius:var(--pill);border:1px solid transparent;font-size:14px;font-weight:500;line-height:1.2;white-space:nowrap;transition:transform 0.18s,background 0.18s,border-color 0.18s,color 0.18s,box-shadow 0.18s}
.btn-primary{background:var(--fg);color:var(--bg);box-shadow:var(--shadow-primary)}
.btn-primary:hover{background:var(--btn-primary-hover);transform:translateY(-1px)}
.btn-primary:active{transform:translateY(0)}
.btn-secondary{border-color:var(--border-strong);color:var(--fg)}
.btn-secondary:hover{background:var(--hover-bg)}
.btn-lg{padding:14px 22px;font-size:15px}
.btn-sm{padding:6px 12px;font-size:13px}
.btn svg{flex:none}
.hero{position:relative;padding:72px 0 56px;text-align:center;overflow:hidden}
@media (min-width:720px){.hero{padding:96px 0 72px}}
.hero-grid{pointer-events:none;position:absolute;inset:0;background-image:linear-gradient(90deg,var(--grid-line) 1px,transparent 1px),linear-gradient(var(--grid-line) 1px,transparent 1px);background-size:48px 48px;-webkit-mask-image:radial-gradient(80% 60% at 50% 40%,#000 40%,transparent 100%);mask-image:radial-gradient(80% 60% at 50% 40%,#000 40%,transparent 100%)}
.hero-inner{position:relative;max-width:760px;margin:0 auto}
.hero h1{font-size:clamp(40px,7vw,72px);font-weight:500;letter-spacing:-0.04em;line-height:1.02;margin:20px 0 22px;text-wrap:balance}
.hero h1 .line2{display:block;color:var(--fg-muted);font-size:clamp(22px,0.52em,38px);line-height:1.15;letter-spacing:-0.03em;margin-top:0.3em}
.hero-sub{font-size:18px;line-height:1.55;color:var(--fg-muted);max-width:560px;margin:0 auto 32px}
.hero-actions{display:flex;flex-direction:column;align-items:center;gap:16px}
@media (min-width:600px){.hero-actions{flex-direction:row;justify-content:center;gap:22px}}
.terminal{position:relative;max-width:760px;margin:56px auto 0;text-align:left;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);box-shadow:var(--shadow-frame);overflow:hidden}
.terminal-bar{display:flex;align-items:center;gap:8px;padding:12px 16px;border-bottom:1px solid var(--border)}
.terminal-dot{width:10px;height:10px;border-radius:50%;background:var(--border-strong)}
.terminal-title{flex:1;text-align:center;font-family:var(--font-mono);font-size:11px;color:var(--fg-dim);margin-right:46px}
.terminal pre{margin:0;padding:18px 20px 20px;overflow-x:auto;font-family:var(--font-mono);font-size:13px;line-height:1.65;color:var(--fg-muted);white-space:pre}
@media (max-width:480px){.terminal pre{font-size:12px;padding:14px 16px 16px}}
.t-prompt{color:var(--fg-dim)}.t-cmd{color:var(--fg)}.t-fg{color:var(--fg)}.t-key{color:var(--fg)}.t-dim{color:var(--fg-dim)}
.t-blocker{color:var(--danger);font-weight:500}.t-warn{color:var(--warn);font-weight:500}.t-info{color:var(--accent);font-weight:500}.t-ok{color:var(--ok);font-weight:500}
.t-str{color:var(--accent)}
.grid{display:grid;gap:12px}
@media (min-width:720px){.grid{gap:16px}.grid-2{grid-template-columns:repeat(2,minmax(0,1fr))}.grid-3{grid-template-columns:repeat(3,minmax(0,1fr))}}
.card{background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:20px;transition:border-color 0.18s;min-width:0}
@media (min-width:720px){.card{padding:24px}}
.card:hover{border-color:var(--border-strong)}
.card h3{font-size:17px;letter-spacing:-0.015em;margin-bottom:8px}
.card>p{color:var(--fg-muted);font-size:14.5px;line-height:1.55}
.card-num{display:block;font-family:var(--font-mono);font-size:12px;color:var(--fg-dim);letter-spacing:0.08em;margin-bottom:14px}
.card-head{display:flex;flex-wrap:wrap;align-items:center;gap:8px 10px;margin-bottom:8px}
.card-head h3{margin:0}
.id-more{margin-top:16px;padding-top:14px;border-top:1px dashed var(--border);font-family:var(--font-mono);font-size:12px;line-height:1.7;color:var(--fg-dim);overflow-wrap:anywhere}
.tick-list{list-style:none;padding:0;margin:12px 0 0;display:flex;flex-direction:column;gap:9px}
.tick-list li{position:relative;padding-left:22px;font-size:14.5px;color:var(--fg-muted);line-height:1.5}
.tick-list li::before{content:"\\2713";position:absolute;left:0;top:0;color:var(--ok);font-weight:500}
.badge{display:inline-flex;align-items:center;padding:3px 9px;border-radius:var(--pill);border:1px solid var(--border);background:var(--pill-bg);font-family:var(--font-mono);font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:var(--fg-muted);vertical-align:middle}
.badge-ok{color:var(--ok);border-color:color-mix(in srgb,var(--ok) 40%,transparent)}
.badge-warn{color:var(--warn);border-color:color-mix(in srgb,var(--warn) 40%,transparent)}
.cmd{display:flex;align-items:center;gap:8px;min-width:0;background:var(--bg-elev);border:1px solid var(--border);border-radius:var(--radius-sm);padding:6px 6px 6px 14px;margin:14px 0 12px}
.cmd code{flex:1;min-width:0;font-size:13px;color:var(--fg);white-space:nowrap;overflow-x:auto;background:none;border:0;padding:4px 0}
.cmd.shell code::before{content:"$ ";color:var(--fg-dim)}
.cmd .btn{flex:none}
.endpoint{max-width:760px;margin:40px auto 0;text-align:left}
.endpoint .cmd{margin:0;padding:8px 8px 8px 16px}
.endpoint .cmd code{font-size:14px}
.endpoint-meta{display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px;margin-top:12px;font-size:13px;color:var(--fg-dim)}
.endpoint-meta .mono{color:var(--fg-muted);overflow-wrap:anywhere}
.codeblock{position:relative;margin:14px 0 0;background:var(--bg-elev);border:1px solid var(--border);border-radius:var(--radius-sm);overflow:hidden}
.codeblock pre{margin:0;padding:16px 18px;overflow-x:auto;font-size:13px;line-height:1.6;color:var(--fg);white-space:pre}
.codeblock .btn{position:absolute;top:8px;right:8px}
.codeblock-label{display:block;padding:8px 14px 0;font-family:var(--font-mono);font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:var(--fg-dim)}
.price-card{display:flex;flex-direction:column;gap:10px;max-width:420px}
.price-card h3{margin:0}
.price{font-family:var(--font-mono);font-size:32px;font-weight:500;letter-spacing:-0.02em;line-height:1;margin:4px 0 2px}
.price-sub{font-family:var(--font-mono);font-size:12.5px;color:var(--fg-dim)}
.price-card>p{flex:1}
.price-card .btn{margin-top:10px;width:100%}
.price-featured{border-color:var(--border-strong);background:linear-gradient(var(--accent-dim),transparent 55%),var(--bg-card)}
.footer{border-top:1px solid var(--border);margin-top:auto;padding:32px 0 max(28px,env(safe-area-inset-bottom))}
.footer-inner{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:16px 24px;font-size:13px;color:var(--fg-dim)}
.footer-brand{display:inline-flex;align-items:center;gap:10px}
.footer-brand .wordmark{font-size:13px;color:var(--fg-muted)}
.footer-links{display:flex;flex-wrap:wrap;gap:8px 20px}
.footer-links a{color:var(--fg-muted);transition:color 0.18s}
.footer-links a:hover{color:var(--fg)}
.cta{text-align:center}
.cta .section-head{margin:0 auto 28px}
.cta-actions{display:flex;flex-direction:column;align-items:center;gap:16px}
@media (min-width:600px){.cta-actions{flex-direction:row;justify-content:center;gap:22px}}
.cta-foot{margin-top:24px;font-size:13px;color:var(--fg-dim)}
`;

/** Example request/response in the hero terminal card. Score matches summarize(): 100 - 25*2 - 5*1. */
function terminalPreview(mcpUrl: string): string {
  const k = (s: string) => `<span class="t-key">"${s}"</span>`;
  const v = (s: string) => `<span class="t-str">"${esc(s)}"</span>`;
  return `<div class="terminal" data-rise style="--d:520ms" aria-label="Example tools/call request and response">
  <div class="terminal-bar" aria-hidden="true"><span class="terminal-dot"></span><span class="terminal-dot"></span><span class="terminal-dot"></span><span class="terminal-title">POST ${esc(mcpUrl)}</span></div>
<pre><span class="t-prompt">&rsaquo;</span> <span class="t-cmd">tools/call</span> <span class="t-dim">(request)</span>
{ ${k("jsonrpc")}: ${v("2.0")}, ${k("id")}: 1, ${k("method")}: ${v("tools/call")},
  ${k("params")}: { ${k("name")}: ${v(SCAN_TOOL)},
              ${k("arguments")}: { ${k("repoUrl")}: ${v("https://github.com/acme/my_app")} } } }

<span class="t-prompt">&lsaquo;</span> <span class="t-cmd">result.structuredContent</span> <span class="t-dim">(Report JSON, trimmed)</span>
{ ${k("schemaVersion")}: 1, ${k("scannedAt")}: ${v("2026-10-10T09:12:44.000Z")},
  ${k("project")}: { ${k("name")}: ${v("my_app")}, ${k("framework")}: ${v("flutter")}, ${k("path")}: ${v(".")} },
  ${k("summary")}: { ${k("blocker")}: <span class="t-blocker">2</span>, ${k("warning")}: <span class="t-warn">1</span>, ${k("info")}: 0, ${k("score")}: <span class="t-blocker">45</span> },
  ${k("findings")}: [
    { ${k("id")}: ${v("android.target-sdk")}, ${k("severity")}: <span class="t-blocker">"blocker"</span>, ${k("platform")}: ${v("android")},
      ${k("title")}: ${v("targetSdk is 33; Google Play requires 35")},
      ${k("file")}: ${v("android/app/build.gradle")}, ${k("line")}: 24,
      ${k("fix")}: ${v("Set targetSdk = 35 and compileSdk = 35.")} },
    { ${k("id")}: ${v("ios.privacy-manifest")}, ${k("severity")}: <span class="t-blocker">"blocker"</span>, <span class="t-dim">&hellip;</span> },
    { ${k("id")}: ${v("android.page-size-16kb")}, ${k("severity")}: <span class="t-warn">"warning"</span>, <span class="t-dim">&hellip;</span> }
  ] }</pre>
</div>`;
}

export function landingPage(info: LandingInfo): string {
  const network = networkLabel(info.network);
  const atomic = usdcAtomicUnits(info.price);
  const checkIds = CHECKS.map((c) => c.id);
  const blockerCount = CHECKS.filter((c) => c.severity === "blocker").length;

  // Claude Code: .mcp.json (project) or ~/.claude.json (user). `claude mcp add --transport http`
  // writes exactly this shape. The same object is read by Cursor and Windsurf.
  // Claude Desktop's claude_desktop_config.json only launches stdio servers; remote HTTP servers
  // are added from Settings > Connectors ("Add custom connector" with the URL) instead.
  // Unverified against the SDK docs in this session: whether Claude Desktop also accepts
  // `"type": "http"` directly in its JSON today. Kept out of the UI on purpose.
  const clientConfig = JSON.stringify({ mcpServers: { storelint: { type: "http", url: info.mcpUrl } } }, null, 2);
  const addCommand = `claude mcp add --transport http storelint ${info.mcpUrl}`;

  const modeBadge = info.paymentsEnabled
    ? `<span class="badge badge-ok">live · paid</span>`
    : `<span class="badge badge-warn">live · free mode</span>`;
  const modeLine = info.paymentsEnabled
    ? `<span class="endpoint-meta-item"><code>${SCAN_TOOL}</code> costs <span class="mono">${esc(info.price)} USDC</span> on ${esc(network)} <span class="dim">(${esc(info.network)})</span>, paid to <span class="mono">${esc(info.payTo ?? "")}</span>.</span>`
    : `<span class="endpoint-meta-item">No pay-to address is configured on this deployment, so <code>${SCAN_TOOL}</code> is currently free. With payments on it costs <span class="mono">${esc(info.price)} USDC</span> per call on ${esc(network)}.</span>`;

  const description = `MCP server that lets AI agents run StoreLint, the Google Play and App Store readiness scanner for Flutter, React Native and Expo apps. ${esc(info.price)} per scan in USDC on Base via x402.`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(SITE_NAME)} MCP — let your agent run StoreLint</title>
<meta name="description" content="${description}">
<meta name="color-scheme" content="dark light">
<meta name="theme-color" content="#09090b" media="(prefers-color-scheme: dark)">
<meta name="theme-color" content="#fafafa" media="(prefers-color-scheme: light)">
<meta property="og:site_name" content="${esc(SITE_NAME)}">
<meta property="og:title" content="${esc(SITE_NAME)} MCP — let your agent run StoreLint">
<meta property="og:description" content="${description}">
<link rel="icon" href="${FAVICON}" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500&family=JetBrains+Mono:wght@400;500&display=swap">
<style>${STYLE}</style>
</head>
<body>
<header class="nav">
  <div class="container nav-inner">
    <a class="wordmark" href="${SITE_URL}">${ICON.mark}<span>${esc(SITE_NAME)}</span></a>
    <nav class="nav-links" aria-label="Site">
      <a class="nav-link" href="${SITE_URL}/#checks">Checks</a>
      <a class="nav-link" href="${SITE_URL}/#pricing">Pricing</a>
      <a class="nav-link nav-link-keep" href="${SITE_URL}/ship">Ship it for me</a>
      <a class="nav-pill" href="${REPO_URL}" rel="noopener">${ICON.github}<span>GitHub</span></a>
    </nav>
  </div>
</header>
<main>
<section class="hero">
  <div class="hero-grid" aria-hidden="true"></div>
  <div class="container">
    <div class="hero-inner">
      <p class="eyebrow" data-rise style="--d:90ms">MCP server · x402</p>
      <h1 data-rise style="--d:180ms">Let your agent run StoreLint.<span class="line2">Two tools over Streamable HTTP. No account, no API key.</span></h1>
      <p class="hero-sub" data-rise style="--d:300ms">Point any MCP client at the endpoint. Scans are paid per call in USDC on Base: the server answers <code>402</code>, an x402-aware client signs the payment and retries.</p>
      <div class="hero-actions" data-rise style="--d:400ms">
        <a class="btn btn-primary btn-lg" href="#connect">Connect it</a>
        <a class="text-link" href="${SITE_URL}">${ICON.terminal}Scanning by hand? Use the free CLI ${ICON.arrow}</a>
      </div>
    </div>
    <div class="endpoint" data-rise style="--d:460ms">
      <div class="cmd"><code id="mcp-url">${esc(info.mcpUrl)}</code><button type="button" class="btn btn-secondary btn-sm" data-copy="${esc(info.mcpUrl)}">Copy</button></div>
      <div class="endpoint-meta">${modeBadge}${modeLine}</div>
    </div>
    ${terminalPreview(info.mcpUrl)}
  </div>
</section>

<section class="section" id="tools">
  <div class="container">
    <div class="section-head">
      <span class="eyebrow">Tools</span>
      <h2>Two tools. One of them is free.</h2>
      <p class="lead">Stateless Streamable HTTP, JSON responses, no sessions. <code>initialize</code> and <code>tools/list</code> are always free. The paid scan is also a plain HTTP endpoint, below.</p>
    </div>
    <div class="grid grid-2">
      <div class="card">
        <div class="card-head"><h3><code>${CHECKS_TOOL}</code></h3><span class="badge badge-ok">free</span></div>
        <p>Returns the catalogue of ${CHECKS.length} checks StoreLint runs: id, platform, severity and what each one catches. ${blockerCount} of them are blockers that fail upload or review outright.</p>
        <p class="id-more">${checkIds.map(esc).join(" · ")}</p>
      </div>
      <div class="card">
        <div class="card-head"><h3><code>${SCAN_TOOL}</code></h3><span class="badge">${esc(info.price)} per call</span></div>
        <p>Takes exactly one of <code>zipBase64</code> (a base64 zip of the project, max 50 MB) or <code>repoUrl</code> (a public GitHub repository, shallow-cloned with a 60 s timeout and 200 MB cap) and returns the StoreLint Report JSON: project, summary with score, findings with id, severity, file and fix.</p>
        <ul class="tick-list">
          <li>Invalid input is rejected before any payment is requested.</li>
          <li>The checkout is scanned in a temp folder and deleted afterwards.</li>
          <li>Score is 100 minus 25 per blocker and 5 per warning.</li>
        </ul>
      </div>
    </div>
    <div class="endpoint" id="http">
      <div class="cmd"><code>POST ${esc(info.scanHttpUrl)}</code><button type="button" class="btn btn-secondary btn-sm" data-copy="${esc(info.scanHttpUrl)}">Copy</button></div>
      <div class="endpoint-meta"><span class="badge">${esc(info.price)} per call</span><span class="endpoint-meta-item">Not on MCP? The same scan is a plain x402 HTTP resource: POST <code>{"repoUrl": "..."}</code> or <code>{"zipBase64": "..."}</code> and get the Report JSON back. It carries Bazaar discovery metadata, so Coinbase agents can find it with <code>coinbase_x402_resources</code> and pay for it with <code>coinbase_x402_fetch</code>${
        info.paymentsEnabled ? "" : " once payments are switched on"
      }.</span></div>
    </div>
  </div>
</section>

<section class="section" id="connect">
  <div class="container mid">
    <div class="section-head">
      <span class="eyebrow">Connect it</span>
      <h2>Add it to your MCP config.</h2>
      <p class="lead">Streamable HTTP at the URL above. In Claude Code this goes in <code>.mcp.json</code> (project) or <code>~/.claude.json</code> (user); the command below writes it for you.</p>
    </div>
    <div class="grid grid-2">
      <div class="card">
        <span class="card-num">01</span>
        <h3>Claude Code</h3>
        <div class="cmd shell"><code>${esc(addCommand)}</code><button type="button" class="btn btn-secondary btn-sm" data-copy="${esc(addCommand)}">Copy</button></div>
        <p>Or paste the JSON into the config file. The same shape works in Cursor and Windsurf.</p>
        <div class="codeblock"><pre>${esc(clientConfig)}</pre><button type="button" class="btn btn-secondary btn-sm" data-copy="${esc(clientConfig)}">Copy</button></div>
      </div>
      <div class="card">
        <span class="card-num">02</span>
        <h3>Claude Desktop and paying clients</h3>
        <p>Claude Desktop adds remote servers from Settings &rarr; Connectors &rarr; Add custom connector, with the endpoint URL.</p>
        <p style="margin-top:12px">Free calls work from any client. To pay for <code>${SCAN_TOOL}</code>, wrap the MCP transport&rsquo;s <code>fetch</code> with an x402 client such as <code>@x402/fetch</code> holding a wallet with USDC on ${esc(network)}. It reads the 402 challenge, signs the transfer authorization and retries on its own.</p>
        <p style="margin-top:12px">Paying from a Coinbase account instead? Add the Coinbase MCP (<code>claude mcp add coinbase --transport http https://agents.coinbase.com/mcp</code>) and call <code>coinbase_x402_fetch</code> with <a class="inline" href="#http">the HTTP endpoint</a> as the resource.</p>
      </div>
    </div>
  </div>
</section>

<section class="section" id="payment">
  <div class="container">
    <div class="section-head">
      <span class="eyebrow">How a paid call works</span>
      <h2>Three HTTP round trips, no account.</h2>
      <p class="lead">Only <code>tools/call</code> for <code>${SCAN_TOOL}</code> is gated. Everything else passes straight through to the MCP transport.</p>
    </div>
    <div class="grid grid-3">
      <div class="card">
        <span class="card-num">01 &middot; request</span>
        <h3>Call the tool</h3>
        <p>The client POSTs the <code>tools/call</code> JSON-RPC message without a payment header. The server validates the arguments first; bad input gets an ordinary MCP tool error and no 402.</p>
      </div>
      <div class="card">
        <span class="card-num">02 &middot; 402</span>
        <h3>Get the challenge</h3>
        <p>The server answers <code>402 Payment Required</code> with a base64 JSON <code>PAYMENT-REQUIRED</code> header: scheme <code>exact</code>, network <code>${esc(info.network)}</code>${atomic ? `, amount <code>${esc(atomic)}</code> (= ${esc(info.price)} USDC)` : ""}, and the pay-to address.</p>
      </div>
      <div class="card">
        <span class="card-num">03 &middot; retry</span>
        <h3>Pay and retry</h3>
        <p>The client signs an EIP-3009 USDC transfer authorization and retries with <code>PAYMENT-SIGNATURE</code>. The facilitator verifies it, the scan runs, the payment is settled on-chain, and the result comes back with a <code>PAYMENT-RESPONSE</code> header.</p>
      </div>
    </div>
    <p class="section-foot">If a verified call still fails after verification (for example a repository that cannot be cloned within the limits), the error is returned as a tool error and the payment is still settled.</p>
  </div>
</section>

<section class="section" id="pricing">
  <div class="container">
    <div class="section-head">
      <span class="eyebrow">Pricing</span>
      <h2>Pay per scan.</h2>
      <p class="lead">No subscription, no key to rotate. The price is set per deployment; this one charges the amount below.</p>
    </div>
    <div class="card price-card price-featured">
      <h3><code>${SCAN_TOOL}</code></h3>
      <div class="price">${esc(info.price)}</div>
      <span class="price-sub">USDC per call · ${esc(network)} · x402</span>
      <p>${
        info.paymentsEnabled
          ? `Settled through the x402 facilitator on ${esc(network)}. <code>${CHECKS_TOOL}</code>, <code>initialize</code> and <code>tools/list</code> stay free.`
          : `This deployment is in free mode right now (no pay-to address configured), so nothing is charged. <code>${CHECKS_TOOL}</code>, <code>initialize</code> and <code>tools/list</code> are always free.`
      }</p>
      <a class="btn btn-secondary" href="#connect">Connect a client</a>
    </div>
  </div>
</section>

<section class="section cta">
  <div class="container">
    <div class="section-head center">
      <span class="eyebrow">For humans</span>
      <h2>Not an agent?</h2>
      <p class="lead">The same scanner runs free from the CLI or as a zip upload on the main site, and if you want the findings fixed and the app on the stores, we ship it for you.</p>
    </div>
    <div class="cta-actions">
      <a class="btn btn-primary btn-lg" href="${SITE_URL}">Go to storelint.embracetech.org</a>
      <a class="text-link" href="${SITE_URL}/ship">Ship it for me ${ICON.arrow}</a>
    </div>
  </div>
</section>
</main>
<footer class="footer">
  <div class="container footer-inner">
    <div class="footer-brand">
      <span class="wordmark">${ICON.mark}<span>${esc(SITE_NAME)}</span></span>
      <span>MCP server. Uploads and clones are deleted after the scan.</span>
    </div>
    <nav class="footer-links" aria-label="Footer">
      <a href="${REPO_URL}" rel="noopener">GitHub</a>
      <a href="${SITE_URL}">storelint.embracetech.org</a>
      <a href="https://www.x402.org/" rel="noopener">x402</a>
      <a href="/health">Status</a>
    </nav>
  </div>
</footer>
<script>
(function () {
  document.querySelectorAll('[data-copy]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var text = btn.getAttribute('data-copy') || '';
      var done = function () { var old = btn.textContent; btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = old; }, 1500); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () {});
    });
  });
})();
</script>
</body>
</html>
`;
}
