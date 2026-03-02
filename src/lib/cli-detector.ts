import { CLIEndpoint } from "@/types";

const DEFAULT_PORTS = [3333, 3001, 4000, 5000, 8000, 8080, 8888, 11434, 1234];

/** Preferred model names — first match wins */
const PREFERRED_MODELS = [
  "eburonmax/codemax-v3",
  "eburonmax/codemax-v3:latest",
  "codemax-v3",
  "codemax-v3:latest",
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

  // Well-known local ports — only add if confirmed to be an LLM runtime
  for (const port of DEFAULT_PORTS) {
    const { version, model } = await probeVersion(port);
    if (model !== undefined) {
      // Known LLM runtime confirmed via version probe
      const chatPath = port === 1234 ? "/v1/chat/completions" : "/api/chat";
      detected.push({
        id: `local-${port}`,
        name: port === 3333
          ? `Eburon Codemax CLI :${port}${model ? ` — ${model}` : ""}`
          : `Eburon Model (maximus-cli) :${port}${model ? ` — ${model}` : ""}`,
        url: `http://localhost:${port}${chatPath}`,
        status: "online",
        type: "http",
        version,
        model,
        lastChecked: new Date(),
      });
    } else {
      // Unknown port — probe for LLM chat paths with a POST to avoid false positives
      const confirmed = await probeChatEndpoint(port);
      if (confirmed) {
        detected.push({
          id: `local-${port}`,
          name: `Eburon Model (maximus-cli) :${port}`,
          url: confirmed,
          status: "online",
          type: "http",
          lastChecked: new Date(),
        });
      }
    }
  }

  return detected;
}

/** POST a minimal LLM payload — only 2xx/4xx from a real LLM server counts */
async function probeChatEndpoint(port: number): Promise<string | null> {
  const paths = ["/v1/chat/completions", "/api/chat"];
  for (const path of paths) {
    const url = `http://localhost:${port}${path}`;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [] }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      // 400/422 = bad request but server understood the LLM payload shape
      // 200/201 = success
      if (res.ok || res.status === 400 || res.status === 422) {
        const text = await res.text().catch(() => "");
        // Must look like JSON from an LLM server, not an HTML page
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
    const timeout = setTimeout(() => controller.abort(), 2000);
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
