"use client";

import { useEffect, useRef, useState, useCallback, KeyboardEvent, ChangeEvent } from "react";
import {
  Plus, MessageSquare, Trash2, Cpu, Send, Square,
  Wifi, Radio, Loader2, CheckCircle, XCircle, ChevronDown,
  Paperclip, Mic, MicOff, FileCode, Layers,
} from "lucide-react";
import { Conversation, CLIEndpoint, Message } from "@/types";
import { ChatGeneratingIndicator } from "./CodeGenerationStatus";
import TemplateGallery from "./TemplateGallery";

const JOKES = [
  "Warming up the hamster wheels…",
  "Downloading more RAM…",
  "Convincing the AI it's actually smart…",
  "Converting coffee into tokens…",
  "Teaching electrons to cooperate…",
  "Consulting ancient Stack Overflow scrolls…",
  "Untangling neural spaghetti…",
  "Politely pestering the GPU…",
  "The AI is pretending to think…",
  "Compiling hopes and dreams…",
  "Summoning digital creativity…",
  "Please hold — genius in progress…",
];

/** Strip code blocks for sidebar display — they go to the code panel */
function stripCode(content: string): string {
  const stripped = content.replace(/```[\s\S]*?```/g, "").replace(/`[^`]+`/g, (m) => m).trim();
  return stripped.length > 0 ? stripped : "";
}

/** Extract file paths from content for display as chips */
function extractFilePaths(content: string): string[] {
  const paths: string[] = [];
  const seen = new Set<string>();
  for (const m of content.matchAll(/```\w*\s+([\w][\w\-./]*\.\w+)/g)) {
    if (!seen.has(m[1])) { seen.add(m[1]); paths.push(m[1]); }
  }
  for (const m of content.matchAll(/(?:\*\*`?|#{1,4}\s+|`)([\w][\w\-./]*\.(?:tsx?|jsx?|css|html|json|md|py|go|rs|ya?ml|sh|toml))`?\*?\*?/g)) {
    if (!seen.has(m[1])) { seen.add(m[1]); paths.push(m[1]); }
  }
  return paths;
}

interface Props {
  conversations: Conversation[];
  activeConvId?: string;
  activeConv?: Conversation;
  endpoints: CLIEndpoint[];
  activeEndpoint?: CLIEndpoint;
  isDetecting: boolean;
  isStreaming: boolean;
  streamingPaths: string[];
  generatedFileCount: number;
  onNew: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onSend: (text: string) => void;
  onStop: () => void;
  onDetect: () => void;
  onSelectEndpoint: (id: string) => void;
}

export default function ChatSidebar({
  conversations, activeConvId, activeConv,
  endpoints, activeEndpoint,
  isDetecting, isStreaming, streamingPaths, generatedFileCount,
  onNew, onSelect, onDelete,
  onSend, onStop, onDetect, onSelectEndpoint,
}: Props) {
  const [input, setInput] = useState("");
  const [endpointOpen, setEndpointOpen] = useState(false);
  const [jokeIdx, setJokeIdx] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<{ name: string; content: string }[]>([]);
  const [sidebarTab, setSidebarTab] = useState<"chat" | "templates">("chat");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const jokeTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);

  // Joke cycling when streaming
  const startJokes = () => {
    if (jokeTimer.current) return;
    jokeTimer.current = setInterval(() => setJokeIdx(i => (i + 1) % JOKES.length), 2800);
  };
  const stopJokes = () => {
    if (jokeTimer.current) { clearInterval(jokeTimer.current); jokeTimer.current = null; }
  };
  if (isStreaming) startJokes(); else stopJokes();

  // ── Voice input via Web Speech API ──
  const toggleRecording = useCallback(() => {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) { alert("Speech recognition not supported in this browser."); return; }
    const rec = new SpeechRec() as any;
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    rec.onresult = (e: any) => {
      let transcript = "";
      for (let i = 0; i < e.results.length; i++) transcript += e.results[i][0].transcript;
      setInput(transcript);
    };
    rec.onerror = () => setIsRecording(false);
    rec.onend = () => setIsRecording(false);
    rec.start();
    recognitionRef.current = rec;
    setIsRecording(true);
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }, [isRecording]);

  // ── File upload handler ──
  const handleFileUpload = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        const content = reader.result as string;
        setAttachedFiles(prev => [...prev, { name: file.name, content }]);
      };
      reader.readAsText(file);
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  function handleSend() {
    if (isRecording) { recognitionRef.current?.stop(); setIsRecording(false); }
    let text = input.trim();
    if (!text && attachedFiles.length === 0) return;
    if (isStreaming || !activeEndpoint) return;
    // Prepend attached files as context
    if (attachedFiles.length > 0) {
      const fileContext = attachedFiles.map(f => `[Attached file: ${f.name}]\n\`\`\`\n${f.content}\n\`\`\``).join("\n\n");
      text = fileContext + (text ? `\n\n${text}` : "\n\nPlease analyze these files.");
      setAttachedFiles([]);
    }
    onSend(text);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }

  function handleKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  const messages = activeConv?.messages ?? [];

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isStreaming, streamingPaths.length]);

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a] border-r border-white/[0.06]">
      {/* ── Header ── */}
      <div className="flex items-center gap-2.5 px-4 py-4 border-b border-white/[0.06]">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-eburon-500 to-purple-600 flex items-center justify-center shrink-0">
          <Cpu size={14} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-white truncate">Eburon Codepilot</p>
          <p className="text-[10px] text-eburon-400">eburonmax/codemax-v3</p>
        </div>
        <button
          onClick={onNew}
          className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-gray-400 hover:text-white transition-colors"
          title="New chat"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* ── Tab switcher: Chat / Templates ── */}
      <div className="flex border-b border-white/[0.06]">
        {([["chat", "Chat", <MessageSquare key="c" size={11} />], ["templates", "Templates", <Layers key="t" size={11} />]] as const).map(([key, label, icon]) => (
          <button
            key={key}
            onClick={() => setSidebarTab(key as "chat" | "templates")}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] font-medium transition-all border-b-2 ${
              sidebarTab === key
                ? "text-eburon-400 border-eburon-500"
                : "text-gray-600 border-transparent hover:text-gray-400 hover:border-white/[0.06]"
            }`}
          >
            {icon}{label}
          </button>
        ))}
      </div>

      {/* ── Templates tab ── */}
      {sidebarTab === "templates" && (
        <div className="flex-1 overflow-hidden">
          <TemplateGallery onUseTemplate={(prompt) => { setSidebarTab("chat"); onSend(prompt); }} />
        </div>
      )}

      {/* ── Chat tab ── */}
      {sidebarTab === "chat" && (<>

      {/* ── CLI endpoint badge ── */}
      <div className="px-3 py-2 border-b border-white/[0.04]">
        <button
          onClick={() => setEndpointOpen(v => !v)}
          className={`w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all border ${
            isDetecting
              ? "bg-yellow-950/30 border-yellow-800/30 text-yellow-400"
              : activeEndpoint
                ? "bg-green-950/40 border-green-800/40 text-green-400"
                : "bg-white/[0.04] border-white/[0.06] text-gray-500"
          }`}
        >
          {isDetecting ? <Loader2 size={10} className="shrink-0 animate-spin" /> : <Wifi size={10} className="shrink-0" />}
          <span className="flex-1 truncate text-left">
            {isDetecting ? "Detecting endpoints…" : activeEndpoint ? activeEndpoint.name : "No CLI connected"}
          </span>
          <ChevronDown size={10} className={`transition-transform ${endpointOpen ? "rotate-180" : ""}`} />
        </button>

        {endpointOpen && (
          <div className="mt-1 bg-[#111] border border-white/[0.06] rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.06]">
              <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Endpoints</span>
              <button onClick={onDetect} disabled={isDetecting} className="text-[10px] text-eburon-400 hover:text-eburon-300 flex items-center gap-1 disabled:opacity-50">
                {isDetecting ? <Loader2 size={10} className="animate-spin" /> : <Radio size={10} />}
                {isDetecting ? "Scanning…" : "Scan"}
              </button>
            </div>
            {endpoints.length === 0 ? (
              <p className="text-[11px] text-gray-600 italic px-3 py-2">No CLI detected</p>
            ) : (
              endpoints.map(ep => (
                <button key={ep.id} onClick={() => { onSelectEndpoint(ep.id); setEndpointOpen(false); }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-[11px] text-left transition-colors hover:bg-white/[0.04] ${activeEndpoint?.id === ep.id ? "text-white" : "text-gray-400"}`}
                >
                  {ep.status === "online"
                    ? <CheckCircle size={10} className="text-green-400 shrink-0" />
                    : <XCircle size={10} className="text-red-400 shrink-0" />}
                  <span className="flex-1 truncate">{ep.name}</span>
                  {ep.model && <span className="text-gray-600 font-mono text-[10px]">{ep.model.split(":")[0]}</span>}
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* ── Conversation list ── */}
      <div className="overflow-y-auto" style={{ maxHeight: "140px" }}>
        {conversations.length === 0 ? (
          <p className="text-[11px] text-gray-700 text-center py-3">No conversations yet</p>
        ) : (
          conversations.map(conv => (
            <div
              key={conv.id}
              onClick={() => onSelect(conv.id)}
              className={`group flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors ${
                activeConvId === conv.id ? "bg-white/[0.06] text-white" : "text-gray-500 hover:bg-white/[0.03] hover:text-gray-300"
              }`}
            >
              <MessageSquare size={11} className="shrink-0" />
              <span className="flex-1 text-[11px] truncate">{conv.title}</span>
              <button
                onClick={e => { e.stopPropagation(); onDelete(conv.id); }}
                className="opacity-0 group-hover:opacity-100 text-gray-700 hover:text-red-400 transition-all shrink-0"
              >
                <Trash2 size={10} />
              </button>
            </div>
          ))
        )}
      </div>

      {/* ── Messages ── */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-2">
            <p className="text-[11px] text-gray-600">
              {isDetecting ? "Scanning for local AI endpoints…" : activeEndpoint ? "Ask anything. Generate apps, debug code, explain concepts." : "Connect a CLI endpoint to start."}
            </p>
            {activeEndpoint && (
              <div className="grid grid-cols-1 gap-1.5 w-full">
                {[
                  "Create a modern landing page with hero, features, pricing and footer sections",
                  "Create a PWA mobile app for an Online Course platform with lessons, progress tracking and certificates",
                  "Create a Movie Site Portal with search, trailers, ratings and watchlist features",
                ].map(s => (
                  <button key={s} onClick={() => onSend(s)} disabled={isStreaming}
                    className="text-left px-2.5 py-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.07] text-[11px] text-gray-400 hover:text-gray-200 border border-white/[0.05] transition-all disabled:opacity-40">
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {messages.map(msg => (
          <MessageRow key={msg.id} msg={msg} jokeText={JOKES[jokeIdx]} isStreaming={isStreaming} streamingPaths={msg.isStreaming ? streamingPaths : []} />
        ))}
        {isStreaming && (
          <ChatGeneratingIndicator stage={messages.some(m => m.isStreaming && m.content.length > 20) ? "generating" : "thinking"} />
        )}
        {/* Show streaming file generation list */}
        {isStreaming && streamingPaths.length > 0 && (
          <div className="space-y-1 px-1">
            <p className="text-[10px] text-gray-600 uppercase tracking-wider font-semibold">Generating files</p>
            <div className="flex flex-wrap gap-1">
              {streamingPaths.map((p, i) => (
                <span key={p} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-cyan-500/10 border border-cyan-500/20 text-[10px] text-cyan-300 font-mono">
                  <FileCode size={9} className="shrink-0" />
                  {p.split("/").pop()}
                  {i === streamingPaths.length - 1 && <Loader2 size={8} className="animate-spin ml-0.5" />}
                </span>
              ))}
            </div>
            {generatedFileCount > 0 && (
              <p className="text-[10px] text-gray-600">{generatedFileCount} file{generatedFileCount !== 1 ? "s" : ""} complete</p>
            )}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── Attached files preview ── */}
      {attachedFiles.length > 0 && (
        <div className="px-3 py-1.5 border-t border-white/[0.04] flex flex-wrap gap-1">
          {attachedFiles.map((f, i) => (
            <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.06] text-[10px] text-gray-400">
              <Paperclip size={9} />{f.name}
              <button onClick={() => setAttachedFiles(prev => prev.filter((_, j) => j !== i))} className="text-gray-600 hover:text-red-400 ml-0.5">×</button>
            </span>
          ))}
        </div>
      )}

      {/* ── Input ── */}
      <div className="px-3 pb-4 pt-2 border-t border-white/[0.06]">
        <div className={`flex items-end gap-1.5 bg-white/[0.04] border rounded-xl px-3 py-2.5 transition-all ${
          activeEndpoint ? "border-white/[0.08] focus-within:border-eburon-500/50" : "border-white/[0.04] opacity-50"
        }`}>
          {/* Upload button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={!activeEndpoint || isStreaming}
            className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/[0.06] transition-colors disabled:opacity-30"
            title="Attach file"
          >
            <Paperclip size={13} />
          </button>
          <input ref={fileInputRef} type="file" multiple accept=".ts,.tsx,.js,.jsx,.css,.html,.json,.md,.py,.go,.rs,.yaml,.yml,.sh,.toml,.txt,.env,.sql,.xml,.svg" onChange={handleFileUpload} className="hidden" />

          {/* Mic button */}
          <button
            onClick={toggleRecording}
            disabled={!activeEndpoint}
            className={`shrink-0 w-7 h-7 flex items-center justify-center rounded-lg transition-colors disabled:opacity-30 ${
              isRecording ? "bg-red-600/20 text-red-400 animate-pulse" : "text-gray-500 hover:text-gray-300 hover:bg-white/[0.06]"
            }`}
            title={isRecording ? "Stop recording" : "Voice input"}
          >
            {isRecording ? <MicOff size={13} /> : <Mic size={13} />}
          </button>

          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            onInput={() => {
              const el = textareaRef.current;
              if (el) { el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 160) + "px"; }
            }}
            rows={1}
            disabled={!activeEndpoint || isStreaming}
            placeholder={isRecording ? "🎤 Listening…" : isDetecting ? "Scanning endpoints…" : activeEndpoint ? "Describe what to build…" : "Connect a CLI first"}
            className="flex-1 bg-transparent text-[12px] text-gray-200 placeholder-gray-600 resize-none outline-none leading-relaxed max-h-40"
          />
          {isStreaming ? (
            <button onClick={onStop} className="shrink-0 w-7 h-7 rounded-lg bg-red-600 hover:bg-red-500 flex items-center justify-center transition-colors">
              <Square size={11} className="text-white fill-white" />
            </button>
          ) : (
            <button onClick={handleSend} disabled={(!input.trim() && attachedFiles.length === 0) || !activeEndpoint}
              className="shrink-0 w-7 h-7 rounded-lg bg-eburon-600 hover:bg-eburon-500 disabled:opacity-30 flex items-center justify-center transition-all">
              <Send size={11} className="text-white" />
            </button>
          )}
        </div>
        <p className="text-center text-[10px] text-gray-700 mt-1.5">
          © {new Date().getFullYear()} Eburon Technologies
        </p>
      </div>
      </>)}
    </div>
  );
}

function MessageRow({ msg, jokeText, isStreaming: parentStreaming, streamingPaths }: { msg: Message; jokeText: string; isStreaming: boolean; streamingPaths: string[] }) {
  const isUser = msg.role === "user";
  const displayText = isUser ? msg.content : stripCode(msg.content);
  // Extract file paths from completed assistant messages
  const filePaths = !isUser && !msg.isStreaming ? extractFilePaths(msg.content) : [];

  return (
    <div className={`flex gap-2 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      {!isUser && (
        <div className="w-5 h-5 rounded-full bg-gradient-to-br from-eburon-500 to-purple-600 flex items-center justify-center shrink-0 mt-0.5">
          <Cpu size={10} className="text-white" />
        </div>
      )}
      <div className="max-w-[88%] space-y-1.5">
        <div className={`rounded-xl px-3 py-2 text-[11px] leading-relaxed ${
          isUser ? "bg-eburon-600/80 text-white rounded-tr-sm" : "bg-white/[0.04] text-gray-300 rounded-tl-sm border border-white/[0.05]"
        }`}>
          {msg.isStreaming && msg.content === "" ? (
            <span className="text-gray-500 italic">{jokeText}</span>
          ) : (
            <>
              {displayText && <span>{displayText}</span>}
              {!displayText && !isUser && <span className="text-gray-500 italic">Code generated → see editor</span>}
              {msg.isStreaming && (
                <span className="inline-block w-0.5 h-3 bg-eburon-400 ml-0.5 animate-blink align-middle" />
              )}
            </>
          )}
          <div className={`text-[9px] mt-1 ${isUser ? "text-eburon-200/60" : "text-gray-600"}`}>
            {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>
        {/* File path chips for completed messages */}
        {filePaths.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {filePaths.map(p => (
              <span key={p} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/[0.06] text-[9px] text-gray-500 font-mono">
                <FileCode size={8} className="text-cyan-500/60" />{p.split("/").pop()}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
