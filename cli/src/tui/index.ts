/**
 * Eburon Copilot CLI — TUI Main Entry
 * Full terminal UI (OpenCode-style) with blessed.
 */
import { createLayout, type TUILayout } from "./layout.js";
import { showWelcome, appendMessage, startAssistantMessage, appendStreaming } from "./chat-pane.js";
import { showFile, showCode, showDiff } from "./code-pane.js";
import { loadFileTree, populateFileTree, type FileEntry } from "./file-tree-pane.js";
import { streamChat, checkOllama, type ChatMessage, type ToolCall } from "../core/agent.js";
import { executeTool } from "../core/tools.js";
import { createSession, saveSession, type Session } from "../core/session.js";
import { CONFIG } from "../core/config.js";

export async function startTUI(): Promise<void> {
  const layout = createLayout();
  const { screen, chatBox, codeBox, fileTree, statusBar, inputBar, headerBar } = layout;

  // State
  const history: ChatMessage[] = [];
  const session: Session = createSession("TUI Session");
  let fileEntries: FileEntry[] = [];
  let isProcessing = false;
  const panes = [inputBar, chatBox, fileTree, codeBox];
  let focusIndex = 0;

  // Load file tree
  try {
    fileEntries = loadFileTree(process.cwd());
    populateFileTree(fileTree, fileEntries, process.cwd());
  } catch { /* skip */ }

  // Welcome
  showWelcome(chatBox);

  // Status update
  function updateStatus(msg?: string) {
    const modelStatus = isProcessing ? "{yellow-fg}thinking...{/yellow-fg}" : "{green-fg}ready{/green-fg}";
    statusBar.setContent(
      `  ${modelStatus}  ·  ${CONFIG.model}  ·  ` +
      `{cyan-fg}Tab{/cyan-fg} Pane  {cyan-fg}Enter{/cyan-fg} Send  {cyan-fg}Esc{/cyan-fg} Input  {cyan-fg}Ctrl+Q{/cyan-fg} Quit` +
      (msg ? `  ·  ${msg}` : "")
    );
    screen.render();
  }

  // Focus management
  function cycleFocus(delta: number) {
    focusIndex = (focusIndex + delta + panes.length) % panes.length;
    panes[focusIndex].focus();
    screen.render();
  }

  // File selection handler
  fileTree.on("select", (_item: unknown, index: number) => {
    const entry = fileEntries[index];
    if (entry && !entry.isDir) {
      showFile(codeBox, entry.path);
      screen.render();
    }
  });

  // Input submission
  inputBar.key("enter", async () => {
    const text = inputBar.getValue().trim();
    if (!text || isProcessing) return;

    inputBar.clearValue();
    screen.render();

    // Slash commands
    if (text.startsWith("/")) {
      handleTUICommand(text, layout, session);
      screen.render();
      return;
    }

    // Send to AI
    isProcessing = true;
    updateStatus();

    history.push({ role: "user", content: text });
    appendMessage(chatBox, { role: "user", content: text });
    screen.render();

    try {
      startAssistantMessage(chatBox);
      screen.render();

      let fullResponse = "";
      const pendingToolCalls: ToolCall[] = [];

      for await (const chunk of streamChat(history)) {
        switch (chunk.type) {
          case "text":
            fullResponse += chunk.content ?? "";
            appendStreaming(chatBox, chunk.content ?? "");
            screen.render();
            break;

          case "tool_call":
            if (chunk.toolCall) {
              pendingToolCalls.push(chunk.toolCall);
            }
            break;

          case "error":
            appendStreaming(chatBox, `\n{red-fg}Error: ${chunk.error}{/red-fg}\n`);
            screen.render();
            break;
        }
      }

      // Handle tool calls
      if (pendingToolCalls.length > 0) {
        history.push({ role: "assistant", content: fullResponse, tool_calls: pendingToolCalls });

        for (const tc of pendingToolCalls) {
          let args: Record<string, unknown> = {};
          try { args = JSON.parse(tc.function.arguments); } catch { /* skip */ }

          appendStreaming(chatBox, `\n{yellow-fg}🔧 ${tc.function.name}{/yellow-fg}`);
          screen.render();

          const result = executeTool(tc.function.name, args);
          history.push({ role: "tool", content: result.output, name: tc.function.name });

          // Show results in code pane
          if (tc.function.name === "readFile" && result.success) {
            showCode(codeBox, result.output, String(args.path ?? "").split(".").pop() ?? "", String(args.path));
          } else if (tc.function.name === "writeFile" && result.diff) {
            showDiff(codeBox, result.diff, String(args.path));
          }

          appendStreaming(chatBox, result.success ? " {green-fg}✔{/green-fg}\n" : ` {red-fg}✖ ${result.output.slice(0, 50)}{/red-fg}\n`);
          screen.render();
        }

        // Continue with tool results
        startAssistantMessage(chatBox);
        let contResponse = "";
        for await (const chunk of streamChat(history)) {
          if (chunk.type === "text") {
            contResponse += chunk.content ?? "";
            appendStreaming(chatBox, chunk.content ?? "");
            screen.render();
          }
        }
        if (contResponse) history.push({ role: "assistant", content: contResponse });
      } else if (fullResponse) {
        history.push({ role: "assistant", content: fullResponse });
      }

      // Extract code from response for code pane
      const codeMatch = fullResponse.match(/```(\w*)\n([\s\S]*?)```/);
      if (codeMatch) {
        showCode(codeBox, codeMatch[2], codeMatch[1], "Generated Code");
      }

      // Refresh file tree
      try {
        fileEntries = loadFileTree(process.cwd());
        populateFileTree(fileTree, fileEntries, process.cwd());
      } catch { /* skip */ }

    } catch (e) {
      appendStreaming(chatBox, `\n{red-fg}Error: ${(e as Error).message}{/red-fg}\n`);
    }

    isProcessing = false;
    updateStatus();
    session.messages = history;
    saveSession(session);
    inputBar.focus();
    screen.render();
  });

  // Global key bindings
  screen.key(["tab"], () => cycleFocus(1));
  screen.key(["S-tab"], () => cycleFocus(-1));
  screen.key(["escape"], () => { inputBar.focus(); screen.render(); });
  screen.key(["C-q"], () => {
    session.messages = history;
    saveSession(session);
    process.exit(0);
  });
  screen.key(["q"], () => {
    // Only quit if not focused on input
    if (screen.focused !== inputBar) {
      session.messages = history;
      saveSession(session);
      process.exit(0);
    }
  });

  // Check Ollama on startup
  updateStatus("{yellow-fg}connecting...{/yellow-fg}");
  const status = await checkOllama();
  if (status.ok) {
    updateStatus("{green-fg}connected{/green-fg}");
  } else {
    updateStatus("{red-fg}Ollama not reachable{/red-fg}");
  }

  inputBar.focus();
  screen.render();
}

