#!/usr/bin/env node
/**
 * Preflight the StoreLint x402 resources against Coinbase's public (key-less) Bazaar validator and
 * print the result. Read-only: the validator makes no payment and does not index anything.
 *
 *   node scripts/validate-listing.mjs                       # both default resources
 *   node scripts/validate-listing.mjs https://host/x402/scan  # one or more resource URLs
 *
 * Exit code 0 when every resource is `valid: true`, 1 otherwise.
 * Docs: https://docs.cdp.coinbase.com/x402/seller/get-discovered and
 *       https://docs.cdp.coinbase.com/api-reference/v2/rest-api/x402-facilitator/validate-x402-endpoint
 */

const VALIDATE_URL = "https://api.cdp.coinbase.com/platform/v2/x402/validate";
const SEARCH_URL = "https://api.cdp.coinbase.com/platform/v2/x402/discovery/search";
const DEFAULT_BASE = "https://storelint-mcp.embracetech.org";
const DEFAULT_RESOURCES = [`${DEFAULT_BASE}/mcp`, `${DEFAULT_BASE}/x402/scan`];

const resources = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_RESOURCES;

async function validate(resource) {
  const res = await fetch(VALIDATE_URL, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ resource, method: "POST" }),
    signal: AbortSignal.timeout(60_000),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`validate returned HTTP ${res.status} with a non-JSON body: ${text.slice(0, 300)}`);
  }
  if (!res.ok) throw new Error(`validate returned HTTP ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

async function searchListing(resource) {
  const { host } = new URL(resource);
  const url = `${SEARCH_URL}?${new URLSearchParams({ urlSubstring: host, limit: "20" })}`;
  const res = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) return { error: `search returned HTTP ${res.status}` };
  const json = await res.json();
  return json.resources?.filter((r) => r.resource === resource) ?? [];
}

function summarizeBazaar(ext) {
  if (!ext) return "none";
  const input = ext.info?.input ?? {};
  if (input.type === "mcp") {
    return `mcp tool "${input.toolName}", args ${Object.keys(input.inputSchema?.properties ?? {}).join("|") || "?"}, output ${ext.info?.output?.type ?? "text"}`;
  }
  const body = input.body ? Object.keys(input.body).join("|") : "-";
  return `${input.type ?? "?"} ${input.method ?? "?"} bodyType=${input.bodyType ?? "-"} body=${body}, output ${ext.info?.output?.type ?? "-"}`;
}

let allValid = true;
for (const resource of resources) {
  console.log(`\n== ${resource}`);
  let result;
  try {
    result = await validate(resource);
  } catch (err) {
    allValid = false;
    console.log(`   ERROR ${err.message}`);
    continue;
  }
  const { valid, statusCode, x402Version, preflight = [], simulation, bazaarExtension, index, paymentRequirements } = result;
  console.log(`   valid: ${valid}   status: ${statusCode ?? "unreachable"}   x402Version: ${x402Version ?? "?"}`);
  for (const check of preflight) {
    const mark = check.passed ? "pass" : check.severity === "required" ? "FAIL" : "warn";
    const diff = check.expected !== undefined || check.actual !== undefined ? ` (expected ${check.expected ?? "-"}, actual ${check.actual ?? "-"})` : "";
    console.log(`   [${mark}] ${check.check}: ${check.detail ?? ""}${diff}`);
  }
  if (simulation) {
    console.log(`   simulation: ${simulation.outcome}${simulation.rejectionReason ? ` (${simulation.rejectionReason})` : ""}`);
  }
  if (paymentRequirements) {
    const accepts = paymentRequirements.accepts ?? [paymentRequirements];
    for (const a of accepts) {
      console.log(`   accepts: ${a.scheme} ${a.network} amount=${a.amount ?? a.maxAmountRequired} payTo=${a.payTo}`);
    }
    const r = paymentRequirements.resource;
    if (r && typeof r === "object") {
      console.log(`   resource: ${r.url}  mimeType=${r.mimeType ?? "-"}  serviceName=${r.serviceName ?? "-"}  tags=${(r.tags ?? []).join(",") || "-"}`);
      if (r.description) console.log(`   description (${r.description.length} chars): ${r.description.slice(0, 120)}${r.description.length > 120 ? "..." : ""}`);
    }
  }
  console.log(`   bazaar: ${summarizeBazaar(bazaarExtension)}`);
  if (index) {
    console.log(`   index: active=${index.active} lastCrawledAt=${index.lastCrawledAt ?? "-"}`);
    if (index.quality) {
      const q = index.quality;
      console.log(`   quality (30 d): calls=${q.l30DaysTotalCalls ?? 0} uniquePayers=${q.l30DaysUniquePayers ?? 0} lastCalledAt=${q.lastCalledAt ?? "-"}`);
    }
  } else {
    console.log("   index: not indexed yet (needs one settled payment through the CDP facilitator)");
  }
  try {
    const listed = await searchListing(resource);
    if (Array.isArray(listed)) {
      console.log(`   discovery/search: ${listed.length ? listed.map((r) => `${r.type} ${JSON.stringify(r.quality ?? {})}`).join("; ") : "not listed"}`);
    } else {
      console.log(`   discovery/search: ${listed.error}`);
    }
  } catch (err) {
    console.log(`   discovery/search: ${err.message}`);
  }
  if (!valid) allValid = false;
}

console.log(allValid ? "\nAll resources valid." : "\nAt least one resource is not valid yet.");
process.exit(allValid ? 0 : 1);
