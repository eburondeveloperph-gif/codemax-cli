/**
 * Eburon Codemax Multi-Agent Orchestrator
 * Coordinates specialist models to generate code in parallel chunks.
 * Orchestrator: eburonmax/codemax-v3 · UI: qwen2.5-coder:7b · API: deepseek-coder:6.7b
 * Styles: codegemma:latest · Config: eburon-new/tiny:latest
 */
import { AgentTask, AgentType } from "@/types";

// ── Model assignments per agent type ──────────────────────────────
export const AGENT_MODELS: Record<AgentType, string> = {
  orchestrator: "eburonmax/codemax-v3",
  ui:           "qwen2.5-coder:7b",
  api:          "deepseek-coder:6.7b",
  styles:       "codegemma:latest",
  config:       "eburon-new/tiny:latest",
  types:        "deepseek-r1:1.5b",
};

export const AGENT_LABELS: Record<AgentType, string> = {
  orchestrator: "Orchestrator",
  ui:           "UI Components",
  api:          "API / Logic",
  styles:       "Styles",
  config:       "Config",
  types:        "Type Definitions",
};

// ── Orchestrator system prompt ────────────────────────────────────
const PLAN_SYSTEM = `You are a coding project architect for Eburon AI. 
Analyze the user request and split it into specialist tasks.
Return ONLY valid JSON — no markdown, no explanation, just the raw JSON object.

JSON format:
{
  "tasks": [
    {
      "id": "unique-snake-case-id",
      "type": "ui" | "api" | "styles" | "config" | "types",
      "description": "one-line description",
      "files": ["list", "of", "file", "paths"],
      "prompt": "Full, self-contained prompt for the specialist agent"
    }
  ]
}

Rules:
- Max 4 tasks. Always include a "config" task for full apps.
- "ui" handles React/JSX/TSX components and pages
- "api" handles hooks, utilities, server logic, API routes
- "styles" handles CSS, Tailwind, animations
- "config" handles package.json, vite.config.ts, tsconfig.json, index.html, README.md
- Each prompt must be fully self-contained (the specialist won't see the other tasks)
- Each prompt must include: "Output ONLY code files using fenced blocks: \`\`\`{lang} {filepath}"
RETURN ONLY THE JSON OBJECT.`;

// ── Per-agent system prompt ───────────────────────────────────────
function agentSystem(task: AgentTask): string {
  return `You are a specialist ${AGENT_LABELS[task.type]} developer for Eburon AI.
Generate ONLY the requested code files. No explanations, no preamble.
For EACH file, use this exact format:

\`\`\`{language} {filepath}
{code here}
\`\`\`

Files you must create: ${task.files.join(", ")}
Generate all files listed above. Be complete — no placeholders, no TODOs.`;
}

// ── Helper: call Ollama non-streaming ─────────────────────────────
async function ollamaChat(
  baseUrl: string,
  model: string,
  messages: { role: string; content: string }[]
): Promise<string> {
  const res = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, stream: false }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Ollama ${model} returned ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.message?.content ?? data.choices?.[0]?.message?.content ?? "";
}

// ── Plan creation ─────────────────────────────────────────────────
export async function createPlan(
  userPrompt: string,
  ollamaBaseUrl: string
): Promise<AgentTask[]> {
  const content = await ollamaChat(ollamaBaseUrl, AGENT_MODELS.orchestrator, [
    { role: "system", content: PLAN_SYSTEM },
    { role: "user", content: `Create a task plan for: ${userPrompt}` },
  ]);

  // Extract the JSON object from response (handles markdown wrappers)
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    // Fallback: treat as single UI task
    return [{
      id: "main",
      type: "ui",
      description: userPrompt,
      files: [],
      model: AGENT_MODELS.ui,
      prompt: userPrompt,
      status: "pending",
    }];
  }

  let plan: { tasks: AgentTask[] };
  try {
    plan = JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error("Orchestrator returned malformed JSON plan");
  }

  return (plan.tasks ?? []).map((t) => ({
    id: String(t.id ?? Math.random().toString(36).slice(2)),
    type: (t.type ?? "ui") as AgentType,
    description: String(t.description ?? ""),
    files: Array.isArray(t.files) ? t.files.map(String) : [],
    model: AGENT_MODELS[(t.type ?? "ui") as AgentType] ?? AGENT_MODELS.ui,
    prompt: String((t as unknown as Record<string, unknown>).prompt ?? t.description ?? ""),
    status: "pending" as const,
  }));
}

// ── Agent runner (streaming) ──────────────────────────────────────
export async function* streamAgentTask(
  task: AgentTask,
  ollamaBaseUrl: string
): AsyncGenerator<string> {
  const messages = [
    { role: "system", content: agentSystem(task) },
    { role: "user", content: task.prompt ?? task.description },
  ];

  const res = await fetch(`${ollamaBaseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: task.model, messages, stream: true }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Agent "${task.id}" (${task.model}) failed ${res.status}: ${t.slice(0, 200)}`);
  }
  if (!res.body) return;

  const reader = res.body.getReader();
  const dec = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const line of dec.decode(value).split("\n").filter(Boolean)) {
      try {
        const j = JSON.parse(line);
        const delta =
          j.message?.content ??
          j.choices?.[0]?.delta?.content ??
          "";
        if (delta) yield delta;
      } catch { /* non-JSON line */ }
    }
  }
}
