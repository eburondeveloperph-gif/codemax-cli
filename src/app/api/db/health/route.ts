import { NextResponse } from "next/server";
import { dbHealthCheck } from "@/lib/db";

export async function GET() {
  const status = await dbHealthCheck();
  return NextResponse.json(status, { status: status.ok ? 200 : 503 });
}
