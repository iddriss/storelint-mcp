import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { CHECKS } from "../src/checks.js";
import { connectClient, startApp, testConfig, type Running } from "./helpers.js";

describe("storelint_checks tool", () => {
  let app: Running;
  before(async () => {
    app = await startApp(testConfig());
  });
  after(() => app.close());

  it("is listed next to storelint_scan", async () => {
    const client = await connectClient(app.url);
    try {
      const { tools } = await client.listTools();
      const names = tools.map((t) => t.name).sort();
      assert.deepEqual(names, ["storelint_checks", "storelint_scan"]);
      const scan = tools.find((t) => t.name === "storelint_scan");
      assert.ok(scan?.inputSchema && JSON.stringify(scan.inputSchema).includes("zipBase64"));
    } finally {
      await client.close();
    }
  });

  it("returns every check id from the spec with its severity and description", async () => {
    const client = await connectClient(app.url);
    try {
      const result = await client.callTool({ name: "storelint_checks", arguments: {} });
      const structured = result.structuredContent as { checks: Array<{ id: string; severity: string; catches: string }> };
      const ids = structured.checks.map((c) => c.id);
      assert.equal(ids.length, CHECKS.length);
      for (const expected of ["android.target-sdk", "android.page-size-16kb", "ios.privacy-manifest", "ios.usage-descriptions", "app.secrets", "app.expo"]) {
        assert.ok(ids.includes(expected), `missing ${expected}`);
      }
      assert.ok(structured.checks.every((c) => ["blocker", "warning", "info"].includes(c.severity) && c.catches.length > 0));
      const text = (result.content as Array<{ type: string; text?: string }>)[0];
      assert.equal(text.type, "text");
      assert.ok(text.text?.includes("android.target-sdk"));
    } finally {
      await client.close();
    }
  });
});
