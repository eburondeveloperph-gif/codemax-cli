import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// In-memory store for sandbox sessions (per-deployment, volatile)
const sandboxStore = new Map<string, { files: Record<string, string>; createdAt: number }>();

// Cleanup old sandboxes (>1 hour)
function cleanup() {
  const now = Date.now();
  for (const [id, s] of sandboxStore) {
    if (now - s.createdAt > 3600000) sandboxStore.delete(id);
  }
}

/** POST — create a sandbox session with generated files */
export async function POST(req: NextRequest) {
  cleanup();
  const { files } = await req.json();
  if (!files || !Array.isArray(files) || files.length === 0) {
    return NextResponse.json({ error: "No files provided" }, { status: 400 });
  }

  const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const fileMap: Record<string, string> = {};
  for (const f of files) {
    if (f.path && f.content) fileMap[f.path] = f.content;
  }
  sandboxStore.set(id, { files: fileMap, createdAt: Date.now() });

  return NextResponse.json({ id, url: `/api/sandbox?id=${id}&file=index.html` });
}

/** GET — serve a file from a sandbox session */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  const filePath = req.nextUrl.searchParams.get("file") || "index.html";

  if (!id) return NextResponse.json({ error: "Missing sandbox id" }, { status: 400 });

  const sandbox = sandboxStore.get(id);
  if (!sandbox) return NextResponse.json({ error: "Sandbox not found or expired" }, { status: 404 });

  // Try exact match, then with/without leading slash
  let content = sandbox.files[filePath]
    || sandbox.files[`/${filePath}`]
    || sandbox.files[filePath.replace(/^\//, "")];

  // If requesting index.html and no exact match, find any .html file
  if (!content && filePath === "index.html") {
    const htmlKey = Object.keys(sandbox.files).find(k => k.endsWith(".html"));
    if (htmlKey) content = sandbox.files[htmlKey];
  }

  // For any file that contains full HTML document, find it
  if (!content) {
    const htmlDocKey = Object.keys(sandbox.files).find(k =>
      sandbox.files[k].includes("<!DOCTYPE html>") || sandbox.files[k].includes("<html")
    );
    if (htmlDocKey) content = sandbox.files[htmlDocKey];
  }

  if (!content) {
    return new NextResponse(`<html><body><h2>File not found: ${filePath}</h2><p>Available: ${Object.keys(sandbox.files).join(", ")}</p></body></html>`, {
      headers: { "Content-Type": "text/html" },
      status: 404,
    });
  }

  // Determine content type
  const ext = filePath.split(".").pop()?.toLowerCase() || "";
  const mimeTypes: Record<string, string> = {
    html: "text/html", css: "text/css", js: "application/javascript",
    json: "application/json", svg: "image/svg+xml", png: "image/png",
    txt: "text/plain", md: "text/plain", ts: "application/javascript",
    tsx: "application/javascript", jsx: "application/javascript",
  };
  const contentType = mimeTypes[ext] || "text/html";

  // For HTML files, rewrite relative asset references to point to sandbox
  if (contentType === "text/html") {
    // Inject base for relative URLs
    for (const key of Object.keys(sandbox.files)) {
      if (key !== filePath && !key.endsWith(".html")) {
        content = content.replace(
          new RegExp(`(href|src)=["']${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`, "g"),
          `$1="/api/sandbox?id=${id}&file=${encodeURIComponent(key)}"`
        );
      }
    }
  }

  return new NextResponse(content, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "no-cache",
      "X-Sandbox-Id": id,
    },
  });
}
