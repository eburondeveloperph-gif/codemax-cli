/**
 * Eburon Copilot CLI — Interactive REPL
 * Terminal-interactive AI coding agent
 */
import { createInterface } from "readline";
import { CONFIG } from "../core/config.js";
import { streamChat, checkOllama, type ChatMessage, type ToolCall } from "../core/agent.js";
import { executeTool } from "../core/tools.js";
import { createSession, saveSession, syncSessionToDB, syncMessageToDB, syncToolToDB, closeDB, type Session } from "../core/session.js";
import { detectContext, contextSummary } from "../core/context.js";
import { T, brand, accent, muted, bold, green, yellow, red, dim, BOX, banner } from "../core/theme.js";
import { renderMarkdown, Spinner } from "./renderer.js";
import { renderToolCall, renderToolResult, renderApprovalPrompt } from "./tool-display.js";
import { handleCommand, type CommandContext } from "./commands.js";

let autoApproveAll = false;

async function askApproval(rl: ReturnType<typeof createInterface>, toolName: string): Promise<"yes" | "no" | "always"> {
  if (autoApproveAll) return "yes";
  if (toolName === "readFile" && CONFIG.autoApproveReads) return "yes";
  if (toolName === "listFiles" || toolName === "searchFiles") return "yes";
  if (toolName === "writeFile" && CONFIG.autoApproveWrites) return "yes";
  if (toolName === "shellExec" && CONFIG.autoApproveShell) return "yes";

  return new Promise((resolve) => {
    process.stdout.write(renderApprovalPrompt(toolName));
    rl.question("", (answer: string) => {
      const a = answer.trim().toLowerCase();
      if (a === "a" || a === "always") {
        autoApproveAll = true;
        resolve("always");
      } else if (a === "y" || a === "yes" || a === "") {
        resolve("yes");
      } else {
        resolve("no");
      }
    });
  });
}

export async function startRepl(): Promise<void> {
  // Print banner
  console.log(banner());

  // Check Ollama (respects OLLAMA_URL — any host/IP)
  const spinner = new Spinner();
  spinner.start(`Connecting to Ollama at ${CONFIG.ollamaUrl}...`);
  const ollamaStatus = await checkOllama();
  spinner.stop();

  if (!ollamaStatus.ok) {
    console.log(red("  ✖ Cannot connect to Ollama: ") + dim(ollamaStatus.error ?? "unknown error"));
    console.log(dim("    URL: ") + accent(CONFIG.ollamaUrl));
    const isRemote = !CONFIG.ollamaUrl.includes("localhost") && !CONFIG.ollamaUrl.includes("127.0.0.1");
    if (isRemote) {
      console.log(dim("    Ensure Ollama is running on the remote host with: ") + accent("OLLAMA_HOST=0.0.0.0 ollama serve"));
    } else {
      console.log(dim("    Start Ollama with: ") + accent("ollama serve"));
    }
    console.log(dim("    Or set OLLAMA_URL to point to a running instance\n"));
    process.exit(1);
  }

  const modelReady = ollamaStatus.modelReady;
  console.log(green("  ✔ ") + dim(`Ollama connected at ${CONFIG.ollamaUrl}`) + (ollamaStatus.version ? dim(` v${ollamaStatus.version}`) : ""));

  if (modelReady) {
    console.log(green("  ✔ ") + dim(`Model ${CONFIG.model} ready`));
  } else {
    console.log(yellow("  ⚠ ") + dim(`Model ${CONFIG.model} not found — pulling...`));
    try {
      const { pullModelStream } = await import("../core/agent.js");
      let lastStatus = "";
      for await (const event of pullModelStream()) {
        if (event.status && event.status !== lastStatus) {
          process.stdout.write(dim(`    ${event.status}\r`));
          lastStatus = event.status;
        }
      }
      console.log(green("  ✔ ") + dim("Model pulled successfully"));
    } catch (err) {
      console.log(red("  ✖ ") + dim(`Model pull failed: ${(err as Error).message}`));
      console.log(dim("    Pull manually: ") + accent(`ollama pull ${CONFIG.model}`));
      console.log(dim("    Continuing without model — responses may fail\n"));
    }
  }

  // Detect project context
  const ctx = detectContext();
  console.log(green("  ✔ ") + dim(contextSummary(ctx)));
  console.log();

  // Initialize session
  const session: Session = createSession(ctx.name);
  const history: ChatMessage[] = [];
  let turnCount = 0;

  // Sync session to DB (non-blocking)
  syncSessionToDB(session, "cli").catch(() => {});

  // Tips
  console.log(dim("  Type a prompt to start, or ") + accent("/help") + dim(" for commands. ") + dim("Ctrl+C to exit.\n"));

  // Setup readline
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
    prompt: "",
  });

  // Command context
  const cmdCtx: CommandContext = {
    history,
    sessionId: session.id,
    sessionStart: new Date(),
    turnCount,
    clearHistory: () => { history.length = 0; turnCount = 0; },
    clearScreen: () => { console.clear(); console.log(banner()); },
  };

  // Graceful exit
  rl.on("SIGINT", () => {
    console.log(dim("\n\n  Goodbye from Eburon Copilot! 👋\n"));
    if (history.length > 0) {
      session.messages = history;
      saveSession(session);
    }
    closeDB().finally(() => process.exit(0));
  });

  // REPL loop
  const ask = (): Promise<string> =>
    new Promise((resolve) => {
      rl.question(`  ${T.brand}❯${T.reset} `, (answer: string) => resolve(answer.trim()));
    });

  while (true) {
    const input = await ask();
    if (!input) continue;

    // Handle slash commands
    if (input.startsWith("/")) {
      const result = handleCommand(input, cmdCtx);
      if (result.handled && "exit" in result && result.exit) {
        if (history.length > 0) {
          session.messages = history;
          saveSession(session);
        }
        rl.close();
        process.exit(0);
      }
      continue;
    }

    // Normal prompt
    turnCount++;
    cmdCtx.turnCount = turnCount;
    history.push({ role: "user", content: input });

    // Sync user message to DB
    syncMessageToDB(session, { role: "user", content: input }).catch(() => {});

    // Update session title from first message
    if (turnCount === 1) {
      session.title = input.slice(0, 60);
      syncSessionToDB(session, "cli").catch(() => {});
    }

    await processPrompt(history, rl, spinner, session);

    // Auto-save
    session.messages = history;
    saveSession(session);
  }
}

