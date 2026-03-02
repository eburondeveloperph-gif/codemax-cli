"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Download, Monitor, Tablet, Smartphone, Globe,
  FileCode, ChevronRight, Code2, Eye, Package, RefreshCw,
} from "lucide-react";
import JSZip from "jszip";
import { GeneratedFile } from "@/lib/parse-generated-files";
import CodeGenerationStatus from "./CodeGenerationStatus";

type Tab = "code" | "preview";
type Device = "mobile" | "tablet" | "desktop" | "web";

interface Props {
  files: GeneratedFile[];
  streamingContent: string;
  isStreaming: boolean;
  activeAgent?: string;
}

// ── Syntax highlighter ────────────────────────────────────────────
const KW = /\b(import|export|from|default|const|let|var|function|return|if|else|for|while|do|class|extends|interface|type|async|await|new|typeof|null|undefined|true|false|void|static|public|private|protected|readonly|enum|try|catch|throw|in|of|switch|case|break|continue|this|super|require|declare|abstract|implements)\b/g;

function hl(raw: string): string {
  const e = raw.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return e.split("\n").map((line) => {
    const t = line.trimStart();
    if (t.startsWith("//") || t.startsWith("#") || t.startsWith("*")) return `<span class="hl-cm">${line}</span>`;
    return line
      .replace(/("(?:[^"\\]|\\.)*")/g, '<span class="hl-str">$1</span>')
      .replace(/('(?:[^'\\]|\\.)*')/g, '<span class="hl-str">$1</span>')
      .replace(/(`(?:[^`\\]|\\.)*`)/g, '<span class="hl-str">$1</span>')
      .replace(KW, '<span class="hl-kw">$1</span>')
      .replace(/\b(\d+(?:\.\d+)?(?:px|em|rem|vh|vw|%)?)\b/g, '<span class="hl-num">$1</span>')
      .replace(/\b([A-Z][a-zA-Z0-9]*)\b/g, '<span class="hl-ty">$1</span>')
      .replace(/\b([a-zA-Z_$][a-zA-Z0-9_$]*)(?=\s*\()/g, '<span class="hl-fn">$1</span>');
  }).join("\n");
}

// ── Live streaming code extraction ────────────────────────────────
function extractLiveCode(content: string): { code: string; language: string; path: string } {
  const lines = content.split("\n");
  let inBlock = false, lang = "", path = "", bodyLines: string[] = [];
  for (const line of lines) {
    const m = line.match(/^```(\w*)\s*(.*)$/);
    if (m) {
      if (!inBlock) { inBlock = true; lang = m[1] || "text"; path = m[2]?.trim() || ""; bodyLines = []; }
      else { inBlock = false; bodyLines = []; }
    } else if (inBlock) { bodyLines.push(line); }
  }
  return { code: inBlock ? bodyLines.join("\n") : "", language: lang || "text", path };
}

// ── React preview via Babel standalone ───────────────────────────
function preprocessReact(files: GeneratedFile[]): string {
  const src = files.filter((f) => ["tsx", "jsx", "typescript", "javascript"].includes(f.language));
  if (src.length === 0) return "";
  const appFile = src.find((f) => /\bApp\b/.test(f.path));
  const ordered = appFile ? [...src.filter((f) => f !== appFile), appFile] : src;
  return ordered.map((f) => {
    let code = f.content;
    code = code.replace(/^import\s+(?:type\s+)?(?:[\w*{},\s]+)\s+from\s+['"][^'"]*['"];?\s*\n?/gm, "");
    code = code.replace(/^import\s+['"][^'"]*['"];?\s*\n?/gm, "");
    code = code.replace(/^export\s+default\s+function\s+/gm, "function ");
    code = code.replace(/^export\s+default\s+class\s+/gm, "class ");
    code = code.replace(/^export\s+default\s+/gm, "");
    code = code.replace(/^export\s+\{[^}]*\}[^;]*;?\s*\n?/gm, "");
    code = code.replace(/^export\s+(const|let|var|function|class|type|interface|enum)\s+/gm, "$1 ");
    return `// ═══ ${f.path} ═══\n${code}`;
  }).join("\n\n");
}

