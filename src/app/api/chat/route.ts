import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { messages, endpointUrl, stream, model } = await req.json();

  if (!endpointUrl) {
    return NextResponse.json({ error: "No endpoint URL provided" }, { status: 400 });
  }

  // Build body — only include model if explicitly provided (avoid sending unknown model names)
  const bodyObj: Record<string, unknown> = { messages, stream: stream ?? true };
  if (model) bodyObj.model = model;

  try {
    const upstream = await fetch(endpointUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bodyObj),
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      return NextResponse.json(
        { error: `Upstream error: ${upstream.status}`, detail: text },
        { status: upstream.status }
      );
    }

    if (stream && upstream.body) {
      // Proxy the SSE stream directly to the client
      return new NextResponse(upstream.body, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        },
      });
    }

    const json = await upstream.json();
    return NextResponse.json(json);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
