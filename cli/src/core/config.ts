/**
 * Eburon Copilot CLI — Configuration
 */
import { homedir } from "os";
import { resolve } from "path";

export const CONFIG = {
  // Model
  model: process.env.EBURON_MODEL ?? "eburonmax/codemax-v3",
  ollamaUrl: process.env.OLLAMA_URL ?? "http://localhost:11434",

  // Paths
  home: resolve(homedir(), ".eburon"),
  sessionsDir: resolve(homedir(), ".eburon", "sessions"),

  // CLI
  version: "2.0.0",
  name: "Eburon Copilot",
  maxContextTokens: 8192,
  maxHistoryMessages: 50,

  // Tool approval
  autoApproveReads: true,
  autoApproveWrites: false,
  autoApproveShell: false,
};

export type Config = typeof CONFIG;
