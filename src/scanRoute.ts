/**
 * Plain HTTP endpoint `POST /x402/scan`: the same scan as the `storelint_scan` MCP tool for agents
 * that pay plain x402 resources (Coinbase for Agents' `coinbase_x402_fetch`, `@x402/fetch`, curl).
 * Body: `{"repoUrl": "..."}` or `{"zipBase64": "..."}`. Response: the Report JSON.
 */
import type { Context } from "hono";
import { InputError, validateScanInput, type InputLimits, type ScanInput } from "./inputs.js";
import type { Report } from "./scanner.js";

export type ScanBody =
  /** No body at all: discovery probes and validators POST without one and expect the 402 challenge. */
  | { kind: "empty" }
  | { kind: "invalid"; status: 400 | 413; error: string }
  | { kind: "input"; input: ScanInput };

/**
 * Reads and validates the request body without touching the disk. Returned `invalid` bodies are
 * answered before any payment is requested; `input` bodies passed every pre-payment check.
 */
export async function readScanBody(req: Request, limits: InputLimits, maxBodyBytes: number): Promise<ScanBody> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBodyBytes) {
    return { kind: "invalid", status: 413, error: `body is ${declared} bytes; the limit is ${maxBodyBytes} bytes` };
  }
  const text = await req.text();
  if (text.length > maxBodyBytes) {
    return { kind: "invalid", status: 413, error: `body is larger than ${maxBodyBytes} bytes` };
  }
  if (text.trim() === "") return { kind: "empty" };
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return { kind: "invalid", status: 400, error: "body must be a JSON object with repoUrl or zipBase64" };
  }
  const invalid = await validateScanInput(body, limits);
  if (invalid) return { kind: "invalid", status: 400, error: invalid };
  const { repoUrl, zipBase64 } = body as ScanInput;
  return { kind: "input", input: { repoUrl, zipBase64 } };
}

export interface ScanRouteDeps {
  scan(input: ScanInput): Promise<Report>;
  limits: InputLimits;
  maxBodyBytes: number;
}

/** Hono handler for `POST /x402/scan`. Runs after the payment gate (if any). */
export function scanRouteHandler(deps: ScanRouteDeps) {
  return async (c: Context): Promise<Response> => {
    const parsed = await readScanBody(c.req.raw, deps.limits, deps.maxBodyBytes);
    if (parsed.kind === "empty") {
      return c.json({ error: "Provide a JSON body with repoUrl (public GitHub repository URL) or zipBase64 (base64 zip of the project)" }, 400);
    }
    if (parsed.kind === "invalid") return c.json({ error: parsed.error }, parsed.status);
    try {
      return c.json(await deps.scan(parsed.input), 200);
    } catch (err) {
      // Clone/extract failures after verification: a 4xx cancels settlement, so the caller is not charged.
      if (err instanceof InputError) return c.json({ error: err.message }, 422);
      throw err;
    }
  };
}
