/**
 * x402 Bazaar discovery metadata for both paid routes: the MCP tool `storelint_scan` on
 * `POST /mcp` (Bazaar resource type "mcp") and its plain HTTP twin `POST /x402/scan` (type "http").
 *
 * The CDP facilitator indexes a resource after it settles a payment whose 402 challenge carried
 * `extensions.bazaar` (docs/RESEARCH.md, "Discovery / Bazaar"). `declareDiscoveryExtension`
 * (@x402/extensions/bazaar) builds that block; `@x402/hono` registers the server extension on its
 * own when a route declares it. The facilitator validates `info` against `schema`, so the example
 * input below must satisfy SCAN_INPUT_SCHEMA and the example report SCAN_OUTPUT_SCHEMA.
 */
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";
import { SCAN_TOOL } from "./mcp.js";
import type { Report } from "./scanner.js";

/** Plain HTTP twin of the `storelint_scan` MCP tool; same input, same Report, same price. */
export const SCAN_HTTP_PATH = "/x402/scan";

/**
 * Route description for `POST /mcp` (the 402's `resource.description`). Under the CDP facilitator's
 * 500-character limit; natural language, since the Bazaar scores bare names as zero.
 */
export const SCAN_MCP_DESCRIPTION =
  `StoreLint MCP server (Streamable HTTP). Paid tool ${SCAN_TOOL}: checks a Flutter, React Native or Expo project ` +
  "for Google Play and App Store rejection risks (target SDK, 16 KB page size, privacy manifest, usage descriptions, " +
  "debug signing, leaked secrets, placeholder ids, icons) and returns a Report JSON with a score and findings " +
  "(severity, file, fix). Arguments: exactly one of repoUrl (public GitHub repo) or zipBase64 (base64 zip, " +
  "max 50 MB). tools/list and storelint_checks are free.";

/** Bazaar `serviceName` (printable ASCII, max 32) and `tags` (max 5) shared by both paid routes. */
export const SERVICE_NAME = "StoreLint";
export const SERVICE_TAGS = ["mobile", "app-store", "google-play", "flutter", "react-native"];

/** Kept under the CDP facilitator's 500-character limit for route descriptions. */
export const SCAN_HTTP_DESCRIPTION =
  "StoreLint scan: checks a Flutter, React Native or Expo project for Google Play and Apple App Store " +
  "rejection risks (target SDK, 16 KB page size, privacy manifest, usage descriptions, debug signing, " +
  "leaked secrets, placeholder ids, icons) and returns a Report JSON with a score and findings that " +
  "each carry a severity, file and fix. POST JSON with exactly one of repoUrl (public GitHub repository) " +
  "or zipBase64 (base64 zip of the project source, max 50 MB).";

export const SCAN_INPUT_SCHEMA = {
  type: "object",
  description: "Provide exactly one of repoUrl or zipBase64.",
  properties: {
    repoUrl: {
      type: "string",
      description: "Public GitHub repository URL, e.g. https://github.com/owner/repo (shallow clone, 60 s timeout, 200 MB cap).",
    },
    zipBase64: {
      type: "string",
      description: "Base64-encoded zip archive of the project source tree (max 50 MB decoded, no symlinks).",
    },
  },
  oneOf: [{ required: ["repoUrl"] }, { required: ["zipBase64"] }],
  additionalProperties: false,
} as const;

export const SCAN_INPUT_EXAMPLE = { repoUrl: "https://github.com/acme/my_app" };

const findingSchema = {
  type: "object",
  properties: {
    id: { type: "string", description: "Check id, e.g. android.target-sdk" },
    platform: { type: "string", enum: ["android", "ios", "both"] },
    severity: { type: "string", enum: ["blocker", "warning", "info"] },
    title: { type: "string" },
    detail: { type: "string" },
    file: { type: "string" },
    line: { type: "integer" },
    fix: { type: "string" },
    docs: { type: "string" },
  },
  required: ["id", "platform", "severity", "title", "fix"],
} as const;

/** StoreLint Report JSON, schemaVersion 1 (mirrors the MCP tool's outputSchema). */
export const SCAN_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    schemaVersion: { type: "integer", const: 1 },
    scannedAt: { type: "string", description: "ISO 8601 timestamp" },
    project: {
      type: "object",
      properties: {
        path: { type: "string" },
        framework: { type: "string", enum: ["flutter", "react-native", "expo", "unknown"] },
        name: { type: "string" },
      },
      required: ["path", "framework", "name"],
    },
    summary: {
      type: "object",
      description: "score = 100 - 25 per blocker - 5 per warning, floored at 0",
      properties: {
        blocker: { type: "integer" },
        warning: { type: "integer" },
        info: { type: "integer" },
        score: { type: "integer" },
      },
      required: ["blocker", "warning", "info", "score"],
    },
    findings: { type: "array", items: findingSchema },
  },
  required: ["schemaVersion", "scannedAt", "project", "summary", "findings"],
} as const;

export const SCAN_OUTPUT_EXAMPLE: Report = {
  schemaVersion: 1,
  scannedAt: "2026-10-10T09:12:44.000Z",
  project: { path: ".", framework: "flutter", name: "my_app" },
  summary: { blocker: 1, warning: 1, info: 0, score: 70 },
  findings: [
    {
      id: "android.target-sdk",
      platform: "android",
      severity: "blocker",
      title: "targetSdk is 33; Google Play requires 35",
      detail: "android/app/build.gradle sets targetSdk 33.",
      file: "android/app/build.gradle",
      line: 24,
      fix: "Set targetSdk = 35 and compileSdk = 35.",
      docs: "https://storelint.embracetech.org/#checks",
    },
    {
      id: "ios.ats",
      platform: "ios",
      severity: "warning",
      title: "NSAllowsArbitraryLoads is enabled",
      detail: "ios/Runner/Info.plist disables App Transport Security for every host.",
      file: "ios/Runner/Info.plist",
      fix: "Remove NSAllowsArbitraryLoads or scope exceptions to specific domains.",
    },
  ],
};

/**
 * `extensions` value for the `POST /x402/scan` route config. The HTTP method is not passed here:
 * the Bazaar server extension fills it in from the request at 402 time.
 */
export function scanDiscoveryExtension(): Record<string, unknown> {
  return declareDiscoveryExtension({
    bodyType: "json",
    input: SCAN_INPUT_EXAMPLE,
    inputSchema: SCAN_INPUT_SCHEMA as unknown as Record<string, unknown>,
    output: {
      example: SCAN_OUTPUT_EXAMPLE,
      schema: SCAN_OUTPUT_SCHEMA as unknown as Record<string, unknown>,
    },
  });
}

/**
 * `extensions` value for the `POST /mcp` route config: the Bazaar "mcp" resource type, catalogued by
 * (resource.url, toolName). `inputSchema` is the tool's `tools/call` arguments schema (repoUrl or
 * zipBase64), `example` a valid arguments object, `output` the Report. The server extension passes
 * MCP declarations through unchanged (no HTTP method is added).
 */
export function mcpDiscoveryExtension(): Record<string, unknown> {
  return declareDiscoveryExtension({
    toolName: SCAN_TOOL,
    description: SCAN_MCP_DESCRIPTION,
    transport: "streamable-http",
    inputSchema: SCAN_INPUT_SCHEMA as unknown as Record<string, unknown>,
    example: SCAN_INPUT_EXAMPLE,
    output: {
      example: SCAN_OUTPUT_EXAMPLE,
      schema: SCAN_OUTPUT_SCHEMA as unknown as Record<string, unknown>,
    },
  });
}
