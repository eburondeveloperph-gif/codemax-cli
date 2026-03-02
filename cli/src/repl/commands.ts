/**
 * Eburon Copilot CLI — Slash Commands
 */
import { T, brand, accent, muted, bold, green, yellow, red, dim, BOX, sectionHeader } from "../core/theme.js";
import { CONFIG } from "../core/config.js";
import { detectContext, contextSummary } from "../core/context.js";
import { listSessions, type Session } from "../core/session.js";
import { listDatasets, listCategories, listTags, searchSkills, getSkillStats, fetchGitHubDatasets, type SkillSearchResult } from "../core/skills.js";
import type { ChatMessage } from "../core/agent.js";

export interface CommandContext {
  history: ChatMessage[];
  sessionId: string;
  sessionStart: Date;
  turnCount: number;
  clearHistory: () => void;
  clearScreen: () => void;
}

export type CommandResult = { handled: true; exit?: boolean } | { handled: false };

export function handleCommand(input: string, ctx: CommandContext): CommandResult {
  const parts = input.slice(1).trim().split(/\s+/);
  const cmd = parts[0]?.toLowerCase();

  switch (cmd) {
    case "help":
    case "h":
      printHelp();
      return { handled: true };

    case "exit":
    case "quit":
    case "q":
      console.log(dim("\n  Goodbye from Eburon Copilot! 👋\n"));
      return { handled: true, exit: true };

    case "clear":
    case "c":
      ctx.clearHistory();
      ctx.clearScreen();
      console.log(green("  ✔ ") + dim("Conversation cleared.\n"));
      return { handled: true };

    case "model":
    case "m":
      printModelInfo();
      return { handled: true };

    case "session":
    case "s":
      printSessionInfo(ctx);
      return { handled: true };

    case "sessions":
      printSessionList();
      return { handled: true };

    case "files":
    case "ls":
      printFileTree();
      return { handled: true };

    case "context":
    case "ctx":
      printContext();
      return { handled: true };

    case "compact":
      compactHistory(ctx);
      return { handled: true };

    case "history":
      printHistory(ctx);
      return { handled: true };

    case "config":
      printConfig();
      return { handled: true };

    case "skills":
    case "sk":
      handleSkills(parts.slice(1));
      return { handled: true };

    default:
      console.log(yellow("  ⚠ Unknown command: ") + input + dim("  (try /help)\n"));
      return { handled: true };
  }
}

function printHelp(): void {
  console.log(sectionHeader("Commands"));
  const cmds = [
    ["/help, /h", "Show this help"],
    ["/clear, /c", "Clear conversation history"],
    ["/model, /m", "Show model info"],
    ["/session, /s", "Current session info"],
    ["/sessions", "List saved sessions"],
    ["/files, /ls", "Show project file tree"],
    ["/context, /ctx", "Show project context"],
    ["/compact", "Compact history (save tokens)"],
    ["/history", "Show conversation history"],
    ["/config", "Show configuration"],
    ["/skills, /sk", "Offline skill datasets (list/search/fetch)"],
    ["/exit, /q", "Exit the CLI"],
    ["Ctrl+C", "Exit"],
  ];
  for (const [cmd, desc] of cmds) {
    console.log(`  ${accent(cmd.padEnd(18))} ${muted(desc)}`);
  }
  console.log();
  console.log(sectionHeader("Tips"));
  console.log(`  ${muted("•")} Type a prompt to chat with the AI agent`);
  console.log(`  ${muted("•")} The agent can read/write files and run commands`);
  console.log(`  ${muted("•")} You'll be asked to approve file writes and shell commands`);
  console.log(`  ${muted("•")} Use ${accent("eburon tui")} for full terminal UI mode`);
  console.log(`  ${muted("•")} Use ${accent("eburon start")} to launch web app + CLI`);
  console.log();
}

