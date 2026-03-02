/**
 * GET /api/ollama/status
 * Returns Ollama server reachability, available models, and model readiness.
 * Respects OLLAMA_URL for any host/IP.
 */
import { NextResponse } from "next/server";
import { checkOllamaStatus, pullModel } from "@/lib/ollama";
import { NextRequest } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const status = await checkOllamaStatus();
  return NextResponse.json(status);
}

/**
 * POST /api/ollama/status — trigger model pull
 * Body: { "action": "pull", "model": "eburonmax/codemax-v3" }
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  if (body.action === "pull") {
    const model = body.model as string | undefined;
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of pullModel(model)) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: "success" })}\n\n`));
        } catch (err) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ status: "error", error: (err as Error).message })}\n\n`
            )
          );
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
      },
    });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
