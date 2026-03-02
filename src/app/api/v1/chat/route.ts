/**
 * API v1 — Authenticated Chat Endpoint
 * Requires Firebase Auth Bearer token.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyAuthToken } from "@/lib/firebase-admin";

export async function POST(req: NextRequest) {
  // ── Auth gate ──────────────────────────────────────────────────
  const authHeader = req.headers.get("authorization");
  const user = await verifyAuthToken(authHeader);

  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized. Provide a valid Firebase ID token as Bearer token." },
      { status: 401 }
    );
  }

  // ── Parse body ─────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const messages = body.messages as Array<{ role: string; content: string }> | undefined;
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "messages[] is required" }, { status: 400 });
  }

  const model = (body.model as string) ?? "eburonmax-codemax-v3:latest";
  const stream = body.stream !== false;

  // ── Forward to Ollama (respects OLLAMA_URL for any host/IP) ─────
  const ollamaUrl = (process.env.OLLAMA_URL ?? "http://localhost:11434").replace(/\/+$/, "");

  try {
    const ollamaRes = await fetch(`${ollamaUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, stream }),
    });

    if (!ollamaRes.ok) {
      const text = await ollamaRes.text();
      return NextResponse.json(
        { error: "Ollama error", detail: text },
        { status: ollamaRes.status }
      );
    }

    if (stream && ollamaRes.body) {
      return new Response(ollamaRes.body, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "X-User-UID": user.uid,
        },
      });
    }

    const data = await ollamaRes.json();
    return NextResponse.json({ ...data, user: { uid: user.uid, email: user.email } });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to reach model server", detail: (err as Error).message },
      { status: 502 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    api: "Eburon AI API v1",
    version: "1.0.0",
    auth: "Firebase Auth (Bearer token)",
    endpoints: {
      "POST /api/v1/chat": {
        description: "Authenticated chat completion",
        headers: { Authorization: "Bearer <firebase-id-token>" },
        body: { messages: [{ role: "user", content: "string" }], model: "optional", stream: true },
      },
    },
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
