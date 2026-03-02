"use client";

import { Conversation } from "@/types";
import { Plus, MessageSquare, Trash2, Cpu } from "lucide-react";

interface Props {
  conversations: Conversation[];
  activeId?: string;
  onNew: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

export default function Sidebar({
  conversations,
  activeId,
  onNew,
  onSelect,
  onDelete,
}: Props) {
  return (
    <div className="flex flex-col h-full bg-gray-900 border-r border-gray-800">
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-gray-800">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-eburon-500 to-purple-600 flex items-center justify-center shadow-md shadow-eburon-600/30">
          <Cpu size={18} className="text-white" />
        </div>
        <div>
          <h1 className="text-sm font-bold text-white leading-tight">
            Eburon Codepilot
          </h1>
          <p className="text-xs text-eburon-400">Autopilot</p>
        </div>
      </div>

      {/* New chat */}
      <div className="px-3 pt-3 pb-2">
        <button
          onClick={onNew}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-eburon-600 hover:bg-eburon-500 text-white text-sm font-medium transition-all shadow-md shadow-eburon-600/20"
        >
          <Plus size={16} />
          New Chat
        </button>
      </div>

      {/* Conversations */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
        {conversations.length === 0 && (
          <p className="text-xs text-gray-600 text-center py-4">
            No conversations yet
          </p>
        )}
        {conversations.map((conv) => (
          <div
            key={conv.id}
            className={`group flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer transition-all ${
              activeId === conv.id
                ? "bg-gray-700/70 text-white"
                : "text-gray-400 hover:bg-gray-800 hover:text-gray-200"
            }`}
            onClick={() => onSelect(conv.id)}
          >
            <MessageSquare size={14} className="shrink-0" />
            <span className="flex-1 text-xs truncate">{conv.title}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(conv.id);
              }}
              className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition-all shrink-0"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-gray-800">
        <p className="text-xs text-gray-600 text-center">
          © {new Date().getFullYear()} Eburon Technologies
        </p>
      </div>
    </div>
  );
}
