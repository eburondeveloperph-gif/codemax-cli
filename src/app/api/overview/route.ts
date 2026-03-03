import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

export const runtime = "nodejs";

export async function GET() {
  try {
    const md = readFileSync(join(process.cwd(), "development.md"), "utf-8");
    return new NextResponse(md, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch {
    return new NextResponse("# Documentation not found\n\nPlace `development.md` in the project root.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
