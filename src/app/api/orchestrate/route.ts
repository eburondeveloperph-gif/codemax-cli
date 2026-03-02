/**
 * POST /api/orchestrate
 * SSE endpoint — streams orchestration events to the client.
 * Events: status | plan | agent_start | agent_chunk | agent_done | agent_error | done | error
 */
import { NextRequest } from "next/server";
import { createPlan, streamAgentTask } from "@/lib/orchestrator";
import { parseGeneratedFiles, GeneratedFile } from "@/lib/parse-generated-files";

export const runtime = "nodejs";

function sse(type: string, data: Record<string, unknown>): string {
  return `data: ${JSON.stringify({ type, ...data })}\n\n`;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { prompt, ollamaBaseUrl = "http://localhost:11434" } = body as {
    prompt?: string;
    ollamaBaseUrl?: string;
  };

  if (!prompt) {
    return new Response(JSON.stringify({ error: "prompt is required" }), { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (type: string, data: Record<string, unknown> = {}) => {
        try {
          controller.enqueue(encoder.encode(sse(type, data)));
        } catch { /* client disconnected */ }
      };

      try {
        // ── Phase 1: Planning ─────────────────────────────────────
        send("status", { message: "🧠 Orchestrator is planning…", phase: "planning" });

        let tasks = await createPlan(prompt, ollamaBaseUrl);
        send("plan", { tasks });

        // ── Phase 2: Run each agent ───────────────────────────────
        const allFiles: GeneratedFile[] = [];

        for (const task of tasks) {
          send("agent_start", {
            agentId: task.id,
            type: task.type,
            model: task.model,
            files: task.files,
            description: task.description,
          });

          let agentOutput = "";

          try {
            for await (const chunk of streamAgentTask(task, ollamaBaseUrl)) {
              agentOutput += chunk;
              send("agent_chunk", { agentId: task.id, chunk });
            }

            const parsed = parseGeneratedFiles(agentOutput);
            // Deduplicate by path (later agents overwrite earlier ones for same path)
            for (const f of parsed) {
              const idx = allFiles.findIndex((e) => e.path === f.path);
              if (idx >= 0) allFiles[idx] = f;
              else allFiles.push(f);
            }

            send("agent_done", {
              agentId: task.id,
              fileCount: parsed.length,
              filePaths: parsed.map((f) => f.path),
            });
          } catch (agentErr) {
            send("agent_error", {
              agentId: task.id,
              error: agentErr instanceof Error ? agentErr.message : String(agentErr),
            });
          }
        }

        // ── Phase 3: Done ─────────────────────────────────────────
        send("done", { files: allFiles, totalFiles: allFiles.length });
      } catch (err) {
        send("error", {
          error: err instanceof Error ? err.message : String(err),
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
