import { createWriteStream, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import yauzl from "yauzl";

/** A problem with the caller's input (bad zip, bad URL, clone failure). Never charged. */
export class InputError extends Error {
  override name = "InputError";
}

export interface InputLimits {
  maxZipBytes: number;
  maxExtractBytes: number;
  maxRepoBytes: number;
  cloneTimeoutMs: number;
}

export interface ScanInput {
  zipBase64?: string;
  repoUrl?: string;
}

export interface Materialized {
  /** Directory containing the project root. */
  dir: string;
  cleanup(): Promise<void>;
}

const MAX_ZIP_ENTRIES = 20_000;
const GITHUB_REPO_RE = /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/;
const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/;

/** Cheap, pre-payment validation of tool arguments. Returns an error message or null. */
export function validateScanArgs(args: unknown): string | null {
  if (typeof args !== "object" || args === null) return "arguments must be an object";
  const { zipBase64, repoUrl } = args as Record<string, unknown>;
  const hasZip = typeof zipBase64 === "string" && zipBase64.length > 0;
  const hasRepo = typeof repoUrl === "string" && repoUrl.length > 0;
  if (hasZip && hasRepo) return "Provide either zipBase64 or repoUrl, not both";
  if (!hasZip && !hasRepo) return "Provide zipBase64 (base64-encoded zip of the project) or repoUrl (public GitHub repository URL)";
  if (hasRepo && !GITHUB_REPO_RE.test((repoUrl as string).trim())) {
    return "repoUrl must be a public GitHub repository URL like https://github.com/owner/repo";
  }
  if (hasZip) {
    const cleaned = (zipBase64 as string).replace(/\s+/g, "");
    if (!BASE64_RE.test(cleaned)) return "zipBase64 is not valid base64";
    if (cleaned.length < 32) return "zipBase64 is too small to be a zip archive";
  }
  return null;
}

/**
 * Full pre-payment validation: cheap argument checks plus a structural inspection of the zip
 * (entry names, symlink bits, declared sizes) without writing anything to disk.
 * Everything this rejects is answered as an MCP tool error without charging the caller.
 */
export async function validateScanInput(args: unknown, limits: InputLimits): Promise<string | null> {
  const basic = validateScanArgs(args);
  if (basic) return basic;
  const { zipBase64 } = args as { zipBase64?: string };
  if (zipBase64) return inspectZipBase64(zipBase64, limits);
  return null;
}

export async function materializeInput(input: ScanInput, limits: InputLimits): Promise<Materialized> {
  const invalid = await validateScanInput(input, limits);
  if (invalid) throw new InputError(invalid);

  const root = await fs.mkdtemp(path.join(os.tmpdir(), "storelint-mcp-"));
  const cleanup = async () => {
    await fs.rm(root, { recursive: true, force: true });
  };
  try {
    const projectDir = path.join(root, "project");
    await fs.mkdir(projectDir);
    if (input.zipBase64) {
      await extractZipBase64(input.zipBase64, path.join(root, "upload.zip"), projectDir, limits);
    } else {
      await shallowClone(input.repoUrl as string, projectDir, limits);
    }
    return { dir: await unwrapSingleDirectory(projectDir), cleanup };
  } catch (err) {
    await cleanup();
    throw err;
  }
}

// ---------------------------------------------------------------------------
// zip
// ---------------------------------------------------------------------------

function decodeZipBase64(zipBase64: string, limits: InputLimits): Buffer {
  const cleaned = zipBase64.replace(/\s+/g, "");
  const approxBytes = Math.floor((cleaned.length * 3) / 4);
  if (approxBytes > limits.maxZipBytes) {
    throw new InputError(`zip is about ${approxBytes} bytes; the limit is ${limits.maxZipBytes} bytes`);
  }
  const buf = Buffer.from(cleaned, "base64");
  if (buf.length < 22) throw new InputError("zip is empty or truncated");
  return buf;
}

async function extractZipBase64(zipBase64: string, zipPath: string, dest: string, limits: InputLimits): Promise<void> {
  const buf = decodeZipBase64(zipBase64, limits);
  await fs.writeFile(zipPath, buf);
  await extractZip(zipPath, dest, limits.maxExtractBytes);
}

/** Inspects a base64 zip's central directory without extracting. Returns an error message or null. */
export async function inspectZipBase64(zipBase64: string, limits: InputLimits): Promise<string | null> {
  try {
    const buf = decodeZipBase64(zipBase64, limits);
    await inspectZipBuffer(buf, limits.maxExtractBytes);
    return null;
  } catch (err) {
    return err instanceof InputError ? err.message : `invalid zip: ${(err as Error).message}`;
  }
}

async function inspectZipBuffer(buf: Buffer, maxExtractBytes: number): Promise<void> {
  const zipfile = await new Promise<yauzl.ZipFile>((resolve, reject) => {
    yauzl.fromBuffer(buf, { lazyEntries: true }, (err, zf) => {
      if (err || !zf) reject(new InputError(`invalid zip: ${err?.message ?? "unreadable"}`));
      else resolve(zf);
    });
  });
  if (zipfile.entryCount > MAX_ZIP_ENTRIES) {
    throw new InputError(`zip has ${zipfile.entryCount} entries; the limit is ${MAX_ZIP_ENTRIES}`);
  }
  let declaredTotal = 0;
  await new Promise<void>((resolve, reject) => {
    const fail = (err: unknown) => reject(err instanceof InputError ? err : new InputError(`invalid zip: ${(err as Error).message}`));
    zipfile.on("error", fail);
    zipfile.on("end", resolve);
    zipfile.on("entry", (entry: yauzl.Entry) => {
      try {
        assertSafeEntry(entry);
        if (!entry.fileName.endsWith("/")) declaredTotal += entry.uncompressedSize;
        if (declaredTotal > maxExtractBytes) throw new InputError(`zip expands to more than ${maxExtractBytes} bytes`);
        zipfile.readEntry();
      } catch (err) {
        fail(err);
      }
    });
    zipfile.readEntry();
  });
}

function openZip(zipPath: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true, autoClose: true }, (err, zipfile) => {
      if (err || !zipfile) reject(new InputError(`invalid zip: ${err?.message ?? "unreadable"}`));
      else resolve(zipfile);
    });
  });
}

