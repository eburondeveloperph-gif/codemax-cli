/**
 * Eburon Copilot CLI — Session Persistence
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "fs";
import { resolve } from "path";
import { CONFIG } from "./config.js";
import type { ChatMessage } from "./agent.js";

export interface Session {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
  cwd: string;
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
