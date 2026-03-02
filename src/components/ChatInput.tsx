"use client";

import { KeyboardEvent, useRef, useState } from "react";
import { Send, Square, Paperclip } from "lucide-react";

interface Props {
  onSend: (text: string) => void;
  disabled?: boolean;
  isStreaming?: boolean;
  onStop?: () => void;
  hasEndpoint: boolean;
}

export default function ChatInput({
  onSend,
  disabled,
  isStreaming,
  onStop,
  hasEndpoint,
}: Props) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  };

  return (
    <div className="px-4 pb-4 pt-2">
      <div
        className={`flex items-end gap-2 bg-gray-800 border rounded-2xl px-4 py-3 transition-all ${
          hasEndpoint
            ? "border-gray-600 focus-within:border-eburon-500 shadow-lg shadow-black/20"
            : "border-gray-700 opacity-60"
        }`}
      >
        <button
          disabled={!hasEndpoint}
          className="text-gray-500 hover:text-gray-300 transition-colors shrink-0 pb-0.5"
          title="Attach file"
        >
          <Paperclip size={18} />
        </button>

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKey}
          onInput={handleInput}
          rows={1}
          placeholder={
            hasEndpoint
              ? "Message Eburon Codepilot… (Shift+Enter for new line)"
              : "Connect a CLI endpoint to start chatting"
          }
          disabled={!hasEndpoint || disabled}
          className="flex-1 bg-transparent text-gray-100 placeholder-gray-500 resize-none outline-none text-sm leading-relaxed max-h-48 overflow-y-auto"
        />

        {isStreaming ? (
          <button
            onClick={onStop}
            className="shrink-0 w-8 h-8 rounded-lg bg-red-600 hover:bg-red-500 flex items-center justify-center transition-colors"
            title="Stop generating"
          >
            <Square size={14} className="text-white fill-white" />
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!value.trim() || !hasEndpoint || disabled}
            className="shrink-0 w-8 h-8 rounded-lg bg-eburon-600 hover:bg-eburon-500 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-all"
            title="Send"
          >
            <Send size={14} className="text-white" />
          </button>
        )}
      </div>
      <p className="text-center text-xs text-gray-600 mt-2">
        Eburon Codepilot may produce inaccurate results. Verify critical output.
      </p>
    </div>
  );
}
