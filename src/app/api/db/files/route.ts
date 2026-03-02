import { NextRequest, NextResponse } from "next/server";
import { saveGeneratedFile, saveGeneratedFiles, getGeneratedFiles, getGeneratedFilesByMessage } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("session_id");
  const messageId = searchParams.get("message_id");

  if (messageId) {
    const files = await getGeneratedFilesByMessage(messageId);
    return NextResponse.json({ files });
  }
  if (sessionId) {
    const files = await getGeneratedFiles(sessionId);
    return NextResponse.json({ files });
  }
  return NextResponse.json({ error: "session_id or message_id required" }, { status: 400 });
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  // Batch save
  if (Array.isArray(body.files)) {
    const files = await saveGeneratedFiles(
      body.files.map((f: Record<string, string>) => ({
        session_id: body.session_id ?? f.session_id,
        message_id: body.message_id ?? f.message_id,
        path: f.path,
        content: f.content,
        language: f.language,
      }))
    );
    return NextResponse.json({ files }, { status: 201 });
  }

  // Single save
  if (!body.session_id || !body.path || body.content === undefined) {
    return NextResponse.json({ error: "session_id, path, content required" }, { status: 400 });
  }
  const file = await saveGeneratedFile({
    session_id: body.session_id,
    message_id: body.message_id,
    path: body.path,
    content: body.content,
    language: body.language,
  });
  return NextResponse.json({ file }, { status: 201 });
}
