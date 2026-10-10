import assert from "node:assert/strict";
import http from "node:http";
import { after, before, describe, it } from "node:test";
import { validateDiscoveryExtension, validateDiscoveryExtensionSpec, type DiscoveryExtension } from "@x402/extensions/bazaar";
import { SCAN_HTTP_DESCRIPTION, SCAN_HTTP_PATH, scanDiscoveryExtension } from "../src/discovery.js";
import { stubReport } from "../src/scanner.js";
import { buildZip, flutterFixtureZip, startApp, startMockFacilitator, testConfig, type Running } from "./helpers.js";

const PAY_TO = "0x1111111111111111111111111111111111111111";
const PUBLIC_URL = "https://storelint-mcp.example.test";

interface Challenge {
  x402Version: number;
  resource: { url: string; description?: string; mimeType?: string };
  accepts: Array<{ scheme: string; network: string; amount: string; payTo: string }>;
  extensions?: {
    bazaar?: {
      info: { input: Record<string, unknown>; output?: Record<string, unknown> };
      schema: { properties: { input: { properties: { body: { properties: Record<string, unknown> } }; required: string[] } } };
    };
  };
}

function decodeChallenge(res: Response): Challenge {
  const header = res.headers.get("payment-required");
  assert.ok(header, "PAYMENT-REQUIRED header missing");
  return JSON.parse(Buffer.from(header, "base64").toString("utf8")) as Challenge;
}

async function postScan(baseUrl: string, body: string | undefined, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(`${baseUrl}${SCAN_HTTP_PATH}`, {
    method: "POST",
    headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...headers },
    body,
  });
}

describe("POST /x402/scan (free mode)", () => {
  let app: Running;
  before(async () => {
    app = await startApp(testConfig(), { scanDirectory: (dir) => stubReport(dir) });
  });
  after(() => app.close());

  it("returns the Report JSON for a fixture zip", async () => {
    const res = await postScan(app.url, JSON.stringify({ zipBase64: flutterFixtureZip().toString("base64") }));
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /application\/json/);
    assert.equal(res.headers.get("payment-required"), null);
    const report = (await res.json()) as { schemaVersion: number; project: { framework: string; name: string }; summary: { score: number }; findings: unknown[] };
    assert.equal(report.schemaVersion, 1);
    assert.equal(report.project.framework, "flutter");
    assert.equal(report.project.name, "my_app");
    assert.equal(typeof report.summary.score, "number");
    assert.ok(Array.isArray(report.findings));
  });

  it("answers bad input with 400 and a JSON error", async () => {
    for (const body of ["", "not json", "{}", JSON.stringify({ repoUrl: "https://evil.example/o/r" }), JSON.stringify({ zipBase64: buildZip([{ name: "../x", data: "x" }]).toString("base64") })]) {
      const res = await postScan(app.url, body);
      assert.equal(res.status, 400, JSON.stringify(body).slice(0, 40));
      const json = (await res.json()) as { error: string };
      assert.equal(typeof json.error, "string");
    }
  });

  it("rejects oversized bodies with 413 from the content-length alone", async () => {
    // fetch() refuses to send a body shorter than content-length, so use a raw request that
    // declares 10 GB and only sends "{}": the server must answer from the header, before reading.
    const status = await new Promise<number>((resolve, reject) => {
      const { hostname, port } = new URL(app.url);
      const req = http.request(
        { hostname, port, method: "POST", path: SCAN_HTTP_PATH, headers: { "content-type": "application/json", "content-length": String(10 * 1024 ** 3) } },
        (res) => {
          res.resume();
          res.on("end", () => resolve(res.statusCode ?? 0));
        },
      );
      req.on("error", reject);
      req.write("{}");
    });
    assert.equal(status, 413);
  });

  it("GET is 405 with a usage hint", async () => {
    const res = await fetch(`${app.url}${SCAN_HTTP_PATH}`);
    assert.equal(res.status, 405);
    const json = (await res.json()) as { error: string };
    assert.match(json.error, /POST \/x402\/scan/);
  });
});

