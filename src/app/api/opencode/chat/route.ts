/**
 * OpenCode Bridge — proxies chat to a local OpenCode server.
 *
 * Expects the same body shape as /api/chat (Ollama-compatible):
 *   { model, messages: [{ role, content }], stream? }
 *
 * Internally it:
 *  1. Creates a fresh OpenCode session per request (avoids "busy" locks)
 *  2. POSTs the user message to /session/{id}/message (synchronous)
 *  3. Returns the response as Ollama-compatible NDJSON or single JSON blob
 */
import { NextRequest, NextResponse } from "next/server";

const OC_BASE = process.env.OPENCODE_URL ?? "http://127.0.0.1:3333";
const OC_PROVIDER = process.env.OPENCODE_PROVIDER ?? "ollama";
const OC_MODEL = process.env.OPENCODE_MODEL ?? "codemax-v3";

async function ocFetch(path: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180_000); // 3 min hard timeout
  try {
    return await fetch(`${OC_BASE}${path}`, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function createSession(): Promise<string> {
  const res = await ocFetch("/session", { method: "POST" });
  if (!res.ok) throw new Error(`Failed to create OpenCode session: ${res.status}`);
  const data = await res.json();
  return data.id;
}

/** Extract text from OpenCode message parts */
function extractText(msg: Record<string, unknown>): string {
  const parts = (msg.parts ?? []) as Array<{ type: string; text?: string }>;
  return parts
    .filter((p) => p.type === "text")
    .map((p) => p.text ?? "")
    .join("\n");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const messages: { role: string; content: string }[] = body.messages ?? [];
    const stream = body.stream ?? false;

    // Quick health check (fast fail)
    const healthCtrl = new AbortController();
    const healthTimer = setTimeout(() => healthCtrl.abort(), 3000);
    const healthRes = await fetch(`${OC_BASE}/global/health`, {
      signal: healthCtrl.signal,
    }).catch(() => null);
    clearTimeout(healthTimer);
    if (!healthRes?.ok) {
      return NextResponse.json(
        { error: "OpenCode server not reachable", url: OC_BASE },
        { status: 502 }
      );
    }

    // Always create a fresh session to avoid "busy" lock from prior requests
    const sessionId = await createSession();

    // Build the parts payload from the last user message
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser) {
      return NextResponse.json({ error: "No user message found" }, { status: 400 });
    }

    // Send to OpenCode (synchronous — waits for full response, can take 10-60s)
    const promptRes = await ocFetch(`/session/${sessionId}/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        parts: [{ type: "text", text: lastUser.content }],
        model: { providerID: OC_PROVIDER, modelID: OC_MODEL },
      }),
    });

    if (!promptRes.ok) {
      const errText = await promptRes.text().catch(() => "");
      return NextResponse.json(
        { error: `OpenCode prompt failed: ${promptRes.status}`, detail: errText.slice(0, 500) },
        { status: 502 }
      );
    }

    const result = await promptRes.json();
    const assistantText = extractText(result);

    if (stream) {
      // Return as Ollama-compatible NDJSON stream
      const encoder = new TextEncoder();
      const readable = new ReadableStream({
        start(controller) {
          const chunk = JSON.stringify({
            model: `opencode/${OC_MODEL}`,
            message: { role: "assistant", content: assistantText },
            done: false,
          });
          controller.enqueue(encoder.encode(chunk + "\n"));
          const done = JSON.stringify({
            model: `opencode/${OC_MODEL}`,
            message: { role: "assistant", content: "" },
            done: true,
          });
          controller.enqueue(encoder.encode(done + "\n"));
          controller.close();
        },
      });

      return new Response(readable, {
        headers: {
          "Content-Type": "application/x-ndjson",
          "Cache-Control": "no-cache",
          "Transfer-Encoding": "chunked",
        },
      });
    }

    return NextResponse.json({
      model: `opencode/${OC_MODEL}`,
      message: { role: "assistant", content: assistantText },
      done: true,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** Health probe used by the endpoint detector */
export async function GET() {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    const res = await fetch(`${OC_BASE}/global/health`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`${res.status}`);
    const data = await res.json();
    return NextResponse.json({
      status: "ok",
      provider: "opencode",
      version: data.version,
      model: `${OC_PROVIDER}/${OC_MODEL}`,
      server: OC_BASE,
    });
  } catch {
    return NextResponse.json({ status: "offline", server: OC_BASE }, { status: 503 });
  }
}
