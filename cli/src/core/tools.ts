/**
 * Eburon Copilot CLI — Tool Implementations
 * File operations, shell execution, search.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from "fs";
import { execSync } from "child_process";
import { resolve, dirname, relative } from "path";
import { createTwoFilesPatch } from "diff";

export interface ToolResult {
  success: boolean;
  output: string;
  diff?: string;
}

const CWD = process.cwd();

function safePath(p: string): string {
  const full = resolve(CWD, p);
  // Security: don't allow traversal above CWD
  if (!full.startsWith(CWD)) throw new Error(`Path traversal blocked: ${p}`);
  return full;
}

export function readFile(path: string): ToolResult {
  try {
    const full = safePath(path);
    if (!existsSync(full)) return { success: false, output: `File not found: ${path}` };
    const content = readFileSync(full, "utf-8");
    const lines = content.split("\n").length;
    return { success: true, output: content, diff: `${lines} lines` };
  } catch (e) {
    return { success: false, output: `Error reading ${path}: ${(e as Error).message}` };
  }
}

export function writeFile(path: string, content: string): ToolResult {
  try {
    const full = safePath(path);
    const dir = dirname(full);
    let diff: string | undefined;

    // Generate diff if file exists
    if (existsSync(full)) {
      const old = readFileSync(full, "utf-8");
      diff = createTwoFilesPatch(path, path, old, content, "before", "after");
    } else {
      diff = `+++ new file: ${path} (${content.split("\n").length} lines)`;
    }

    mkdirSync(dir, { recursive: true });
    writeFileSync(full, content, "utf-8");
    return { success: true, output: `Wrote ${content.length} bytes to ${path}`, diff };
  } catch (e) {
    return { success: false, output: `Error writing ${path}: ${(e as Error).message}` };
  }
}

export function shellExec(command: string): ToolResult {
  try {
    const output = execSync(command, {
      cwd: CWD,
      encoding: "utf-8",
      timeout: 30000,
      maxBuffer: 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { success: true, output: output.trim() };
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string; message: string };
    const output = (err.stdout ?? "") + (err.stderr ?? "") || err.message;
    return { success: false, output: output.trim() };
  }
}

export function listFiles(path: string = ".", maxDepth: number = 3): ToolResult {
  try {
    const full = safePath(path);
    if (!existsSync(full)) return { success: false, output: `Directory not found: ${path}` };

    const IGNORE = new Set(["node_modules", ".git", ".next", "dist", ".cache", "coverage"]);
    const files: string[] = [];

    function walk(dir: string, depth: number) {
      if (depth > maxDepth) return;
      try {
        for (const entry of readdirSync(dir)) {
          if (entry.startsWith(".") && entry !== ".env.example") continue;
          if (IGNORE.has(entry)) continue;
          const p = resolve(dir, entry);
          const rel = relative(CWD, p);
          if (statSync(p).isDirectory()) {
            files.push(rel + "/");
            walk(p, depth + 1);
          } else {
            files.push(rel);
          }
        }
      } catch { /* skip */ }
    }

    walk(full, 0);
    return { success: true, output: files.join("\n") };
  } catch (e) {
    return { success: false, output: (e as Error).message };
  }
}

export function searchFiles(pattern: string, path: string = ".", glob?: string): ToolResult {
  try {
    let cmd = `grep -rn --include='${glob ?? "*"}' '${pattern.replace(/'/g, "'\\''")}'  '${safePath(path)}'`;
    const output = execSync(cmd, {
      cwd: CWD,
      encoding: "utf-8",
      timeout: 10000,
      maxBuffer: 512 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
    });
    // Make paths relative
    const lines = output.trim().split("\n").map((l) => {
      const absPrefix = CWD + "/";
      return l.startsWith(absPrefix) ? l.slice(absPrefix.length) : l;
    });
    return { success: true, output: lines.slice(0, 50).join("\n") + (lines.length > 50 ? `\n... (${lines.length} total matches)` : "") };
  } catch (e: unknown) {
    const err = e as { stdout?: string; status?: number };
    if (err.status === 1) return { success: true, output: "No matches found" };
    return { success: false, output: (e as Error).message };
  }
}

/**
 * Execute a tool call by name
 */
export function executeTool(name: string, args: Record<string, unknown>): ToolResult {
  switch (name) {
    case "readFile":
      return readFile(String(args.path ?? ""));
    case "writeFile":
      return writeFile(String(args.path ?? ""), String(args.content ?? ""));
    case "shellExec":
      return shellExec(String(args.command ?? ""));
    case "listFiles":
      return listFiles(String(args.path ?? "."), Number(args.maxDepth ?? 3));
    case "searchFiles":
      return searchFiles(String(args.pattern ?? ""), String(args.path ?? "."), args.glob as string | undefined);
    default:
      return { success: false, output: `Unknown tool: ${name}` };
  }
}
