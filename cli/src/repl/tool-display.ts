/**
 * Eburon Copilot CLI — Tool Use Display
 * Renders tool calls, approvals, and results in the terminal.
 */
import { T, brand, accent, muted, green, yellow, red, bold, dim, code, BOX } from "../core/theme.js";
import { renderDiff } from "./renderer.js";
import type { ToolResult } from "../core/tools.js";
import type { ToolCall } from "../core/agent.js";

export function renderToolCall(tc: ToolCall): string {
  const name = tc.function.name;
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(tc.function.arguments);
  } catch { /* raw string */ }

  const icon = toolIcon(name);
  const lines: string[] = [];

  lines.push(`  ${T.brand}${BOX.ltee}${BOX.h}${T.reset} ${icon} ${bold(name)}`);

  switch (name) {
    case "readFile":
      lines.push(`  ${T.brand}${BOX.v}${T.reset}   ${muted("path:")} ${accent(String(args.path ?? ""))}`);
      break;
    case "writeFile":
      lines.push(`  ${T.brand}${BOX.v}${T.reset}   ${muted("path:")} ${accent(String(args.path ?? ""))}`);
      lines.push(`  ${T.brand}${BOX.v}${T.reset}   ${muted("size:")} ${dim(String(args.content ?? "").length + " chars")}`);
      break;
    case "shellExec":
      lines.push(`  ${T.brand}${BOX.v}${T.reset}   ${muted("$")} ${code(String(args.command ?? ""))}`);
      break;
    case "listFiles":
      lines.push(`  ${T.brand}${BOX.v}${T.reset}   ${muted("path:")} ${accent(String(args.path ?? "."))}`);
      break;
    case "searchFiles":
      lines.push(`  ${T.brand}${BOX.v}${T.reset}   ${muted("pattern:")} ${code(String(args.pattern ?? ""))}`);
      if (args.glob) lines.push(`  ${T.brand}${BOX.v}${T.reset}   ${muted("glob:")} ${dim(String(args.glob))}`);
      break;
  }

  return lines.join("\n");
}

export function renderToolResult(name: string, result: ToolResult): string {
  const lines: string[] = [];
  const icon = result.success ? `${T.green}✔${T.reset}` : `${T.red}✖${T.reset}`;

  lines.push(`  ${T.brand}${BOX.v}${T.reset}   ${icon} ${result.success ? green("success") : red("failed")}`);

  if (name === "writeFile" && result.diff) {
    lines.push(`  ${T.brand}${BOX.v}${T.reset}`);
    const diffLines = renderDiff(result.diff).split("\n").map((l) => `  ${T.brand}${BOX.v}${T.reset}   ${l}`);
    lines.push(...diffLines.slice(0, 30));
    if (diffLines.length > 30) {
      lines.push(`  ${T.brand}${BOX.v}${T.reset}   ${dim(`... ${diffLines.length - 30} more lines`)}`);
    }
  } else if (name === "readFile" && result.success) {
    const preview = result.output.split("\n").slice(0, 8);
    lines.push(`  ${T.brand}${BOX.v}${T.reset}   ${dim(result.diff ?? "")}`);
    for (const line of preview) {
      lines.push(`  ${T.brand}${BOX.v}${T.reset}   ${dim(line.slice(0, 80))}`);
    }
    if (result.output.split("\n").length > 8) {
      lines.push(`  ${T.brand}${BOX.v}${T.reset}   ${dim("...")}`);
    }
  } else if (name === "shellExec") {
    const outLines = result.output.split("\n").slice(0, 15);
    for (const line of outLines) {
      lines.push(`  ${T.brand}${BOX.v}${T.reset}   ${dim(line.slice(0, 100))}`);
    }
    if (result.output.split("\n").length > 15) {
      lines.push(`  ${T.brand}${BOX.v}${T.reset}   ${dim("...")}`);
    }
  } else if (result.output) {
    const outLines = result.output.split("\n").slice(0, 10);
    for (const line of outLines) {
      lines.push(`  ${T.brand}${BOX.v}${T.reset}   ${dim(line.slice(0, 100))}`);
    }
  }

  lines.push(`  ${T.brand}${BOX.v}${T.reset}`);
  return lines.join("\n");
}

export function renderApprovalPrompt(name: string): string {
  const action = name === "writeFile" ? "write a file" : name === "shellExec" ? "run a command" : name;
  return `  ${T.brand}${BOX.v}${T.reset}   ${yellow("?")} ${bold("Allow")} ${accent(action)}${bold("?")} ${dim("[y/n/a(lways)]")} `;
}

function toolIcon(name: string): string {
  switch (name) {
    case "readFile": return `${T.blue}📖${T.reset}`;
    case "writeFile": return `${T.green}✏️${T.reset}`;
    case "shellExec": return `${T.yellow}⚡${T.reset}`;
    case "listFiles": return `${T.accent}📂${T.reset}`;
    case "searchFiles": return `${T.pink}🔍${T.reset}`;
    default: return `${T.muted}🔧${T.reset}`;
  }
}
