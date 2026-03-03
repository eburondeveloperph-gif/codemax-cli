/**
 * Eburon Copilot — 3-Tier Context Memory System
 *
 * Tier 1: Conversation Memory — sliding window of recent messages
 * Tier 2: Long-term Memory — extracted facts stored with embeddings
 * Tier 3: Codebase Memory — indexed source files chunked + embedded
 *
 * All tiers feed into the chat context via RAG retrieval.
 */

import { embed, embedBatch, searchVectors, chunkText, cosineSimilarity } from "./embeddings";

// ── Types ──────────────────────────────────────────────────────────

export type MemoryType = "fact" | "preference" | "codebase" | "conversation_summary";

export interface Memory {
  id: string;
  type: MemoryType;
  content: string;
  embedding: number[];
  session_id?: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface CodebaseChunk {
  id: string;
  file_path: string;
  chunk: string;
  chunk_index: number;
  embedding: number[];
  checksum: string;
  last_indexed: string;
}

export interface MemorySearchResult {
  memory: Memory | CodebaseChunk;
  score: number;
  source: "long_term" | "codebase";
}

// ── In-memory cache (for fast retrieval without DB round-trips) ────

let _longTermCache: Memory[] = [];
let _codebaseCache: CodebaseChunk[] = [];
let _cacheLoaded = false;

// ── DB helpers (lazy import to avoid circular deps) ────────────────

async function getDb() {
  const { getSupabase, isSupabaseConfigured } = await import("./supabase");
  if (isSupabaseConfigured()) return { type: "supabase" as const, sb: getSupabase()! };

  if (process.env.DATABASE_URL) {
    try {
      const { Pool } = await import("pg");
      const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3, ssl: { rejectUnauthorized: false } });
      await pool.query("SELECT 1");
      return { type: "pg" as const, pool };
    } catch { /* fall through */ }
  }
  return { type: "none" as const };
}

// ── Ensure tables exist ────────────────────────────────────────────

let _tablesChecked = false;

