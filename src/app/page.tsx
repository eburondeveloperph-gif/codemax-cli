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
  const abortRef = useRef<AbortController | null>(null);

  const activeConv = conversations.find((c) => c.id === activeConvId);
  const activeEndpoint = endpoints.find((e) => e.id === activeEndpointId);

  useEffect(() => { detectEndpoints(); }, []);

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
    return id;
  }, []);

  const deleteConversation = useCallback((id: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeConvId === id) setActiveConvId(undefined);
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

    updateConversation(convId, (c) => ({
      ...c,
      title: c.messages.length === 0 ? text.slice(0, 45) : c.title,
      messages: [...c.messages, userMsg, assistantMsg],
      updatedAt: new Date(),
    }));

    setIsStreaming(true);
    setStreamingContent("");
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

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          for (const line of dec.decode(value).split("\n").filter(Boolean)) {
            const clean = line.replace(/^data:\s*/, "");
            if (clean === "[DONE]") continue;
            try {
              const j = JSON.parse(clean);
              const delta = j.choices?.[0]?.delta?.content || j.message?.content || j.content || "";
              if (delta) {
                full += delta;
                setStreamingContent(full);
                updateConversation(convId!, (c) => ({
                  ...c,
                  messages: c.messages.map((m) => m.id === aId ? { ...m, content: full } : m),
                }));
              }
            } catch {
              if (clean) {
                full += clean;
                setStreamingContent(full);
                updateConversation(convId!, (c) => ({
                  ...c,
                  messages: c.messages.map((m) => m.id === aId ? { ...m, content: full } : m),
                }));
              }
            }
          }
        }

        // Parse files once streaming completes
        const parsed = parseGeneratedFiles(full);
        if (parsed.length >= 2) setDisplayedFiles(parsed);
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
  }, []);

  // When switching conversations, restore files from last assistant message
  useEffect(() => {
    if (!activeConv) return;
    const lastAssistant = [...activeConv.messages].reverse().find((m) => m.role === "assistant" && !m.isStreaming);
    if (lastAssistant) {
      const parsed = parseGeneratedFiles(lastAssistant.content);
      if (parsed.length >= 2) setDisplayedFiles(parsed);
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
        style={{ width: sidebarOpen ? "300px" : "0px" }}
      >
        <div className="w-[300px] h-full pl-10">
          <ChatSidebar
            conversations={conversations}
            activeConvId={activeConvId}
            activeConv={activeConv}
            endpoints={endpoints}
            activeEndpoint={activeEndpoint}
            isDetecting={isDetecting}
            isStreaming={isStreaming}
            onNew={createConversation}
            onSelect={setActiveConvId}
            onDelete={deleteConversation}
            onSend={handleSend}
            onStop={handleStop}
            onDetect={detectEndpoints}
            onSelectEndpoint={setActiveEndpointId}
          />
        </div>
      </aside>

      {/* ── Right code panel ── */}
      <main className="flex-1 min-w-0">
        <CodePanel
          files={displayedFiles}
          streamingContent={streamingContent}
          isStreaming={isStreaming}
        />
      </main>
    </div>
  );
}
