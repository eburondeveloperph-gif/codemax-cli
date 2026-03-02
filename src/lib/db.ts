/**
 * Eburon Copilot — Database Access Layer
 * Uses Supabase JS client (HTTP) as primary, pg Pool as fallback.
 * Shared by Web (Next.js), CLI, TUI, and Bridge Server.
 */
import crypto from "crypto";
import { getSupabase, isSupabaseConfigured } from "./supabase";

// ─── pg Pool fallback (for direct connections when available) ──────
let _pool: import("pg").Pool | null = null;

async function getPool(): Promise<import("pg").Pool | null> {
  if (_pool) return _pool;
  if (!process.env.DATABASE_URL) return null;
  try {
    const { Pool } = await import("pg");
    _pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: process.env.VERCEL === "1" ? 5 : 10,
      idleTimeoutMillis: 30000,
      ssl: { rejectUnauthorized: false },
    });
    // Test the connection
    await _pool.query("SELECT 1");
    return _pool;
  } catch {
    _pool = null;
    return null;
  }
}

export async function closePool(): Promise<void> {
  if (_pool) { await _pool.end(); _pool = null; }
}

function genId(): string {
  return Date.now().toString(36) + crypto.randomBytes(4).toString("hex");
}

// ─── Backend selector ──────────────────────────────────────────────
type Backend = "supabase" | "pg" | "none";

async function getBackend(): Promise<Backend> {
  if (isSupabaseConfigured()) return "supabase";
  const pool = await getPool();
  if (pool) return "pg";
  return "none";
}

