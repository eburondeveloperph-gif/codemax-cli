/**
 * Eburon Copilot CLI — Direct Ollama API Client
 * Talks to Ollama directly with streaming support and tool calling.
 */
import { CONFIG } from "./config.js";
import { T, brand, accent, muted, green, red, bold } from "./theme.js";

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: ToolCall[];
  name?: string;
}

export interface ToolCall {
  id: string;
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface StreamChunk {
  type: "text" | "tool_call" | "done" | "error";
  content?: string;
  toolCall?: ToolCall;
  error?: string;
}

// System prompt for the autonomous agent — injected at runtime, not baked into model
const SYSTEM_PROMPT = `You are codemax-v3, an autonomous AI coding agent created by Eburon AI (founded by Jo Lernout).
You operate like GitHub Copilot's coding agent — fully autonomous, tool-augmented, and production-focused.

## Agent Behavior
You are an agentic software engineer. When given a task you:
1. Analyze the full scope independently — never ask for clarification you can infer
2. Use tools to understand the current codebase before making changes
3. Plan architecture and file structure, then implement completely
4. Self-review for bugs, security issues, and edge cases
5. Verify changes with readFile or shellExec after writing

## Available Tools
- **readFile**: Read file contents from the filesystem
- **writeFile**: Write or create files on the filesystem
- **shellExec**: Execute shell commands (build, test, install deps)
- **listFiles**: List files in a directory (recursive)
- **searchFiles**: Search for text patterns in files (grep)
- **querySkills**: Search offline knowledge datasets (React, Next.js, Tailwind, TypeScript, PWA, API design, auth, testing, security, deployment, database, CSS/UI, git workflows) — works without internet

## Workflow
1. Use listFiles/readFile to understand project structure
2. Use querySkills to find relevant patterns, best practices, and code references
3. Plan what files need to be created or modified
4. Use writeFile to implement changes — complete files only, no placeholders
5. Use shellExec to verify (run tests, check builds)
6. Report what was done concisely

## Offline Knowledge
You have access to curated offline skill datasets via querySkills.
Use them proactively to reference best practices, code patterns, and architecture.
Categories: frontend, styling, language, architecture, backend, security, testing, devops.

## Code Standards
- TypeScript by default, Tailwind CSS for styling
- Complete, production-ready code — no TODOs, no stubs
- Proper error handling, input validation, accessibility
- Show file diffs when modifying existing files

Be direct. Lead with the solution. No filler phrases.`;

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "readFile",
      description: "Read the contents of a file at the given path",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path relative to working directory" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "writeFile",
      description: "Write content to a file, creating it if it doesn't exist",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path relative to working directory" },
          content: { type: "string", description: "File content to write" },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "shellExec",
      description: "Execute a shell command and return stdout/stderr",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "Shell command to execute" },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "listFiles",
      description: "List files in a directory recursively",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Directory path (default: '.')" },
          maxDepth: { type: "number", description: "Maximum depth (default: 3)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "searchFiles",
      description: "Search for a text pattern across files (like grep)",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "Search pattern (regex)" },
          path: { type: "string", description: "Directory to search in (default: '.')" },
          glob: { type: "string", description: "File glob filter (e.g. '*.ts')" },
        },
        required: ["pattern"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "querySkills",
      description: "Search offline knowledge datasets for code patterns, best practices, and reference material. Categories: frontend (React, Next.js), styling (Tailwind, CSS/UI), language (TypeScript), architecture (PWA), backend (API design, databases), security (auth, XSS, CSRF), testing (Vitest, Playwright), devops (git, deployment). Works without internet.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query (e.g. 'react hooks', 'tailwind dark mode', 'jwt auth')" },
          category: { type: "string", description: "Optional category filter: frontend, styling, language, architecture, backend, security, testing, devops" },
          maxResults: { type: "number", description: "Maximum results to return (default: 5)" },
        },
        required: ["query"],
      },
    },
  },
];

/**
 * Stream a chat completion from Ollama with tool support
 */
