"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import ChatSidebar from "@/components/ChatSidebar";
import CodePanel from "@/components/CodePanel";
import { Conversation, CLIEndpoint, Message } from "@/types";
import { GeneratedFile, parseGeneratedFiles } from "@/lib/parse-generated-files";

function generateId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Extract file paths from partial streaming content (including in-progress blocks) */
function extractStreamingPaths(content: string): string[] {
  const paths: string[] = [];
  const seen = new Set<string>();
  // Completed blocks: ```lang filepath ... ```
  for (const m of content.matchAll(/```\w*\s+([\w][\w\-./]*\.\w+)/g)) {
    if (!seen.has(m[1])) { seen.add(m[1]); paths.push(m[1]); }
  }
  // Path on the line after ```lang (model puts filename on next line)
  for (const m of content.matchAll(/```\w*\n([\w][\w\-./]*\.(?:tsx?|jsx?|css|html|json|md|py|go|rs|ya?ml|sh|toml))\s*\n/g)) {
    if (!seen.has(m[1])) { seen.add(m[1]); paths.push(m[1]); }
  }
  // Context lines: **path**, `path`, ### path
  for (const m of content.matchAll(/(?:\*\*`?|#{1,4}\s+|`)([\w][\w\-./]*\.(?:tsx?|jsx?|css|html|json|md|py|go|rs|ya?ml|sh|toml))`?\*?\*?/g)) {
    if (!seen.has(m[1])) { seen.add(m[1]); paths.push(m[1]); }
  }
  return paths;
}

// ─── DB helpers (fire-and-forget, non-blocking) ────────────────────
async function dbCreateSession(id: string, title: string, model?: string) {
  try {
    await fetch("/api/db/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, title, source: "web", model }),
    });
  } catch { /* non-critical */ }
}

async function dbUpdateSession(id: string, title: string) {
  try {
    await fetch("/api/db/sessions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, title }),
    });
  } catch { /* non-critical */ }
}

async function dbDeleteSession(id: string) {
  try {
    await fetch(`/api/db/sessions?id=${id}`, { method: "DELETE" });
  } catch { /* non-critical */ }
}

async function dbSaveMessage(sessionId: string, msg: { id: string; role: string; content: string }) {
  try {
    await fetch("/api/db/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, role: msg.role, content: msg.content }),
    });
  } catch { /* non-critical */ }
}

async function dbSaveFiles(sessionId: string, files: GeneratedFile[]) {
  if (files.length === 0) return;
  try {
    await fetch("/api/db/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        files: files.map((f) => ({ path: f.path, content: f.content, language: f.language })),
      }),
    });
  } catch { /* non-critical */ }
}

/** Fire-and-forget: extract memories from the exchange */
async function extractMemories(sessionId: string, userContent: string, assistantContent: string) {
  try {
    // Store conversation summary as memory
    if (userContent.length > 30 && assistantContent.length > 50) {
      const summary = `User asked about: ${userContent.slice(0, 100)}. Result: ${assistantContent.slice(0, 200)}`;
      await fetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "conversation_summary",
          content: summary,
          session_id: sessionId,
        }),
      });
    }
  } catch { /* non-critical */ }
}

async function dbLoadSessions(): Promise<Conversation[]> {
  try {
    const res = await fetch("/api/db/sessions?source=web&limit=30");
    const data = await res.json();
    return (data.sessions ?? []).map((s: Record<string, unknown>) => ({
      id: s.id as string,
      title: s.title as string,
      messages: [],
      createdAt: new Date(s.created_at as string),
      updatedAt: new Date(s.updated_at as string),
    }));
  } catch {
    return [];
  }
}