async function processPrompt(
  history: ChatMessage[],
  rl: ReturnType<typeof createInterface>,
  spinner: Spinner,
  session: Session,
): Promise<void> {
  spinner.start("Thinking...");

  let fullResponse = "";
  let firstChunk = true;
  const pendingToolCalls: ToolCall[] = [];

  try {
    for await (const chunk of streamChat(history)) {
      switch (chunk.type) {
        case "text":
          if (firstChunk) {
            spinner.stop();
            console.log(`\n  ${T.brand}┌─${T.reset} ${bold("Eburon Copilot")}`);
            firstChunk = false;
          }
          fullResponse += chunk.content ?? "";
          // Stream text to terminal
          process.stdout.write(
            renderMarkdown(chunk.content ?? "")
              .split("\n")
              .map((l, i) => (i === 0 ? l : `  ${l}`))
              .join("\n")
          );
          break;

        case "tool_call":
          if (firstChunk) {
            spinner.stop();
            console.log(`\n  ${T.brand}┌─${T.reset} ${bold("Eburon Copilot")}`);
            firstChunk = false;
          }
          if (chunk.toolCall) {
            pendingToolCalls.push(chunk.toolCall);
          }
          break;

        case "error":
          spinner.stop();
          console.log(red(`\n  ✖ Error: ${chunk.error}\n`));
          history.pop(); // remove user message
          return;

        case "done":
          break;
      }
    }

    spinner.stop();

    // Close response box if we had text
    if (!firstChunk && pendingToolCalls.length === 0) {
      console.log(`\n  ${T.brand}└${BOX.h.repeat(55)}${T.reset}\n`);
    }

    // Handle tool calls
    if (pendingToolCalls.length > 0) {
      if (firstChunk) {
        console.log(`\n  ${T.brand}┌─${T.reset} ${bold("Eburon Copilot")} ${dim("(using tools)")}`);
      }

      // Add assistant message with tool calls to history
      history.push({
        role: "assistant",
        content: fullResponse,
        tool_calls: pendingToolCalls,
      });

      for (const tc of pendingToolCalls) {
        console.log(renderToolCall(tc));

        // Ask for approval
        const approval = await askApproval(rl, tc.function.name);

        if (approval === "no") {
          console.log(`  ${T.brand}${BOX.v}${T.reset}   ${red("✖")} ${dim("Denied by user")}`);
          console.log(`  ${T.brand}${BOX.v}${T.reset}`);

          history.push({
            role: "tool",
            content: "Tool call denied by user",
            name: tc.function.name,
          });
          continue;
        }

        // Execute tool
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.function.arguments);
        } catch {
          args = { raw: tc.function.arguments };
        }

        const t0 = Date.now();
        const result = executeTool(tc.function.name, args);
        const elapsed = Date.now() - t0;
        console.log(renderToolResult(tc.function.name, result));

        // Log tool execution to DB
        syncToolToDB(session, tc.function.name, args, result.output, result.success, elapsed).catch(() => {});

        // Add tool result to history
        history.push({
          role: "tool",
          content: result.output,
          name: tc.function.name,
        });
      }

      console.log(`  ${T.brand}└${BOX.h.repeat(55)}${T.reset}\n`);

      // Continue conversation with tool results
      await processPrompt(history, rl, spinner, session);
      return;
    }

    // Add assistant response to history
    if (fullResponse) {
      history.push({ role: "assistant", content: fullResponse });
      syncMessageToDB(session, { role: "assistant", content: fullResponse }).catch(() => {});
    }
  } catch (err) {
    spinner.stop();
    const msg = err instanceof Error ? err.message : String(err);
    console.log(red(`\n  ✖ Error: ${msg}\n`));

    if (msg.includes("fetch") || msg.includes("ECONNREFUSED")) {
      console.log(dim("    Is Ollama running? Start with: ") + accent("ollama serve\n"));
    }
  }
}
