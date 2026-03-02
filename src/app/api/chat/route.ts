import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { messages, endpointUrl, stream, model } = await req.json();

  if (!endpointUrl) {
    return NextResponse.json({ error: "No endpoint URL provided" }, { status: 400 });
  }

  // Inject system prompt to guide structured code generation
  const SYSTEM_PROMPT = {
    role: "system",
    content: `You are Eburon Copilot (codemax-v3), an autonomous AI coding agent by Eburon AI.

When generating code, ALWAYS format each file using fenced code blocks with the file path:

\`\`\`language filepath
// code here
\`\`\`

Example:
\`\`\`tsx src/App.tsx
export default function App() { return <div>Hello</div> }
\`\`\`

Rules:
- Every file MUST have a file path after the language tag
- Generate complete, production-ready code — no placeholders
- Include all necessary files (components, styles, config, types)
- Use TypeScript by default for React/Next.js projects
- Be thorough: include package.json, tsconfig.json when creating new projects`
  };

  // Prepend system prompt if not already present
  const enrichedMessages = messages?.[0]?.role === "system"
    ? messages
    : [SYSTEM_PROMPT, ...(messages ?? [])];

  // Build body — only include model if explicitly provided
  const bodyObj: Record<string, unknown> = { messages: enrichedMessages, stream: stream ?? true };
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