describe("POST /x402/scan (paid mode, mock facilitator)", () => {
  let facilitator: Running & { calls: string[] };
  let app: Running;
  let scans = 0;

  before(async () => {
    facilitator = await startMockFacilitator("eip155:8453");
    app = await startApp(testConfig({ payTo: PAY_TO, facilitatorUrl: facilitator.url, publicUrl: PUBLIC_URL }), {
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

  it("returns 402 with Bazaar discovery metadata for a valid body", async () => {
    const res = await postScan(app.url, JSON.stringify({ repoUrl: "https://github.com/acme/my_app" }));
    assert.equal(res.status, 402);
    const challenge = decodeChallenge(res);
    assert.equal(challenge.x402Version, 2);
    assert.equal(challenge.resource.url, `${PUBLIC_URL}${SCAN_HTTP_PATH}`);
    assert.equal(challenge.resource.description, SCAN_HTTP_DESCRIPTION);
    assert.ok(SCAN_HTTP_DESCRIPTION.length <= 500, "CDP rejects descriptions over 500 characters");
    assert.equal(challenge.resource.mimeType, "application/json");
    assert.equal(challenge.accepts[0].amount, "50000");
    assert.equal(challenge.accepts[0].payTo, PAY_TO);

    const bazaar = challenge.extensions?.bazaar;
    assert.ok(bazaar, "extensions.bazaar missing from the challenge");
    assert.equal(bazaar.info.input.type, "http");
    assert.equal(bazaar.info.input.method, "POST");
    assert.equal(bazaar.info.input.bodyType, "json");
    assert.deepEqual(bazaar.info.input.body, { repoUrl: "https://github.com/acme/my_app" });
    assert.equal(bazaar.info.output?.type, "json");
    assert.equal((bazaar.info.output?.example as { schemaVersion: number }).schemaVersion, 1);
    const inputSchema = bazaar.schema.properties.input;
    assert.ok("repoUrl" in inputSchema.properties.body.properties);
    assert.ok("zipBase64" in inputSchema.properties.body.properties);
    assert.ok(inputSchema.required.includes("method"));
    // what the facilitator checks before indexing: info validates against schema, and the spec rules
    assert.deepEqual(validateDiscoveryExtension(bazaar as unknown as DiscoveryExtension), { valid: true });
    assert.deepEqual(validateDiscoveryExtensionSpec(bazaar as unknown as Record<string, unknown>), { valid: true });

    assert.equal(scans, 0, "scanner ran without payment");
    assert.ok(!facilitator.calls.some((c) => /verify|settle/.test(c)));
  });

  it("the declaration validates before enrichment too", () => {
    const declared = scanDiscoveryExtension().bazaar as Record<string, unknown>;
    assert.deepEqual(validateDiscoveryExtensionSpec(declared), { valid: true });
  });

  it("returns 402 for an empty probe (discovery validators POST without a body)", async () => {
    const res = await postScan(app.url, undefined);
    assert.equal(res.status, 402);
    const challenge = decodeChallenge(res);
    assert.equal(challenge.extensions?.bazaar?.info.input.method, "POST");
  });

  it("rejects bad input with 4xx before any 402", async () => {
    const cases: Array<[string, number]> = [
      ["not json", 400],
      ["{}", 400],
      [JSON.stringify({ repoUrl: "https://evil.example/o/r" }), 400],
      [JSON.stringify({ repoUrl: "https://github.com/a/b", zipBase64: "QUJDRA==" }), 400],
      [JSON.stringify({ zipBase64: buildZip([{ name: "app/link", data: "/etc/passwd", symlink: true }]).toString("base64") }), 400],
    ];
    for (const [body, status] of cases) {
      const res = await postScan(app.url, body);
      assert.equal(res.status, status, body.slice(0, 40));
      assert.equal(res.headers.get("payment-required"), null, body.slice(0, 40));
    }
    assert.ok(!facilitator.calls.some((c) => /verify|settle/.test(c)));
    assert.equal(scans, 0);
  });

  it("keeps the MCP challenge on its public URL as well", async () => {
    const res = await fetch(`${app.url}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "storelint_scan", arguments: { repoUrl: "https://github.com/a/b" } } }),
    });
    assert.equal(res.status, 402);
    const challenge = decodeChallenge(res);
    assert.equal(challenge.resource.url, `${PUBLIC_URL}/mcp`);
    assert.equal(challenge.extensions?.bazaar, undefined);
  });
});
