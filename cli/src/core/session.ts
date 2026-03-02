/**
 * Eburon Copilot CLI — Session Persistence
 * Saves to both JSON files (offline fallback) and PostgreSQL.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "fs";
import { resolve } from "path";
import { CONFIG } from "./config.js";
import type { ChatMessage } from "./agent.js";
import * as db from "./db.js";

export interface Session {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
  cwd: string;
  dbSessionId?: string; // PostgreSQL session ID (set after first sync)
}

function ensureDir(): void {
  if (!existsSync(CONFIG.sessionsDir)) {
    mkdirSync(CONFIG.sessionsDir, { recursive: true });
  }
}

function sessionPath(id: string): string {
  return resolve(CONFIG.sessionsDir, `${id}.json`);
}

export function generateSessionId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `${ts}-${rand}`;
}

export function saveSession(session: Session): void {
  ensureDir();
  session.updatedAt = new Date().toISOString();
  writeFileSync(sessionPath(session.id), JSON.stringify(session, null, 2), "utf-8");
}

export function loadSession(id: string): Session | null {
  const path = sessionPath(id);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

export function listSessions(): Session[] {
  ensureDir();
  const files = readdirSync(CONFIG.sessionsDir).filter((f) => f.endsWith(".json"));
  const sessions: Session[] = [];
  for (const file of files) {
    try {
      const s = JSON.parse(readFileSync(resolve(CONFIG.sessionsDir, file), "utf-8"));
      sessions.push(s);
    } catch { /* skip corrupt */ }
  }
  return sessions.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export function createSession(title?: string): Session {
  return {
    id: generateSessionId(),
    title: title ?? "New Session",
    messages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    cwd: process.cwd(),
  };
}

export function deleteSession(id: string): boolean {
  const path = sessionPath(id);
  if (!existsSync(path)) return false;
  try {
    const { unlinkSync } = require("fs");
    unlinkSync(path);
    return true;
  } catch {
    return false;
  }
}

// ─── PostgreSQL sync (best-effort, non-blocking) ───────────────────
export async function syncSessionToDB(session: Session, source: "cli" | "tui" = "cli"): Promise<string | null> {
  try {
    if (!await db.isDBAvailable()) return null;
    if (session.dbSessionId) {
      await db.updateSessionTitle(session.dbSessionId, session.title);
      return session.dbSessionId;
    }
    const dbId = await db.createSession({
      title: session.title,
      source,
      cwd: session.cwd,
    });
    session.dbSessionId = dbId;
    return dbId;
  } catch {
    return null;
  }
}

export async function syncMessageToDB(session: Session, msg: ChatMessage): Promise<void> {
  try {
    const sid = session.dbSessionId;
    if (!sid) return;
    await db.addMessage({
      session_id: sid,
      role: msg.role as "system" | "user" | "assistant" | "tool",
      content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content),
    });
  } catch { /* non-critical */ }
}

export async function syncToolToDB(session: Session, toolName: string, args: Record<string, unknown>, result: string, success: boolean, durationMs?: number): Promise<void> {
  try {
    const sid = session.dbSessionId;
    if (!sid) return;
    await db.logToolExecution({
      session_id: sid,
      tool_name: toolName,
      arguments: args,
      result,
      success,
      duration_ms: durationMs,
    });
  } catch { /* non-critical */ }
}

export async function syncFileToDB(session: Session, path: string, content: string, language?: string): Promise<void> {
  try {
    const sid = session.dbSessionId;
    if (!sid) return;
    await db.saveGeneratedFile({ session_id: sid, path, content, language });
  } catch { /* non-critical */ }
}

export async function closeDB(): Promise<void> {
  try { await db.closePool(); } catch { /* ignore */ }
}