export default function Home() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | undefined>();
  const [endpoints, setEndpoints] = useState<CLIEndpoint[]>([]);
  const [activeEndpointId, setActiveEndpointId] = useState<string | undefined>();
  const [isDetecting, setIsDetecting] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [streamingContent, setStreamingContent] = useState("");
  const [displayedFiles, setDisplayedFiles] = useState<GeneratedFile[]>([]);
  const [streamingPaths, setStreamingPaths] = useState<string[]>([]);
  const [templatePreviewUrl, setTemplatePreviewUrl] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const activeConv = conversations.find((c) => c.id === activeConvId);
  const activeEndpoint = endpoints.find((e) => e.id === activeEndpointId);

  useEffect(() => { detectEndpoints(); loadPersistedSessions(); }, []);

  const loadPersistedSessions = useCallback(async () => {
    const saved = await dbLoadSessions();
    if (saved.length > 0) {
      setConversations((prev) => {
        const existingIds = new Set(prev.map((c) => c.id));
        const newOnes = saved.filter((s) => !existingIds.has(s.id));
        return [...prev, ...newOnes];
      });
    }
  }, []);

  const detectEndpoints = useCallback(async () => {
    setIsDetecting(true);
    try {
      const res = await fetch("/api/detect");
      const data = await res.json();
      const detected: CLIEndpoint[] = data.endpoints ?? [];
      setEndpoints((prev) => {
        const manual = prev.filter((e) => e.id.startsWith("manual-"));
        return [...detected, ...manual.filter((m) => !detected.find((d) => d.url === m.url))];
      });
      if (detected.length > 0 && !activeEndpointId) {
        const online = detected.find((e) => e.status === "online");
        if (online) setActiveEndpointId(online.id);
      }
    } catch { /* silent */ }
    finally { setIsDetecting(false); }
  }, [activeEndpointId]);

  const createConversation = useCallback(() => {
    const id = generateId();
    const conv: Conversation = { id, title: "New Chat", messages: [], createdAt: new Date(), updatedAt: new Date() };
    setConversations((prev) => [conv, ...prev]);
    setActiveConvId(id);
    dbCreateSession(id, "New Chat", activeEndpoint?.model);
    return id;
  }, [activeEndpoint]);

  const deleteConversation = useCallback((id: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeConvId === id) setActiveConvId(undefined);
    dbDeleteSession(id);
  }, [activeConvId]);

  const updateConversation = useCallback((id: string, updater: (c: Conversation) => Conversation) => {
    setConversations((prev) => prev.map((c) => (c.id === id ? updater(c) : c)));
  }, []);

  const handleSend = useCallback(async (text: string) => {
    if (!activeEndpoint) return;

    let convId = activeConvId;
    if (!convId) convId = createConversation();

    const userMsg: Message = { id: generateId(), role: "user", content: text, timestamp: new Date() };
    const aId = generateId();
    const assistantMsg: Message = { id: aId, role: "assistant", content: "", timestamp: new Date(), isStreaming: true };

    const isFirst = (conversations.find((c) => c.id === convId)?.messages ?? []).length === 0;
    const newTitle = isFirst ? text.slice(0, 45) : undefined;

    updateConversation(convId, (c) => ({
      ...c,
      title: isFirst ? text.slice(0, 45) : c.title,
      messages: [...c.messages, userMsg, assistantMsg],
      updatedAt: new Date(),
    }));

    dbSaveMessage(convId, userMsg);
    if (newTitle) dbUpdateSession(convId, newTitle);

    setIsStreaming(true);
    setStreamingContent("");
    setStreamingPaths([]);
    setTemplatePreviewUrl(null);
    abortRef.current = new AbortController();

    try {
      const history = [
        ...(conversations.find((c) => c.id === convId)?.messages ?? []).map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: text },
      ];

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, endpointUrl: activeEndpoint.url, stream: true, model: activeEndpoint.model }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      if (res.body) {
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let full = "";
        let lastParseLen = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          for (const line of dec.decode(value).split("\n").filter(Boolean)) {
            const clean = line.replace(/^data:\s*/, "");
            if (clean === "[DONE]") continue;
            try {
              const j = JSON.parse(clean);
              // Ollama streaming: {"message":{"content":"token"},"done":false}
              // Ollama non-chat: {"response":"token","done":false}
              // OpenAI-compat: {"choices":[{"delta":{"content":"token"}}]}
              const delta = j.choices?.[0]?.delta?.content
                || j.message?.content
                || j.response
                || j.content
                || "";
              if (delta && !j.done) {
                full += delta;
                setStreamingContent(full);
                updateConversation(convId!, (c) => ({
                  ...c,
                  messages: c.messages.map((m) => m.id === aId ? { ...m, content: full } : m),
                }));
              }
            } catch {
              if (clean && clean !== "undefined") {
                full += clean;
                setStreamingContent(full);
                updateConversation(convId!, (c) => ({
                  ...c,
                  messages: c.messages.map((m) => m.id === aId ? { ...m, content: full } : m),
                }));
              }
            }
          }

          // Incrementally parse completed files + streaming file paths
          if (full.length - lastParseLen > 100) {
            lastParseLen = full.length;
            const paths = extractStreamingPaths(full);
            setStreamingPaths(paths);
            const partial = parseGeneratedFiles(full);
            if (partial.length > 0) setDisplayedFiles(partial);
          }
        }

        // Final parse
        const parsed = parseGeneratedFiles(full);
        let finalFiles: GeneratedFile[] = [];
        if (parsed.length >= 1) {
          finalFiles = parsed;
          setDisplayedFiles(parsed);
        } else if (full.includes("```")) {
          // Fallback: extract code blocks even without identified file paths
          const codeBlocks: { lang: string; content: string }[] = [];
          const blockRegex = /```(\w*)[^\n]*\n([\s\S]*?)```/g;
          let match;
          while ((match = blockRegex.exec(full)) !== null) {
            const content = match[2].trimEnd();
            if (content.trim()) codeBlocks.push({ lang: match[1] || "text", content });
          }
          if (codeBlocks.length > 0) {
            // Try to infer file extensions from language
            const langToExt: Record<string, string> = {
              html: "html", css: "css", javascript: "js", js: "js",
              typescript: "ts", ts: "ts", tsx: "tsx", jsx: "jsx",
              python: "py", py: "py", json: "json", bash: "sh", sh: "sh",
              go: "go", rust: "rs", yaml: "yml", md: "md",
            };
            finalFiles = codeBlocks.map((b, i) => {
              const ext = langToExt[b.lang] || b.lang || "txt";
              // If only one block and it looks like HTML, name it index.html
              const name = codeBlocks.length === 1 && ext === "html" ? "index" : `generated-${i + 1}`;
              return { path: `${name}.${ext}`, content: b.content, language: b.lang || "text" };
            });
            setDisplayedFiles(finalFiles);
          } else {
            // Even raw content with no fenced blocks — show as single file
            setDisplayedFiles([{ path: "response.md", content: full, language: "markdown" }]);
            finalFiles = [{ path: "response.md", content: full, language: "markdown" }];
          }
        } else if (full.trim().length > 50) {
          // No code blocks at all — show raw response in editor
          setDisplayedFiles([{ path: "response.md", content: full, language: "markdown" }]);
          finalFiles = [{ path: "response.md", content: full, language: "markdown" }];
        }

        setStreamingPaths([]);
        dbSaveMessage(convId!, { id: aId, role: "assistant", content: full });
        if (finalFiles.length > 0) dbSaveFiles(convId!, finalFiles);
        extractMemories(convId!, text, full);
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== "AbortError") {
        const msg = err instanceof Error ? err.message : String(err);
        updateConversation(convId!, (c) => ({
          ...c,
          messages: c.messages.map((m) =>
            m.id === aId ? { ...m, content: `⚠️ ${msg === "Failed to fetch" ? "Cannot reach the app server — please refresh." : `Error: ${msg}`}`, isStreaming: false } : m
          ),
        }));
      }
    } finally {
      updateConversation(convId!, (c) => ({
        ...c,
        messages: c.messages.map((m) => m.id === aId ? { ...m, isStreaming: false } : m),
      }));
      setIsStreaming(false);
      setStreamingContent("");
    }
  }, [activeEndpoint, activeConvId, conversations, createConversation, updateConversation]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
    setStreamingContent("");
    setStreamingPaths([]);
  }, []);

  // When switching conversations, restore files from last assistant message
  useEffect(() => {
    if (!activeConv) return;
    const lastAssistant = [...activeConv.messages].reverse().find((m) => m.role === "assistant" && !m.isStreaming);
    if (lastAssistant) {
      const parsed = parseGeneratedFiles(lastAssistant.content);
      if (parsed.length >= 1) setDisplayedFiles(parsed);
      else if (!isStreaming) setDisplayedFiles([]);
    } else if (!isStreaming) {
      setDisplayedFiles([]);
    }
  }, [activeConvId]);

  return (
    <div className="flex h-screen bg-[#0d1117] text-white overflow-hidden">
      {/* ── Sidebar toggle ── */}
      <button
        onClick={() => setSidebarOpen((v) => !v)}
        className="absolute top-3.5 left-3 z-50 w-7 h-7 flex items-center justify-center rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-gray-400 hover:text-white transition-colors"
        title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
      >
        {sidebarOpen ? <PanelLeftClose size={14} /> : <PanelLeftOpen size={14} />}
      </button>

      {/* ── Left sidebar ── */}
      <aside
        className="shrink-0 transition-all duration-300 overflow-hidden"
        style={{ width: sidebarOpen ? "340px" : "0px" }}
      >
        <div className="w-[340px] h-full pl-10">
          <ChatSidebar
            conversations={conversations}
            activeConvId={activeConvId}
            activeConv={activeConv}
            endpoints={endpoints}
            activeEndpoint={activeEndpoint}
            isDetecting={isDetecting}
            isStreaming={isStreaming}
            streamingPaths={streamingPaths}
            generatedFileCount={displayedFiles.length}
            onNew={createConversation}
            onSelect={setActiveConvId}
            onDelete={deleteConversation}
            onSend={handleSend}
            onStop={handleStop}
            onDetect={detectEndpoints}
            onSelectEndpoint={setActiveEndpointId}
            onLoadTemplateFiles={setDisplayedFiles}
            onTemplatePreviewUrl={setTemplatePreviewUrl}
          />
        </div>
      </aside>

      {/* ── Right code panel ── */}
      <main className="flex-1 min-w-0">
        <CodePanel
          files={displayedFiles}
          streamingContent={streamingContent}
          isStreaming={isStreaming}
          templatePreviewUrl={templatePreviewUrl}
        />
      </main>
    </div>
  );
}
