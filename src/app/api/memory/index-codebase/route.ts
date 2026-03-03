import { NextRequest, NextResponse } from "next/server";
import { readdir, readFile, stat } from "fs/promises";
import { join, relative, extname } from "path";

export const runtime = "nodejs";
export const maxDuration = 120;

const CODE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".java", ".c", ".cpp",
  ".h", ".css", ".scss", ".html", ".json", ".yaml", ".yml", ".toml", ".md",
  ".sh", ".sql", ".graphql", ".prisma", ".env.example",
]);

const IGNORE_DIRS = new Set([
  "node_modules", ".git", ".next", "dist", "build", ".vercel",
  "__pycache__", ".cache", "coverage", ".turbo", "public/templates",
]);

async function walkDir(dir: string, baseDir: string): Promise<{ path: string; content: string }[]> {
  const files: { path: string; content: string }[] = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".") && entry.name !== ".env.example") continue;
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (IGNORE_DIRS.has(entry.name)) continue;
        files.push(...(await walkDir(fullPath, baseDir)));
      } else if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase();
        if (!CODE_EXTENSIONS.has(ext)) continue;
        try {
          const s = await stat(fullPath);
          if (s.size > 100000) continue; // Skip files > 100KB
          const content = await readFile(fullPath, "utf-8");
          files.push({ path: relative(baseDir, fullPath), content });
        } catch { /* skip unreadable files */ }
      }
    }
  } catch { /* skip unreadable dirs */ }
  return files;
}

/** POST — Index a codebase directory */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const cwd = body.cwd || process.cwd();

    const { indexFile } = await import("@/lib/memory");

    // Walk the directory
    const files = await walkDir(cwd, cwd);
    let totalChunks = 0;
    let indexed = 0;
    const errors: string[] = [];

    for (const file of files) {
      try {
        const chunks = await indexFile(file.path, file.content);
        totalChunks += chunks;
        if (chunks > 0) indexed++;
      } catch (e: unknown) {
        errors.push(`${file.path}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return NextResponse.json({
      filesScanned: files.length,
      filesIndexed: indexed,
      totalChunks,
      errors: errors.slice(0, 10),
      cwd,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[memory/index-codebase] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** GET — Get codebase index stats */
export async function GET() {
  try {
    const { getMemoryStats } = await import("@/lib/memory");
    const stats = await getMemoryStats();
    return NextResponse.json(stats);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
