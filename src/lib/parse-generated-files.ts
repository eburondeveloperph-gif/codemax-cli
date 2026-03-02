export interface GeneratedFile {
  path: string;
  content: string;
  language: string;
}

const FILE_EXT =
  /\.(tsx?|jsx?|css|scss|html|json|md|env|ya?ml|sh|py|go|rs|toml|lock|gitignore|prettierrc|eslintrc|nvmrc|editorconfig)$/i;

function looksLikePath(s: string): boolean {
  return FILE_EXT.test(s) && !s.includes(" ") && s.length < 120;
}

function inferLang(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "tsx",
    js: "javascript",
    jsx: "jsx",
    css: "css",
    scss: "scss",
    html: "html",
    json: "json",
    md: "markdown",
    yaml: "yaml",
    yml: "yaml",
    sh: "bash",
    py: "python",
    go: "go",
    rs: "rust",
    toml: "toml",
  };
  return map[ext] || ext;
}

export function parseGeneratedFiles(text: string): GeneratedFile[] {
  const files: GeneratedFile[] = [];
  const seen = new Set<string>();
  const lines = text.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const fenceMatch = line.match(/^```(\w*)\s*(.*)$/);

    if (!fenceMatch) {
      i++;
      continue;
    }

    const lang = fenceMatch[1] || "";
    const afterFence = fenceMatch[2].trim();

    // Collect block body
    const bodyLines: string[] = [];
    i++;
    while (i < lines.length && !lines[i].startsWith("```")) {
      bodyLines.push(lines[i]);
      i++; // skip closing ```
    }
    i++;

    const content = bodyLines.join("\n").trimEnd();
    if (!content.trim()) continue;

    // 1. Path inline with fence: ```tsx src/App.tsx
    let path = looksLikePath(afterFence) ? afterFence : "";

    // 2. Context above: **src/App.tsx**, `src/App.tsx`, ### src/App.tsx
    if (!path) {
      const start = Math.max(0, i - bodyLines.length - 6);
      for (let k = i - bodyLines.length - 2; k >= start; k--) {
        const prev = lines[k].trim();
        const m =
          prev.match(/^\*\*`?([\w][\w\-./ ]*\.\w+)`?\*\*$/) ||
          prev.match(/^#{1,4}\s+(?:File:\s*)?([\w][\w\-./ ]*\.\w+)\s*$/) ||
          prev.match(/^`([\w][\w\-./ ]*\.\w+)`$/) ||
          prev.match(/^([\w][\w\-./]*\.\w+)\s*$/);
        if (m && looksLikePath(m[1])) {
          path = m[1];
          break;
        }
      }
    }

    // 3. First-line comment inside block: // src/App.tsx  or  # src/App.tsx
    if (!path && bodyLines.length > 0) {
      const first = bodyLines[0].trim();
      const m = first.match(/^(?:\/\/|#|<!--|--)\s*([\w][\w\-./]*\.\w+)/);
      if (m && looksLikePath(m[1])) path = m[1];
    }

    if (path && !seen.has(path)) {
      seen.add(path);
      files.push({ path, content, language: lang || inferLang(path) });
    }
  }

  return files;
}

/** True when the AI response looks like a generated app (2+ distinct source files) */
export function isAppGenerationResponse(text: string): boolean {
  return parseGeneratedFiles(text).length >= 2;
}