export async function ensureMemoryTables(): Promise<void> {
  if (_tablesChecked) return;
  const db = await getDb();

  if (db.type === "pg") {
    await db.pool.query(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL DEFAULT 'fact',
        content TEXT NOT NULL,
        embedding JSONB,
        session_id TEXT,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
      CREATE INDEX IF NOT EXISTS idx_memories_session ON memories(session_id);

      CREATE TABLE IF NOT EXISTS codebase_index (
        id TEXT PRIMARY KEY,
        file_path TEXT NOT NULL,
        chunk TEXT NOT NULL,
        chunk_index INTEGER DEFAULT 0,
        embedding JSONB,
        checksum TEXT,
        last_indexed TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_codebase_path ON codebase_index(file_path);
    `);
    _tablesChecked = true;
  } else if (db.type === "supabase") {
    // Tables must be created via Supabase dashboard or migration
    // We just verify they exist
    try {
      await db.sb.from("memories").select("id").limit(1);
      await db.sb.from("codebase_index").select("id").limit(1);
      _tablesChecked = true;
    } catch {
      console.warn("[memory] Supabase tables not ready — run migration first");
    }
  }
}

// ── Tier 1: Conversation Memory ────────────────────────────────────

/** Build conversation context: last N messages + summaries of older ones */
export function buildConversationContext(
  messages: { role: string; content: string }[],
  maxRecent = 10,
  maxTokensEstimate = 8000
): { role: string; content: string }[] {
  if (messages.length <= maxRecent) return messages;

  const recent = messages.slice(-maxRecent);
  const older = messages.slice(0, -maxRecent);

  // Summarize older messages into a compact context
  const summaryParts: string[] = [];
  let charBudget = maxTokensEstimate * 3; // rough char estimate
  for (const m of older) {
    if (charBudget <= 0) break;
    const snippet = m.content.slice(0, 200);
    summaryParts.push(`[${m.role}]: ${snippet}${m.content.length > 200 ? "…" : ""}`);
    charBudget -= snippet.length + 20;
  }

  const summaryMsg = {
    role: "system",
    content: `## Earlier conversation context (summarized)\n${summaryParts.join("\n")}`,
  };

  return [summaryMsg, ...recent];
}

/** Summarize a conversation for long-term storage */
export async function summarizeConversation(
  messages: { role: string; content: string }[]
): Promise<string> {
  // Simple extractive summary: take key user intents and assistant conclusions
  const keyParts: string[] = [];
  for (const m of messages) {
    if (m.role === "user" && m.content.length > 20) {
      keyParts.push(`User asked: ${m.content.slice(0, 150)}`);
    }
    if (m.role === "assistant" && m.content.length > 50) {
      // Extract first meaningful line
      const firstLine = m.content.split("\n").find((l) => l.trim().length > 20);
      if (firstLine) keyParts.push(`Assistant: ${firstLine.slice(0, 150)}`);
    }
  }
  return keyParts.slice(0, 10).join("\n");
}

// ── Tier 2: Long-term Memory ───────────────────────────────────────

function genMemoryId(): string {
  return "mem_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/** Store a fact/preference/summary in long-term memory with embedding */
export async function storeMemory(opts: {
  type: MemoryType;
  content: string;
  session_id?: string;
  metadata?: Record<string, unknown>;
}): Promise<Memory> {
  await ensureMemoryTables();
  const id = genMemoryId();
  const embedding = await embed(opts.content);
  const memory: Memory = {
    id,
    type: opts.type,
    content: opts.content,
    embedding,
    session_id: opts.session_id,
    metadata: opts.metadata ?? {},
    created_at: new Date().toISOString(),
  };

  const db = await getDb();
  if (db.type === "supabase") {
    await db.sb.from("memories").insert({
      id, type: memory.type, content: memory.content,
      embedding: memory.embedding, session_id: memory.session_id,
      metadata: memory.metadata,
    });
  } else if (db.type === "pg") {
    await db.pool.query(
      `INSERT INTO memories (id, type, content, embedding, session_id, metadata) VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, memory.type, memory.content, JSON.stringify(embedding), memory.session_id, JSON.stringify(memory.metadata)]
    );
  }

  _longTermCache.push(memory);
  return memory;
}

/** Search long-term memories by semantic similarity */
export async function searchMemories(
  query: string,
  opts?: { topK?: number; threshold?: number; types?: MemoryType[] }
): Promise<MemorySearchResult[]> {
  await loadCacheIfNeeded();
  const queryVec = await embed(query);
  const topK = opts?.topK ?? 5;
  const threshold = opts?.threshold ?? 0.35;

  let candidates = _longTermCache;
  if (opts?.types) {
    candidates = candidates.filter((m) => opts.types!.includes(m.type));
  }

  if (candidates.length === 0) return [];

  const vectors = candidates.map((m) => m.embedding);
  const results = searchVectors(queryVec, vectors, topK, threshold);
  return results.map((r) => ({
    memory: candidates[r.index],
    score: r.score,
    source: "long_term" as const,
  }));
}

/** Load all memories into cache from DB */
async function loadCacheIfNeeded(): Promise<void> {
  if (_cacheLoaded) return;
  await ensureMemoryTables();
  const db = await getDb();

  if (db.type === "supabase") {
    const { data } = await db.sb.from("memories").select("*").order("created_at", { ascending: false }).limit(500);
    _longTermCache = (data ?? []).map((r: Record<string, unknown>) => ({
      ...r,
      embedding: Array.isArray(r.embedding) ? r.embedding : JSON.parse(String(r.embedding ?? "[]")),
    })) as Memory[];

    const { data: codeData } = await db.sb.from("codebase_index").select("*").limit(2000);
    _codebaseCache = (codeData ?? []).map((r: Record<string, unknown>) => ({
      ...r,
      embedding: Array.isArray(r.embedding) ? r.embedding : JSON.parse(String(r.embedding ?? "[]")),
    })) as CodebaseChunk[];
  } else if (db.type === "pg") {
    const memResult = await db.pool.query("SELECT * FROM memories ORDER BY created_at DESC LIMIT 500");
    _longTermCache = memResult.rows.map((r: Record<string, unknown>) => ({
      ...r,
      embedding: typeof r.embedding === "string" ? JSON.parse(r.embedding as string) : r.embedding,
    })) as Memory[];

    const codeResult = await db.pool.query("SELECT * FROM codebase_index LIMIT 2000");
    _codebaseCache = codeResult.rows.map((r: Record<string, unknown>) => ({
      ...r,
      embedding: typeof r.embedding === "string" ? JSON.parse(r.embedding as string) : r.embedding,
    })) as CodebaseChunk[];
  }

  _cacheLoaded = true;
}

/** Force-reload cache from DB */
export async function reloadCache(): Promise<void> {
  _cacheLoaded = false;
  _longTermCache = [];
  _codebaseCache = [];
  await loadCacheIfNeeded();
}

// ── Tier 3: Codebase Memory ────────────────────────────────────────

function genChunkId(): string {
  return "chunk_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/** Index a single file: chunk it, embed chunks, store in DB */
export async function indexFile(filePath: string, content: string): Promise<number> {
  await ensureMemoryTables();
  const crypto = await import("crypto");
  const checksum = crypto.createHash("sha256").update(content).digest("hex").slice(0, 16);

  // Check if already indexed with same checksum
  const existing = _codebaseCache.find((c) => c.file_path === filePath && c.checksum === checksum);
  if (existing) return 0;

  // Remove old chunks for this file
  const db = await getDb();
  if (db.type === "supabase") {
    await db.sb.from("codebase_index").delete().eq("file_path", filePath);
  } else if (db.type === "pg") {
    await db.pool.query("DELETE FROM codebase_index WHERE file_path = $1", [filePath]);
  }
  _codebaseCache = _codebaseCache.filter((c) => c.file_path !== filePath);

  // Chunk the file
  const header = `File: ${filePath}\n`;
  const chunks = chunkText(header + content, 1200, 150);
  if (chunks.length === 0) return 0;

  // Embed all chunks
  const vectors = await embedBatch(chunks);

  // Store
  for (let i = 0; i < chunks.length; i++) {
    const id = genChunkId();
    const chunk: CodebaseChunk = {
      id, file_path: filePath, chunk: chunks[i], chunk_index: i,
      embedding: vectors[i] ?? [], checksum, last_indexed: new Date().toISOString(),
    };

    if (db.type === "supabase") {
      await db.sb.from("codebase_index").insert({
        id, file_path: filePath, chunk: chunks[i], chunk_index: i,
        embedding: vectors[i], checksum,
      });
    } else if (db.type === "pg") {
      await db.pool.query(
        `INSERT INTO codebase_index (id, file_path, chunk, chunk_index, embedding, checksum) VALUES ($1,$2,$3,$4,$5,$6)`,
        [id, filePath, chunks[i], i, JSON.stringify(vectors[i]), checksum]
      );
    }

    _codebaseCache.push(chunk);
  }

  return chunks.length;
}

/** Search codebase by semantic similarity */
export async function searchCodebase(
  query: string,
  opts?: { topK?: number; threshold?: number }
): Promise<MemorySearchResult[]> {
  await loadCacheIfNeeded();
  if (_codebaseCache.length === 0) return [];

  const queryVec = await embed(query);
  const topK = opts?.topK ?? 5;
  const threshold = opts?.threshold ?? 0.3;

  const vectors = _codebaseCache.map((c) => c.embedding);
  const results = searchVectors(queryVec, vectors, topK, threshold);
  return results.map((r) => ({
    memory: _codebaseCache[r.index],
    score: r.score,
    source: "codebase" as const,
  }));
}

// ── Unified search across all memory tiers ─────────────────────────

/** Search all memory tiers and return unified results */
export async function searchAllMemory(
  query: string,
  opts?: { topK?: number; threshold?: number; includeCodes?: boolean }
): Promise<MemorySearchResult[]> {
  const topK = opts?.topK ?? 8;
  const threshold = opts?.threshold ?? 0.3;

  const [longTermResults, codebaseResults] = await Promise.all([
    searchMemories(query, { topK, threshold }),
    opts?.includeCodes !== false ? searchCodebase(query, { topK, threshold }) : Promise.resolve([]),
  ]);

  // Merge and sort by score
  return [...longTermResults, ...codebaseResults]
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/** Format memory search results for injection into chat context */
export function formatMemoryContext(results: MemorySearchResult[]): string {
  if (results.length === 0) return "";

  const parts: string[] = ["## Relevant Context from Memory"];

  const ltResults = results.filter((r) => r.source === "long_term");
  const cbResults = results.filter((r) => r.source === "codebase");

  if (ltResults.length > 0) {
    parts.push("### Facts & Preferences");
    for (const r of ltResults) {
      const mem = r.memory as Memory;
      parts.push(`- [${mem.type}] ${mem.content} (relevance: ${(r.score * 100).toFixed(0)}%)`);
    }
  }

  if (cbResults.length > 0) {
    parts.push("### Relevant Codebase");
    for (const r of cbResults) {
      const chunk = r.memory as CodebaseChunk;
      parts.push(`**${chunk.file_path}** (relevance: ${(r.score * 100).toFixed(0)}%):`);
      parts.push("```\n" + chunk.chunk.slice(0, 500) + "\n```");
    }
  }

  return parts.join("\n");
}

// ── Memory extraction from assistant responses ─────────────────────

const FACT_PATTERNS = [
  /(?:I(?:'ll| will) remember|noted|storing|saving)[\s:]+(.{20,200})/gi,
  /(?:key (?:fact|point|decision|choice))[\s:]+(.{20,200})/gi,
  /(?:your preference|you prefer|you like|you want)[\s:]+(.{20,200})/gi,
];

/** Extract potential facts from assistant response for memory storage */
export function extractFacts(response: string): string[] {
  const facts: string[] = [];
  for (const pattern of FACT_PATTERNS) {
    const matches = response.matchAll(pattern);
    for (const m of matches) {
      if (m[1]) facts.push(m[1].trim());
    }
  }
  return facts;
}

/** Extract and store facts from a user-assistant exchange */
export async function extractAndStoreMemories(
  userMessage: string,
  assistantResponse: string,
  sessionId?: string
): Promise<number> {
  // Extract explicit facts from response
  const responseFacts = extractFacts(assistantResponse);

  // Extract user preferences from user message
  const prefPatterns = [
    /(?:I (?:prefer|like|want|need|always use|usually use))[\s:]+(.{10,150})/gi,
    /(?:my (?:preference|style|approach) is)[\s:]+(.{10,150})/gi,
  ];

  const userFacts: string[] = [];
  for (const pattern of prefPatterns) {
    const matches = userMessage.matchAll(pattern);
    for (const m of matches) {
      if (m[1]) userFacts.push(m[1].trim());
    }
  }

  let stored = 0;

  for (const fact of responseFacts) {
    // Check for duplicates (> 0.85 similarity = likely duplicate)
    const existing = await searchMemories(fact, { topK: 1, threshold: 0.85 });
    if (existing.length === 0) {
      await storeMemory({ type: "fact", content: fact, session_id: sessionId });
      stored++;
    }
  }

  for (const pref of userFacts) {
    const existing = await searchMemories(pref, { topK: 1, threshold: 0.85 });
    if (existing.length === 0) {
      await storeMemory({ type: "preference", content: pref, session_id: sessionId });
      stored++;
    }
  }

  return stored;
}

// ── Stats ──────────────────────────────────────────────────────────

export async function getMemoryStats(): Promise<{
  longTermCount: number;
  codebaseChunks: number;
  codebaseFiles: number;
}> {
  await loadCacheIfNeeded();
  const uniqueFiles = new Set(_codebaseCache.map((c) => c.file_path));
  return {
    longTermCount: _longTermCache.length,
    codebaseChunks: _codebaseCache.length,
    codebaseFiles: uniqueFiles.size,
  };
}