function printModelInfo(): void {
  console.log(sectionHeader("Model"));
  console.log(`  ${bold("Model:").padEnd(26)} ${accent(CONFIG.model)}`);
  console.log(`  ${bold("Endpoint:").padEnd(26)} ${muted(CONFIG.ollamaUrl)}`);
  console.log(`  ${bold("Context:").padEnd(26)} ${muted(CONFIG.maxContextTokens + " tokens")}`);
  console.log(`  ${bold("Provider:").padEnd(26)} ${muted("Ollama (local)")}`);
  console.log();
}

function printSessionInfo(ctx: CommandContext): void {
  const uptime = formatUptime(ctx.sessionStart);
  console.log(sectionHeader("Session"));
  console.log(`  ${bold("ID:").padEnd(26)} ${muted(ctx.sessionId)}`);
  console.log(`  ${bold("Turns:").padEnd(26)} ${muted(String(ctx.turnCount))}`);
  console.log(`  ${bold("Messages:").padEnd(26)} ${muted(String(ctx.history.length))}`);
  console.log(`  ${bold("Uptime:").padEnd(26)} ${muted(uptime)}`);
  console.log();
}

function printSessionList(): void {
  const sessions = listSessions();
  console.log(sectionHeader("Saved Sessions"));
  if (sessions.length === 0) {
    console.log(`  ${dim("No saved sessions yet.")}`);
  } else {
    for (const s of sessions.slice(0, 10)) {
      const date = new Date(s.updatedAt).toLocaleDateString();
      console.log(`  ${muted(s.id.slice(0, 8))}  ${accent(s.title.slice(0, 40).padEnd(42))} ${dim(date)}`);
    }
  }
  console.log();
}

function printFileTree(): void {
  const ctx = detectContext();
  console.log(sectionHeader(`Files (${ctx.fileCount})`));
  console.log("  " + ctx.tree.split("\n").join("\n  "));
  console.log();
}

function printContext(): void {
  const ctx = detectContext();
  console.log(sectionHeader("Project Context"));
  console.log(`  ${bold("Name:").padEnd(20)} ${accent(ctx.name)}`);
  console.log(`  ${bold("Dir:").padEnd(20)} ${muted(ctx.cwd)}`);
  if (ctx.gitBranch) console.log(`  ${bold("Branch:").padEnd(20)} ${muted(ctx.gitBranch)}${ctx.gitDirty ? yellow(" (dirty)") : green(" (clean)")}`);
  if (ctx.packageJson?.version) console.log(`  ${bold("Version:").padEnd(20)} ${muted(ctx.packageJson.version)}`);
  console.log(`  ${bold("Files:").padEnd(20)} ${muted(String(ctx.fileCount))}`);
  console.log();
}

function compactHistory(ctx: CommandContext): void {
  const before = ctx.history.length;
  // Keep only the last 10 messages
  while (ctx.history.length > 10) {
    ctx.history.shift();
  }
  console.log(green("  ✔ ") + dim(`Compacted: ${before} → ${ctx.history.length} messages\n`));
}

function printHistory(ctx: CommandContext): void {
  console.log(sectionHeader("History"));
  if (ctx.history.length === 0) {
    console.log(`  ${dim("No messages yet.")}`);
  } else {
    for (const msg of ctx.history.slice(-20)) {
      const role = msg.role === "user" ? accent("you") : brand("ai ");
      const preview = msg.content.split("\n")[0].slice(0, 70);
      console.log(`  ${role}  ${dim(preview)}`);
    }
  }
  console.log();
}

function printConfig(): void {
  console.log(sectionHeader("Configuration"));
  console.log(`  ${bold("Model:").padEnd(26)} ${muted(CONFIG.model)}`);
  console.log(`  ${bold("Ollama URL:").padEnd(26)} ${muted(CONFIG.ollamaUrl)}`);
  console.log(`  ${bold("Sessions dir:").padEnd(26)} ${muted(CONFIG.sessionsDir)}`);
  console.log(`  ${bold("Auto-approve reads:").padEnd(26)} ${CONFIG.autoApproveReads ? green("yes") : red("no")}`);
  console.log(`  ${bold("Auto-approve writes:").padEnd(26)} ${CONFIG.autoApproveWrites ? green("yes") : red("no")}`);
  console.log(`  ${bold("Auto-approve shell:").padEnd(26)} ${CONFIG.autoApproveShell ? green("yes") : red("no")}`);
  console.log();
}

