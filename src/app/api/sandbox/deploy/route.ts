import { NextRequest, NextResponse } from "next/server";
import { takeScreenshots } from "@/lib/browser-agent";

export const runtime = "nodejs";
export const maxDuration = 60;

const VPS_HOST = "168.231.78.113";
const VPS_USER = "root";
const VPS_PASS = "Master120221@";
const SANDBOX_DIR = "/opt/eburon-sandbox";

function getTunnelUrl(): string {
  return process.env.EBURON_SANDBOX_TUNNEL || "https://stranger-wave-wider-mighty.trycloudflare.com";
}

async function sshExec(cmd: string, timeoutMs = 20000): Promise<string> {
  const { execSync } = await import("child_process");
  try {
    return execSync(
      `sshpass -p '${VPS_PASS}' ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 ${VPS_USER}@${VPS_HOST} ${JSON.stringify(cmd)}`,
      { timeout: timeoutMs, encoding: "utf-8" }
    ).trim();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`SSH failed: ${msg}`);
  }
}

/** POST — deploy generated files to VPS sandbox + take browser screenshot */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { files, id: providedId, screenshot } = body;
    if (!files || !Array.isArray(files) || files.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    const id = providedId || (Math.random().toString(36).slice(2) + Date.now().toString(36));

    // Create sandbox directory
    await sshExec(`mkdir -p ${SANDBOX_DIR}/${id}`);

    // Write each file via SSH (base64 to handle special chars)
    for (const file of files) {
      if (!file.path || !file.content) continue;
      const safePath = file.path.replace(/\.\./g, "").replace(/^\//, "");
      const dir = safePath.includes("/") ? safePath.substring(0, safePath.lastIndexOf("/")) : "";
      if (dir) {
        await sshExec(`mkdir -p ${SANDBOX_DIR}/${id}/${dir}`);
      }
      const b64 = Buffer.from(file.content, "utf-8").toString("base64");
      await sshExec(`echo '${b64}' | base64 -d > ${SANDBOX_DIR}/${id}/${safePath}`);
    }

    const tunnelUrl = getTunnelUrl();
    const baseUrl = `${tunnelUrl}/${id}/`;

    // Find the best entry HTML file
    const htmlFile = files.find((f: { path: string }) => f.path === "index.html")
      || files.find((f: { path: string }) => f.path.endsWith(".html"))
      || files[0];
    const entryPath = htmlFile ? htmlFile.path.replace(/^\//, "") : "";
    const entryUrl = entryPath ? `${tunnelUrl}/${id}/${entryPath}` : baseUrl;

    // Browser agent: screenshot via Browserbase (cloud) → VPS fallback
    let screenshotUrl: string | null = null;
    let screenshotMobileUrl: string | null = null;
    const wantScreenshot = screenshot !== false;
    if (wantScreenshot) {
      try {
        const result = await takeScreenshots(entryUrl);
        if (result.desktop) screenshotUrl = result.desktop;
        if (result.mobile) screenshotMobileUrl = result.mobile;
      } catch (e) {
        console.warn("[sandbox/deploy] Screenshot failed:", e instanceof Error ? e.message : e);
      }
    }

    return NextResponse.json({
      id,
      previewUrl: entryUrl,
      baseUrl,
      tunnelUrl,
      screenshotUrl,
      screenshotMobileUrl,
      files: files.map((f: { path: string }) => f.path),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[sandbox/deploy] POST error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** GET — check sandbox status or get tunnel URL */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");

  // Screenshot on demand: ?action=screenshot&id=xxx
  if (action === "screenshot") {
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    try {
      const tunnelUrl = getTunnelUrl();
      const entryUrl = `${tunnelUrl}/${id}/index.html`;
      const result = await takeScreenshots(entryUrl);
      return NextResponse.json({
        success: !!result.desktop,
        source: result.source,
        screenshotUrl: result.desktop || null,
        screenshotMobileUrl: result.mobile || null,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  // Default: health check
  try {
    const tunnelUrl = getTunnelUrl();
    const result = await sshExec(`ls ${SANDBOX_DIR} | head -20`);
    const sandboxes = result.split("\n").filter(Boolean).filter(s => s !== ".tunnel_url" && s !== "browser-agent");
    return NextResponse.json({ tunnelUrl, sandboxes, status: "online" });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg, status: "offline" }, { status: 500 });
  }
}
