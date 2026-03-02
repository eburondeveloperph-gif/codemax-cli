import { NextRequest, NextResponse } from "next/server";
import { detectCLIEndpoints } from "@/lib/cli-detector";

export async function GET(_req: NextRequest) {
  const endpoints = await detectCLIEndpoints();
  return NextResponse.json({ endpoints, timestamp: new Date().toISOString() });
}