function formatUptime(start: Date): string {
  const ms = Date.now() - start.getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function handleSkills(args: string[]): void {
  const subcmd = args[0]?.toLowerCase();

  if (!subcmd || subcmd === "list") {
    const datasets = listDatasets();
    const stats = getSkillStats();
    console.log(sectionHeader("Offline Skills"));
    console.log(`  ${bold("Datasets:").padEnd(20)} ${accent(String(stats.datasets))} (${green(String(stats.bundled))} bundled, ${muted(String(stats.downloaded))} downloaded)`);
    console.log(`  ${bold("Entries:").padEnd(20)} ${accent(String(stats.entries))}`);
    console.log(`  ${bold("Categories:").padEnd(20)} ${muted(String(stats.categories))}`);
    console.log(`  ${bold("Tags:").padEnd(20)} ${muted(String(stats.tags))}`);
    console.log();
    for (const ds of datasets) {
      const src = ds.source === "bundled" ? green("bundled") : accent("github");
      console.log(`  ${accent(ds.name.padEnd(24))} ${muted(ds.category.padEnd(14))} ${dim(String(ds.entries).padStart(3))} entries  ${src}`);
    }
    console.log();
    console.log(dim("  Usage: /skills search <query>  |  /skills fetch  |  /skills categories"));
    console.log();
    return;
  }

  if (subcmd === "search" || subcmd === "s") {
    const query = args.slice(1).join(" ");
    if (!query) {
      console.log(yellow("  ⚠ Usage: /skills search <query>"));
      console.log(dim("  Example: /skills search react hooks\n"));
      return;
    }
    const results = searchSkills(query, { maxResults: 5 });
    console.log(sectionHeader(`Skill Search: "${query}"`));
    if (results.length === 0) {
      console.log(dim("  No matching skills found.\n"));
      return;
    }
    for (const r of results) {
      console.log(`  ${accent(r.entry.title)} ${dim(`[${r.dataset}]`)} ${dim(`score:${r.score}`)}`);
      console.log(`  ${muted(r.entry.content.slice(0, 120))}...`);
      if (r.entry.code) {
        const preview = r.entry.code.split("\n").slice(0, 3).join("\n    ");
        console.log(`    ${dim(preview)}`);
      }
      console.log();
    }
    return;
  }

  if (subcmd === "categories" || subcmd === "cats") {
    const cats = listCategories();
    console.log(sectionHeader("Skill Categories"));
    for (const cat of cats) {
      console.log(`  ${accent(cat)}`);
    }
    console.log();
    return;
  }

  if (subcmd === "tags") {
    const tags = listTags().slice(0, 30);
    console.log(sectionHeader("Top Tags"));
    for (const t of tags) {
      console.log(`  ${accent(t.tag.padEnd(24))} ${dim(String(t.count) + " entries")}`);
    }
    console.log();
    return;
  }

  if (subcmd === "fetch") {
    const repo = args[1];
    console.log(dim("  Fetching datasets from GitHub..."));
    fetchGitHubDatasets(repo).then(({ fetched, errors }) => {
      if (fetched.length > 0) {
        console.log(green(`  ✔ Fetched: ${fetched.join(", ")}`));
      }
      if (errors.length > 0) {
        console.log(yellow(`  ⚠ Errors: ${errors.join(", ")}`));
      }
      if (fetched.length === 0 && errors.length === 0) {
        console.log(dim("  No new datasets found."));
      }
      console.log();
    }).catch(e => {
      console.log(red(`  ✖ Fetch failed: ${(e as Error).message}\n`));
    });
    return;
  }

  console.log(yellow("  ⚠ Unknown skills subcommand: ") + subcmd);
  console.log(dim("  Available: list, search, categories, tags, fetch\n"));
}
