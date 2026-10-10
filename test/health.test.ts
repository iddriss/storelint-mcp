import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startApp, testConfig, type Running } from "./helpers.js";

describe("http basics", () => {
  let app: Running;
  before(async () => {
    app = await startApp(testConfig({ publicUrl: "https://example.test" }));
  });
  after(() => app.close());

  it("GET /health returns {ok:true}", async () => {
    const res = await fetch(`${app.url}/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
  });

  it("GET / is an HTML page describing the tool, price and MCP URL", async () => {
    const res = await fetch(`${app.url}/`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /text\/html/);
    const html = await res.text();
    assert.match(html, /storelint_scan/);
    assert.match(html, /storelint_checks/);
    assert.match(html, /\$0\.05/);
    assert.match(html, /https:\/\/example\.test\/mcp/);
    assert.match(html, /https:\/\/storelint\.embracetech\.org/);
    // plain HTTP twin of the paid tool, and the Coinbase MCP route to pay for it
    assert.match(html, /POST https:\/\/example\.test\/x402\/scan/);
    assert.match(html, /coinbase_x402_fetch/);
    assert.match(html, /agents\.coinbase\.com\/mcp/);
  });

  it("GET /mcp is rejected: the server is stateless", async () => {
    const res = await fetch(`${app.url}/mcp`);
    assert.equal(res.status, 405);
  });
});