function handleTUICommand(input: string, layout: TUILayout, session: Session): void {
  const cmd = input.slice(1).split(/\s+/)[0]?.toLowerCase();
  const { chatBox, screen } = layout;

  switch (cmd) {
    case "help":
    case "h":
      appendStreaming(chatBox,
        `\n{bold}Commands:{/bold}\n` +
        `  {cyan-fg}/help{/cyan-fg}     Show help\n` +
        `  {cyan-fg}/clear{/cyan-fg}    Clear chat\n` +
        `  {cyan-fg}/model{/cyan-fg}    Show model\n` +
        `  {cyan-fg}/files{/cyan-fg}    Refresh files\n` +
        `  {cyan-fg}Ctrl+Q{/cyan-fg}    Quit\n`
      );
      break;
    case "clear":
    case "c":
      chatBox.setContent("{center}{grey-fg}Chat cleared{/grey-fg}{/center}\n");
      break;
    case "model":
    case "m":
      appendStreaming(chatBox, `\n{bold}Model:{/bold} {cyan-fg}${CONFIG.model}{/cyan-fg}\n{bold}Endpoint:{/bold} ${CONFIG.ollamaUrl}\n`);
      break;
    default:
      appendStreaming(chatBox, `\n{yellow-fg}Unknown command: ${input}{/yellow-fg}\n`);
  }
}
