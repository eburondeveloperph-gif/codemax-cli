import { NextRequest, NextResponse } from "next/server";
import { addMessage, getMessages } from "@/lib/db";

export async function GET(req: NextRequest) {
  const sessionId = new URL(req.url).searchParams.get("session_id");
  if (!sessionId) return NextResponse.json({ error: "session_id required" }, { status: 400 });
  const messages = await getMessages(sessionId);
  return NextResponse.json({ messages });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.session_id || !body.role || body.content === undefined) {
    return NextResponse.json({ error: "session_id, role, content required" }, { status: 400 });
  }
  const message = await addMessage({
    session_id: body.session_id,
    role: body.role,
    content: body.content,
    tool_name: body.tool_name,
    tool_call_id: body.tool_call_id,
    tokens_used: body.tokens_used,
    metadata: body.metadata,
  });
  return NextResponse.json({ message }, { status: 201 });
}
