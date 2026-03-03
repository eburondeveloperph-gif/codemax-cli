import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Memory API — store, search, and manage context memories
 *
 * POST — Store a new memory
 * GET  — Search memories (query param: q) or get stats (query param: stats=true)
 */

export async function POST(req: NextRequest) {
  try {
    const { type, content, session_id, metadata } = await req.json();
    if (!content || typeof content !== "string" || content.length < 5) {
      return NextResponse.json({ error: "Content must be at least 5 characters" }, { status: 400 });
    }

    const { storeMemory } = await import("@/lib/memory");
    const memory = await storeMemory({
      type: type ?? "fact",
      content,
      session_id,
      metadata,
    });

    return NextResponse.json({ id: memory.id, type: memory.type, stored: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[memory] Store error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get("q");
    const stats = searchParams.get("stats");

    // Stats mode
    if (stats === "true") {
      const { getMemoryStats } = await import("@/lib/memory");
      const s = await getMemoryStats();
      return NextResponse.json(s);
    }

    // Search mode
    if (!query || query.length < 3) {
      return NextResponse.json({ error: "Query (q) must be at least 3 characters" }, { status: 400 });
    }

    const topK = parseInt(searchParams.get("topK") ?? "5");
    const threshold = parseFloat(searchParams.get("threshold") ?? "0.3");
    const types = searchParams.get("types")?.split(",") as import("@/lib/memory").MemoryType[] | undefined;
    const includeCode = searchParams.get("includeCode") !== "false";

    const { searchAllMemory } = await import("@/lib/memory");
    const results = await searchAllMemory(query, { topK, threshold, includeCodes: includeCode });

    return NextResponse.json({
      results: results.map((r) => ({
        source: r.source,
        score: Math.round(r.score * 1000) / 1000,
        content: "content" in r.memory ? r.memory.content : ("chunk" in r.memory ? r.memory.chunk : ""),
        type: "type" in r.memory ? r.memory.type : "codebase",
        file_path: "file_path" in r.memory ? r.memory.file_path : undefined,
        id: r.memory.id,
      })),
      count: results.length,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[memory] Search error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** DELETE — Clear memories (type param optional) */
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");

    const { getSupabase, isSupabaseConfigured } = await import("@/lib/supabase");
    if (isSupabaseConfigured()) {
      const sb = getSupabase()!;
      if (type) {
        await sb.from("memories").delete().eq("type", type);
      } else {
        await sb.from("memories").delete().neq("id", "");
      }
    }

    const { reloadCache } = await import("@/lib/memory");
    await reloadCache();

    return NextResponse.json({ cleared: true, type: type ?? "all" });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