function makePreviewURL(files: GeneratedFile[]): string | null {
  if (files.length === 0) return null;
  const cssFiles = files.filter((f) => ["css", "scss"].includes(f.language));
  const styles = cssFiles.map((f) => f.content).join("\n");

  // Plain HTML project
  const htmlFile = files.find((f) => f.path === "index.html" || f.path.endsWith("/index.html"));
  if (htmlFile) {
    let html = htmlFile.content;
    cssFiles.forEach((f) => {
      html = html.replace(new RegExp(`<link[^>]*href=["']${f.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]*>`, "g"), `<style>${f.content}</style>`);
    });
    files.filter((f) => ["javascript", "js"].includes(f.language)).forEach((f) => {
      html = html.replace(new RegExp(`<script[^>]*src=["']${f.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]*></script>`, "g"), `<script>${f.content}</script>`);
    });
    return URL.createObjectURL(new Blob([html], { type: "text/html" }));
  }

  // React / TS project — Babel standalone
  const reactCode = preprocessReact(files);
  if (!reactCode) return null;
  const useTailwind = files.some((f) => f.content.includes("tailwind") || (f.content.includes("className=") && /\b(flex|grid|text-|bg-|p-\d|m-\d|rounded)/.test(f.content)));

  const html = `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Preview</title>
<script src="https://unpkg.com/react@18/umd/react.development.js" crossorigin></script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js" crossorigin></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
${useTailwind ? '<script src="https://cdn.tailwindcss.com"></script>' : ""}
<style>*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,sans-serif}${styles}</style>
</head><body><div id="root"></div>
<script type="text/babel" data-presets="react,typescript">
${reactCode}
try{const r=document.getElementById('root');if(r&&typeof App!=='undefined'){ReactDOM.createRoot(r).render(React.createElement(App))}else if(r){r.innerHTML='<div style="padding:24px;color:#888;font-family:monospace">No App component found</div>'}}catch(e){document.getElementById('root').innerHTML='<div style="padding:24px;font-family:monospace;color:#ef4444"><b>Preview Error</b><br><pre style="font-size:12px;margin-top:8px;white-space:pre-wrap">'+String(e.message||e)+'</pre></div>'}
</script></body></html>`;

  return URL.createObjectURL(new Blob([html], { type: "text/html" }));
}

// ── File tree ─────────────────────────────────────────────────────
function FileTree({ files, active, onSelect }: { files: GeneratedFile[]; active: string; onSelect: (p: string) => void }) {
  const [openFolders, setOpenFolders] = useState<Set<string>>(() => {
    const s = new Set<string>();
    files.forEach((f) => { const p = f.path.split("/"); if (p.length > 1) s.add(p.slice(0, -1).join("/")); });
    return s;
  });
  const grouped: Record<string, GeneratedFile[]> = {};
  const root: GeneratedFile[] = [];
  files.forEach((f) => {
    const p = f.path.split("/");
    if (p.length === 1) root.push(f);
    else { const k = p.slice(0, -1).join("/"); (grouped[k] = grouped[k] || []).push(f); }
  });
  const langColor: Record<string, string> = {
    tsx: "text-blue-400", ts: "text-blue-400", typescript: "text-blue-400",
    jsx: "text-yellow-400", js: "text-yellow-400", javascript: "text-yellow-400",
    css: "text-pink-400", html: "text-orange-400", json: "text-green-400",
    md: "text-gray-400", py: "text-green-300", go: "text-cyan-400",
  };
  const FRow = ({ f, indent }: { f: GeneratedFile; indent: number }) => (
    <button onClick={() => onSelect(f.path)} style={{ paddingLeft: `${(indent + 1) * 10 + 8}px` }}
      className={`w-full flex items-center gap-1.5 py-[3px] text-[11px] text-left transition-colors ${active === f.path ? "bg-eburon-700/30 text-white" : "text-gray-500 hover:text-gray-300 hover:bg-white/[0.03]"}`}>
      <FileCode size={10} className={`shrink-0 ${langColor[f.language] || "text-gray-500"}`} />
      <span className="truncate">{f.path.split("/").pop()}</span>
    </button>
  );
  return (
    <div className="py-1 select-none">
      {root.map((f) => <FRow key={f.path} f={f} indent={0} />)}
      {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([folder, ff]) => (
        <div key={folder}>
          <button onClick={() => setOpenFolders((s) => { const n = new Set(s); n.has(folder) ? n.delete(folder) : n.add(folder); return n; })}
            className="w-full flex items-center gap-1 px-2 py-[3px] text-[11px] text-gray-500 hover:text-gray-300 hover:bg-white/[0.03] transition-colors">
            <ChevronRight size={9} className={`transition-transform ${openFolders.has(folder) ? "rotate-90" : ""}`} />
            <span className="font-medium">{folder.split("/").pop()}/</span>
          </button>
          {openFolders.has(folder) && ff.map((f) => <FRow key={f.path} f={f} indent={1} />)}
        </div>
      ))}
    </div>
  );
}

