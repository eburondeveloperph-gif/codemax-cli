"use client";

import { CheckCircle2, Circle, Loader2, XCircle, Cpu, Code2, Palette, Settings2, FileCode2, Braces } from "lucide-react";
import { AgentTask, AgentType } from "@/types";

const TYPE_ICONS: Record<AgentType, React.ReactNode> = {
  orchestrator: <Cpu size={11} />,
  ui:           <Code2 size={11} />,
  api:          <Braces size={11} />,
  styles:       <Palette size={11} />,
  config:       <Settings2 size={11} />,
  types:        <FileCode2 size={11} />,
};

const TYPE_COLORS: Record<AgentType, string> = {
  orchestrator: "text-violet-400 bg-violet-950/50 border-violet-800/40",
  ui:           "text-blue-400   bg-blue-950/50   border-blue-800/40",
  api:          "text-cyan-400   bg-cyan-950/50   border-cyan-800/40",
  styles:       "text-pink-400   bg-pink-950/50   border-pink-800/40",
  config:       "text-amber-400  bg-amber-950/50  border-amber-800/40",
  types:        "text-green-400  bg-green-950/50  border-green-800/40",
};

interface Props {
  tasks: AgentTask[];
  statusMessage?: string;
}

export default function AgentProgress({ tasks, statusMessage }: Props) {
  const done  = tasks.filter((t) => t.status === "done").length;
  const total = tasks.length;
  const pct   = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="px-3 py-2 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1">
          <Cpu size={9} />
          Multi-Agent
        </span>
        <span className="text-[10px] text-eburon-400 font-mono">{done}/{total}</span>
      </div>

      {/* Progress bar */}
      <div className="h-0.5 w-full bg-white/[0.05] rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-eburon-600 to-purple-500 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Status message */}
      {statusMessage && (
        <p className="text-[10px] text-gray-500 italic truncate">{statusMessage}</p>
      )}

      {/* Agent cards */}
      <div className="space-y-1">
        {tasks.map((task) => (
          <AgentCard key={task.id} task={task} />
        ))}
      </div>
    </div>
  );
}

function AgentCard({ task }: { task: AgentTask }) {
  const colorClass = TYPE_COLORS[task.type] ?? TYPE_COLORS.ui;

  return (
    <div className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border text-[11px] transition-all ${colorClass}`}>
      {/* Type icon */}
      <span className="shrink-0 opacity-70">{TYPE_ICONS[task.type]}</span>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold capitalize truncate">{task.type}</span>
          {task.fileCount !== undefined && task.status === "done" && (
            <span className="text-[9px] opacity-60">{task.fileCount} files</span>
          )}
        </div>
        <div className="text-[9px] opacity-50 font-mono truncate">{task.model}</div>
      </div>

      {/* Status icon */}
      <StatusIcon status={task.status} />
    </div>
  );
}

function StatusIcon({ status }: { status: AgentTask["status"] }) {
  switch (status) {
    case "pending":
      return <Circle size={11} className="shrink-0 opacity-30" />;
    case "running":
      return <Loader2 size={11} className="shrink-0 animate-spin text-current" />;
    case "done":
      return <CheckCircle2 size={11} className="shrink-0 text-green-400" />;
    case "error":
      return <XCircle size={11} className="shrink-0 text-red-400" />;
  }
}
