import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

const VPS_HOST = "168.231.78.113";
const VPS_USER = "root";
const VPS_PASS = "Master120221@";
const SANDBOX_DIR = "/opt/eburon-sandbox";

// Read tunnel URL from env or fallback
function getTunnelUrl(): string {
  return process.env.EBURON_SANDBOX_TUNNEL || "https://stranger-wave-wider-mighty.trycloudflare.com";
}

async function sshExec(cmd: string): Promise<string> {
  const { execSync } = await import("child_process");
  try {
    return execSync(
      `sshpass -p '${VPS_PASS}' ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 ${VPS_USER}@${VPS_HOST} ${JSON.stringify(cmd)}`,
      { timeout: 20000, encoding: "utf-8" }
    ).trim();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`SSH failed: ${msg}`);
  }
}

/** POST — deploy generated files to VPS sandbox */
export async function POST(req: NextRequest) {
  try {
    const { files, id: providedId } = await req.json();
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
      // Create subdirectories if needed
      const dir = safePath.includes("/") ? safePath.substring(0, safePath.lastIndexOf("/")) : "";
      if (dir) {
        await sshExec(`mkdir -p ${SANDBOX_DIR}/${id}/${dir}`);
      }
      // Write file content via base64 encoding (safe for any content)
      const b64 = Buffer.from(file.content, "utf-8").toString("base64");
      await sshExec(`echo '${b64}' | base64 -d > ${SANDBOX_DIR}/${id}/${safePath}`);
    }

    const tunnelUrl = getTunnelUrl();
    const previewUrl = `${tunnelUrl}/${id}/`;

    // Find the best entry HTML file
    const htmlFile = files.find((f: { path: string }) => f.path === "index.html")
      || files.find((f: { path: string }) => f.path.endsWith(".html"))
      || files[0];
    const entryUrl = htmlFile
      ? `${tunnelUrl}/${id}/${htmlFile.path.replace(/^\//, "")}`
      : previewUrl;

    return NextResponse.json({
      id,
      previewUrl: entryUrl,
      baseUrl: previewUrl,
      tunnelUrl,
      files: files.map((f: { path: string }) => f.path),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** GET — check sandbox status or get tunnel URL */
export async function GET() {
  try {
    const tunnelUrl = getTunnelUrl();
    // Quick health check
    const result = await sshExec(`ls ${SANDBOX_DIR} | head -20`);
    const sandboxes = result.split("\n").filter(Boolean).filter(s => s !== ".tunnel_url");
    return NextResponse.json({ tunnelUrl, sandboxes, status: "online" });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg, status: "offline" }, { status: 500 });
  }
}
