/**
 * Eburon Copilot CLI — Terminal Renderer
 * Renders markdown with syntax highlighting for terminal output.
 */
import { T, brand, accent, muted, bold, green, yellow, red, code, dim, BOX } from "../core/theme.js";

// Language-specific keyword sets for basic highlighting
const KEYWORDS: Record<string, Set<string>> = {
  ts: new Set(["import", "export", "from", "const", "let", "var", "function", "class", "interface", "type", "return", "if", "else", "for", "while", "async", "await", "new", "throw", "try", "catch", "finally", "extends", "implements", "default", "switch", "case", "break", "continue", "typeof", "instanceof", "void", "null", "undefined", "true", "false", "enum", "readonly", "private", "public", "protected", "static", "abstract", "as", "is"]),
  js: new Set(["import", "export", "from", "const", "let", "var", "function", "class", "return", "if", "else", "for", "while", "async", "await", "new", "throw", "try", "catch", "finally", "extends", "default", "switch", "case", "break", "continue", "typeof", "instanceof", "void", "null", "undefined", "true", "false"]),
  py: new Set(["import", "from", "def", "class", "return", "if", "elif", "else", "for", "while", "with", "as", "try", "except", "finally", "raise", "yield", "async", "await", "pass", "break", "continue", "True", "False", "None", "and", "or", "not", "in", "is", "lambda"]),
  go: new Set(["package", "import", "func", "type", "struct", "interface", "return", "if", "else", "for", "range", "switch", "case", "default", "break", "continue", "go", "defer", "select", "chan", "map", "var", "const", "nil", "true", "false"]),
  sh: new Set(["if", "then", "else", "elif", "fi", "for", "while", "do", "done", "case", "esac", "function", "return", "local", "export", "source", "echo", "exit", "cd", "set"]),
};

const LANG_ALIASES: Record<string, string> = {
  typescript: "ts", javascript: "js", python: "py", golang: "go",
  bash: "sh", shell: "sh", zsh: "sh", tsx: "ts", jsx: "js",
  json: "json", css: "css", html: "html", yaml: "yaml", yml: "yaml",
  sql: "sql", rust: "go", // rust uses similar keywords
};

function highlightLine(line: string, lang: string): string {
  const normalized = LANG_ALIASES[lang] ?? lang;
  const kw = KEYWORDS[normalized];

  if (!kw) return code(line);

  // Basic syntax highlighting
  return line.replace(/(\b\w+\b)|("(?:[^"\\]|\\.)*")|('(?:[^'\\]|\\.)*')|(`(?:[^`\\]|\\.)*`)|(\/\/.*$)|(#.*$)/g,
    (match, word, dblStr, sglStr, tmplStr, comment, hashComment) => {
      if (comment || hashComment) return dim(match);
      if (dblStr || sglStr || tmplStr) return green(match);
      if (word && kw.has(word)) return `${T.pink}${word}${T.reset}`;
      if (word && /^\d+(\.\d+)?$/.test(word)) return `${T.orange}${word}${T.reset}`;
      return code(match);
    }
  );
}

export function renderCodeBlock(lang: string, content: string): string {
  const displayLang = lang || "text";
  const lines = content.split("\n");
  const lineNumWidth = String(lines.length).length;

  const header = `  ${T.muted}${BOX.tl}${BOX.h}${T.reset} ${accent(displayLang)} ${muted(BOX.h.repeat(Math.max(0, 50 - displayLang.length)))}`;
  const body = lines.map((line, i) => {
    const num = String(i + 1).padStart(lineNumWidth);
    return `  ${T.muted}${BOX.v}${T.reset} ${dim(num)} ${T.muted}│${T.reset} ${highlightLine(line, lang)}`;
  }).join("\n");
  const footer = `  ${T.muted}${BOX.bl}${BOX.h.repeat(55)}${T.reset}`;

  return `\n${header}\n${body}\n${footer}\n`;
}

export function renderDiff(diff: string): string {
  const lines = diff.split("\n");
  return lines.map((line) => {
    if (line.startsWith("+++") || line.startsWith("---")) return muted(line);
    if (line.startsWith("@@")) return accent(line);
    if (line.startsWith("+")) return green(line);
    if (line.startsWith("-")) return red(line);
    return dim(line);
  }).join("\n");
}

/**
 * Render markdown text for terminal output
 */
export function renderMarkdown(text: string): string {
  let output = text;

  // Code blocks with syntax highlighting
  output = output.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return renderCodeBlock(lang, code.trimEnd());
  });

  // Inline code
  output = output.replace(/`([^`]+)`/g, (_, c) => `${T.bgMuted} ${T.code}${c}${T.reset} `);

  // Bold
  output = output.replace(/\*\*(.+?)\*\*/g, (_, t) => bold(t));

  // Italic
  output = output.replace(/\*(.+?)\*/g, (_, t) => `${T.italic}${t}${T.reset}`);

  // Headers
  output = output.replace(/^(#{1,3})\s+(.+)$/gm, (_, hashes, title) => {
    if (hashes.length === 1) return `\n  ${T.brand}${T.bold}${title}${T.reset}`;
    if (hashes.length === 2) return `\n  ${T.accent}${T.bold}${title}${T.reset}`;
    return `\n  ${T.text}${T.bold}${title}${T.reset}`;
  });

  // Bullet lists
  output = output.replace(/^(\s*)-\s+(.+)$/gm, (_, indent, item) => {
    return `${indent}  ${T.brand}•${T.reset} ${item}`;
  });

  // Numbered lists
  output = output.replace(/^(\s*)\d+\.\s+(.+)$/gm, (_, indent, item) => {
    return `${indent}  ${T.accent}→${T.reset} ${item}`;
  });

  // Blockquotes
  output = output.replace(/^>\s+(.+)$/gm, (_, text) => {
    return `  ${T.brand}${BOX.v}${T.reset} ${dim(text)}`;
  });

  // Horizontal rules
  output = output.replace(/^---+$/gm, () => `  ${muted(BOX.h.repeat(50))}`);

  return output;
}

/**
 * Spinner animation frames
 */
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export class Spinner {
  private interval: ReturnType<typeof setInterval> | null = null;
  private frame = 0;

  start(message: string): void {
    this.stop();
    this.interval = setInterval(() => {
      const f = SPINNER_FRAMES[this.frame++ % SPINNER_FRAMES.length];
      process.stdout.write(`\r  ${T.accent}${f}${T.reset} ${muted(message)}` + " ".repeat(20));
    }, 80);
  }

  update(message: string): void {
    if (this.interval) {
      // Just change the message on next tick
    }
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      process.stdout.write("\r" + " ".repeat(80) + "\r");
    }
  }
}
