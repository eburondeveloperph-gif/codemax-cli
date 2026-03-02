/**
 * Eburon Copilot CLI — TUI File Tree Pane
 */
import blessed from "blessed";
import { readdirSync, statSync, readFileSync } from "fs";
import { resolve, relative, basename } from "path";

const IGNORE = new Set(["node_modules", ".git", ".next", "dist", ".cache", "coverage", "__pycache__", ".turbo"]);

export interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
  depth: number;
}

export function loadFileTree(dir: string, maxDepth: number = 4): FileEntry[] {
  const entries: FileEntry[] = [];

  function walk(d: string, depth: number) {
    if (depth > maxDepth) return;
    try {
      const items = readdirSync(d)
        .filter((e) => !e.startsWith(".") || e === ".env.example")
        .filter((e) => !IGNORE.has(e))
        .sort((a, b) => {
          const aDir = statSync(resolve(d, a)).isDirectory();
          const bDir = statSync(resolve(d, b)).isDirectory();
          if (aDir !== bDir) return aDir ? -1 : 1;
          return a.localeCompare(b);
        });

      for (const item of items) {
        const fullPath = resolve(d, item);
        const isDir = statSync(fullPath).isDirectory();
        entries.push({
          name: item,
          path: fullPath,
          isDir,
          depth,
        });
        if (isDir) walk(fullPath, depth + 1);
      }
    } catch { /* skip */ }
  }

  walk(dir, 0);
  return entries;
}

export function populateFileTree(
  list: blessed.Widgets.ListElement,
  entries: FileEntry[],
  cwd: string
): void {
  const items = entries.map((e) => {
    const indent = "  ".repeat(e.depth);
    const icon = e.isDir ? "📁 " : fileIcon(e.name);
    const relPath = relative(cwd, e.path);
    return `${indent}${icon}${e.name}`;
  });

  list.setItems(items);
}

function fileIcon(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const icons: Record<string, string> = {
    ts: "🟦 ", tsx: "⚛️  ", js: "🟨 ", jsx: "⚛️  ",
    py: "🐍 ", go: "🔷 ", rs: "🦀 ",
    json: "📋 ", yaml: "📋 ", yml: "📋 ",
    md: "📝 ", txt: "📄 ",
    css: "🎨 ", scss: "🎨 ", html: "🌐 ",
    sh: "🔧 ", bash: "🔧 ",
    dockerfile: "🐳 ",
    lock: "🔒 ",
  };
  return icons[ext] ?? "📄 ";
}