function openEntryStream(zipfile: yauzl.ZipFile, entry: yauzl.Entry): Promise<NodeJS.ReadableStream> {
  return new Promise((resolve, reject) => {
    zipfile.openReadStream(entry, (err, stream) => {
      if (err || !stream) reject(new InputError(`invalid zip entry ${entry.fileName}: ${err?.message ?? "unreadable"}`));
      else resolve(stream);
    });
  });
}

/** Rejects traversal, absolute paths, Windows drive paths and symlink entries. */
function assertSafeEntry(entry: Pick<yauzl.Entry, "fileName" | "externalFileAttributes">): void {
  const name = entry.fileName;
  if (
    name.length === 0 ||
    name.includes("\0") ||
    name.startsWith("/") ||
    name.includes("\\") ||
    /^[A-Za-z]:/.test(name) ||
    name.split("/").some((segment) => segment === "..")
  ) {
    throw new InputError(`unsafe path in zip: ${JSON.stringify(name)}`);
  }
  const unixMode = (entry.externalFileAttributes >>> 16) & 0xf000;
  if (unixMode === 0xa000) throw new InputError(`symlinks are not allowed in zip: ${name}`);
}

/**
 * Safe extraction: rejects path traversal, absolute paths and symlinks; caps entry count and
 * total extracted bytes (checked against both the declared size and the bytes actually written).
 */
