#!/usr/bin/env node
// Runs after `npm install` inside the CLI package.
// 1. Checks OLLAMA_URL for remote Ollama (any host/IP)
// 2. Falls back to local Ollama detection
// 3. Pulls model only if not already present
import { execSync, spawnSync } from "child_process";
import { platform } from "os";

const MODEL = "eburonmax/codemax-v3";
const OS = platform();
const OLLAMA_URL = (process.env.OLLAMA_URL ?? "http://localhost:11434").replace(/\/+$/, "");
const IS_REMOTE = !OLLAMA_URL.includes("localhost") && !OLLAMA_URL.includes("127.0.0.1");

function run(cmd, opts = {}) {
  try {
    execSync(cmd, { stdio: "inherit", ...opts });
    return true;
  } catch {
    return false;
  }
}

function hasLocalOllama() {
  const r = spawnSync("ollama", ["--version"], { stdio: "pipe" });
  return r.status === 0;
}

/** Check if Ollama is reachable at the configured URL (any host/IP) */
async function probeOllamaUrl() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await globalThis.fetch(OLLAMA_URL, { signal: controller.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

/** List models on remote Ollama via API */
async function remoteModels() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await globalThis.fetch(`${OLLAMA_URL}/api/tags`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.models ?? []).map((m) => m.name);
  } catch {
    return [];
  }
}

/** Check model via local CLI */
function localHasModel() {
  try {
    const out = execSync("ollama list", { encoding: "utf8", stdio: ["pipe","pipe","pipe"] });
    return out.includes("eburonmax/codemax-v3");
  } catch {
    return false;
  }
}

function installOllama() {
  console.log("\n📦  Ollama not found locally. Installing…");
  if (OS === "darwin" || OS === "linux") {
    const ok = run("curl -fsSL https://ollama.com/install.sh | sh");
    if (!ok) {
      console.warn("⚠️  Automatic install failed. Install manually: https://ollama.com/download");
    }
  } else if (OS === "win32") {
    console.warn("⚠️  Windows detected. Install Ollama from: https://ollama.com/download/windows");
    console.warn("    Then run: ollama pull eburonmax/codemax-v3");
  }
}

function pullModelLocal() {
  console.log(`\n🤖  Pulling model ${MODEL} (this may take a while)…`);
  const r = spawnSync("ollama", ["pull", MODEL], { stdio: "inherit" });
  if (r.status !== 0) {
    console.warn(`⚠️  Could not pull ${MODEL} automatically.`);
    console.warn(`    Run manually: ollama pull ${MODEL}`);
  } else {
    console.log(`✅  Model ${MODEL} ready.`);
  }
}

/** Pull model on remote Ollama via API (non-streaming for postinstall) */
async function pullModelRemote() {
  console.log(`\n🤖  Pulling model ${MODEL} on ${OLLAMA_URL}…`);
  try {
    const res = await globalThis.fetch(`${OLLAMA_URL}/api/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: MODEL, stream: false }),
    });
    if (res.ok) {
      console.log(`✅  Model ${MODEL} pulled on remote server.`);
    } else {
      const text = await res.text().catch(() => "");
      console.warn(`⚠️  Remote pull failed (${res.status}): ${text.slice(0, 200)}`);
      console.warn(`    Pull manually on the host: ollama pull ${MODEL}`);
    }
  } catch (e) {
    console.warn(`⚠️  Remote pull error: ${e.message}`);
    console.warn(`    Pull manually on the host: ollama pull ${MODEL}`);
  }
}

// ── Main (async IIFE for fetch support) ──────────────────────────
(async () => {
  console.log("\n🔧  Eburon Codemax post-install setup…");
  console.log(`    OLLAMA_URL: ${OLLAMA_URL}${IS_REMOTE ? " (remote)" : " (local)"}`);

  // ── Check remote Ollama first ──────────────────────────────────
  const remoteReachable = await probeOllamaUrl();

  if (remoteReachable) {
    console.log(`✅  Ollama reachable at ${OLLAMA_URL}`);

    // Check if model is already available
    const models = await remoteModels();
    const hasModel = models.some((m) => m.includes("codemax-v3"));

    if (hasModel) {
      console.log(`✅  Model ${MODEL} already present on server.`);
    } else {
      console.log(`ℹ️  Model ${MODEL} not found. Available: ${models.slice(0, 5).join(", ") || "(none)"}`);
      if (IS_REMOTE) {
        await pullModelRemote();
      } else {
        // Local Ollama is running — use local pull
        pullModelLocal();
      }
    }
  } else if (IS_REMOTE) {
    // Remote configured but not reachable
    console.warn(`⚠️  Remote Ollama at ${OLLAMA_URL} is not reachable.`);
    console.warn(`    Ensure Ollama is running on the remote host with OLLAMA_HOST=0.0.0.0`);
    console.warn(`    Skipping model pull — will retry at runtime.`);
  } else {
    // Local mode — install Ollama if needed
    if (!hasLocalOllama()) {
      installOllama();
    }

    if (hasLocalOllama()) {
      if (localHasModel()) {
        console.log(`✅  Model ${MODEL} already present.`);
      } else {
        pullModelLocal();
      }
    } else {
      console.warn(`\n⚠️  Ollama is not installed. Skipping model pull.`);
      console.warn(`    Install Ollama: https://ollama.com/download`);
      console.warn(`    Then run:       ollama pull ${MODEL}`);
    }
  }

  console.log("\n✅  Eburon Codemax CLI installed successfully.");
  console.log("    Start with:  eburon-codemax start\n");
})();
