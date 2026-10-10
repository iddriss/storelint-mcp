import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { isPaidToolCall } from "../src/payment.js";
import { buildZip, flutterFixtureZip, postJsonRpc, startApp, startMockFacilitator, testConfig, type Running } from "./helpers.js";

const PAY_TO = "0x1111111111111111111111111111111111111111";
const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

describe("x402 payment gate", () => {
  let facilitator: Running & { calls: string[] };
  let app: Running;
  let scans = 0;

  before(async () => {
    facilitator = await startMockFacilitator("eip155:8453");
    app = await startApp(testConfig({ payTo: PAY_TO, facilitatorUrl: facilitator.url }), {
      scanDirectory: async () => {
        scans += 1;
        throw new Error("scanner must not run without payment");
      },
    });
  });
  after(async () => {
    await app.close();
    await facilitator.close();
  });

  it("returns 402 with a PAYMENT-REQUIRED challenge when storelint_scan is called without payment", async () => {
    const res = await postJsonRpc(app.url, {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "storelint_scan", arguments: { zipBase64: flutterFixtureZip().toString("base64") } },
    });
    assert.equal(res.status, 402);
    const header = res.headers.get("payment-required");
    assert.ok(header, "PAYMENT-REQUIRED header missing");
    const challenge = JSON.parse(Buffer.from(header, "base64").toString("utf8")) as {
      x402Version: number;
      accepts: Array<{ scheme: string; network: string; amount: string; asset: string; payTo: string }>;
    };
    assert.equal(challenge.x402Version, 2);
    assert.equal(challenge.accepts.length, 1);
    assert.equal(challenge.accepts[0].scheme, "exact");
    assert.equal(challenge.accepts[0].network, "eip155:8453");
    assert.equal(challenge.accepts[0].amount, "50000"); // $0.05 in 6-decimal USDC
    assert.equal(challenge.accepts[0].asset.toLowerCase(), BASE_USDC.toLowerCase());
    assert.equal(challenge.accepts[0].payTo, PAY_TO);
    assert.equal(scans, 0, "scanner ran without payment");
    // only the startup /supported sync hit the facilitator; no verify/settle without a payment header
    assert.ok(facilitator.calls.includes("GET /supported"));
    assert.ok(!facilitator.calls.some((c) => /verify|settle/.test(c)));
  });

  it("leaves the free tool and protocol methods unpaid", async () => {
    const list = await postJsonRpc(app.url, { jsonrpc: "2.0", id: 2, method: "tools/list" });
    assert.equal(list.status, 200);
    const checks = await postJsonRpc(app.url, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "storelint_checks", arguments: {} },
    });
    assert.equal(checks.status, 200);
    const body = (await checks.json()) as { result: { structuredContent: { checks: unknown[] } } };
    assert.ok(body.result.structuredContent.checks.length > 10);
  });

  it("does not charge for invalid scan calls: missing input, bad URL, unsafe zip", async () => {
    const cases = [
      {},
      { repoUrl: "https://evil.example/owner/repo" },
      { zipBase64: buildZip([{ name: "../evil.txt", data: "x" }]).toString("base64") },
      { zipBase64: buildZip([{ name: "app/link", data: "/etc/passwd", symlink: true }]).toString("base64") },
    ];
    for (const args of cases) {
      const res = await postJsonRpc(app.url, { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "storelint_scan", arguments: args } });
      assert.equal(res.status, 200, JSON.stringify(args).slice(0, 60));
      assert.equal(res.headers.get("payment-required"), null);
      const body = (await res.json()) as { result: { isError: boolean } };
      assert.equal(body.result.isError, true);
    }
  });

  it("isPaidToolCall only matches valid storelint_scan calls", async () => {
    const limits = testConfig();
    const valid = { method: "tools/call", params: { name: "storelint_scan", arguments: { repoUrl: "https://github.com/a/b" } } };
    assert.equal(await isPaidToolCall(valid, limits), true);
    assert.equal(await isPaidToolCall({ method: "tools/call", params: { name: "storelint_checks", arguments: {} } }, limits), false);
    assert.equal(await isPaidToolCall({ method: "tools/list" }, limits), false);
    assert.equal(await isPaidToolCall([{ method: "initialize" }, valid], limits), true);
    assert.equal(await isPaidToolCall("nope", limits), false);
    const zipCall = { method: "tools/call", params: { name: "storelint_scan", arguments: { zipBase64: flutterFixtureZip().toString("base64") } } };
    assert.equal(await isPaidToolCall(zipCall, limits), true);
  });
});

describe("free mode", () => {
  it("runs storelint_scan without payment when X402_PAY_TO is unset", async () => {
    const app = await startApp(testConfig(), {
      scanDirectory: async () => ({
        schemaVersion: 1,
        scannedAt: new Date().toISOString(),
        project: { path: ".", framework: "flutter", name: "x" },
        summary: { blocker: 0, warning: 0, info: 0, score: 100 },
        findings: [],
      }),
    });
    try {
      const res = await postJsonRpc(app.url, {
        jsonrpc: "2.0",
        id: 5,
        method: "tools/call",
        params: { name: "storelint_scan", arguments: { zipBase64: flutterFixtureZip().toString("base64") } },
      });
      assert.equal(res.status, 200);
      assert.equal(res.headers.get("payment-required"), null);
      const body = (await res.json()) as { result: { structuredContent: { summary: { score: number } } } };
      assert.equal(body.result.structuredContent.summary.score, 100);
    } finally {
      await app.close();
    }
  });
});