export async function extractZip(zipPath: string, dest: string, maxExtractBytes: number): Promise<void> {
  const destRoot = path.resolve(dest);
  const zipfile = await openZip(zipPath);
  if (zipfile.entryCount > MAX_ZIP_ENTRIES) {
    zipfile.close();
    throw new InputError(`zip has ${zipfile.entryCount} entries; the limit is ${MAX_ZIP_ENTRIES}`);
  }
  let declaredTotal = 0;
  let writtenTotal = 0;

  const handleEntry = async (entry: yauzl.Entry): Promise<void> => {
    const name = entry.fileName;
    assertSafeEntry(entry);
    const target = path.resolve(destRoot, name);
    if (target !== destRoot && !target.startsWith(destRoot + path.sep)) {
      throw new InputError(`unsafe path in zip: ${JSON.stringify(name)}`);
    }
    if (name.endsWith("/")) {
      await fs.mkdir(target, { recursive: true });
      return;
    }
    declaredTotal += entry.uncompressedSize;
    if (declaredTotal > maxExtractBytes) {
      throw new InputError(`zip expands to more than ${maxExtractBytes} bytes`);
    }
    await fs.mkdir(path.dirname(target), { recursive: true });
    const source = await openEntryStream(zipfile, entry);
    const counter = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        writtenTotal += chunk.length;
        if (writtenTotal > maxExtractBytes) {
          cb(new InputError(`zip expands to more than ${maxExtractBytes} bytes`));
          return;
        }
        cb(null, chunk);
      },
    });
    await pipeline(source, counter, createWriteStream(target, { flags: "wx" }));
  };

  await new Promise<void>((resolve, reject) => {
    let failed = false;
    const fail = (err: unknown) => {
      if (failed) return;
      failed = true;
      try {
        zipfile.close();
      } catch {
        /* already closed */
      }
      reject(err instanceof InputError ? err : new InputError(`invalid zip: ${(err as Error).message}`));
    };
    zipfile.on("error", fail);
    zipfile.on("end", () => {
      if (!failed) resolve();
    });
    zipfile.on("entry", (entry: yauzl.Entry) => {
      handleEntry(entry).then(() => zipfile.readEntry(), fail);
    });
    zipfile.readEntry();
  });
}

// ---------------------------------------------------------------------------
// git clone
// ---------------------------------------------------------------------------

export async function shallowClone(repoUrl: string, dest: string, limits: InputLimits): Promise<void> {
  const match = GITHUB_REPO_RE.exec(repoUrl.trim());
  if (!match) throw new InputError("repoUrl must be a public GitHub repository URL like https://github.com/owner/repo");
  const url = `https://github.com/${match[1]}/${match[2]}.git`;

  await new Promise<void>((resolve, reject) => {
    let stderr = "";
    let timedOut = false;
    const child = spawn(
      "git",
      // core.symlinks=false checks symlinks out as plain text files so the scanner never follows one.
      ["-c", "core.symlinks=false", "clone", "--depth", "1", "--single-branch", "--no-tags", "--", url, dest],
      {
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_ASKPASS: "echo", GIT_CONFIG_NOSYSTEM: "1" },
        stdio: ["ignore", "ignore", "pipe"],
      },
    );
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, limits.cloneTimeoutMs);
    child.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length < 4000) stderr += chunk.toString();
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(new InputError(`git is not available on this server: ${err.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) reject(new InputError(`git clone timed out after ${limits.cloneTimeoutMs} ms`));
      else if (code !== 0) reject(new InputError(`git clone failed: ${describeCloneFailure(stderr, code)}`));
      else resolve();
    });
  });

  const size = await directorySize(dest);
  if (size > limits.maxRepoBytes) {
    throw new InputError(`repository checkout is ${size} bytes; the limit is ${limits.maxRepoBytes} bytes`);
  }
}

/** Turns git's stderr into a short message without temp paths; private/missing repos look like auth failures to git. */
function describeCloneFailure(stderr: string, code: number | null): string {
  if (/Authentication failed|could not read Username|Repository not found/i.test(stderr)) {
    return "repository not found or not public";
  }
  const lines = stderr
    .trim()
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("Cloning into"));
  return lines.slice(-2).join(" ") || `exit code ${code}`;
}

async function directorySize(dir: string): Promise<number> {
  let total = 0;
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop() as string;
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) total += (await fs.lstat(full)).size;
    }
  }
  return total;
}

/** GitHub-style zips wrap everything in one top-level folder; descend into it so the scanner sees the project root. */
async function unwrapSingleDirectory(dir: string): Promise<string> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const visible = entries.filter((e) => e.name !== "__MACOSX" && e.name !== ".DS_Store");
  if (visible.length === 1 && visible[0].isDirectory() && visible[0].name !== ".git") {
    return path.join(dir, visible[0].name);
  }
  return dir;
}
