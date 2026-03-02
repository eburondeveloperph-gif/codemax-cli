/**
 * Eburon Copilot — Ollama Detection & Health
 * Centralized check for Ollama server reachability, model availability,
 * and auto-pull support. Works with any host/IP via OLLAMA_URL.
 */

export interface OllamaStatus {
  reachable: boolean;
  url: string;
  version?: string;
  models: string[];
  modelReady: boolean;
  targetModel: string;
  error?: string;
}

const DEFAULT_OLLAMA_URL = "http://localhost:11434";
const DEFAULT_MODEL = "eburonmax/codemax-v3";
const TIMEOUT_MS = 5000;

function getOllamaUrl(): string {
  return (process.env.OLLAMA_URL ?? DEFAULT_OLLAMA_URL).replace(/\/+$/, "");
}

function getTargetModel(): string {
  return process.env.EBURON_MODEL ?? DEFAULT_MODEL;
}

/**
 * Probe Ollama at the configured OLLAMA_URL (any host/IP).
 * Returns full status: reachable, version, models, model readiness.
 */
export async function checkOllamaStatus(): Promise<OllamaStatus> {
  const url = getOllamaUrl();
  const targetModel = getTargetModel();
  const result: OllamaStatus = {
    reachable: false,
    url,
    models: [],
    modelReady: false,
    targetModel,
  };

  // Step 1: Check if Ollama server is reachable (GET / returns "Ollama is running")
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (res.ok) {
      const text = await res.text();
      result.reachable = true;
      // Ollama root returns "Ollama is running" on success
      if (!text.toLowerCase().includes("ollama")) {
        // Might still be valid — some versions return version JSON
        try {
          const j = JSON.parse(text);
          result.version = j.version;
        } catch { /* plain text, fine */ }
      }
    }
  } catch (e) {
    result.error = (e as Error).message;
    return result;
  }

  // Step 2: Get version info
  if (!result.version) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const res = await fetch(`${url}/api/version`, { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        result.version = data.version;
      }
    } catch { /* version endpoint may not exist in older versions */ }
  }

  // Step 3: List available models
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(`${url}/api/tags`, { signal: controller.signal });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      result.models = (data.models ?? []).map((m: { name: string }) => m.name);
    }
  } catch (e) {
    if (!result.error) result.error = (e as Error).message;
  }

  // Step 4: Check if target model is present
  result.modelReady = result.models.some(
    (m) => m === targetModel || m === `${targetModel}:latest` || m.startsWith(`${targetModel}:`)
  );

  return result;
}

/**
 * Pull a model on the remote Ollama server via POST /api/pull.
 * Returns an async generator of progress events.
 */
export async function* pullModel(
  model?: string
): AsyncGenerator<{ status: string; completed?: number; total?: number }> {
  const url = getOllamaUrl();
  const targetModel = model ?? getTargetModel();

  const res = await fetch(`${url}/api/pull`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: targetModel, stream: true }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Pull failed (${res.status}): ${text.slice(0, 200)}`);
  }

  if (!res.body) {
    throw new Error("No response body from Ollama pull");
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
        yield JSON.parse(line);
      } catch { /* skip non-JSON */ }
    }
  }
  if (buffer.trim()) {
    try { yield JSON.parse(buffer); } catch { /* skip */ }
  }
}

/**
 * Quick boolean check — is Ollama reachable at the configured URL?
 */
export async function isOllamaReachable(): Promise<boolean> {
  try {
    const url = getOllamaUrl();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Quick boolean check — is the target model available?
 */
export async function isModelAvailable(model?: string): Promise<boolean> {
  const status = await checkOllamaStatus();
  if (!status.reachable) return false;
  const target = model ?? getTargetModel();
  return status.models.some(
    (m) => m === target || m === `${target}:latest` || m.startsWith(`${target}:`)
  );
}
