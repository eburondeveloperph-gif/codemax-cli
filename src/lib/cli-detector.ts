import { CLIEndpoint } from "@/types";
import { execSync } from "child_process";

const DEFAULT_PORTS = [3333, 3001, 4000, 5000, 8000, 8080, 8888, 11434, 1234];

/** Parse OLLAMA_URL and extract unique host+port combos to probe */
function getExtraHosts(): { host: string; port: number }[] {
  const ollamaUrl = process.env.OLLAMA_URL;
  if (!ollamaUrl) return [];
  try {
    const u = new URL(ollamaUrl);
    const host = u.hostname;
    const port = parseInt(u.port) || (u.protocol === "https:" ? 443 : 80);
    // Skip localhost variants — they're already probed via DEFAULT_PORTS
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") return [];
    return [{ host, port }];
  } catch {
    return [];
  }
}

/** Preferred model names — first match wins */
const PREFERRED_MODELS = [
  "eburonmax/codemax-v3",
  "eburonmax/codemax-v3:latest",
  "codemax-v3",
  "codemax-v3:latest",
];

// ── External AI CLI definitions ───────────────────────────────────
interface ExternalCLI {
  name: string;
  processPatterns: string[];       // grep patterns to match running processes
  binaryNames: string[];           // binary names to check in PATH
  defaultPort?: number;            // if it exposes an HTTP server
  healthPath?: string;             // health check path
  chatPath?: string;               // chat API path
  icon: string;                    // emoji identifier
}

const EXTERNAL_CLIS: ExternalCLI[] = [
  {
    name: "codemax-ext-1",
    processPatterns: ["copilot", "github-copilot"],
    binaryNames: ["copilot", "github-copilot-cli"],
    icon: "🔌",
  },
  {
    name: "codemax-ext-2",
    processPatterns: ["codex"],
    binaryNames: ["codex"],
    icon: "🔌",
  },
  {
    name: "codemax-ext-3",
    processPatterns: ["opencode"],
    binaryNames: ["opencode"],
    defaultPort: 3333,
    healthPath: "/health",
    chatPath: "/api/chat",
    icon: "🔌",
  },
  {
    name: "codemax-ext-4",
    processPatterns: ["claude"],
    binaryNames: ["claude"],
    icon: "🔌",
  },
  {
    name: "codemax-ext-5",
    processPatterns: ["aider"],
    binaryNames: ["aider"],
    icon: "🔌",
  },
  {
    name: "codemax-ext-6",
    processPatterns: ["cursor"],
    binaryNames: ["cursor"],
    icon: "🔌",
  },
  {
    name: "codemax-ext-7",
    processPatterns: ["continue"],
    binaryNames: ["continue"],
    defaultPort: 65432,
    healthPath: "/health",
    chatPath: "/v1/chat/completions",
    icon: "🔌",
  },
  {
    name: "codemax-ext-8",
    processPatterns: ["cline"],
    binaryNames: ["cline"],
    icon: "🔌",
  },
];

/** Known LLM runtimes to probe for version info */
const VERSION_PROBES: Record<number, { path: string; extract: (body: string) => { version?: string; model?: string } }> = {
  // Eburon Codemax CLI bridge server
  3333: {
    path: "/health",
    extract: (b) => {
      try {
        const d = JSON.parse(b);
        if (d.provider === "ollama" || d.name?.includes("Eburon")) {
          return { model: d.model ?? "eburonmax/codemax-v3", version: d.version };
        }
        return {};
      } catch { return {}; }
    },
  },
  11434: {
    path: "/api/tags",
    extract: (b) => {
      try {
        const d = JSON.parse(b);
        const models: { name: string }[] = d.models ?? [];
        // Prefer codemax-v3, else pick the first available model
        const preferred = models.find((m) =>
          PREFERRED_MODELS.some((p) => m.name === p || m.name.startsWith("eburonmax/codemax-v3") || m.name.startsWith("codemax-v3"))
        );
        return { model: (preferred ?? models[0])?.name };
      } catch { return {}; }
    },
  },
  1234: {
    path: "/v1/models",
    extract: (b) => {
      try {
        const d = JSON.parse(b);
        const first = d.data?.[0]?.id;
        return { model: first };
      } catch { return {}; }
    },
  },
};

