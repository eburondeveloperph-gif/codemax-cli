import { NextRequest, NextResponse } from "next/server";
import { createSession, listSessions, getSession, updateSession, deleteSession, getMessages, getGeneratedFiles } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (id) {
    const session = await getSession(id);
    if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
    const messages = await getMessages(id);
    const files = await getGeneratedFiles(id);
    return NextResponse.json({ session, messages, files });
  }

  const source = searchParams.get("source") as "web" | "cli" | "tui" | "api" | null;
  const limit = parseInt(searchParams.get("limit") ?? "50");
  const offset = parseInt(searchParams.get("offset") ?? "0");
  const sessions = await listSessions({ source: source ?? undefined, limit, offset });
  return NextResponse.json({ sessions });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const session = await createSession({
    title: body.title,
    source: body.source ?? "web",
    model: body.model,
    cwd: body.cwd,
    metadata: body.metadata,
  });
  return NextResponse.json({ session }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await updateSession(body.id, { title: body.title, model: body.model, metadata: body.metadata });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const deleted = await deleteSession(id);
  return NextResponse.json({ deleted });
}
