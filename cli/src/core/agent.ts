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

// System prompt for the autonomous agent
const SYSTEM_PROMPT = `You are Eburon Copilot (codemax-v3), an autonomous AI coding agent created by Eburon AI.

You have access to the following tools to help you accomplish tasks:

- **readFile**: Read file contents from the filesystem
- **writeFile**: Write or create files on the filesystem  
- **shellExec**: Execute shell commands
- **listFiles**: List files in a directory (recursive)
- **searchFiles**: Search for text patterns in files (grep)

When the user asks you to do something:
1. Analyze what needs to be done
2. Use tools to understand the current codebase
3. Make changes using writeFile
4. Verify your changes with readFile or shellExec

Always explain what you're doing and why. Show file diffs when modifying existing files.
Be direct, concise, and thorough. Generate complete, production-ready code.`;

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
 * Check if Ollama is reachable and model is available
 */
export async function checkOllama(): Promise<{ ok: boolean; models: string[]; error?: string }> {
  try {
    const res = await fetch(`${CONFIG.ollamaUrl}/api/tags`);
    if (!res.ok) return { ok: false, models: [], error: `HTTP ${res.status}` };
    const data = await res.json();
    const models = (data.models ?? []).map((m: { name: string }) => m.name);
    return { ok: true, models };
  } catch (e) {
    return { ok: false, models: [], error: (e as Error).message };
  }
}
