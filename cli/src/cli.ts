#!/usr/bin/env node
/**
 * Eburon Copilot CLI — v2.0
 * Terminal-interactive AI coding agent with REPL, TUI, and Web modes.
 * Created by Master E of Eburon AI, founded by Jo Lernout.
 *
 * Modes:
 *   eburon chat       → Interactive REPL (like Codex CLI / Gemini CLI)
 *   eburon tui        → Full terminal UI (like OpenCode)
 *   eburon start      → Launch web app + bridge server
 *   eburon [prompt]   → Single-shot generation
 *   eburon            → Default: interactive REPL
 */
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { CONFIG } from "./core/config.js";
import { banner, brand, accent, muted, bold, dim, green, yellow, red, T, BOX } from "./core/theme.js";
import { startRepl } from "./repl/index.js";
import { streamChat, checkOllama, type ChatMessage } from "./core/agent.js";
import { renderMarkdown, Spinner } from "./repl/renderer.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_DIR = resolve(__dirname, "..");
const APP_ROOT = resolve(CLI_DIR, "..");
const VERSION = CONFIG.version;

// ─── Start command: full stack launcher (web + bridge) ──────────
async function findFreePort(start: number): Promise<number> {
  const { createServer } = await import("net");
  return new Promise((resolve) => {
    const s = createServer();
    s.listen(start, () => {
      const addr = s.address();
      s.close(() => resolve(typeof addr === "object" && addr ? addr.port : start));
    });
    s.on("error", () => resolve(findFreePort(start + 1)));
  });
}

async function handleStart() {
  console.log(banner());
  console.log(bold("  Starting Eburon Copilot full stack…\n"));

  // 1. Check Ollama (respects OLLAMA_URL — any host/IP)
  process.stdout.write(dim(`  Checking Ollama at ${CONFIG.ollamaUrl}…  `));
  const status = await checkOllama();
  if (!status.ok) {
    console.log(red("✖"));
    console.error(red("  Ollama is not reachable: ") + dim(status.error ?? "unknown error"));
    console.log(dim("    URL: ") + accent(CONFIG.ollamaUrl));
    const isRemote = !CONFIG.ollamaUrl.includes("localhost") && !CONFIG.ollamaUrl.includes("127.0.0.1");
    if (isRemote) {
      console.log(dim("    Ensure Ollama is running on the remote host with: ") + accent("OLLAMA_HOST=0.0.0.0 ollama serve"));
    } else {
      console.log(dim("    Start with: ") + accent("ollama serve"));
    }
    console.log(dim("    Or set OLLAMA_URL to point to a running instance\n"));
    process.exit(1);
  }
  console.log(green("✔") + (status.version ? dim(` v${status.version}`) : ""));

  // 2. Check model (auto-pull if missing — works for local and remote)
  process.stdout.write(dim(`  Checking model ${CONFIG.model}…  `));
  if (status.modelReady) {
    console.log(green("✔"));
  } else {
    console.log(yellow("not found — pulling…"));
    try {
      const { pullModelStream } = await import("./core/agent.js");
      let lastStatus = "";
      for await (const event of pullModelStream()) {
        if (event.status && event.status !== lastStatus) {
          process.stdout.write(dim(`    ${event.status}\r`));
          lastStatus = event.status;
        }
      }
      console.log(green("  ✔ ") + "Model ready");
    } catch (err) {
      console.log(red("  ✖ ") + dim((err as Error).message));
      console.log(dim("    Pull manually: ") + accent(`ollama pull ${CONFIG.model}\n`));
      process.exit(1);
    }
  }

  // 3. Start CLI bridge server
  process.stdout.write(dim("  Starting bridge server :3333…  "));
  const bridge = spawn("node", ["cli/dist/server.js"], {
    cwd: APP_ROOT,
    detached: true,
    stdio: "ignore",
  });
  bridge.unref();
  await new Promise((r) => setTimeout(r, 800));
  try {
    const check = await fetch("http://localhost:3333/health");
    console.log(check.ok ? green("✔") : yellow("starting…"));
  } catch {
    console.log(yellow("starting…"));
  }

  // 4. Determine port for Next.js
  const appPort = String(await findFreePort(Number(process.env.PORT ?? 3000)));

  console.log("");
  console.log(brand(`  ${BOX.tl}${"─".repeat(50)}${BOX.tr}`));
  console.log(brand(`  ${BOX.v}`) + bold("  ⚡ Eburon Copilot is launching") + " ".repeat(19) + brand(BOX.v));
  console.log(brand(`  ${BOX.v}`) + dim(`  Web app   →  http://localhost:${appPort}`) + " ".repeat(15) + brand(BOX.v));
  console.log(brand(`  ${BOX.v}`) + dim(`  CLI API   →  http://localhost:3333`) + " ".repeat(15) + brand(BOX.v));
  console.log(brand(`  ${BOX.v}`) + dim(`  Model     →  ${CONFIG.model}`) + " ".repeat(10) + brand(BOX.v));
  console.log(brand(`  ${BOX.bl}${"─".repeat(50)}${BOX.br}`));
  console.log("");
  console.log(dim("  Press Ctrl+C to stop all services.\n"));

  // 5. Start Next.js (foreground — keeps process alive)
  const next = spawn("npm", ["run", "dev"], {
    cwd: APP_ROOT,
    stdio: "inherit",
    env: { ...process.env, PORT: appPort },
  });

  process.on("SIGINT", () => { next.kill("SIGINT"); process.exit(0); });
  process.on("SIGTERM", () => { next.kill("SIGTERM"); process.exit(0); });
  next.on("close", () => process.exit(0));
}