// ─── Types ──────────────────────────────────────────────────────────
export interface DBSession {
  id: string;
  title: string;
  source: "web" | "cli" | "tui" | "api";
  model?: string;
  cwd?: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface DBMessage {
  id: string;
  session_id: string;
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_name?: string;
  tool_call_id?: string;
  tokens_used?: number;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface DBGeneratedFile {
  id: number;
  session_id: string;
  message_id?: string;
  path: string;
  content: string;
  language?: string;
  size_bytes: number;
  checksum?: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface DBToolExecution {
  id: number;
  session_id: string;
  message_id?: string;
  tool_name: string;
  arguments: Record<string, unknown>;
  result?: string;
  success: boolean;
  duration_ms?: number;
  metadata: Record<string, unknown>;
  created_at: string;
}

// ─── Sessions ───────────────────────────────────────────────────────
export async function createSession(opts: {
  title?: string;
  source: DBSession["source"];
  model?: string;
  cwd?: string;
  metadata?: Record<string, unknown>;
}): Promise<DBSession> {
  const id = genId();
  const row = {
    id,
    title: opts.title ?? "New Session",
    source: opts.source,
    model: opts.model ?? null,
    cwd: opts.cwd ?? null,
    metadata: opts.metadata ?? {},
  };

  const backend = await getBackend();
  if (backend === "supabase") {
    const sb = getSupabase()!;
    const { data, error } = await sb.from("sessions").insert(row).select().single();
    if (error) throw new Error(error.message);
    return data as DBSession;
  }
  if (backend === "pg") {
    const pool = (await getPool())!;
    const result = await pool.query(
      `INSERT INTO sessions (id, title, source, model, cwd, metadata) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [id, row.title, row.source, row.model, row.cwd, JSON.stringify(row.metadata)]
    );
    return result.rows[0];
  }
  return { ...row, metadata: row.metadata ?? {}, created_at: new Date().toISOString(), updated_at: new Date().toISOString() } as DBSession;
}

export async function getSession(id: string): Promise<DBSession | null> {
  const backend = await getBackend();
  if (backend === "supabase") {
    const sb = getSupabase()!;
    const { data } = await sb.from("sessions").select("*").eq("id", id).single();
    return (data as DBSession) ?? null;
  }
  if (backend === "pg") {
    const pool = (await getPool())!;
    const result = await pool.query("SELECT * FROM sessions WHERE id = $1", [id]);
    return result.rows[0] ?? null;
  }
  return null;
}

export async function updateSession(id: string, updates: Partial<Pick<DBSession, "title" | "model" | "metadata">>): Promise<void> {
  const backend = await getBackend();
  if (backend === "supabase") {
    const sb = getSupabase()!;
    await sb.from("sessions").update(updates).eq("id", id);
    return;
  }
  if (backend === "pg") {
    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    if (updates.title !== undefined) { sets.push(`title = $${i++}`); vals.push(updates.title); }
    if (updates.model !== undefined) { sets.push(`model = $${i++}`); vals.push(updates.model); }
    if (updates.metadata !== undefined) { sets.push(`metadata = $${i++}`); vals.push(JSON.stringify(updates.metadata)); }
    if (sets.length === 0) return;
    vals.push(id);
    await (await getPool())!.query(`UPDATE sessions SET ${sets.join(", ")} WHERE id = $${i}`, vals);
  }
}

export async function listSessions(opts?: {
  source?: DBSession["source"];
  limit?: number;
  offset?: number;
}): Promise<DBSession[]> {
  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;

  const backend = await getBackend();
  if (backend === "supabase") {
    const sb = getSupabase()!;
    let query = sb.from("sessions").select("*").order("updated_at", { ascending: false }).range(offset, offset + limit - 1);
    if (opts?.source) query = query.eq("source", opts.source);
    const { data } = await query;
    return (data as DBSession[]) ?? [];
  }
  if (backend === "pg") {
    const conditions: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    if (opts?.source) { conditions.push(`source = $${i++}`); vals.push(opts.source); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    vals.push(limit, offset);
    const result = await (await getPool())!.query(
      `SELECT * FROM sessions ${where} ORDER BY updated_at DESC LIMIT $${i++} OFFSET $${i}`,
      vals
    );
    return result.rows;
  }
  return [];
}

export async function deleteSession(id: string): Promise<boolean> {
  const backend = await getBackend();
  if (backend === "supabase") {
    const sb = getSupabase()!;
    const { error } = await sb.from("sessions").delete().eq("id", id);
    return !error;
  }
  if (backend === "pg") {
    const result = await (await getPool())!.query("DELETE FROM sessions WHERE id = $1", [id]);
    return (result.rowCount ?? 0) > 0;
  }
  return false;
}

// ─── Messages ───────────────────────────────────────────────────────
export async function addMessage(opts: {
  session_id: string;
  role: DBMessage["role"];
  content: string;
  tool_name?: string;
  tool_call_id?: string;
  tokens_used?: number;
  metadata?: Record<string, unknown>;
}): Promise<DBMessage> {
  const id = genId();
  const row = {
    id,
    session_id: opts.session_id,
    role: opts.role,
    content: opts.content,
    tool_name: opts.tool_name ?? null,
    tool_call_id: opts.tool_call_id ?? null,
    tokens_used: opts.tokens_used ?? null,
    metadata: opts.metadata ?? {},
  };

  const backend = await getBackend();
  if (backend === "supabase") {
    const sb = getSupabase()!;
    const { data, error } = await sb.from("messages").insert(row).select().single();
    if (error) throw new Error(error.message);
    return data as DBMessage;
  }
  if (backend === "pg") {
    const pool = (await getPool())!;
    const result = await pool.query(
      `INSERT INTO messages (id, session_id, role, content, tool_name, tool_call_id, tokens_used, metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [id, row.session_id, row.role, row.content, row.tool_name, row.tool_call_id, row.tokens_used, JSON.stringify(row.metadata)]
    );
    return result.rows[0];
  }
  return { ...row, metadata: row.metadata ?? {}, created_at: new Date().toISOString() } as DBMessage;
}

export async function getMessages(sessionId: string): Promise<DBMessage[]> {
  const backend = await getBackend();
  if (backend === "supabase") {
    const sb = getSupabase()!;
    const { data } = await sb.from("messages").select("*").eq("session_id", sessionId).order("created_at", { ascending: true });
    return (data as DBMessage[]) ?? [];
  }
  if (backend === "pg") {
    const result = await (await getPool())!.query("SELECT * FROM messages WHERE session_id = $1 ORDER BY created_at ASC", [sessionId]);
    return result.rows;
  }
  return [];
}

// ─── Generated Files ────────────────────────────────────────────────
export async function saveGeneratedFile(opts: {
  session_id: string;
  message_id?: string;
  path: string;
  content: string;
  language?: string;
  metadata?: Record<string, unknown>;
}): Promise<DBGeneratedFile> {
  const size = Buffer.byteLength(opts.content, "utf-8");
  const checksum = crypto.createHash("sha256").update(opts.content).digest("hex").slice(0, 16);
  const row = {
    session_id: opts.session_id,
    message_id: opts.message_id ?? null,
    path: opts.path,
    content: opts.content,
    language: opts.language ?? null,
    size_bytes: size,
    checksum,
    metadata: opts.metadata ?? {},
  };

  const backend = await getBackend();
  if (backend === "supabase") {
    const sb = getSupabase()!;
    const { data, error } = await sb.from("generated_files").insert(row).select().single();
    if (error) throw new Error(error.message);
    return data as DBGeneratedFile;
  }
  if (backend === "pg") {
    const pool = (await getPool())!;
    const result = await pool.query(
      `INSERT INTO generated_files (session_id, message_id, path, content, language, size_bytes, checksum, metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [row.session_id, row.message_id, row.path, row.content, row.language, row.size_bytes, row.checksum, JSON.stringify(row.metadata)]
    );
    return result.rows[0];
  }
  return { id: 0, ...row, metadata: row.metadata ?? {}, created_at: new Date().toISOString() } as DBGeneratedFile;
}

export async function saveGeneratedFiles(files: Array<{
  session_id: string;
  message_id?: string;
  path: string;
  content: string;
  language?: string;
}>): Promise<DBGeneratedFile[]> {
  const results: DBGeneratedFile[] = [];
  for (const f of files) results.push(await saveGeneratedFile(f));
  return results;
}

export async function getGeneratedFiles(sessionId: string): Promise<DBGeneratedFile[]> {
  const backend = await getBackend();
  if (backend === "supabase") {
    const sb = getSupabase()!;
    const { data } = await sb.from("generated_files").select("*").eq("session_id", sessionId).order("created_at", { ascending: true });
    return (data as DBGeneratedFile[]) ?? [];
  }
  if (backend === "pg") {
    const result = await (await getPool())!.query("SELECT * FROM generated_files WHERE session_id = $1 ORDER BY created_at ASC", [sessionId]);
    return result.rows;
  }
  return [];
}

export async function getGeneratedFilesByMessage(messageId: string): Promise<DBGeneratedFile[]> {
  const backend = await getBackend();
  if (backend === "supabase") {
    const sb = getSupabase()!;
    const { data } = await sb.from("generated_files").select("*").eq("message_id", messageId).order("path", { ascending: true });
    return (data as DBGeneratedFile[]) ?? [];
  }
  if (backend === "pg") {
    const result = await (await getPool())!.query("SELECT * FROM generated_files WHERE message_id = $1 ORDER BY path ASC", [messageId]);
    return result.rows;
  }
  return [];
}

// ─── Tool Executions ────────────────────────────────────────────────
export async function logToolExecution(opts: {
  session_id: string;
  message_id?: string;
  tool_name: string;
  arguments: Record<string, unknown>;
  result?: string;
  success: boolean;
  duration_ms?: number;
  metadata?: Record<string, unknown>;
}): Promise<DBToolExecution> {
  const row = {
    session_id: opts.session_id,
    message_id: opts.message_id ?? null,
    tool_name: opts.tool_name,
    arguments: opts.arguments,
    result: opts.result?.slice(0, 50000) ?? null,
    success: opts.success,
    duration_ms: opts.duration_ms ?? null,
    metadata: opts.metadata ?? {},
  };

  const backend = await getBackend();
  if (backend === "supabase") {
    const sb = getSupabase()!;
    const { data, error } = await sb.from("tool_executions").insert(row).select().single();
    if (error) throw new Error(error.message);
    return data as DBToolExecution;
  }
  if (backend === "pg") {
    const pool = (await getPool())!;
    const result = await pool.query(
      `INSERT INTO tool_executions (session_id, message_id, tool_name, arguments, result, success, duration_ms, metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [row.session_id, row.message_id, row.tool_name, JSON.stringify(row.arguments), row.result, row.success, row.duration_ms, JSON.stringify(row.metadata)]
    );
    return result.rows[0];
  }
  return { id: 0, ...row, created_at: new Date().toISOString() } as unknown as DBToolExecution;
}

export async function getToolExecutions(sessionId: string): Promise<DBToolExecution[]> {
  const backend = await getBackend();
  if (backend === "supabase") {
    const sb = getSupabase()!;
    const { data } = await sb.from("tool_executions").select("*").eq("session_id", sessionId).order("created_at", { ascending: true });
    return (data as DBToolExecution[]) ?? [];
  }
  if (backend === "pg") {
    const result = await (await getPool())!.query("SELECT * FROM tool_executions WHERE session_id = $1 ORDER BY created_at ASC", [sessionId]);
    return result.rows;
  }
  return [];
}

// ─── App Metadata ───────────────────────────────────────────────────
export async function getMeta(key: string): Promise<unknown> {
  const backend = await getBackend();
  if (backend === "supabase") {
    const sb = getSupabase()!;
    const { data } = await sb.from("app_metadata").select("value").eq("key", key).single();
    return data?.value;
  }
  if (backend === "pg") {
    const result = await (await getPool())!.query("SELECT value FROM app_metadata WHERE key = $1", [key]);
    return result.rows[0]?.value;
  }
  return undefined;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  const backend = await getBackend();
  if (backend === "supabase") {
    const sb = getSupabase()!;
    await sb.from("app_metadata").upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
    return;
  }
  if (backend === "pg") {
    await (await getPool())!.query(
      `INSERT INTO app_metadata (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
      [key, JSON.stringify(value)]
    );
  }
}

// ─── Health check ───────────────────────────────────────────────────
export async function dbHealthCheck(): Promise<{ ok: boolean; backend: string; error?: string; sessions?: number }> {
  const backend = await getBackend();
  try {
    if (backend === "supabase") {
      const sb = getSupabase()!;
      const { count, error } = await sb.from("sessions").select("*", { count: "exact", head: true });
      if (error) return { ok: false, backend, error: error.message };
      return { ok: true, backend, sessions: count ?? 0 };
    }
    if (backend === "pg") {
      const result = await (await getPool())!.query("SELECT COUNT(*) as count FROM sessions");
      return { ok: true, backend, sessions: parseInt(result.rows[0].count) };
    }
    return { ok: false, backend: "none", error: "No database configured" };
  } catch (e) {
    return { ok: false, backend, error: (e as Error).message };
  }
}
