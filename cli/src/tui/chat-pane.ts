/**
 * Eburon Copilot CLI — TUI Chat Pane
 */
import blessed from "blessed";
import type { ChatMessage } from "../core/agent.js";

export function appendMessage(chatBox: blessed.Widgets.BoxElement, msg: ChatMessage): void {
  const existing = chatBox.getContent();
  let formatted: string;

  if (msg.role === "user") {
    formatted = `\n{bold}{cyan-fg}  ❯ You{/cyan-fg}{/bold}\n  ${escapeContent(msg.content)}\n`;
  } else if (msg.role === "assistant") {
    formatted = `\n{bold}{#7C3AED-fg}  ⚡ Copilot{/#7C3AED-fg}{/bold}\n  ${formatAssistantContent(msg.content)}\n`;
  } else if (msg.role === "tool") {
    const icon = msg.name === "readFile" ? "📖" : msg.name === "writeFile" ? "✏️" : msg.name === "shellExec" ? "⚡" : "🔧";
    const preview = msg.content.split("\n").slice(0, 5).join("\n  ");
    formatted = `\n{yellow-fg}  ${icon} ${msg.name}{/yellow-fg}\n  {grey-fg}${escapeContent(preview)}{/grey-fg}\n`;
  } else {
    formatted = `\n  ${escapeContent(msg.content)}\n`;
  }

  chatBox.setContent(existing + formatted);
  chatBox.setScrollPerc(100);
}

export function appendStreaming(chatBox: blessed.Widgets.BoxElement, delta: string): void {
  const content = chatBox.getContent();
  chatBox.setContent(content + escapeContent(delta));
  chatBox.setScrollPerc(100);
}

export function startAssistantMessage(chatBox: blessed.Widgets.BoxElement): void {
  const existing = chatBox.getContent();
  chatBox.setContent(existing + `\n{bold}{#7C3AED-fg}  ⚡ Copilot{/#7C3AED-fg}{/bold}\n  `);
  chatBox.setScrollPerc(100);
}

export function showWelcome(chatBox: blessed.Widgets.BoxElement): void {
  chatBox.setContent(
    `{center}{bold}{#7C3AED-fg}⚡ Eburon Copilot{/#7C3AED-fg}{/bold}{/center}\n` +
    `{center}{grey-fg}AI coding agent — type a prompt below{/grey-fg}{/center}\n\n` +
    `{grey-fg}  • I can read and write files in your project{/grey-fg}\n` +
    `{grey-fg}  • I can run shell commands{/grey-fg}\n` +
    `{grey-fg}  • I can search through your codebase{/grey-fg}\n` +
    `{grey-fg}  • Press Tab to switch between panes{/grey-fg}\n` +
    `{grey-fg}  • Type /help for commands{/grey-fg}\n`
  );
}

function formatAssistantContent(content: string): string {
  // Basic formatting for blessed tags
  let text = escapeContent(content);

  // Code blocks
  text = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return `\n{cyan-fg}── ${lang || "code"} ──{/cyan-fg}\n{green-fg}${code.trimEnd()}{/green-fg}\n{cyan-fg}${"─".repeat(20)}{/cyan-fg}\n`;
  });

  // Inline code
  text = text.replace(/`([^`]+)`/g, "{cyan-fg}$1{/cyan-fg}");

  // Bold
  text = text.replace(/\*\*(.+?)\*\*/g, "{bold}$1{/bold}");

  return text;
}

function escapeContent(s: string): string {
  // Escape blessed tags that aren't ours
  return s.replace(/\{(?!\/?(?:bold|underline|center|right|left|cyan-fg|green-fg|yellow-fg|red-fg|grey-fg|white-fg|blue-fg|#[0-9a-fA-F]+-fg))/g, "\\{");
}