export async function* streamChat(
  messages: ChatMessage[],
  options?: { tools?: boolean }
): AsyncGenerator<StreamChunk> {
  const body: Record<string, unknown> = {
    model: CONFIG.model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      ...messages,
    ],
    stream: true,
    options: {
      temperature: 0.7,
      top_p: 0.9,
      num_ctx: CONFIG.maxContextTokens,
    },
  };

  if (options?.tools !== false) {
    body.tools = TOOL_DEFINITIONS;
  }

  const res = await fetch(`${CONFIG.ollamaUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    yield { type: "error", error: `Ollama returned ${res.status}: ${text.slice(0, 200)}` };
    return;
  }

  if (!res.body) {
    yield { type: "error", error: "No response body from Ollama" };
    return;
  }

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += dec.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const json = JSON.parse(line);

        // Tool calls
        if (json.message?.tool_calls?.length) {
          for (const tc of json.message.tool_calls) {
            yield {
              type: "tool_call",
              toolCall: {
                id: tc.id ?? `tc_${Date.now()}`,
                function: {
                  name: tc.function?.name ?? "",
                  arguments: typeof tc.function?.arguments === "string"
                    ? tc.function.arguments
                    : JSON.stringify(tc.function?.arguments ?? {}),
                },
              },
            };
          }
        }

        // Text content
        if (json.message?.content) {
          yield { type: "text", content: json.message.content };
        }

        // Done
        if (json.done) {
          yield { type: "done" };
        }
      } catch {
        // Non-JSON line, skip
      }
    }
  }

  // Process remaining buffer
  if (buffer.trim()) {
    try {
      const json = JSON.parse(buffer);
      if (json.message?.content) {
        yield { type: "text", content: json.message.content };
      }
      if (json.done) {
        yield { type: "done" };
      }
    } catch { /* ignore */ }
  }
}

/**
 * Non-streaming chat for simple queries
 */
export async function chat(messages: ChatMessage[]): Promise<string> {
  const res = await fetch(`${CONFIG.ollamaUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: CONFIG.model,
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
      stream: false,
      options: { temperature: 0.7, top_p: 0.9, num_ctx: CONFIG.maxContextTokens },
    }),
  });

  if (!res.ok) throw new Error(`Ollama returned ${res.status}`);
  const data = await res.json();
  return data.message?.content ?? "";
}

/**
 * Check if Ollama is reachable at the configured OLLAMA_URL (any host/IP)
 * and whether the target model is available.
 */
export async function checkOllama(): Promise<{
  ok: boolean;
  models: string[];
  modelReady: boolean;
  version?: string;
  error?: string;
}> {
  const url = CONFIG.ollamaUrl;

  // Step 1: Ping the root endpoint
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return { ok: false, models: [], modelReady: false, error: `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, models: [], modelReady: false, error: (e as Error).message };
  }

  // Step 2: Get version (optional)
  let version: string | undefined;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${url}/api/version`, { signal: controller.signal });
    clearTimeout(timer);
    if (res.ok) { const d = await res.json(); version = d.version; }
  } catch { /* version endpoint may not exist */ }

  // Step 3: List models
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${url}/api/tags`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return { ok: true, models: [], modelReady: false, version, error: `Tags HTTP ${res.status}` };
    const data = await res.json();
    const models = (data.models ?? []).map((m: { name: string }) => m.name);
    const modelReady = models.some(
      (m: string) => m === CONFIG.model || m === `${CONFIG.model}:latest` || m.startsWith(`${CONFIG.model}:`)
    );
    return { ok: true, models, modelReady, version };
  } catch (e) {
    return { ok: true, models: [], modelReady: false, version, error: (e as Error).message };
  }
}

/**
 * Pull a model on the Ollama server (works with any remote host via OLLAMA_URL).
 * Returns an async generator of progress events.
 */
export async function* pullModelStream(
  model?: string
): AsyncGenerator<{ status: string; completed?: number; total?: number }> {
  const url = CONFIG.ollamaUrl;
  const target = model ?? CONFIG.model;

  const res = await fetch(`${url}/api/pull`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: target, stream: true }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Pull failed (${res.status}): ${text.slice(0, 200)}`);
  }
  if (!res.body) throw new Error("No response body from Ollama pull");

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += dec.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try { yield JSON.parse(line); } catch { /* skip */ }
    }
  }
  if (buffer.trim()) {
    try { yield JSON.parse(buffer); } catch { /* skip */ }
  }
}
