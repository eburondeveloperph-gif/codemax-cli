"use client";

import { CLIEndpoint } from "@/types";
import { CheckCircle, XCircle, Loader2, Radio } from "lucide-react";

interface Props {
  endpoints: CLIEndpoint[];
  activeId?: string;
  isDetecting: boolean;
  onSelect: (id: string) => void;
  onDetect: () => void;
}

export default function CLIStatus({
  endpoints,
  activeId,
  isDetecting,
  onSelect,
  onDetect,
}: Props) {
  return (
    <div className="px-3 py-2">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          CLI Endpoints
        </span>
        <button
          onClick={onDetect}
          disabled={isDetecting}
          className="text-xs text-eburon-400 hover:text-eburon-300 transition-colors flex items-center gap-1 disabled:opacity-50"
        >
          {isDetecting ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Radio size={12} />
          )}
          {isDetecting ? "Detecting…" : "Scan"}
        </button>
      </div>

      {endpoints.length === 0 && !isDetecting && (
        <p className="text-xs text-gray-500 italic py-1 px-2">
          No CLI detected. Click Scan.
        </p>
      )}

      {endpoints.map((ep) => (
        <button
          key={ep.id}
          onClick={() => onSelect(ep.id)}
          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs mb-1 transition-all ${
            activeId === ep.id
              ? "bg-eburon-700/50 text-white"
              : "text-gray-400 hover:bg-gray-700/50 hover:text-gray-200"
          }`}
        >
          {ep.status === "online" ? (
            <CheckCircle size={12} className="text-green-400 shrink-0" />
          ) : ep.status === "detecting" ? (
            <Loader2 size={12} className="animate-spin text-yellow-400 shrink-0" />
          ) : (
            <XCircle size={12} className="text-red-400 shrink-0" />
          )}
          <span className="truncate text-left flex-1">{ep.name}</span>
          {ep.model && (
            <span className="shrink-0 text-gray-600 font-mono" title={ep.model}>
              {ep.model.length > 12 ? ep.model.slice(0, 12) + "…" : ep.model}
            </span>
          )}
          {activeId === ep.id && (
            <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-eburon-400" />
          )}
        </button>
      ))}
    </div>
  );
}
