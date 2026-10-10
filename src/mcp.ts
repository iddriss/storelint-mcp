import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { CHECKS } from "./checks.js";
import { InputError, type ScanInput } from "./inputs.js";
import type { Report } from "./scanner.js";

export const SCAN_TOOL = "storelint_scan";
export const CHECKS_TOOL = "storelint_checks";
export const SERVER_INFO = { name: "storelint-mcp", version: "0.1.0" } as const;

export interface McpDeps {
  scan(input: ScanInput): Promise<Report>;
  /** Human label for the price, e.g. "$0.05 USDC on Base" or "free". */
  priceLabel: string;
  /** Upper bound for a POST body (base64 zip + JSON-RPC envelope). */
  maxBodyBytes: number;
}

// Output schema kept loose on purpose: validation failures would turn a paid call into an error.
const findingSchema = z.looseObject({
  id: z.string(),
  platform: z.string(),
  severity: z.string(),
  title: z.string(),
  detail: z.string().optional(),
  file: z.string().optional(),
  line: z.number().optional(),
  fix: z.string().optional(),
  docs: z.string().optional(),
});

const reportShape = {
  schemaVersion: z.number(),
  scannedAt: z.string(),
  project: z.looseObject({ path: z.string(), framework: z.string(), name: z.string() }),
  summary: z.looseObject({ blocker: z.number(), warning: z.number(), info: z.number(), score: z.number() }),
  findings: z.array(findingSchema),
};

export function buildMcpServer(deps: McpDeps): McpServer {
  const server = new McpServer(SERVER_INFO, {
    instructions:
      `StoreLint scans Flutter, React Native and Expo projects for things that get apps rejected on Google Play and the Apple App Store. ` +
      `Call ${CHECKS_TOOL} (free) to see what is checked. Call ${SCAN_TOOL} (${deps.priceLabel}) with a zipBase64 or a public GitHub repoUrl to get the Report JSON.`,
  });

  server.registerTool(
    CHECKS_TOOL,
    {
      title: "StoreLint check catalogue",
      description:
        "Free. Lists every check StoreLint runs (id, platform, severity, what it catches) for Google Play and App Store readiness.",
      inputSchema: {},
      outputSchema: {
        checks: z.array(
          z.object({ id: z.string(), platform: z.string(), severity: z.string(), catches: z.string() }),
        ),
      },
    },
    async () => {
      const payload = { checks: CHECKS.map((c) => ({ ...c })) };
      return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }], structuredContent: payload };
    },
  );

  server.registerTool(
    SCAN_TOOL,
    {
      title: "StoreLint scan",
      description:
        `Scan a Flutter / React Native / Expo project for Google Play and App Store rejection risks and return the StoreLint Report JSON (schemaVersion 1: project, summary with score, findings with id/severity/fix). ` +
        `Price: ${deps.priceLabel}. Provide exactly one of zipBase64 (base64-encoded zip of the project source, max 50 MB) or repoUrl (public GitHub repository, shallow-cloned with a 60 s timeout and 200 MB cap).`,
      inputSchema: {
        zipBase64: z.string().optional().describe("Base64-encoded zip archive of the project source tree (max 50 MB decoded)."),
        repoUrl: z.string().optional().describe("Public GitHub repository URL, e.g. https://github.com/owner/repo"),
      },
      outputSchema: reportShape,
    },
    async ({ zipBase64, repoUrl }) => {
      try {
        const report = await deps.scan({ zipBase64, repoUrl });
        return {
          content: [{ type: "text", text: JSON.stringify(report, null, 2) }],
          structuredContent: report as unknown as Record<string, unknown>,
        };
      } catch (err) {
        if (err instanceof InputError) {
          return { isError: true, content: [{ type: "text", text: `Input error: ${err.message}` }] };
        }
        throw err;
      }
    },
  );

  return server;
}

/**
 * Stateless Streamable HTTP: a fresh McpServer + transport per request, no session ids,
 * JSON responses (no SSE) so the x402 middleware can settle after the handler returns.
 */
export async function handleMcpRequest(req: Request, deps: McpDeps): Promise<Response> {
  const server = buildMcpServer(deps);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
    maxRequestBodySize: deps.maxBodyBytes,
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(req);
  } finally {
    await transport.close().catch(() => undefined);
    await server.close().catch(() => undefined);
  }
}
