import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { stubReport } from "../src/scanner.js";
import { buildZip, connectClient, flutterFixtureZip, postJsonRpc, startApp, testConfig, type Running } from "./helpers.js";

interface ToolResult {
  isError?: boolean;
  structuredContent?: unknown;
  content: Array<{ type: string; text?: string }>;
}

describe("storelint_scan tool (free mode)", () => {
  let app: Running;
  const seenDirs: string[] = [];
  before(async () => {
    app = await startApp(testConfig(), {
      // Use the stub report (what production falls back to) but record the project dir the scanner saw.
      scanDirectory: async (dir) => {
        seenDirs.push(dir);
        assert.ok(await fs.stat(path.join(dir, "pubspec.yaml")), "project root should be unwrapped");
        return stubReport(dir);
      },
    });
  });
  after(() => app.close());

  it("scans a tiny fixture zip and returns a Report", async () => {
    const client = await connectClient(app.url);
    try {
      const result = (await client.callTool({
        name: "storelint_scan",
        arguments: { zipBase64: flutterFixtureZip().toString("base64") },
      })) as ToolResult;
      assert.ok(!result.isError, JSON.stringify(result.content));
      const report = result.structuredContent as {
        schemaVersion: number;
        scannedAt: string;
        project: { path: string; framework: string; name: string };
        summary: { blocker: number; warning: number; info: number; score: number };
        findings: Array<{ id: string; severity: string; fix: string }>;
      };
      assert.equal(report.schemaVersion, 1);
      assert.ok(Date.parse(report.scannedAt) > 0);
      assert.equal(report.project.framework, "flutter");
      assert.equal(report.project.name, "my_app");
      assert.ok(Array.isArray(report.findings));
      assert.equal(typeof report.summary.score, "number");
      const parsed = JSON.parse(result.content[0].text ?? "{}");
      assert.equal(parsed.schemaVersion, 1);
      // the temp dir is removed after the scan
      assert.equal(seenDirs.length, 1);
      await assert.rejects(fs.stat(seenDirs[0]));
    } finally {
      await client.close();
    }
  });

  it("rejects a zip with path traversal", async () => {
    const zip = buildZip([{ name: "../evil.txt", data: "x" }]);
    const client = await connectClient(app.url);
    try {
      const result = (await client.callTool({ name: "storelint_scan", arguments: { zipBase64: zip.toString("base64") } })) as ToolResult;
      assert.equal(result.isError, true);
      assert.match(result.content[0].text ?? "", /Input error/);
    } finally {
      await client.close();
    }
  });

  it("rejects a zip containing a symlink", async () => {
    const zip = buildZip([
      { name: "app/pubspec.yaml", data: "name: x\nflutter:\n" },
      { name: "app/link", data: "/etc/passwd", symlink: true },
    ]);
    const client = await connectClient(app.url);
    try {
      const result = (await client.callTool({ name: "storelint_scan", arguments: { zipBase64: zip.toString("base64") } })) as ToolResult;
      assert.equal(result.isError, true);
      assert.match(result.content[0].text ?? "", /symlink/i);
    } finally {
      await client.close();
    }
  });

  it("rejects non-GitHub repo URLs and missing input", async () => {
    const client = await connectClient(app.url);
    try {
      const bad = (await client.callTool({ name: "storelint_scan", arguments: { repoUrl: "https://evil.example/owner/repo" } })) as ToolResult;
      assert.equal(bad.isError, true);
      const none = (await client.callTool({ name: "storelint_scan", arguments: {} })) as ToolResult;
      assert.equal(none.isError, true);
    } finally {
      await client.close();
    }
  });

  it("answers input failures as ordinary MCP tool errors (HTTP 200 + isError)", async () => {
    const zip = buildZip([{ name: "../evil.txt", data: "x" }]);
    const res = await postJsonRpc(app.url, {
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: { name: "storelint_scan", arguments: { zipBase64: zip.toString("base64") } },
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { result: ToolResult };
    assert.equal(body.result.isError, true);
  });
});
