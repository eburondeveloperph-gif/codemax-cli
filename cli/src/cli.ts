#!/usr/bin/env node
/**
 * Eburon Codemax CLI
 * Autonomous coding agent powered by eburonmax/codemax-v3 via opencode
 * Created by Master E of Eburon AI, founded by Jo Lernout
 */
import chalk from "chalk";
import * as readline from "readline";
import { spawn } from "child_process";
import { createInterface } from "readline";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_DIR = resolve(__dirname, "..");

const OPENCODE_BIN =
  process.env.OPENCODE_PATH ||
  `${process.env.HOME}/.opencode/bin/opencode` ||
  "opencode";

const MODEL = "ollama/eburonmax/codemax-v3";
const VERSION = "1.0.0";

// ─── Colour palette ───────────────────────────────────────────────
const c = {
  brand: chalk.hex("#7C3AED"),      // violet
  accent: chalk.hex("#06B6D4"),     // cyan
  dim:    chalk.hex("#6B7280"),     // gray
  green:  chalk.hex("#10B981"),     // emerald
  yellow: chalk.hex("#F59E0B"),     // amber
  red:    chalk.hex("#EF4444"),     // red
  white:  chalk.hex("#F9FAFB"),     // near-white
  code:   chalk.hex("#A78BFA"),     // light purple for code
};

// ─── Banner ───────────────────────────────────────────────────────
function printBanner() {
  const w = 62;
  const line = "─".repeat(w);
  console.log(c.brand("╭" + line + "╮"));
  console.log(
    c.brand("│") +
    "  " +
    c.brand("⚡") +
    c.white.bold(" EBURON CODEMAX CLI") +
    c.dim("  ·  ") +
    c.accent(`eburonmax/codemax-v3`) +
    c.dim("  ·  ") +
    c.dim("opencode") +
    c.dim("  ·  v" + VERSION) +
    "  " +
    c.brand("│")
  );
  console.log(
    c.brand("│") +
    c.dim("  Autonomous coding agent by ") +
    c.accent("Master E") +
    c.dim(", Eburon AI (founded by Jo Lernout)") +
    "   " +
    c.brand("│")
  );
  console.log(c.brand("╰" + line + "╯"));
  console.log();
}

function printHelp() {
  console.log(c.white.bold("Usage:"));
  console.log(c.dim("  eburon-codemax start    ") + "Start full stack (web app + bridge server)");
  console.log(c.dim("  eburon-codemax [prompt] ") + "Single-shot generation");
  console.log(c.dim("  eburon-codemax          ") + "Interactive mode");
  console.log();
  console.log(c.white.bold("Commands:"));
  console.log(c.dim("  /help        ") + "Show this help");
  console.log(c.dim("  /clear       ") + "Clear conversation history");
  console.log(c.dim("  /model       ") + "Show current model info");
  console.log(c.dim("  /session     ") + "Show session info");
  console.log(c.dim("  /exit        ") + "Exit the CLI");
  console.log(c.dim("  Ctrl+C       ") + "Exit");
  console.log();
  console.log(c.white.bold("Examples:"));
  console.log(c.dim("  ❯ ") + "create a React todo app with Tailwind CSS");
  console.log(c.dim("  ❯ ") + "refactor this function to use async/await");
  console.log(c.dim("  ❯ ") + "explain how event loop works in Node.js");
  console.log();
}

// ─── Spinner ──────────────────────────────────────────────────────
const JOKES = [
  "eburonmax/codemax-v3 is warming up its neurons… ☕",
  "Summoning the autonomous agent… 🤖",
  "Teaching the machine to care about semicolons… 🎓",
  "Consulting the spirits of clean code… 👻",
  "Solving problems that haven't happened yet… 🔮",
  "Running 1000x faster than your last developer… 🚀",
  "If it compiles on first try, I work here forever… 🤞",
  "Turning caffeine into code via AI… ☕→💻",
  "Asking eburonmax/codemax-v3 nicely… please work… 🙏",
  "The stack is thinking… do NOT interrupt… 🧠",
];

let spinnerInterval: ReturnType<typeof setInterval> | null = null;
let jokeIndex = 0;

function startSpinner() {
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let fi = 0;
  jokeIndex = Math.floor(Math.random() * JOKES.length);
  process.stdout.write("\n");
  spinnerInterval = setInterval(() => {
    const frame = frames[fi++ % frames.length];
    const joke = JOKES[jokeIndex % JOKES.length];
    process.stdout.write(
      `\r  ${c.accent(frame)} ${c.dim(joke)}    `
    );
    if (fi % 12 === 0) jokeIndex++;
  }, 100);
}

function stopSpinner() {
  if (spinnerInterval) {
    clearInterval(spinnerInterval);
    spinnerInterval = null;
    process.stdout.write("\r" + " ".repeat(80) + "\r");
  }
}

