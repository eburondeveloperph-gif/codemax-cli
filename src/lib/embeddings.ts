/**
 * Eburon Copilot — Embeddings via Ollama
 * Uses nomic-embed-text for generating vector embeddings.
 * Provides cosine similarity search over stored vectors.
 */

const EMBED_MODEL = "nomic-embed-text";
const TIMEOUT_MS = 30000;

function getOllamaUrl(): string {
  return (process.env.OLLAMA_URL ?? "http://localhost:11434").replace(/\/+$/, "");
}

/** Generate embedding vector for a single text */
export async function embed(text: string): Promise<number[]> {
  const url = `${getOllamaUrl()}/api/embed`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: EMBED_MODEL, input: text }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`Embed failed: ${res.status}`);
    const data = await res.json();
    // Ollama returns { embeddings: [[...]] } for single input
    return data.embeddings?.[0] ?? data.embedding ?? [];
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

/** Generate embeddings for multiple texts in a single call */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  if (texts.length === 1) return [await embed(texts[0])];

  const url = `${getOllamaUrl()}/api/embed`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS * 2);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`Embed batch failed: ${res.status}`);
    const data = await res.json();
    return data.embeddings ?? [];
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

/** Cosine similarity between two vectors */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

/** Search vectors by similarity to a query vector. Returns indices sorted by score. */
export function searchVectors(
  query: number[],
  vectors: number[][],
  topK = 5,
  threshold = 0.3
): { index: number; score: number }[] {
  return vectors
    .map((v, index) => ({ index, score: cosineSimilarity(query, v) }))
    .filter((r) => r.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/** Chunk text into overlapping segments for embedding */
export function chunkText(
  text: string,
  maxChars = 1500,
  overlap = 200
): string[] {
  if (text.length <= maxChars) return [text];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + maxChars, text.length);
    chunks.push(text.slice(start, end));
    start = end - overlap;
    if (start + overlap >= text.length) break;
  }
  return chunks;
}

/** Check if embedding model is available */
export async function isEmbedModelReady(): Promise<boolean> {
  try {
    const url = `${getOllamaUrl()}/api/tags`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return false;
    const data = await res.json();
    const models: string[] = (data.models ?? []).map((m: { name: string }) => m.name);
    return models.some((m) => m.includes(EMBED_MODEL));
  } catch {
    return false;
  }
}
