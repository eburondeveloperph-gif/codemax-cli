/**
 * Eburon Codemax Bridge Server
 * Exposes an Ollama-compatible HTTP API that routes to opencode/eburonmax/codemax-v3
 * Allows the Eburon Codepilot web app to use the CLI as its LLM backend.
 */
import http from "http";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_DIR = resolve(__dirname, "..");

const OPENCODE_BIN =
  process.env.OPENCODE_PATH ||
  `${process.env.HOME}/.opencode/bin/opencode` ||
  "opencode";

const MODEL = "ollama/eburonmax/codemax-v3";
const PORT = Number(process.env.EBURON_CLI_PORT ?? 3333);

// ─── opencode runner ─────────────────────────────────────────────
function runOpencode(
  prompt: string,
  onChunk: (text: string) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      OPENCODE_BIN,
      ["run", "--model", MODEL, "--dir", CLI_DIR, prompt],
      { env: { ...process.env }, cwd: CLI_DIR }
    );

    proc.stdout.on("data", (d: Buffer) => onChunk(d.toString()));
    proc.stderr.on("data", () => {}); // suppress
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`opencode exited ${code}`));
    });
    proc.on("error", reject);
  });
}

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
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        model: "eburonmax/codemax-v3",
        provider: "opencode",
        name: "Eburon Codemax CLI",
        version: "1.0.0",
      })
    );
    return;
  }

  // Ollama-compatible /api/tags (for model detection by the web app)
  if (url.pathname === "/api/tags") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        models: [{ name: "eburonmax/codemax-v3", model: "eburonmax/codemax-v3", size: 0 }],
      })
    );
    return;
  }

  // Chat endpoint — POST /api/chat
  if (req.method === "POST" && url.pathname === "/api/chat") {
    let body: {
      messages?: { role: string; content: string }[];
      stream?: boolean;
    } = {};
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON body" }));
      return;
    }

    const messages = body.messages ?? [];
    if (messages.length === 0) {
      // Probe request from detector — just return 200
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: { role: "assistant", content: "" }, done: true }));
      return;
    }

    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const prompt = lastUser?.content ?? "";

    const streaming = body.stream !== false;

    if (streaming) {
      res.writeHead(200, {
        "Content-Type": "application/x-ndjson",
        "Transfer-Encoding": "chunked",
        "Cache-Control": "no-cache",
      });
    }

    let fullResponse = "";

    try {
      await runOpencode(prompt, (chunk) => {
        fullResponse += chunk;
        if (streaming && !res.destroyed) {
          const event = {
            model: "eburonmax/codemax-v3",
            message: { role: "assistant", content: chunk },
            done: false,
          };
          res.write(JSON.stringify(event) + "\n");
        }
      });

      if (streaming && !res.destroyed) {
        res.write(
          JSON.stringify({
            model: "eburonmax/codemax-v3",
            message: { role: "assistant", content: "" },
            done: true,
          }) + "\n"
        );
        res.end();
      } else if (!streaming) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            model: "eburonmax/codemax-v3",
            message: { role: "assistant", content: fullResponse },
            done: true,
          })
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: msg }));
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
  ⚡ Eburon Codemax CLI Bridge Server
  ──────────────────────────────────────
  Running on  http://localhost:${PORT}
  Model       eburonmax/codemax-v3  (via opencode)
  Creator     Master E · Eburon AI
  
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
