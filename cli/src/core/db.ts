/**
 * Eburon CLI — PostgreSQL Database Access Layer
 * Mirrors src/lib/db.ts but for the CLI package (separate dependency tree).
 */
import { Pool, type PoolConfig } from "pg";
import crypto from "crypto";

// ─── Connection ────────────────────────────────────────────────────
const poolConfig: PoolConfig = {
  connectionString: process.env.DATABASE_URL ?? "postgresql://master@localhost:5432/eburon_copilot",
  max: 3,
  idleTimeoutMillis: 10000,
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

// ─── Sessions ───────────────────────────────────────────────────────
export async function createSession(opts: {
  title?: string;
  source: "cli" | "tui";
  model?: string;
  cwd?: string;
}): Promise<string> {
  const pool = getPool();
  const id = genId();
  await pool.query(
    `INSERT INTO sessions (id, title, source, model, cwd, metadata) VALUES ($1, $2, $3, $4, $5, '{}')`,
    [id, opts.title ?? "New Session", opts.source, opts.model, opts.cwd]
  );
  return id;
}

export async function updateSessionTitle(id: string, title: string): Promise<void> {
  await getPool().query("UPDATE sessions SET title = $1 WHERE id = $2", [title, id]);
}

// ─── Messages ───────────────────────────────────────────────────────
export async function addMessage(opts: {
  session_id: string;
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_name?: string;
  tool_call_id?: string;
  tokens_used?: number;
}): Promise<string> {
  const pool = getPool();
  const id = genId();
  await pool.query(
    `INSERT INTO messages (id, session_id, role, content, tool_name, tool_call_id, tokens_used, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, '{}')`,
    [id, opts.session_id, opts.role, opts.content, opts.tool_name, opts.tool_call_id, opts.tokens_used]
  );
  return id;
}

// ─── Generated Files ────────────────────────────────────────────────
export async function saveGeneratedFile(opts: {
  session_id: string;
  path: string;
  content: string;
  language?: string;
}): Promise<void> {
  const pool = getPool();
  const size = Buffer.byteLength(opts.content, "utf-8");
  const checksum = crypto.createHash("sha256").update(opts.content).digest("hex").slice(0, 16);
  await pool.query(
    `INSERT INTO generated_files (session_id, path, content, language, size_bytes, checksum, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, '{}')`,
    [opts.session_id, opts.path, opts.content, opts.language, size, checksum]
  );
}

// ─── Tool Executions ────────────────────────────────────────────────
export async function logToolExecution(opts: {
  session_id: string;
  tool_name: string;
  arguments: Record<string, unknown>;
  result?: string;
  success: boolean;
  duration_ms?: number;
}): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO tool_executions (session_id, tool_name, arguments, result, success, duration_ms, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, '{}')`,
    [opts.session_id, opts.tool_name, JSON.stringify(opts.arguments), opts.result?.slice(0, 50000), opts.success, opts.duration_ms]
  );
}

// ─── Health ─────────────────────────────────────────────────────────
export async function isDBAvailable(): Promise<boolean> {
  try {
    await getPool().query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}