// ─── Code block highlighter (minimal, terminal) ───────────────────
function highlightBlock(lang: string, code: string): string {
  const lines = code.split("\n");
  const header = c.dim("  ╭─ ") + c.accent(lang || "code") + c.dim(" " + "─".repeat(Math.max(0, 48 - lang.length)) + "╮");
  const body = lines.map((l) => c.dim("  │ ") + c.code(l)).join("\n");
  const footer = c.dim("  ╰" + "─".repeat(52) + "╯");
  return `\n${header}\n${body}\n${footer}\n`;
}

function renderResponse(text: string): string {
  // Replace markdown code fences with terminal-highlighted blocks
  return text.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) =>
    highlightBlock(lang, code.trimEnd())
  );
}

// ─── opencode runner ─────────────────────────────────────────────
interface Message { role: "user" | "assistant"; content: string }
const history: Message[] = [];

function runPrompt(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = [
      "run",
      "--model", MODEL,
      "--dir", CLI_DIR,
    ];

    // Pass conversation context: build a combined prompt with history
    const fullPrompt = history.length > 0
      ? history.map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n\n") +
        `\n\nUser: ${prompt}`
      : prompt;

    args.push(fullPrompt);

    const proc = spawn(OPENCODE_BIN, args, {
      env: { ...process.env, TERM: "xterm-256color" },
      cwd: CLI_DIR,
    });

    let output = "";
    let firstChunk = true;

    proc.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      if (firstChunk) {
        stopSpinner();
        process.stdout.write("\n" + c.brand("  ┌─ ") + c.white.bold("eburonmax/codemax-v3") + "\n");
        firstChunk = false;
      }
      output += text;
      // Stream output in real-time with indentation
      const rendered = renderResponse(text);
      process.stdout.write(
        rendered
          .split("\n")
          .map((l) => (l.trim() ? "  " + l : l))
          .join("\n")
      );
    });

    proc.stderr.on("data", (chunk: Buffer) => {
      // Suppress verbose opencode stderr unless debug mode
      if (process.env.EBURON_DEBUG) {
        process.stderr.write(c.dim(chunk.toString()));
      }
    });

    proc.on("close", (code) => {
      stopSpinner();
      if (!firstChunk) {
        process.stdout.write("\n" + c.brand("  └─────────────────────────────────────────────────\n"));
      }
      if (code === 0 || output.length > 0) {
        resolve(output);
      } else {
        reject(new Error(`opencode exited with code ${code}`));
      }
    });

    proc.on("error", (err) => {
      stopSpinner();
      reject(err);
    });
  });
}

// ─── Start command: full stack launcher ──────────────────────────
async function findFreePort(start: number): Promise<number> {
  const { createServer } = await import("net");
  return new Promise((resolve) => {
    const s = createServer();
    s.listen(start, () => { const addr = s.address(); s.close(() => resolve(typeof addr === "object" && addr ? addr.port : start)); });
    s.on("error", () => resolve(findFreePort(start + 1)));
  });
}

async function handleStart() {
  const APP_ROOT = resolve(CLI_DIR, "..");

  printBanner();
  console.log(c.white.bold("  Starting Eburon Codemax full stack…\n"));

  // 1. Check Ollama
  process.stdout.write(c.dim("  Checking Ollama…  "));
  try {
    const res = await fetch("http://localhost:11434/api/tags");
    if (!res.ok) throw new Error("not ok");
    process.stdout.write(c.green("✔\n"));
  } catch {
    process.stdout.write(c.red("✖\n"));
    console.error(c.red("  Ollama is not running. ") + c.dim("Start with: ollama serve\n"));
    process.exit(1);
  }

  // 2. Check model
  process.stdout.write(c.dim("  Checking eburonmax/codemax-v3…  "));
  try {
    const res = await fetch("http://localhost:11434/api/tags");
    const data: { models?: { name: string }[] } = await res.json();
    const has = data.models?.some((m) => m.name.includes("codemax-v3"));
    if (has) {
      process.stdout.write(c.green("✔\n"));
    } else {
      process.stdout.write(c.yellow("pulling…\n"));
      const pull = spawn("ollama", ["pull", "eburonmax/codemax-v3"], { stdio: "inherit" });
      await new Promise<void>((r, j) => { pull.on("close", (code) => code === 0 ? r() : j(new Error(`pull failed: ${code}`))); });
      console.log(c.green("  ✔ ") + "Model ready");
    }
  } catch (e) {
    console.warn(c.yellow("  ⚠ ") + "Could not verify model: " + (e instanceof Error ? e.message : e));
  }

  // 3. Start CLI bridge server
  process.stdout.write(c.dim("  Starting bridge server :3333…  "));
  const bridge = spawn("node", ["cli/dist/server.js"], {
    cwd: APP_ROOT,
    detached: true,
    stdio: "ignore",
  });
  bridge.unref();
  await new Promise((r) => setTimeout(r, 800));
  try {
    const check = await fetch("http://localhost:3333/health");
    process.stdout.write(check.ok ? c.green("✔\n") : c.yellow("starting…\n"));
  } catch {
    process.stdout.write(c.yellow("starting…\n"));
  }

  // 4. Determine port for Next.js
  const appPort = String(await findFreePort(Number(process.env.PORT ?? 3000)));

  console.log("");
  console.log(c.brand("  ╭──────────────────────────────────────────────╮"));
  console.log(c.brand("  │") + c.white.bold("  ⚡ Eburon Codepilot is launching              ") + c.brand("│"));
  console.log(c.brand("  │") + c.dim(`  Web app   →  http://localhost:${appPort}           `) + c.brand("│"));
  console.log(c.brand("  │") + c.dim(`  CLI API   →  http://localhost:3333           `) + c.brand("│"));
  console.log(c.brand("  │") + c.dim(`  Model     →  eburonmax/codemax-v3           `) + c.brand("│"));
  console.log(c.brand("  ╰──────────────────────────────────────────────╯"));
  console.log("");
  console.log(c.dim("  Press Ctrl+C to stop all services.\n"));

  // 5. Start Next.js (foreground — keeps process alive)
  const next = spawn("npm", ["run", "dev"], {
    cwd: APP_ROOT,
    stdio: "inherit",
    env: { ...process.env, PORT: appPort },
  });

  process.on("SIGINT",  () => { next.kill("SIGINT");  process.exit(0); });
  process.on("SIGTERM", () => { next.kill("SIGTERM"); process.exit(0); });
  next.on("close", () => process.exit(0));
}

