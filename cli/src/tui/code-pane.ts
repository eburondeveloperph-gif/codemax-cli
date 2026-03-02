/**
 * Eburon Copilot CLI — TUI Code Pane
 */
import blessed from "blessed";
import { readFileSync, existsSync } from "fs";

export function showFile(codeBox: blessed.Widgets.BoxElement, filePath: string): void {
  if (!existsSync(filePath)) {
    codeBox.setContent(`{red-fg}File not found: ${filePath}{/red-fg}`);
    return;
  }

  try {
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    const ext = filePath.split(".").pop() ?? "";
    const numWidth = String(lines.length).length;

    const formatted = lines.map((line, i) => {
      const num = String(i + 1).padStart(numWidth);
      const highlighted = highlightLine(line, ext);
      return `{grey-fg}${num}{/grey-fg} │ ${highlighted}`;
    }).join("\n");

    codeBox.setLabel(` {bold}${filePath}{/bold} `);
    codeBox.setContent(formatted);
    codeBox.setScrollPerc(0);
  } catch (e) {
    codeBox.setContent(`{red-fg}Error reading file: ${(e as Error).message}{/red-fg}`);
  }
}

export function showCode(codeBox: blessed.Widgets.BoxElement, content: string, lang: string, title?: string): void {
  const lines = content.split("\n");
  const numWidth = String(lines.length).length;

  const formatted = lines.map((line, i) => {
    const num = String(i + 1).padStart(numWidth);
    return `{grey-fg}${num}{/grey-fg} │ ${highlightLine(line, lang)}`;
  }).join("\n");

  codeBox.setLabel(` {bold}${title ?? lang}{/bold} `);
  codeBox.setContent(formatted);
  codeBox.setScrollPerc(0);
}

export function showDiff(codeBox: blessed.Widgets.BoxElement, diff: string, title?: string): void {
  const formatted = diff.split("\n").map((line) => {
    if (line.startsWith("+++") || line.startsWith("---")) return `{grey-fg}${escapeBlessed(line)}{/grey-fg}`;
    if (line.startsWith("@@")) return `{cyan-fg}${escapeBlessed(line)}{/cyan-fg}`;
    if (line.startsWith("+")) return `{green-fg}${escapeBlessed(line)}{/green-fg}`;
    if (line.startsWith("-")) return `{red-fg}${escapeBlessed(line)}{/red-fg}`;
    return escapeBlessed(line);
  }).join("\n");

  codeBox.setLabel(` {bold}${title ?? "Diff"}{/bold} `);
  codeBox.setContent(formatted);
  codeBox.setScrollPerc(0);
}

function highlightLine(line: string, ext: string): string {
  let escaped = escapeBlessed(line);

  // Keywords
  const keywords = getKeywords(ext);
  if (keywords.length > 0) {
    const kwPattern = new RegExp(`\\b(${keywords.join("|")})\\b`, "g");
    escaped = escaped.replace(kwPattern, "{#EC4899-fg}$1{/#EC4899-fg}");
  }

  // Strings
  escaped = escaped.replace(/(["'`])(?:(?!\1|\\).|\\.)*?\1/g, "{green-fg}$&{/green-fg}");

  // Comments
  escaped = escaped.replace(/(\/\/.*$|#.*$)/gm, "{grey-fg}$1{/grey-fg}");

  // Numbers
  escaped = escaped.replace(/\b(\d+\.?\d*)\b/g, "{yellow-fg}$1{/yellow-fg}");

  return escaped;
}

function getKeywords(ext: string): string[] {
  const map: Record<string, string[]> = {
    ts: ["import", "export", "from", "const", "let", "var", "function", "class", "interface", "type", "return", "if", "else", "async", "await", "new"],
    tsx: ["import", "export", "from", "const", "let", "var", "function", "class", "interface", "type", "return", "if", "else", "async", "await", "new"],
    js: ["import", "export", "from", "const", "let", "var", "function", "class", "return", "if", "else", "async", "await", "new"],
    jsx: ["import", "export", "from", "const", "let", "var", "function", "class", "return", "if", "else", "async", "await", "new"],
    py: ["import", "from", "def", "class", "return", "if", "elif", "else", "for", "while", "with", "as", "try", "except", "raise", "yield", "async", "await"],
    go: ["package", "import", "func", "type", "struct", "interface", "return", "if", "else", "for", "range", "switch", "case", "go", "defer"],
    sh: ["if", "then", "else", "fi", "for", "while", "do", "done", "function", "return", "export", "echo"],
  };
  return map[ext] ?? [];
}

function escapeBlessed(s: string): string {
  return s.replace(/\{(?!\/?(?:bold|underline|center|right|left|cyan-fg|green-fg|yellow-fg|red-fg|grey-fg|white-fg|blue-fg|#[0-9a-fA-F]+-fg))/g, "\\{");
}
