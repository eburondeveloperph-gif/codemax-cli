/**
 * Eburon Copilot CLI — Project Context Detection
 */
import { execSync } from "child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { resolve, relative, basename } from "path";

export interface ProjectContext {
  cwd: string;
  name: string;
  gitBranch?: string;
  gitDirty: boolean;
  packageJson?: { name?: string; version?: string; scripts?: Record<string, string> };
  fileCount: number;
  tree: string;
}

function tryExec(cmd: string, cwd: string): string | undefined {
  try {
    return execSync(cmd, { cwd, encoding: "utf-8", timeout: 3000, stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch {
    return undefined;
  }
}

function buildTree(dir: string, prefix: string = "", depth: number = 0, maxDepth: number = 3): string[] {
  if (depth > maxDepth) return [];
  const IGNORE = new Set(["node_modules", ".git", ".next", "dist", ".cache", "coverage", "__pycache__", ".turbo"]);
  const lines: string[] = [];

  try {
    const entries = readdirSync(dir)
      .filter((e) => !e.startsWith(".") || e === ".env.example")
      .filter((e) => !IGNORE.has(e))
      .sort((a, b) => {
        const aDir = statSync(resolve(dir, a)).isDirectory();
        const bDir = statSync(resolve(dir, b)).isDirectory();
        if (aDir !== bDir) return aDir ? -1 : 1;
        return a.localeCompare(b);
      });

    entries.forEach((entry, i) => {
      const fullPath = resolve(dir, entry);
      const isLast = i === entries.length - 1;
      const connector = isLast ? "└── " : "├── ";
      const isDir = statSync(fullPath).isDirectory();

      lines.push(`${prefix}${connector}${entry}${isDir ? "/" : ""}`);

      if (isDir) {
        const newPrefix = prefix + (isLast ? "    " : "│   ");
        lines.push(...buildTree(fullPath, newPrefix, depth + 1, maxDepth));
      }
    });
  } catch { /* permission error */ }

  return lines;
}

export function detectContext(cwd?: string): ProjectContext {
  const dir = cwd ?? process.cwd();

  // Git info
  const gitBranch = tryExec("git rev-parse --abbrev-ref HEAD", dir);
  const gitStatus = tryExec("git status --porcelain", dir);
  const gitDirty = !!gitStatus && gitStatus.length > 0;

  // Package.json
  let packageJson: ProjectContext["packageJson"];
  const pkgPath = resolve(dir, "package.json");
  if (existsSync(pkgPath)) {
    try {
      packageJson = JSON.parse(readFileSync(pkgPath, "utf-8"));
    } catch { /* malformed */ }
  }

  // File tree
  const tree = buildTree(dir);
  const fileCount = tree.filter((l) => !l.endsWith("/")).length;

  return {
    cwd: dir,
    name: packageJson?.name ?? basename(dir),
    gitBranch,
    gitDirty,
    packageJson,
    fileCount,
    tree: tree.slice(0, 80).join("\n") + (tree.length > 80 ? `\n  ... and ${tree.length - 80} more` : ""),
  };
}

export function contextSummary(ctx: ProjectContext): string {
  const parts: string[] = [];
  parts.push(`Project: ${ctx.name}`);
  parts.push(`Dir: ${ctx.cwd}`);
  if (ctx.gitBranch) parts.push(`Git: ${ctx.gitBranch}${ctx.gitDirty ? " (dirty)" : ""}`);
  if (ctx.packageJson?.version) parts.push(`Version: ${ctx.packageJson.version}`);
  parts.push(`Files: ${ctx.fileCount}`);
  return parts.join("  ·  ");
}
