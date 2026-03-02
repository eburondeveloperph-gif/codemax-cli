#!/usr/bin/env node
// Runs after `npm install` inside the CLI package.
// 1. Compiles TypeScript (postinstall: npm run build)
// 2. Installs Ollama if missing
// 3. Pulls eburonmax/codemax-v3 if not present
import { execSync, spawnSync } from "child_process";
import { platform } from "os";

const MODEL = "eburonmax/codemax-v3";
const OS = platform();

function run(cmd, opts = {}) {
  try {
    execSync(cmd, { stdio: "inherit", ...opts });
    return true;
  } catch {
    return false;
  }
}

function hasOllama() {
  const r = spawnSync("ollama", ["--version"], { stdio: "pipe" });
  return r.status === 0;
}

function hasModel() {
  try {
    const out = execSync("ollama list", { encoding: "utf8", stdio: ["pipe","pipe","pipe"] });
    return out.includes("eburonmax/codemax-v3");
  } catch {
    return false;
  }
}

function installOllama() {
  console.log("\n📦  Ollama not found. Installing…");
  if (OS === "darwin" || OS === "linux") {
    const ok = run("curl -fsSL https://ollama.com/install.sh | sh");
    if (!ok) {
      console.warn("⚠️  Automatic install failed. Please install Ollama manually: https://ollama.com/download");
    }
  } else if (OS === "win32") {
    console.warn("⚠️  Windows detected. Please install Ollama manually from: https://ollama.com/download/windows");
    console.warn("    Then run: ollama pull eburonmax/codemax-v3");
  }
}

function pullModel() {
  console.log(`\n🤖  Pulling model ${MODEL} (19 GB — this may take a while)…`);
  const r = spawnSync("ollama", ["pull", MODEL], { stdio: "inherit" });
  if (r.status !== 0) {
    console.warn(`⚠️  Could not pull ${MODEL} automatically.`);
    console.warn(`    Run manually once Ollama is running: ollama pull ${MODEL}`);
  } else {
    console.log(`✅  Model ${MODEL} ready.`);
  }
}

// ── Main ──────────────────────────────────────────────────────────
console.log("\n🔧  Eburon Codemax post-install setup…");

if (!hasOllama()) {
  installOllama();
}

if (hasOllama()) {
  if (hasModel()) {
    console.log(`✅  Model ${MODEL} already present.`);
  } else {
    pullModel();
  }
} else {
  console.warn(`\n⚠️  Ollama is not installed. Skipping model pull.`);
  console.warn(`    Install Ollama: https://ollama.com/download`);
  console.warn(`    Then run:       ollama pull ${MODEL}`);
}

console.log("\n✅  Eburon Codemax CLI installed successfully.");
console.log("    Start with:  eburon-codemax start\n");
