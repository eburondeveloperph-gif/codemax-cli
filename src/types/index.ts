import type { GeneratedFile } from "@/lib/parse-generated-files";

export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  images?: string[];
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CLIEndpoint {
  id: string;
  name: string;
  url: string;
  status: "online" | "offline" | "detecting";
  type: "http" | "websocket" | "local";
  version?: string;
  model?: string;
  lastChecked?: Date;
}

export interface CLIConfig {
  endpoints: CLIEndpoint[];
  activeEndpoint?: string;
  autoDetect: boolean;
}

// ── Multi-agent orchestration ──────────────────────────────────────

export type AgentType = "orchestrator" | "ui" | "api" | "styles" | "config" | "types";

export interface AgentTask {
  id: string;
  type: AgentType;
  description: string;
  files: string[];
  model: string;
  prompt?: string;
  status: "pending" | "running" | "done" | "error";
  fileCount?: number;
  error?: string;
}

export type OrchestratorEventType =
  | "status"
  | "plan"
  | "agent_start"
  | "agent_chunk"
  | "agent_done"
  | "agent_error"
  | "done"
  | "error";

export interface OrchestratorEvent {
  type: OrchestratorEventType;
  message?: string;
  phase?: string;
  tasks?: AgentTask[];
  agentId?: string;
  chunk?: string;
  files?: GeneratedFile[];
  fileCount?: number;
  totalFiles?: number;
  error?: string;
}