export async function detectCLIEndpoints(): Promise<CLIEndpoint[]> {
  const detected: CLIEndpoint[] = [];

  // Check environment variable overrides first
  const envEndpoint = process.env.EBURON_CLI_ENDPOINT;
  if (envEndpoint) {
    detected.push({
      id: "env-configured",
      name: "Eburon Model (maximus-cli) — env",
      url: envEndpoint,
      status: "detecting",
      type: "http",
    });
  }

  // Probe all localhost ports in parallel
  const results = await Promise.all(
    DEFAULT_PORTS.map(async (port) => {
      const { version, model } = await probeVersion(port);
      if (model !== undefined) {
        const chatPath = port === 1234 ? "/v1/chat/completions" : "/api/chat";
        return {
          id: `local-${port}`,
          name: port === 3333
            ? `Eburon Codemax CLI :${port}${model ? ` — ${model}` : ""}`
            : `Eburon Model (maximus-cli) :${port}${model ? ` — ${model}` : ""}`,
          url: `http://localhost:${port}${chatPath}`,
          status: "online" as const,
          type: "http" as const,
          version,
          model,
          lastChecked: new Date(),
        };
      }
      // Unknown port — probe for LLM chat paths
      const confirmed = await probeChatEndpoint(port);
      if (confirmed) {
        return {
          id: `local-${port}`,
          name: `Eburon Model (maximus-cli) :${port}`,
          url: confirmed,
          status: "online" as const,
          type: "http" as const,
          lastChecked: new Date(),
        };
      }
      return null;
    })
  );

  const filtered = results.filter((r) => r !== null) as CLIEndpoint[];
  detected.push(...filtered);

  // ── Probe remote OLLAMA_URL hosts (if configured, not localhost) ──
  const extraHosts = getExtraHosts();
  for (const { host, port } of extraHosts) {
    const baseUrl = `http://${host}:${port}`;
    // Check if already detected (unlikely for remote, but guard)
    if (detected.some((d) => d.url.includes(host))) continue;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`${baseUrl}/api/tags`, { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        const models: { name: string }[] = data.models ?? [];
        const preferred = models.find((m) =>
          PREFERRED_MODELS.some((p) => m.name === p || m.name.startsWith("eburonmax/codemax-v3"))
        );
        const model = (preferred ?? models[0])?.name;
        detected.push({
          id: `remote-${host}-${port}`,
          name: `Ollama @ ${host}:${port}${model ? ` — ${model}` : ""}`,
          url: `${baseUrl}/api/chat`,
          status: "online",
          type: "http",
          model,
          lastChecked: new Date(),
        });
      }
    } catch { /* remote host not reachable */ }
  }

  // ── Detect external AI CLI tools running as processes ──
  const externalCLIs = await detectExternalCLIs();
  detected.push(...externalCLIs);

  return detected;
}

// ── External AI CLI detection ─────────────────────────────────────

/** Check if a process matching any pattern is running */
function isProcessRunning(patterns: string[]): boolean {
  try {
    const ps = execSync("ps aux 2>/dev/null", { encoding: "utf-8", timeout: 2000 });
    const lower = ps.toLowerCase();
    return patterns.some((p) => lower.includes(p.toLowerCase()));
  } catch {
    return false;
  }
}

/** Check if a binary exists in PATH */
function binaryExists(name: string): boolean {
  try {
    execSync(`which ${name} 2>/dev/null`, { encoding: "utf-8", timeout: 1000 });
    return true;
  } catch {
    return false;
  }
}

async function detectExternalCLIs(): Promise<CLIEndpoint[]> {
  const endpoints: CLIEndpoint[] = [];
  let extIndex = 1;

  // Get process list once
  let psList = "";
  try {
    psList = execSync("ps aux 2>/dev/null", { encoding: "utf-8", timeout: 2000 }).toLowerCase();
  } catch { /* no ps available */ }

  for (const cli of EXTERNAL_CLIS) {
    const running = psList ? cli.processPatterns.some((p) => psList.includes(p.toLowerCase())) : false;
    const installed = cli.binaryNames.some((b) => binaryExists(b));

    if (!running && !installed) continue;

    const extModel = `codemax-ext-${extIndex}`;
    const status = running ? "online" as const : "offline" as const;

    // If the CLI has an HTTP server, try to probe it
    let url: string | undefined;
    if (cli.defaultPort && cli.chatPath) {
      const probed = await probeChatEndpoint(cli.defaultPort);
      if (probed) url = probed;
      else url = `http://localhost:${cli.defaultPort}${cli.chatPath}`;
    }

    endpoints.push({
      id: `ext-${extIndex}`,
      name: `${cli.icon} ${cli.name}`,
      url: url || `ext://${cli.name}`,
      status,
      type: url ? "http" : "local",
      model: extModel,
      lastChecked: new Date(),
    });

    extIndex++;
  }

  return endpoints;
}

/** POST a minimal LLM payload — only 2xx/4xx from a real LLM server counts */
async function probeChatEndpoint(port: number): Promise<string | null> {
  const paths = ["/v1/chat/completions", "/api/chat"];
  for (const path of paths) {
    const url = `http://localhost:${port}${path}`;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1200);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [] }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.ok || res.status === 400 || res.status === 422) {
        const text = await res.text().catch(() => "");
        if (text.trim().startsWith("{") || text.trim().startsWith("[")) {
          return url;
        }
      }
    } catch { /* port not open */ }
  }
  return null;
}

async function probeVersion(port: number): Promise<{ version?: string; model?: string }> {
  const probe = VERSION_PROBES[port];
  if (!probe) return {};
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1200);
    const res = await fetch(`http://localhost:${port}${probe.path}`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return {};
    return probe.extract(await res.text());
  } catch {
    return {};
  }
}

export async function sendMessageToCLI(
  endpoint: CLIEndpoint,
  messages: { role: string; content: string }[],
  onChunk?: (chunk: string) => void
): Promise<string> {
  const body = JSON.stringify({
    messages,
    stream: !!onChunk,
    ...(endpoint.model ? { model: endpoint.model } : {}),
  });

  const res = await fetch(endpoint.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  if (!res.ok) {
    throw new Error(`CLI responded with ${res.status}: ${res.statusText}`);
  }

  if (onChunk && res.body) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let full = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value);
      // Handle SSE / NDJSON
      const lines = text.split("\n").filter(Boolean);
      for (const line of lines) {
        const clean = line.replace(/^data:\s*/, "");
        if (clean === "[DONE]") continue;
        try {
          const json = JSON.parse(clean);
          const delta =
            json.choices?.[0]?.delta?.content ||
            json.message?.content ||
            json.content ||
            "";
          if (delta) {
            full += delta;
            onChunk(delta);
          }
        } catch {
          // plain text chunk
          full += clean;
          onChunk(clean);
        }
      }
    }
    return full;
  }

  const json = await res.json();
  return (
    json.choices?.[0]?.message?.content ||
    json.message?.content ||
    json.content ||
    JSON.stringify(json)
  );
}
