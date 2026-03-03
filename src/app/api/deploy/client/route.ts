import { NextRequest, NextResponse } from "next/server";
import { pushFilesToRepo } from "@/lib/github-deploy";
import { deployToVercel } from "@/lib/vercel-deploy";
import crypto from "crypto";

export const runtime = "nodejs";
export const maxDuration = 60;

interface DeployFile {
  path: string;
  content: string;
  language?: string;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "app";
}

function hashUserId(userId: string): string {
  return crypto.createHash("sha256").update(userId).digest("hex").slice(0, 12);
}

/**
 * POST /api/deploy/client
 * Body: { files: DeployFile[], userId: string, appName: string }
 * Returns: { githubUrl, vercelUrl, path, commitSha }
 */
export async function POST(req: NextRequest) {
  try {
    const { files, userId, appName } = (await req.json()) as {
      files: DeployFile[];
      userId: string;
      appName?: string;
    };

    if (!files?.length) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }
    if (!userId) {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    const userHash = hashUserId(userId);
    const slug = slugify(appName || "generated-app");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const dirPath = `client/deployments/${userHash}/${slug}/${timestamp}`;

    const deployFiles = files.map((f) => ({
      path: f.path.replace(/^\/+/, ""),
      content: f.content,
    }));

    const results: {
      githubUrl?: string;
      vercelUrl?: string;
      path: string;
      commitSha?: string;
      errors: string[];
    } = { path: dirPath, errors: [] };

    // 1. Push to GitHub (for version history)
    if (process.env.GITHUB_PAT) {
      try {
        const gitResult = await pushFilesToRepo(
          deployFiles,
          dirPath,
          `deploy: ${slug} by ${userHash} at ${timestamp}`
        );
        results.githubUrl = gitResult.treeUrl;
        results.commitSha = gitResult.commitSha;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[deploy/client] GitHub push failed:", msg);
        results.errors.push(`GitHub: ${msg}`);
      }
    } else {
      results.errors.push("GitHub: GITHUB_PAT not configured");
    }

    // 2. Deploy to Vercel (for instant live URL)
    if (process.env.VERCEL_DEPLOY_TOKEN) {
      try {
        const vercelResult = await deployToVercel(deployFiles, `${slug}-${timestamp}`);
        results.vercelUrl = vercelResult.url;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[deploy/client] Vercel deploy failed:", msg);
        results.errors.push(`Vercel: ${msg}`);
      }
    } else {
      results.errors.push("Vercel: VERCEL_DEPLOY_TOKEN not configured");
    }

    const hasAnyDeploy = results.githubUrl || results.vercelUrl;
    return NextResponse.json(results, { status: hasAnyDeploy ? 200 : 502 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[deploy/client] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** GET /api/deploy/client — health check */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    github: !!process.env.GITHUB_PAT,
    vercel: !!process.env.VERCEL_DEPLOY_TOKEN,
    repo: process.env.DEPLOY_REPO || "eburondeveloperph-gif/studious-potato",
  });
}
