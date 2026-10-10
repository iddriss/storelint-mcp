import http from "node:http";
import type { AddressInfo } from "node:net";
import { crc32 } from "node:zlib";
import { serve } from "@hono/node-server";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createApp, type AppOverrides } from "../src/app.js";
import type { AppConfig } from "../src/config.js";

export interface Running {
  url: string;
  close(): Promise<void>;
}

export function testConfig(over: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 0,
    price: "$0.05",
    network: "eip155:8453",
    facilitatorUrl: "http://127.0.0.1:9/unused",
    cloneTimeoutMs: 60_000,
    maxRepoBytes: 200 * 1024 * 1024,
    maxZipBytes: 50 * 1024 * 1024,
    maxExtractBytes: 200 * 1024 * 1024,
    ...over,
  };
}

export async function startApp(cfg: AppConfig, overrides: AppOverrides = {}): Promise<Running> {
  const app = createApp(cfg, overrides);
  return new Promise((resolve) => {
    const server = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" }, (info) => {
      resolve({
        url: `http://127.0.0.1:${info.port}`,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}

/** Minimal x402 v2 facilitator mock: answers /supported; records any verify/settle attempts. */
export async function startMockFacilitator(network = "eip155:8453"): Promise<Running & { calls: string[] }> {
  const calls: string[] = [];
  const server = http.createServer((req, res) => {
    calls.push(`${req.method} ${req.url}`);
    res.setHeader("content-type", "application/json");
    if (req.method === "GET" && req.url === "/supported") {
      res.end(
        JSON.stringify({
          kinds: [{ x402Version: 2, scheme: "exact", network }],
          extensions: [],
          signers: { "eip155:*": ["0x0000000000000000000000000000000000000001"] },
        }),
      );
      return;
    }
    res.statusCode = 500;
    res.end(JSON.stringify({ error: "mock facilitator: not implemented" }));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    calls,
    close: () => new Promise<void>((done) => server.close(() => done())),
  };
}

export async function connectClient(baseUrl: string): Promise<Client> {
  const client = new Client({ name: "storelint-mcp-test", version: "0.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`)));
  return client;
}

export interface ZipEntry {
  name: string;
  data?: string | Buffer;
  symlink?: boolean;
}

/** Builds a "stored" (uncompressed) zip in memory; enough for fixtures and for traversal/symlink cases. */
export function buildZip(entries: ZipEntry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data ?? "", "utf8");
    const crc = crc32(data) >>> 0;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(0, 8); // method: stored
    local.writeUInt16LE(0, 10); // time
    local.writeUInt16LE(0x21, 12); // date (1980-01-01)
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE((3 << 8) | 20, 4); // made by: unix
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    const mode = entry.symlink ? 0o120777 : entry.name.endsWith("/") ? 0o040755 : 0o100644;
    central.writeUInt32LE((mode << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);

    locals.push(local, name, data);
    centrals.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const centralDir = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, centralDir, eocd]);
}

/** A tiny Flutter project with one obvious blocker (com.example application id). */
export function flutterFixtureZip(): Buffer {
  return buildZip([
    { name: "my_app/" },
    { name: "my_app/pubspec.yaml", data: "name: my_app\nversion: 1.0.0+1\nenvironment:\n  sdk: '>=3.0.0 <4.0.0'\nflutter:\n  uses-material-design: true\n" },
    { name: "my_app/android/app/build.gradle", data: "android {\n  namespace 'com.example.my_app'\n  compileSdk 33\n  defaultConfig {\n    applicationId 'com.example.my_app'\n    minSdk 19\n    targetSdk 33\n  }\n  buildTypes { release { signingConfig signingConfigs.debug } }\n}\n" },
    { name: "my_app/ios/Runner/Info.plist", data: "<plist><dict><key>CFBundleIdentifier</key><string>com.example.myApp</string></dict></plist>\n" },
  ]);
}

export async function postJsonRpc(baseUrl: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers },
    body: JSON.stringify(body),
  });
}
