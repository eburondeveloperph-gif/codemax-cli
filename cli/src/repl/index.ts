/**
 * Eburon Copilot CLI — Interactive REPL
 * Terminal-interactive AI coding agent (like Codex CLI / Gemini CLI)
 */
import { createInterface } from "readline";
import { CONFIG } from "../core/config.js";
import { streamChat, checkOllama, type ChatMessage, type ToolCall } from "../core/agent.js";
import { executeTool } from "../core/tools.js";
import { createSession, saveSession, type Session } from "../core/session.js";
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

  // Check Ollama
  const spinner = new Spinner();
  spinner.start("Connecting to Ollama...");
  const ollamaStatus = await checkOllama();
  spinner.stop();

  if (!ollamaStatus.ok) {
    console.log(red("  ✖ Cannot connect to Ollama: ") + dim(ollamaStatus.error ?? "unknown error"));
    console.log(dim("    Start Ollama with: ") + accent("ollama serve"));
    console.log(dim("    Or set OLLAMA_URL environment variable\n"));
    process.exit(1);
  }

  const hasModel = ollamaStatus.models.some((m) => m.includes("codemax-v3"));
  console.log(green("  ✔ ") + dim("Ollama connected") + (hasModel ? green(" · model ready") : yellow(" · model may need pulling")));

  // Detect project context
  const ctx = detectContext();
  console.log(green("  ✔ ") + dim(contextSummary(ctx)));
  console.log();

  // Initialize session
  const session: Session = createSession(ctx.name);
  const history: ChatMessage[] = [];
  let turnCount = 0;

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
    process.exit(0);
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

    // Update session title from first message
    if (turnCount === 1) {
      session.title = input.slice(0, 60);
    }

    await processPrompt(history, rl, spinner);

    // Auto-save
    session.messages = history;
    saveSession(session);
  }
}

async function processPrompt(
  history: ChatMessage[],
  rl: ReturnType<typeof createInterface>,
  spinner: Spinner
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

        const result = executeTool(tc.function.name, args);
        console.log(renderToolResult(tc.function.name, result));

        // Add tool result to history
        history.push({
          role: "tool",
          content: result.output,
          name: tc.function.name,
        });
      }

      console.log(`  ${T.brand}└${BOX.h.repeat(55)}${T.reset}\n`);

      // Continue conversation with tool results
      await processPrompt(history, rl, spinner);
      return;
    }

    // Add assistant response to history
    if (fullResponse) {
      history.push({ role: "assistant", content: fullResponse });
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
