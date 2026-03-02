/**
 * Eburon Copilot — Web Skills Engine
 * Loads offline skill datasets for context injection in web API.
 * Datasets are bundled as JSON in src/lib/datasets/ and also from cli/src/core/datasets/.
 */
import { readFileSync, existsSync, readdirSync } from "fs";
import { resolve, join } from "path";

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
  source: string;
  entries: SkillEntry[];
}

export interface SkillSearchResult {
  entry: SkillEntry;
  dataset: string;
  score: number;
}

let _datasets: SkillDataset[] | null = null;

function getDatasetDirs(): string[] {
  const dirs: string[] = [];
  // CLI bundled datasets
  const cliDir = resolve(process.cwd(), "cli/src/core/datasets");
  if (existsSync(cliDir)) dirs.push(cliDir);
  // Web datasets (if any additional)
  const webDir = resolve(process.cwd(), "src/lib/datasets");
  if (existsSync(webDir)) dirs.push(webDir);
  return dirs;
}

function loadAllDatasets(): SkillDataset[] {
  if (_datasets) return _datasets;

  _datasets = [];
  for (const dir of getDatasetDirs()) {
    try {
      for (const file of readdirSync(dir)) {
        if (!file.endsWith(".json") || file.startsWith(".")) continue;
        try {
          const raw = readFileSync(join(dir, file), "utf-8");
          const ds = JSON.parse(raw) as SkillDataset;
          _datasets.push(ds);
        } catch { /* skip malformed */ }
      }
    } catch { /* skip unreadable */ }
  }
  return _datasets;
}

export function searchSkills(query: string, options?: {
  category?: string;
  maxResults?: number;
}): SkillSearchResult[] {
  const datasets = loadAllDatasets();
  const max = options?.maxResults ?? 5;
  const queryWords = query.toLowerCase().split(/\W+/).filter(w => w.length > 2);
  const queryLower = query.toLowerCase();
  const scored: SkillSearchResult[] = [];

  for (const ds of datasets) {
    if (options?.category && ds.category !== options.category) continue;
    for (const entry of ds.entries) {
      let score = 0;
      if (entry.title.toLowerCase().includes(queryLower)) score += 10;
      for (const tag of entry.tags) {
        if (queryLower.includes(tag.toLowerCase())) score += 5;
      }
      const text = `${entry.title} ${entry.tags.join(" ")} ${entry.content}`.toLowerCase();
      for (const word of queryWords) {
        if (text.includes(word)) score += 2;
      }
      if (score > 0) scored.push({ entry, dataset: ds.name, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, max);
}

export function formatSkillContext(results: SkillSearchResult[]): string {
  if (results.length === 0) return "";
  let out = `\n\n## Reference Knowledge (${results.length} skill entries)\n\n`;
  for (const r of results) {
    out += `### ${r.entry.title}\n${r.entry.content}\n`;
    if (r.entry.code) out += "```\n" + r.entry.code + "\n```\n";
    out += "\n";
  }
  return out;
}

export function listAllDatasets(): Array<{
  name: string;
  category: string;
  description: string;
  entries: number;
}> {
  return loadAllDatasets().map(ds => ({
    name: ds.name,
    category: ds.category,
    description: ds.description,
    entries: ds.entries.length,
  }));
}

export function getSkillStats() {
  const datasets = loadAllDatasets();
  const categories = new Set(datasets.map(d => d.category));
  const tags = new Set(datasets.flatMap(d => d.entries.flatMap(e => e.tags)));
  return {
    datasets: datasets.length,
    entries: datasets.reduce((sum, d) => sum + d.entries.length, 0),
    categories: categories.size,
    tags: tags.size,
  };
}
