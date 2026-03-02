"use client";

import { useRef, useState, KeyboardEvent } from "react";
import {
  Plus, MessageSquare, Trash2, Cpu, Send, Square,
  Wifi, Radio, Loader2, CheckCircle, XCircle, ChevronDown,
} from "lucide-react";
import { Conversation, CLIEndpoint, Message } from "@/types";
import { ChatGeneratingIndicator } from "./CodeGenerationStatus";

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
  return stripped.length > 0 ? stripped : "⬛ Code generated →";
}

interface Props {
  conversations: Conversation[];
  activeConvId?: string;
  activeConv?: Conversation;
  endpoints: CLIEndpoint[];
  activeEndpoint?: CLIEndpoint;
  isDetecting: boolean;
  isStreaming: boolean;
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
  isDetecting, isStreaming,
  onNew, onSelect, onDelete,
  onSend, onStop, onDetect, onSelectEndpoint,
}: Props) {
  const [input, setInput] = useState("");
  const [endpointOpen, setEndpointOpen] = useState(false);
  const [jokeIdx, setJokeIdx] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const jokeTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Joke cycling when streaming
  const startJokes = () => {
    if (jokeTimer.current) return;
    jokeTimer.current = setInterval(() => setJokeIdx(i => (i + 1) % JOKES.length), 2800);
  };
  const stopJokes = () => {
    if (jokeTimer.current) { clearInterval(jokeTimer.current); jokeTimer.current = null; }
  };
  if (isStreaming) startJokes(); else stopJokes();

  function handleSend() {
    const t = input.trim();
    if (!t || isStreaming || !activeEndpoint) return;
    onSend(t);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }

  function handleKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  const messages = activeConv?.messages ?? [];

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

      {/* ── CLI endpoint badge ── */}
      <div className="px-3 py-2 border-b border-white/[0.04]">
        <button
          onClick={() => setEndpointOpen(v => !v)}
          className={`w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all border ${
            activeEndpoint
              ? "bg-green-950/40 border-green-800/40 text-green-400"
              : "bg-white/[0.04] border-white/[0.06] text-gray-500"
          }`}
        >
          <Wifi size={10} className="shrink-0" />
          <span className="flex-1 truncate text-left">
            {activeEndpoint ? activeEndpoint.name : "No CLI connected"}
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
              {activeEndpoint ? "Ask anything. Generate apps, debug code, explain concepts." : "Connect a CLI endpoint to start."}
            </p>
            {activeEndpoint && (
              <div className="grid grid-cols-1 gap-1.5 w-full">
                {["Generate a React todo app", "Build a REST API", "Debug my code", "Explain a concept"].map(s => (
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
          <MessageRow key={msg.id} msg={msg} jokeText={JOKES[jokeIdx]} />
        ))}
        {isStreaming && (
          <ChatGeneratingIndicator stage={messages.some(m => m.isStreaming && m.content.length > 20) ? "generating" : "thinking"} />
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── Input ── */}
      <div className="px-3 pb-4 pt-2 border-t border-white/[0.06]">
        <div className={`flex items-end gap-2 bg-white/[0.04] border rounded-xl px-3 py-2.5 transition-all ${
          activeEndpoint ? "border-white/[0.08] focus-within:border-eburon-500/50" : "border-white/[0.04] opacity-50"
        }`}>
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
            placeholder={activeEndpoint ? "Describe what to build…" : "Connect a CLI first"}
            className="flex-1 bg-transparent text-[12px] text-gray-200 placeholder-gray-600 resize-none outline-none leading-relaxed max-h-40"
          />
          {isStreaming ? (
            <button onClick={onStop} className="shrink-0 w-7 h-7 rounded-lg bg-red-600 hover:bg-red-500 flex items-center justify-center transition-colors">
              <Square size={11} className="text-white fill-white" />
            </button>
          ) : (
            <button onClick={handleSend} disabled={!input.trim() || !activeEndpoint}
              className="shrink-0 w-7 h-7 rounded-lg bg-eburon-600 hover:bg-eburon-500 disabled:opacity-30 flex items-center justify-center transition-all">
              <Send size={11} className="text-white" />
            </button>
          )}
        </div>
        <p className="text-center text-[10px] text-gray-700 mt-1.5">
          © {new Date().getFullYear()} Eburon Technologies
        </p>
      </div>
    </div>
  );
}

function MessageRow({ msg, jokeText }: { msg: Message; jokeText: string }) {
  const isUser = msg.role === "user";
  const displayText = isUser ? msg.content : stripCode(msg.content);

  return (
    <div className={`flex gap-2 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      {!isUser && (
        <div className="w-5 h-5 rounded-full bg-gradient-to-br from-eburon-500 to-purple-600 flex items-center justify-center shrink-0 mt-0.5">
          <Cpu size={10} className="text-white" />
        </div>
      )}
      <div className={`rounded-xl px-3 py-2 text-[11px] leading-relaxed max-w-[85%] ${
        isUser ? "bg-eburon-600/80 text-white rounded-tr-sm" : "bg-white/[0.04] text-gray-300 rounded-tl-sm border border-white/[0.05]"
      }`}>
        {msg.isStreaming && msg.content === "" ? (
          <span className="text-gray-500 italic">{jokeText}</span>
        ) : (
          <>
            <span>{displayText}</span>
            {msg.isStreaming && (
              <span className="inline-block w-0.5 h-3 bg-eburon-400 ml-0.5 animate-blink align-middle" />
            )}
          </>
        )}
        <div className={`text-[9px] mt-1 ${isUser ? "text-eburon-200/60" : "text-gray-600"}`}>
          {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>
    </div>
  );
}
