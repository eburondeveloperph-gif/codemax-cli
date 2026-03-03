import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const VISION_MODEL = "moondream";

function getOllamaUrl(): string {
  return (process.env.OLLAMA_URL ?? "http://localhost:11434").replace(/\/+$/, "");
}

/**
 * POST — Analyze an image with the vision model
 * Body: { image: base64string, prompt?: string }
 * Returns: { description: string }
 */
export async function POST(req: NextRequest) {
  try {
    const { image, prompt, model } = await req.json();
    if (!image) {
      return NextResponse.json({ error: "No image provided (base64 expected)" }, { status: 400 });
    }

    // Strip data URL prefix if present
    const base64 = image.replace(/^data:image\/\w+;base64,/, "");
    const visionModel = model ?? VISION_MODEL;
    const userPrompt = prompt ?? "Describe this image in detail. What do you see?";

    const url = `${getOllamaUrl()}/api/chat`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: visionModel,
        messages: [
          {
            role: "user",
            content: userPrompt,
            images: [base64],
          },
        ],
        stream: false,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `Vision model error: ${res.status}`, detail: text },
        { status: res.status }
      );
    }

    const data = await res.json();
    const description = data.message?.content ?? data.response ?? "";

    return NextResponse.json({
      description,
      model: visionModel,
      tokens: data.eval_count,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[vision/analyze] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** GET — Check if vision model is available */
export async function GET() {
  try {
    const url = `${getOllamaUrl()}/api/tags`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return NextResponse.json({ available: false, error: "Ollama unreachable" });

    const data = await res.json();
    const models: string[] = (data.models ?? []).map((m: { name: string }) => m.name);
    const hasVision = models.some((m) => m.includes(VISION_MODEL) || m.includes("llava") || m.includes("bakllava"));

    return NextResponse.json({
      available: hasVision,
      model: VISION_MODEL,
      allModels: models,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ available: false, error: msg });
  }
}