// ─── Single-shot mode ────────────────────────────────────────────
async function handleSingleShot(prompt: string): Promise<void> {
  console.log(banner());
  const spinner = new Spinner();
  spinner.start("Thinking…");

  const messages: ChatMessage[] = [{ role: "user", content: prompt }];
  let firstChunk = true;
  let fullResponse = "";

  try {
    for await (const chunk of streamChat(messages, { tools: false })) {
      if (chunk.type === "text") {
        if (firstChunk) {
          spinner.stop();
          console.log(`\n  ${T.brand}┌─${T.reset} ${bold("Eburon Copilot")}`);
          firstChunk = false;
        }
        fullResponse += chunk.content ?? "";
        process.stdout.write(
          renderMarkdown(chunk.content ?? "")
            .split("\n")
            .map((l, i) => (i === 0 ? l : `  ${l}`))
            .join("\n")
        );
      } else if (chunk.type === "error") {
        spinner.stop();
        console.error(red(`\n  ✖ Error: ${chunk.error}\n`));
        process.exit(1);
      }
    }
    spinner.stop();
    if (!firstChunk) {
      console.log(`\n  ${T.brand}└${"─".repeat(55)}${T.reset}\n`);
    }
  } catch (err) {
    spinner.stop();
    console.error(red("\n  ✖ Error: ") + (err instanceof Error ? err.message : String(err)));
    process.exit(1);
  }
}

// ─── Help ─────────────────────────────────────────────────────────
function printUsage(): void {
  console.log(banner());
  console.log(bold("  Usage:"));
  console.log(`  ${accent("eburon chat")}           ${muted("Interactive REPL (like Codex CLI / Gemini CLI)")}`);
  console.log(`  ${accent("eburon tui")}            ${muted("Full terminal UI (like OpenCode)")}`);
  console.log(`  ${accent("eburon start")}          ${muted("Launch web app + bridge server (v0-style frontend)")}`);
  console.log(`  ${accent("eburon [prompt]")}       ${muted("Single-shot generation")}`);
  console.log(`  ${accent("eburon")}                ${muted("Default: interactive REPL")}`);
  console.log();
  console.log(bold("  Options:"));
  console.log(`  ${accent("--help, -h")}            ${muted("Show this help")}`);
  console.log(`  ${accent("--version, -v")}         ${muted("Show version")}`);
  console.log();
  console.log(bold("  Environment:"));
  console.log(`  ${accent("EBURON_MODEL")}          ${muted("Override model (default: " + CONFIG.model + ")")}`);
  console.log(`  ${accent("OLLAMA_URL")}            ${muted("Override Ollama URL (default: " + CONFIG.ollamaUrl + ")")}`);
  console.log();
}

// ─── Main router ──────────────────────────────────────────────────
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0]?.toLowerCase();

  switch (command) {
    case "--help":
    case "-h":
    case "help":
      printUsage();
      break;

    case "--version":
    case "-v":
    case "version":
      console.log(`Eburon Copilot CLI v${VERSION}`);
      break;

    case "start":
      await handleStart();
      break;

    case "chat":
    case "repl":
      await startRepl();
      break;

    case "tui":
    case "ui":
      // Dynamic import to avoid loading blessed unless needed
      const { startTUI } = await import("./tui/index.js");
      await startTUI();
      break;

    case undefined:
      // No command = default to interactive REPL
      await startRepl();
      break;

    default:
      // Treat as single-shot prompt
      if (!command.startsWith("-")) {
        await handleSingleShot(args.join(" "));
      } else {
        console.log(red(`  Unknown option: ${command}\n`));
        printUsage();
        process.exit(1);
      }
      break;
  }
}

main().catch((err) => {
  console.error(red("Fatal: ") + (err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
