"use client";

import { useEffect, useState, useRef } from "react";
import { Loader2, Cpu, Zap, Code2, Check, Sparkles } from "lucide-react";

interface Props {
  isActive: boolean;
  stage?: "thinking" | "generating" | "writing" | "done";
  elapsedMs?: number;
  filesGenerated?: number;
  currentFile?: string;
}

const THINKING_MESSAGES = [
  "Analyzing your request…",
  "Reasoning through the architecture…",
  "Decomposing the problem…",
  "Planning the implementation…",
  "Evaluating approaches…",
];

const GENERATING_MESSAGES = [
  "Writing production-ready code…",
  "Generating components…",
  "Constructing the solution…",
  "Assembling the codebase…",
  "Building your application…",
];

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

// Animated gradient bar
function PulseBar() {
  return (
    <div className="relative w-full h-1 rounded-full overflow-hidden bg-gray-800/50">
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-cyan-500/60 to-transparent animate-pulse-bar" />
    </div>
  );
}

// Small dot spinner
function DotSpinner() {
  return (
    <span className="inline-flex gap-[3px] items-center">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-[5px] h-[5px] rounded-full bg-cyan-400"
          style={{ animation: `dotPulse 1.4s ease-in-out ${i * 0.16}s infinite` }}
        />
      ))}
    </span>
  );
}

export default function CodeGenerationStatus({ isActive, stage = "thinking", elapsedMs = 0, filesGenerated = 0, currentFile }: Props) {
  const [msgIndex, setMsgIndex] = useState(0);
  const [elapsed, setElapsed] = useState(elapsedMs);
  const startRef = useRef(Date.now());

  // Cycle through messages
  useEffect(() => {
    if (!isActive) return;
    const iv = setInterval(() => setMsgIndex((i) => i + 1), 3000);
    return () => clearInterval(iv);
  }, [isActive]);

  // Live elapsed timer
  useEffect(() => {
    if (!isActive) return;
    startRef.current = Date.now();
    const iv = setInterval(() => setElapsed(Date.now() - startRef.current), 100);
    return () => clearInterval(iv);
  }, [isActive]);

  if (!isActive) return null;

  const messages = stage === "thinking" ? THINKING_MESSAGES : GENERATING_MESSAGES;
  const currentMsg = messages[msgIndex % messages.length];
  const isDone = stage === "done";

  return (
    <>
      {/* ── Status bar (bottom of code panel) ── */}
      <div className="shrink-0 border-t border-white/[0.06] bg-[#0a0e14]">
        <PulseBar />
        <div className="flex items-center justify-between px-4 py-2">
          {/* Left: status */}
          <div className="flex items-center gap-3">
            {/* Stage indicator */}
            <div className={`flex items-center gap-2 px-2.5 py-1 rounded-md text-xs font-medium ${
              isDone
                ? "bg-emerald-500/10 text-emerald-400"
                : "bg-cyan-500/10 text-cyan-400"
            }`}>
              {isDone ? (
                <Check size={12} />
              ) : stage === "thinking" ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Code2 size={12} className="animate-pulse" />
              )}
              {isDone ? "Complete" : stage === "thinking" ? "Thinking" : "Generating"}
            </div>

            {/* Elapsed */}
            <span className="text-[11px] text-gray-500 font-mono tabular-nums">
              {formatElapsed(elapsed)}
            </span>

            {/* Files count */}
            {filesGenerated > 0 && (
              <span className="flex items-center gap-1 text-[11px] text-gray-500">
                <Zap size={10} className="text-yellow-500" />
                {filesGenerated} file{filesGenerated !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          {/* Right: model badge */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-[11px] text-gray-600">
              <Cpu size={10} />
              <span className="font-mono">codemax-v3</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Overlay card (when no files yet) ── */}
      {!isDone && filesGenerated === 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0d1117]/80 backdrop-blur-sm z-10 pointer-events-none">
          <div className="flex flex-col items-center gap-6 max-w-sm">
            {/* Animated logo */}
            <div className="relative">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-cyan-700/10 border border-cyan-500/20 flex items-center justify-center">
                <img
                  src="https://eburon.ai/icon-eburon.svg"
                  alt="Eburon"
                  className="w-10 h-10 animate-pulse"
                />
              </div>
              {/* Orbiting dot */}
              <div className="absolute inset-0 animate-orbit">
                <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-cyan-400 shadow-lg shadow-cyan-400/50" />
              </div>
            </div>

            {/* Message */}
            <div className="text-center space-y-2">
              <div className="flex items-center justify-center gap-2">
                <Sparkles size={14} className="text-cyan-400" />
                <span className="text-sm font-medium text-white">
                  {stage === "thinking" ? "Eburon is thinking" : "Eburon is generating code"}
                </span>
                <DotSpinner />
              </div>
              <p className="text-xs text-gray-500 transition-all duration-500">
                {currentMsg}
              </p>
            </div>

            {/* Current file being written */}
            {currentFile && (
              <div className="flex items-center gap-2 bg-gray-800/50 border border-gray-700/30 rounded-lg px-3 py-1.5">
                <Code2 size={11} className="text-cyan-400 animate-pulse" />
                <span className="text-[11px] text-gray-400 font-mono">{currentFile}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Compact inline indicator for the chat sidebar
 */
export function ChatGeneratingIndicator({ stage = "thinking" }: { stage?: "thinking" | "generating" }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 mx-2 my-1 rounded-lg bg-cyan-500/5 border border-cyan-500/10">
      {stage === "thinking" ? (
        <Loader2 size={12} className="text-cyan-400 animate-spin shrink-0" />
      ) : (
        <Code2 size={12} className="text-cyan-400 animate-pulse shrink-0" />
      )}
      <span className="text-xs text-cyan-300/70">
        {stage === "thinking" ? "Thinking" : "Writing code"}
      </span>
      <DotSpinner />
    </div>
  );
}
