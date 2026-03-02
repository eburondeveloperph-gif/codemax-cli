"use client";

import { Message } from "@/types";
import { User, Cpu } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import GeneratedAppPreview from "@/components/GeneratedAppPreview";
import { parseGeneratedFiles } from "@/lib/parse-generated-files";

interface Props {
  messages: Message[];
  onSuggestion?: (text: string) => void;
}

const JOKES = [
  "Warming up the hamster wheels…",
  "Downloading more RAM…",
  "Convincing the AI it's actually smart…",
  "Converting coffee into tokens…",
  "Teaching electrons to cooperate…",
  "Consulting ancient Stack Overflow scrolls…",
  "Untangling neural spaghetti…",
  "Politely pestering the GPU…",
  "Bribing transformer layers with attention…",
  "Asking nicely — twice…",
  "The AI is pretending to think…",
  "Compiling hopes and dreams…",
  "Summoning digital creativity…",
  "Running on vibes and matrix math…",
  "Please hold — genius in progress…",
];

function TypingIndicator() {
  const [idx, setIdx] = useState(() => Math.floor(Math.random() * JOKES.length));

  useEffect(() => {
    const t = setInterval(
      () => setIdx((i) => (i + 1) % JOKES.length),
      2800
    );
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex items-center gap-2.5 py-1">
      <div className="flex items-center gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-eburon-400"
            style={{
              animation: `pulse_dot 1.4s ease-in-out ${i * 0.16}s infinite`,
            }}
          />
        ))}
      </div>
      <span className="text-xs italic text-gray-400 animate-fade-in">
        {JOKES[idx]}
      </span>
    </div>
  );
}

function MessageBubble({ msg, onSuggestion }: { msg: Message; onSuggestion?: (t: string) => void }) {
  const isUser = msg.role === "user";
  const files = !isUser && !msg.isStreaming ? parseGeneratedFiles(msg.content) : [];
  const hasFiles = files.length >= 2;

  return (
    <div className={`flex gap-3 animate-fade-in ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      {/* Avatar */}
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-1 ${
          isUser
            ? "bg-eburon-600 text-white"
            : "bg-gradient-to-br from-eburon-500 to-purple-600 text-white"
        }`}
      >
        {isUser ? <User size={16} /> : <Cpu size={16} />}
      </div>

      {/* Content */}
      <div className={`${isUser ? "max-w-[75%]" : "flex-1 min-w-0"}`}>
        <div
          className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
            isUser
              ? "bg-eburon-600 text-white rounded-tr-sm"
              : "bg-gray-800 text-gray-100 rounded-tl-sm border border-gray-700/50"
          }`}
        >
          {msg.isStreaming && msg.content === "" ? (
            <TypingIndicator />
          ) : (
            <pre className="whitespace-pre-wrap font-sans">
              {msg.content}
              {msg.isStreaming && (
                <span className="inline-block w-0.5 h-4 bg-eburon-400 ml-0.5 animate-blink align-text-bottom" />
              )}
            </pre>
          )}
          <div className={`text-xs mt-1.5 ${isUser ? "text-eburon-200/70" : "text-gray-500"}`}>
            {new Date(msg.timestamp).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
        </div>

        {/* Generated app preview */}
        {hasFiles && <GeneratedAppPreview files={files} />}
      </div>
    </div>
  );
}

export default function ChatMessages({ messages, onSuggestion }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-4 text-center">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-eburon-500 to-purple-600 flex items-center justify-center shadow-lg shadow-eburon-500/30">
          <Cpu size={32} className="text-white" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-white mb-2">
            Eburon Codepilot
          </h2>
          <p className="text-gray-400 max-w-md">
            Your intelligent coding companion. Connect a CLI endpoint and start
            building.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl w-full">
          {[
            "Explain this codebase",
            "Generate a REST API",
            "Debug my code",
            "Optimize performance",
          ].map((suggestion) => (
            <button
              key={suggestion}
              onClick={() => onSuggestion?.(suggestion)}
              disabled={!onSuggestion}
              className="p-3 rounded-xl border border-gray-700/50 bg-gray-800/50 text-gray-300 text-sm text-left hover:border-eburon-500/50 hover:bg-gray-800 hover:text-white transition-all disabled:cursor-default disabled:opacity-60"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
      {messages.map((msg) => (
        <MessageBubble key={msg.id} msg={msg} onSuggestion={onSuggestion} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
