import { promises as fs } from "node:fs";
import path from "node:path";

/** Report JSON contract from docs/STORELINT-SPEC.md. */
export interface Finding {
  id: string;
  platform: "android" | "ios" | "both";
  severity: "blocker" | "warning" | "info";
  title: string;
  detail: string;
  file?: string;
  line?: number;
  fix: string;
  docs?: string;
}

export type Framework = "flutter" | "react-native" | "expo" | "unknown";

export interface Report {
  schemaVersion: 1;
  scannedAt: string;
  project: { path: string; framework: Framework; name: string };
  summary: { blocker: number; warning: number; info: number; score: number };
  findings: Finding[];
}

export type ScanFn = (projectPath: string) => Promise<Report>;

let scannerPromise: Promise<ScanFn | null> | undefined;

/**
 * Loads `scan()` from the `storelint` package (optional dependency `github:iddriss/storelint`).
 * Resolves to null when the package is not installed so the server keeps running with stub reports.
 */
export function loadScanner(): Promise<ScanFn | null> {
  scannerPromise ??= (async () => {
    // Kept as a variable so TypeScript does not try to resolve a package that may be absent.
    const moduleName = "storelint";
    try {
      const mod = (await import(moduleName)) as { scan?: unknown; default?: { scan?: unknown } };
      const scan = mod.scan ?? mod.default?.scan;
      if (typeof scan !== "function") throw new Error("package does not export scan()");
      return scan as ScanFn;
    } catch (err) {
      console.warn(`[storelint-mcp] storelint scanner unavailable, serving stub reports: ${(err as Error).message}`);
      return null;
    }
  })();
  return scannerPromise;
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function readText(p: string): Promise<string | undefined> {
  try {
    return await fs.readFile(p, "utf8");
  } catch {
    return undefined;
  }
}

/** Project detection rules from the spec (used only by the stub report). */
export async function detectProject(dir: string): Promise<{ framework: Framework; name: string }> {
  const fallbackName = path.basename(dir);
  const pubspec = await readText(path.join(dir, "pubspec.yaml"));
  if (pubspec && /^flutter:/m.test(pubspec)) {
    const name = /^name:\s*["']?([\w.-]+)/m.exec(pubspec)?.[1] ?? fallbackName;
    return { framework: "flutter", name };
  }
  const appJson = await readText(path.join(dir, "app.json"));
  const hasAppConfig = (await exists(path.join(dir, "app.config.js"))) || (await exists(path.join(dir, "app.config.ts")));
  const pkgText = await readText(path.join(dir, "package.json"));
  let pkg: { name?: string; dependencies?: Record<string, string>; devDependencies?: Record<string, string> } = {};
  try {
    if (pkgText) pkg = JSON.parse(pkgText);
  } catch {
    pkg = {};
  }
  if ((appJson && appJson.includes('"expo"')) || hasAppConfig) {
    let name = pkg.name;
    try {
      name = (appJson ? JSON.parse(appJson)?.expo?.name : undefined) ?? name;
    } catch {
      /* ignore malformed app.json */
    }
    return { framework: "expo", name: name ?? fallbackName };
  }
  if (pkg.dependencies?.["react-native"] || pkg.devDependencies?.["react-native"]) {
    return { framework: "react-native", name: pkg.name ?? fallbackName };
  }
  return { framework: "unknown", name: pkg.name ?? fallbackName };
}

export function summarize(findings: Finding[]): Report["summary"] {
  const blocker = findings.filter((f) => f.severity === "blocker").length;
  const warning = findings.filter((f) => f.severity === "warning").length;
  const info = findings.filter((f) => f.severity === "info").length;
  return { blocker, warning, info, score: Math.max(0, 100 - 25 * blocker - 5 * warning) };
}

/** Report returned when the real scanner is not installed. */
export async function stubReport(dir: string): Promise<Report> {
  const project = await detectProject(dir);
  const findings: Finding[] = [
    {
      id: "app.scanner-unavailable",
      platform: "both",
      severity: "info",
      title: "scanner unavailable",
      detail:
        "The StoreLint scanner package is not installed on this server, so no checks were run. Project detection still ran.",
      fix: "Install the `storelint` package on the server (dependency github:iddriss/storelint) and redeploy.",
      docs: "https://storelint.embracetech.org",
    },
  ];
  return {
    schemaVersion: 1,
    scannedAt: new Date().toISOString(),
    project: { path: ".", ...project },
    summary: summarize(findings),
    findings,
  };
}

export async function runScan(dir: string): Promise<Report> {
  const scan = await loadScanner();
  return scan ? scan(dir) : stubReport(dir);
}
