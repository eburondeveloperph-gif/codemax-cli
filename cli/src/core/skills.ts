/**
 * Eburon Copilot CLI — Offline Skills & Datasets Engine
 *
 * Provides curated, searchable knowledge datasets that work without internet.
 * Skills are loaded from bundled JSON files and optional GitHub-fetched packs.
 * The agent can query skills via the `querySkills` tool for context injection.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { resolve, basename } from "path";
import { CONFIG } from "./config.js";

// ── Types ───────────────────────────────────────────────────────────

export interface SkillEntry {
  id: string;
  title: string;
  content: string;
  code?: string;
  tags: string[];
  category: string;
}

export interface SkillDataset {
  name: string;
  description: string;
  category: string;
  version: string;
  source: "bundled" | "github" | "custom";
  entries: SkillEntry[];
}

export interface SkillSearchResult {
  entry: SkillEntry;
  dataset: string;
  score: number;
}

export interface SkillIndex {
  datasets: Map<string, SkillDataset>;
  tagIndex: Map<string, SkillEntry[]>;
  wordIndex: Map<string, Set<string>>; // word → entry IDs
}

// ── Paths ───────────────────────────────────────────────────────────

const BUNDLED_DIR = resolve(new URL(".", import.meta.url).pathname, "datasets");
const SKILLS_DIR = resolve(CONFIG.home, "skills");
const INDEX_PATH = resolve(SKILLS_DIR, ".index.json");

// ── Global Skill Index ──────────────────────────────────────────────

let _index: SkillIndex | null = null;

function ensureSkillsDir(): void {
  mkdirSync(SKILLS_DIR, { recursive: true });
}

/**
 * Load all skill datasets (bundled + downloaded) and build search index
 */
export function loadSkills(): SkillIndex {
  if (_index) return _index;

  const datasets = new Map<string, SkillDataset>();
  const tagIndex = new Map<string, SkillEntry[]>();
  const wordIndex = new Map<string, Set<string>>();

  // Load bundled datasets
  loadFromDir(BUNDLED_DIR, "bundled", datasets);

  // Load downloaded datasets from ~/.eburon/skills/
  ensureSkillsDir();
  loadFromDir(SKILLS_DIR, "github", datasets);

  // Build indexes
  for (const [, ds] of datasets) {
    for (const entry of ds.entries) {
      // Tag index
      for (const tag of entry.tags) {
        const key = tag.toLowerCase();
        if (!tagIndex.has(key)) tagIndex.set(key, []);
        tagIndex.get(key)!.push(entry);
      }

      // Word index (title + tags + first 200 chars of content)
      const text = `${entry.title} ${entry.tags.join(" ")} ${entry.content.slice(0, 200)}`.toLowerCase();
      for (const word of text.split(/\W+/).filter(w => w.length > 2)) {
        if (!wordIndex.has(word)) wordIndex.set(word, new Set());
        wordIndex.get(word)!.add(entry.id);
      }
    }
  }

  _index = { datasets, tagIndex, wordIndex };
  return _index;
}

function loadFromDir(dir: string, source: "bundled" | "github" | "custom", into: Map<string, SkillDataset>): void {
  if (!existsSync(dir)) return;
  try {
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".json") || file.startsWith(".")) continue;
      try {
        const raw = readFileSync(resolve(dir, file), "utf-8");
        const ds = JSON.parse(raw) as SkillDataset;
        ds.source = source;
        into.set(ds.name, ds);
      } catch { /* skip malformed */ }
    }
  } catch { /* skip unreadable dir */ }
}

/**
 * Search skills by query string. Returns ranked results.
 */
export function searchSkills(query: string, options?: {
  category?: string;
  maxResults?: number;
  tags?: string[];
}): SkillSearchResult[] {
  const index = loadSkills();
  const max = options?.maxResults ?? 10;
  const queryWords = query.toLowerCase().split(/\W+/).filter(w => w.length > 2);
  const queryLower = query.toLowerCase();

  // Score each entry
  const scored: SkillSearchResult[] = [];

  for (const [dsName, ds] of index.datasets) {
    if (options?.category && ds.category !== options.category) continue;

    for (const entry of ds.entries) {
      let score = 0;

      // Exact title match
      if (entry.title.toLowerCase().includes(queryLower)) score += 10;

      // Tag match
      for (const tag of entry.tags) {
        if (queryLower.includes(tag.toLowerCase())) score += 5;
        if (options?.tags?.includes(tag.toLowerCase())) score += 3;
      }

      // Word overlap
      for (const word of queryWords) {
        if (index.wordIndex.get(word)?.has(entry.id)) score += 2;
      }

      // Content keyword match
      const contentLower = entry.content.toLowerCase();
      for (const word of queryWords) {
        if (contentLower.includes(word)) score += 1;
      }

      if (score > 0) {
        scored.push({ entry, dataset: dsName, score });
      }
    }
  }

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, max);
}

/**
 * Get all entries in a specific category
 */
export function getCategory(category: string): SkillEntry[] {
  const index = loadSkills();
  const results: SkillEntry[] = [];
  for (const [, ds] of index.datasets) {
    if (ds.category === category) {
      results.push(...ds.entries);
    }
  }
  return results;
}

