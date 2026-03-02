import { NextRequest, NextResponse } from "next/server";
import { searchSkills, listAllDatasets, getSkillStats, formatSkillContext } from "@/lib/skills";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action") ?? "stats";
  const query = searchParams.get("q") ?? "";
  const category = searchParams.get("category") ?? undefined;
  const maxResults = parseInt(searchParams.get("max") ?? "5");

  switch (action) {
    case "search": {
      if (!query) return NextResponse.json({ error: "Missing ?q= parameter" }, { status: 400 });
      const results = searchSkills(query, { category, maxResults });
      return NextResponse.json({ results, context: formatSkillContext(results) });
    }
    case "list":
      return NextResponse.json({ datasets: listAllDatasets() });
    case "stats":
    default:
      return NextResponse.json(getSkillStats());
  }
}
