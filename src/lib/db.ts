/**
 * Eburon Copilot — PostgreSQL Database Access Layer
 * Shared by Web (Next.js), CLI, TUI, and Bridge Server.
 */
import { Pool, type PoolConfig } from "pg";
import crypto from "crypto";

// ─── Connection ────────────────────────────────────────────────────
const isProduction = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";

const poolConfig: PoolConfig = {
  connectionString: process.env.DATABASE_URL ?? "postgresql://master@localhost:5432/eburon_copilot",
  max: isProduction ? 5 : 10,
  idleTimeoutMillis: 30000,
  ...(isProduction && { ssl: { rejectUnauthorized: false } }),
};

let _pool: Pool | null = null;

export function getPool(): Pool {
  if (!_pool) _pool = new Pool(poolConfig);
  return _pool;
}

export async function closePool(): Promise<void> {
  if (_pool) { await _pool.end(); _pool = null; }
}

function genId(): string {
  return Date.now().toString(36) + crypto.randomBytes(4).toString("hex");
}

// ─── Types ──────────────────────────────────────────────────────────
export interface DBSession {
  id: string;
  title: string;
  source: "web" | "cli" | "tui" | "api";
  model?: string;
  cwd?: string;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
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
  created_at: Date;
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
  created_at: Date;
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
  created_at: Date;
}

// ─── Sessions ───────────────────────────────────────────────────────
export async function createSession(opts: {
  title?: string;
  source: DBSession["source"];
  model?: string;
  cwd?: string;
  metadata?: Record<string, unknown>;
}): Promise<DBSession> {
  const pool = getPool();
  const id = genId();
  const result = await pool.query(
    `INSERT INTO sessions (id, title, source, model, cwd, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [id, opts.title ?? "New Session", opts.source, opts.model, opts.cwd, JSON.stringify(opts.metadata ?? {})]
  );
  return result.rows[0];
}

export async function getSession(id: string): Promise<DBSession | null> {
  const result = await getPool().query("SELECT * FROM sessions WHERE id = $1", [id]);
  return result.rows[0] ?? null;
}

export async function updateSession(id: string, updates: Partial<Pick<DBSession, "title" | "model" | "metadata">>): Promise<void> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if (updates.title !== undefined) { sets.push(`title = $${i++}`); vals.push(updates.title); }
  if (updates.model !== undefined) { sets.push(`model = $${i++}`); vals.push(updates.model); }
  if (updates.metadata !== undefined) { sets.push(`metadata = $${i++}`); vals.push(JSON.stringify(updates.metadata)); }
  if (sets.length === 0) return;
  vals.push(id);
  await getPool().query(`UPDATE sessions SET ${sets.join(", ")} WHERE id = $${i}`, vals);
}

export async function listSessions(opts?: {
  source?: DBSession["source"];
  limit?: number;
  offset?: number;
}): Promise<DBSession[]> {
  const conditions: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if (opts?.source) { conditions.push(`source = $${i++}`); vals.push(opts.source); }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;
  vals.push(limit, offset);
  const result = await getPool().query(
    `SELECT * FROM sessions ${where} ORDER BY updated_at DESC LIMIT $${i++} OFFSET $${i}`,
    vals
  );
  return result.rows;
}

export async function deleteSession(id: string): Promise<boolean> {
  const result = await getPool().query("DELETE FROM sessions WHERE id = $1", [id]);
  return (result.rowCount ?? 0) > 0;
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
  const pool = getPool();
  const id = genId();
  const result = await pool.query(
    `INSERT INTO messages (id, session_id, role, content, tool_name, tool_call_id, tokens_used, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [id, opts.session_id, opts.role, opts.content, opts.tool_name, opts.tool_call_id, opts.tokens_used, JSON.stringify(opts.metadata ?? {})]
  );
  return result.rows[0];
}

export async function getMessages(sessionId: string): Promise<DBMessage[]> {
  const result = await getPool().query(
    "SELECT * FROM messages WHERE session_id = $1 ORDER BY created_at ASC",
    [sessionId]
  );
  return result.rows;
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
  const pool = getPool();
  const size = Buffer.byteLength(opts.content, "utf-8");
  const checksum = crypto.createHash("sha256").update(opts.content).digest("hex").slice(0, 16);
  const result = await pool.query(
    `INSERT INTO generated_files (session_id, message_id, path, content, language, size_bytes, checksum, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [opts.session_id, opts.message_id, opts.path, opts.content, opts.language, size, checksum, JSON.stringify(opts.metadata ?? {})]
  );
  return result.rows[0];
}

export async function saveGeneratedFiles(files: Array<{
  session_id: string;
  message_id?: string;
  path: string;
  content: string;
  language?: string;
}>): Promise<DBGeneratedFile[]> {
  const results: DBGeneratedFile[] = [];
  for (const f of files) {
    results.push(await saveGeneratedFile(f));
  }
  return results;
}

export async function getGeneratedFiles(sessionId: string): Promise<DBGeneratedFile[]> {
  const result = await getPool().query(
    "SELECT * FROM generated_files WHERE session_id = $1 ORDER BY created_at ASC",
    [sessionId]
  );
  return result.rows;
}

export async function getGeneratedFilesByMessage(messageId: string): Promise<DBGeneratedFile[]> {
  const result = await getPool().query(
    "SELECT * FROM generated_files WHERE message_id = $1 ORDER BY path ASC",
    [messageId]
  );
  return result.rows;
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
  const pool = getPool();
  const result = await pool.query(
    `INSERT INTO tool_executions (session_id, message_id, tool_name, arguments, result, success, duration_ms, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [opts.session_id, opts.message_id, opts.tool_name, JSON.stringify(opts.arguments), opts.result?.slice(0, 50000), opts.success, opts.duration_ms, JSON.stringify(opts.metadata ?? {})]
  );
  return result.rows[0];
}

export async function getToolExecutions(sessionId: string): Promise<DBToolExecution[]> {
  const result = await getPool().query(
    "SELECT * FROM tool_executions WHERE session_id = $1 ORDER BY created_at ASC",
    [sessionId]
  );
  return result.rows;
}

// ─── App Metadata ───────────────────────────────────────────────────
export async function getMeta(key: string): Promise<unknown> {
  const result = await getPool().query("SELECT value FROM app_metadata WHERE key = $1", [key]);
  return result.rows[0]?.value;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await getPool().query(
    `INSERT INTO app_metadata (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
    [key, JSON.stringify(value)]
  );
}

// ─── Health check ───────────────────────────────────────────────────
export async function dbHealthCheck(): Promise<{ ok: boolean; error?: string; sessions?: number }> {
  try {
    const result = await getPool().query("SELECT COUNT(*) as count FROM sessions");
    return { ok: true, sessions: parseInt(result.rows[0].count) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