/**
 * Get all entries by tag
 */
export function getByTag(tag: string): SkillEntry[] {
  const index = loadSkills();
  return index.tagIndex.get(tag.toLowerCase()) ?? [];
}

/**
 * List all available datasets with stats
 */
export function listDatasets(): Array<{
  name: string;
  category: string;
  description: string;
  source: string;
  entries: number;
}> {
  const index = loadSkills();
  return Array.from(index.datasets.values()).map(ds => ({
    name: ds.name,
    category: ds.category,
    description: ds.description,
    source: ds.source,
    entries: ds.entries.length,
  }));
}

/**
 * List all available categories
 */
export function listCategories(): string[] {
  const index = loadSkills();
  const cats = new Set<string>();
  for (const [, ds] of index.datasets) cats.add(ds.category);
  return Array.from(cats).sort();
}

/**
 * List all available tags
 */
export function listTags(): Array<{ tag: string; count: number }> {
  const index = loadSkills();
  return Array.from(index.tagIndex.entries())
    .map(([tag, entries]) => ({ tag, count: entries.length }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Format skill results into a context string for injection into model prompt
 */
export function formatSkillContext(results: SkillSearchResult[]): string {
  if (results.length === 0) return "No matching skills found.";

  let out = `## Relevant Skills & Reference Data (${results.length} results)\n\n`;
  for (const r of results) {
    out += `### ${r.entry.title} [${r.dataset}]\n`;
    out += `Tags: ${r.entry.tags.join(", ")}\n\n`;
    out += r.entry.content + "\n";
    if (r.entry.code) {
      out += "\n```\n" + r.entry.code + "\n```\n";
    }
    out += "\n---\n\n";
  }
  return out;
}

// ── GitHub Dataset Fetcher ──────────────────────────────────────────

const GITHUB_RAW = "https://raw.githubusercontent.com";
const DEFAULT_REPO = "eburondeveloperph-gif/codemax-datasets";

interface RemoteManifest {
  datasets: Array<{ name: string; file: string; version: string }>;
}

/**
 * Fetch datasets from a GitHub repository.
 * Downloads JSON files to ~/.eburon/skills/ for offline use.
 */
export async function fetchGitHubDatasets(
  repo?: string,
  branch?: string
): Promise<{ fetched: string[]; errors: string[] }> {
  const r = repo ?? DEFAULT_REPO;
  const b = branch ?? "main";
  const baseUrl = `${GITHUB_RAW}/${r}/${b}`;
  const fetched: string[] = [];
  const errors: string[] = [];

  ensureSkillsDir();

  try {
    // Try fetching manifest
    const manifestUrl = `${baseUrl}/manifest.json`;
    const mRes = await fetch(manifestUrl);

    if (mRes.ok) {
      const manifest = (await mRes.json()) as RemoteManifest;
      for (const item of manifest.datasets) {
        try {
          const dsUrl = `${baseUrl}/${item.file}`;
          const dsRes = await fetch(dsUrl);
          if (dsRes.ok) {
            const data = await dsRes.text();
            writeFileSync(resolve(SKILLS_DIR, basename(item.file)), data, "utf-8");
            fetched.push(item.name);
          } else {
            errors.push(`${item.name}: HTTP ${dsRes.status}`);
          }
        } catch (e) {
          errors.push(`${item.name}: ${(e as Error).message}`);
        }
      }
    } else {
      // No manifest — try fetching datasets/ directory listing
      // Fall back to known dataset names
      const knownFiles = [
        "react-patterns.json", "nextjs-patterns.json", "tailwind-reference.json",
        "typescript-patterns.json", "pwa-guide.json", "api-design.json",
        "auth-patterns.json", "testing-patterns.json", "database-patterns.json",
        "css-ui-patterns.json", "git-workflows.json", "security-patterns.json",
      ];
      for (const file of knownFiles) {
        try {
          const dsUrl = `${baseUrl}/datasets/${file}`;
          const dsRes = await fetch(dsUrl);
          if (dsRes.ok) {
            const data = await dsRes.text();
            writeFileSync(resolve(SKILLS_DIR, file), data, "utf-8");
            fetched.push(file.replace(".json", ""));
          }
        } catch { /* skip */ }
      }
    }
  } catch (e) {
    errors.push(`Network error: ${(e as Error).message}`);
  }

  // Invalidate cache so next loadSkills() picks up new data
  _index = null;

  return { fetched, errors };
}

/**
 * Check if datasets exist locally (for offline status)
 */
export function hasOfflineDatasets(): boolean {
  const index = loadSkills();
  return index.datasets.size > 0;
}

/**
 * Get total skill stats
 */
export function getSkillStats(): {
  datasets: number;
  entries: number;
  categories: number;
  tags: number;
  bundled: number;
  downloaded: number;
} {
  const index = loadSkills();
  let bundled = 0, downloaded = 0, totalEntries = 0;
  for (const [, ds] of index.datasets) {
    totalEntries += ds.entries.length;
    if (ds.source === "bundled") bundled++;
    else downloaded++;
  }
  return {
    datasets: index.datasets.size,
    entries: totalEntries,
    categories: listCategories().length,
    tags: index.tagIndex.size,
    bundled,
    downloaded,
  };
}