// ─── Session state ────────────────────────────────────────────────
let sessionStart = new Date();
let turnCount = 0;

function formatUptime(): string {
  const ms = Date.now() - sessionStart.getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

// ─── Main REPL ────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);

  // ── start command ──────────────────────────────────────────────
  if (args[0] === "start") {
    await handleStart();
    return;
  }

  // Single-shot mode: eburon-codemax "my prompt"
  if (args.length > 0 && !args[0].startsWith("-")) {
    const singlePrompt = args.join(" ");
    printBanner();
    startSpinner();
    try {
      const result = await runPrompt(singlePrompt);
      history.push({ role: "user", content: singlePrompt });
      history.push({ role: "assistant", content: result });
    } catch (err) {
      stopSpinner();
      console.error(c.red("\n  ✖ Error: ") + (err instanceof Error ? err.message : String(err)));
      process.exit(1);
    }
    process.exit(0);
  }

  // Interactive mode
  printBanner();
  console.log(c.dim("  Type your prompt or ") + c.white("/help") + c.dim(" for commands. ") + c.dim("Ctrl+C to exit.\n"));

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  const prompt = () => {
    process.stdout.write(
      c.brand("  ❯ ") + c.white("")
    );
  };

  const ask = () =>
    new Promise<string>((res) => {
      rl.question(c.brand("  ❯ "), (ans) => res(ans.trim()));
    });

  // Handle Ctrl+C gracefully
  rl.on("SIGINT", () => {
    console.log(c.dim("\n\n  Goodbye from Eburon Codemax CLI! 👋\n"));
    process.exit(0);
  });

  // Main interaction loop
  while (true) {
    const input = await ask();

    if (!input) continue;

    // Slash commands
    if (input.startsWith("/")) {
      const cmd = input.slice(1).split(" ")[0].toLowerCase();
      switch (cmd) {
        case "exit":
        case "quit":
          console.log(c.dim("\n  Goodbye from Eburon Codemax CLI! 👋\n"));
          rl.close();
          process.exit(0);
          break;
        case "help":
          printHelp();
          break;
        case "clear":
          history.length = 0;
          turnCount = 0;
          sessionStart = new Date();
          console.clear();
          printBanner();
          console.log(c.green("  ✔ ") + c.dim("Conversation cleared.\n"));
          break;
        case "model":
          console.log();
          console.log(c.white.bold("  Model:      ") + c.accent(MODEL));
          console.log(c.white.bold("  Provider:   ") + c.dim("Ollama (local)"));
          console.log(c.white.bold("  Engine:     ") + c.dim("opencode v1.x"));
          console.log(c.white.bold("  Context:    ") + c.dim("8192 tokens"));
          console.log();
          break;
        case "session":
          console.log();
          console.log(c.white.bold("  Uptime:     ") + c.dim(formatUptime()));
          console.log(c.white.bold("  Turns:      ") + c.dim(String(turnCount)));
          console.log(c.white.bold("  History:    ") + c.dim(`${history.length} messages`));
          console.log();
          break;
        default:
          console.log(c.yellow("  ⚠ Unknown command: ") + input + c.dim("  (try /help)\n"));
      }
      continue;
    }

    // Normal prompt
    turnCount++;
    history.push({ role: "user", content: input });
    startSpinner();

    try {
      const response = await runPrompt(input);
      history.push({ role: "assistant", content: response });
      process.stdout.write("\n");
    } catch (err) {
      stopSpinner();
      const msg = err instanceof Error ? err.message : String(err);
      console.error(c.red("\n  ✖ eburonmax/codemax-v3 error: ") + msg + "\n");
      // Pop the user message if we failed
      history.pop();
    }
  }
}

main().catch((err) => {
  console.error(c.red("Fatal: ") + err.message);
  process.exit(1);
});