// ── Code editor ───────────────────────────────────────────────────
function CodeEditor({ content, isStreaming }: { content: string; isStreaming: boolean }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const highlighted = useMemo(() => hl(content), [content]);
  const lines = content.split("\n");
  useEffect(() => { if (isStreaming) bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [content, isStreaming]);
  return (
    <div className="flex-1 overflow-auto bg-[#0d1117] font-mono text-[12px] leading-[1.7]">
      <table className="w-full border-collapse">
        <tbody>
          {lines.map((_, i) => (
            <tr key={i} className="hover:bg-white/[0.02]">
              <td className="select-none text-right pr-4 pl-4 text-gray-600 w-10 align-top leading-[1.7]" style={{ minWidth: "3rem" }}>{i + 1}</td>
              <td className="pr-6 align-top">
                <span className="code-line" dangerouslySetInnerHTML={{ __html: highlighted.split("\n")[i] || " " }} />
                {isStreaming && i === lines.length - 1 && <span className="inline-block w-0.5 h-3.5 bg-eburon-400 ml-0.5 animate-blink align-middle" />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div ref={bottomRef} />
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────
export default function CodePanel({ files, streamingContent, isStreaming, activeAgent }: Props) {
  const [tab, setTab] = useState<Tab>("code");
  const [device, setDevice] = useState<Device>("web");
  const [activeFile, setActiveFile] = useState<string>("");
  const [downloading, setDownloading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const prevUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (files.length > 0 && !files.find((f) => f.path === activeFile)) setActiveFile(files[0].path);
  }, [files]);

  useEffect(() => {
    if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current);
    const url = makePreviewURL(files);
    prevUrlRef.current = url;
    setPreviewUrl(url);
  }, [files]);

  const { code: liveCode, language: liveLang, path: livePath } = useMemo(() => extractLiveCode(streamingContent), [streamingContent]);
  const displayFile = files.find((f) => f.path === activeFile);
  const editorCode = isStreaming ? (liveCode || streamingContent) : (displayFile?.content ?? "");
  const editorPath = isStreaming ? (livePath || `[${activeAgent ?? "eburonmax/codemax-v3"}] streaming…`) : (displayFile?.path ?? "");
  const hasFiles = files.length > 0;

  async function downloadZip() {
    if (!hasFiles) return;
    setDownloading(true);
    try {
      const zip = new JSZip();
      files.forEach((f) => zip.file(f.path, f.content));
      if (!files.find((f) => f.path === "README.md"))
        zip.file("README.md", `# Generated App\n\nCreated by **Eburon Codepilot** (eburonmax/codemax-v3)\n\n## Files\n${files.map((f) => `- \`${f.path}\``).join("\n")}\n`);
      const blob = await zip.generateAsync({ type: "blob" });
      const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "eburon-generated-app.zip" });
      a.click(); URL.revokeObjectURL(a.href);
    } finally { setDownloading(false); }
  }

  const devices: { key: Device; icon: React.ReactNode; label: string }[] = [
    { key: "mobile",  icon: <Smartphone size={12} />, label: "Mobile" },
    { key: "tablet",  icon: <Tablet size={12} />,     label: "Tablet" },
    { key: "desktop", icon: <Monitor size={12} />,    label: "Desktop" },
    { key: "web",     icon: <Globe size={12} />,      label: "Full" },
  ];

  // Detect generation stage
  const genStage = isStreaming ? (hasFiles || liveCode ? "generating" : "thinking") : (hasFiles ? "done" : undefined);

  return (
    <div className="flex flex-col h-full bg-[#0d1117] relative">
      {/* ── Top bar ── */}
      <div className="flex items-center gap-3 px-4 h-12 border-b border-white/[0.06] shrink-0 bg-[#0a0a0a]">
        <div className="flex items-center gap-0.5 bg-white/[0.04] rounded-lg p-0.5">
          {(["code", "preview"] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-all ${tab === t ? "bg-white/[0.1] text-white shadow-sm" : "text-gray-500 hover:text-gray-300"}`}>
              {t === "code" ? <Code2 size={12} /> : <Eye size={12} />}{t}
            </button>
          ))}
        </div>
        {tab === "preview" && (
          <div className="flex items-center gap-0.5 bg-white/[0.04] rounded-lg p-0.5">
            {devices.map((d) => (
              <button key={d.key} onClick={() => setDevice(d.key)} title={d.label}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs transition-all ${device === d.key ? "bg-white/[0.1] text-white" : "text-gray-500 hover:text-gray-300"}`}>
                {d.icon}<span className="hidden sm:inline">{d.label}</span>
              </button>
            ))}
          </div>
        )}
        {tab === "code" && editorPath && <span className="text-[11px] text-gray-500 font-mono flex-1 truncate">{editorPath}</span>}
        <div className="flex-1" />
        {hasFiles && <div className="flex items-center gap-1 text-[11px] text-gray-600"><Package size={11} /><span>{files.length} files</span></div>}
        <button onClick={downloadZip} disabled={!hasFiles || downloading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-30 text-white text-xs font-medium transition-all">
          <Download size={12} />{downloading ? "Packaging…" : "Download ZIP"}
        </button>
      </div>

      {/* ── Code tab ── */}
      {tab === "code" && (
        <div className="flex flex-1 min-h-0">
          {hasFiles && (
            <div className="w-44 shrink-0 border-r border-white/[0.06] overflow-y-auto bg-[#0a0a0a]">
              <div className="px-3 py-2 border-b border-white/[0.04] flex items-center justify-between">
                <span className="text-[10px] font-semibold text-gray-600 uppercase tracking-wider">Files</span>
                <span className="text-[10px] text-gray-700 font-mono">{files.length}</span>
              </div>
              <FileTree files={files} active={activeFile} onSelect={setActiveFile} />
            </div>
          )}
          {(editorCode || isStreaming)
            ? <CodeEditor content={editorCode} isStreaming={isStreaming} />
            : <EmptyCode />}
        </div>
      )}

      {/* ── Preview tab ── */}
      {tab === "preview" && (
        <>
          {previewUrl
            ? <PreviewFrame url={previewUrl} device={device} />
            : isStreaming
              ? <Msg icon={<Eye size={24} />} title="Preview ready after generation" sub="Generating files…" />
              : hasFiles
                ? <Msg icon={<Eye size={24} />} title="Preview unavailable" sub="No HTML/React entry found. Download ZIP to run locally." />
                : <EmptyCode />}
        </>
      )}

      {/* ── Generation status (continuous background indicator) ── */}
      {isStreaming && (
        <CodeGenerationStatus
          isActive={isStreaming}
          stage={genStage as "thinking" | "generating" | "done"}
          filesGenerated={files.length}
          currentFile={isStreaming ? (livePath || undefined) : undefined}
        />
      )}
    </div>
  );
}

function PreviewFrame({ url, device }: { url: string; device: Device }) {
  const [key, setKey] = useState(0);
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center justify-end px-4 py-1.5 border-b border-white/[0.04] shrink-0">
        <button onClick={() => setKey((k) => k + 1)} className="flex items-center gap-1 text-[11px] text-gray-600 hover:text-gray-300 transition-colors">
          <RefreshCw size={10} /> Refresh
        </button>
      </div>
      <div className="flex-1 overflow-auto flex items-center justify-center bg-[#080808] p-6">
        <div className={device !== "web" ? `device-${device} overflow-hidden` : "w-full h-full rounded-lg overflow-hidden border border-white/[0.06]"}>
          <iframe key={key} src={url} title="Preview" className="w-full h-full bg-white"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups" />
        </div>
      </div>
    </div>
  );
}

function EmptyCode() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-5 text-center p-8">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500/10 to-cyan-700/5 border border-cyan-500/10 flex items-center justify-center">
        <img src="https://eburon.ai/icon-eburon.svg" alt="Eburon" className="w-8 h-8 opacity-60" />
      </div>
      <div className="space-y-1.5">
        <p className="text-sm font-medium text-gray-400">Eburon Codemax</p>
        <p className="text-xs text-gray-600 max-w-xs">Describe what you want to build and the AI will generate production-ready code</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2 max-w-md">
        {["Landing Page", "PWA Mobile App", "Movie Portal", "Dashboard"].map((t) => (
          <span key={t} className="px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/[0.06] text-[10px] text-gray-600">{t}</span>
        ))}
      </div>
    </div>
  );
}

function Msg({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-8">
      <div className="text-gray-700">{icon}</div>
      <p className="text-sm font-medium text-gray-400">{title}</p>
      <p className="text-xs text-gray-600 max-w-xs">{sub}</p>
    </div>
  );
}
