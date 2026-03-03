/**
 * OpenCode Bridge — proxies chat to a local OpenCode server.
 *
 * Expects the same body shape as /api/chat (Ollama-compatible):
 *   { model, messages: [{ role, content }], stream? }
 *
 * Internally it:
 *  1. Creates (or reuses) an OpenCode session
 *  2. POSTs the user message to /session/{id}/message
 *  3. Streams the response back as Ollama-style NDJSON or returns a single JSON blob
 */
import { NextRequest, NextResponse } from "next/server";

const OC_BASE = process.env.OPENCODE_URL ?? "http://127.0.0.1:3333";
const OC_PROVIDER = process.env.OPENCODE_PROVIDER ?? "ollama";
const OC_MODEL = process.env.OPENCODE_MODEL ?? "codemax-v3";
const TIMEOUT_MS = 120_000; // 2 min for long generations

// Session cache: reuse across requests within the same server lifetime
let cachedSessionId: string | null = null;

async function ocFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = `${OC_BASE}${path}`;
  return fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
}

async function ensureSession(): Promise<string> {
  if (cachedSessionId) {
    // Verify it still exists
    try {
      const res = await ocFetch(`/session/${cachedSessionId}`);
      if (res.ok) return cachedSessionId;
    } catch { /* stale, create new */ }
  }
  const res = await ocFetch("/session", { method: "POST" });
  if (!res.ok) throw new Error(`Failed to create OpenCode session: ${res.status}`);
  const data = await res.json();
  cachedSessionId = data.id;
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

    // Health check first
    const healthRes = await ocFetch("/global/health").catch(() => null);
    if (!healthRes?.ok) {
      return NextResponse.json(
        { error: "OpenCode server not reachable", url: OC_BASE },
        { status: 502 }
      );
    }

    const sessionId = await ensureSession();

    // Build the parts payload from the last user message
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser) {
      return NextResponse.json({ error: "No user message found" }, { status: 400 });
    }

    // Send to OpenCode (synchronous — waits for full response)
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
          // Send the response as a single chunk (OpenCode doesn't support real streaming via REST)
          const chunk = JSON.stringify({
            model: `opencode/${OC_MODEL}`,
            message: { role: "assistant", content: assistantText },
            done: false,
          });
          controller.enqueue(encoder.encode(chunk + "\n"));

          // Send done signal
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

    // Non-streaming response (Ollama-compatible shape)
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
    const res = await ocFetch("/global/health");
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
