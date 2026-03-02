/**
 * Eburon Codemax Bridge Server
 * Exposes an Ollama-compatible HTTP API that routes to eburonmax/codemax-v3
 * directly via Ollama — fully independent, no external CLI dependencies.
 */
import http from "http";

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const MODEL = process.env.EBURON_MODEL ?? "eburonmax/codemax-v3:latest";
const PORT = Number(process.env.EBURON_CLI_PORT ?? 3333);

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((res) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => res(data));
  });
}

// ─── HTTP Server ──────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health / detection endpoint
  if (url.pathname === "/health" || url.pathname === "/api/health") {
    // Probe Ollama to include live status
    let ollamaOk = false;
    let models: string[] = [];
    let version: string | undefined;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      const tagsRes = await fetch(`${OLLAMA_URL}/api/tags`, { signal: controller.signal });
      clearTimeout(timer);
      if (tagsRes.ok) {
        ollamaOk = true;
        const data = await tagsRes.json();
        models = (data.models ?? []).map((m: { name: string }) => m.name);
      }
    } catch { /* not reachable */ }
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2000);
      const vRes = await fetch(`${OLLAMA_URL}/api/version`, { signal: controller.signal });
      clearTimeout(timer);
      if (vRes.ok) { const d = await vRes.json(); version = d.version; }
    } catch { /* optional */ }

    const modelReady = models.some((m) => m === MODEL || m.startsWith("eburonmax/codemax-v3"));

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        model: MODEL,
        provider: "ollama",
        name: "Eburon Codemax CLI",
        version: "2.0.0",
        ollama: {
          url: OLLAMA_URL,
          reachable: ollamaOk,
          version,
          models,
          modelReady,
        },
      })
    );
    return;
  }

  // Ollama-compatible /api/tags (for model detection by the web app)
  if (url.pathname === "/api/tags") {
    // Proxy to Ollama if available, otherwise return our model
    try {
      const ollamaRes = await fetch(`${OLLAMA_URL}/api/tags`);
      if (ollamaRes.ok) {
        const data = await ollamaRes.json();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(data));
        return;
      }
    } catch { /* fallback below */ }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        models: [{ name: MODEL, model: MODEL, size: 0 }],
      })
    );
    return;
  }

  // Chat endpoint — POST /api/chat (proxy to Ollama)
  if (req.method === "POST" && url.pathname === "/api/chat") {
    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON body" }));
      return;
    }

    const messages = (body.messages as Array<{ role: string; content: string }>) ?? [];
    if (messages.length === 0) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: { role: "assistant", content: "" }, done: true }));
      return;
    }

    const streaming = body.stream !== false;

    try {
      // Forward to Ollama directly
      const ollamaRes = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: (body.model as string) ?? MODEL,
          messages,
          stream: streaming,
        }),
      });

      if (!ollamaRes.ok) {
        const text = await ollamaRes.text();
        res.writeHead(ollamaRes.status, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: `Ollama error: ${ollamaRes.status}`, detail: text }));
        return;
      }

      if (streaming && ollamaRes.body) {
        res.writeHead(200, {
          "Content-Type": "application/x-ndjson",
          "Transfer-Encoding": "chunked",
          "Cache-Control": "no-cache",
        });

        // Stream Ollama response chunks to client
        const reader = (ollamaRes.body as ReadableStream<Uint8Array>).getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!res.destroyed) {
            res.write(decoder.decode(value, { stream: true }));
          }
        }
        if (!res.destroyed) res.end();
      } else {
        // Non-streaming: return full response
        const data = await ollamaRes.json();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(data));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!res.headersSent) {
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Cannot reach Ollama", detail: msg }));
      } else if (!res.destroyed) {
        res.end();
      }
    }
    return;
  }

  // 404
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, () => {
  console.log(`
  ⚡ Eburon Codemax Bridge Server
  ──────────────────────────────────────
  Running on  http://localhost:${PORT}
  Ollama      ${OLLAMA_URL}
  Model       ${MODEL}
  Creator     Jo Lernout · Eburon AI
  
  Endpoints:
    POST /api/chat    — Ollama-compatible chat
    GET  /api/tags    — Model list
    GET  /health      — Server health
  `);
});

server.on("error", (err) => {
  console.error("Bridge server error:", err.message);
  process.exit(1);
});
