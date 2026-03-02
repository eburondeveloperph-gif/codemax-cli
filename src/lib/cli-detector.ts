import { CLIEndpoint } from "@/types";
import { execSync } from "child_process";

// ── Ports to scan on every host ───────────────────────────────────
const SCAN_PORTS = [3333, 3001, 4000, 5000, 8000, 8080, 8888, 11434, 1234, 65432];

/** Hardcoded + env-configured VPS / remote hosts to always probe */
const REMOTE_HOSTS: string[] = [
  "168.231.78.113",
  ...(process.env.EBURON_VPS_HOSTS ? process.env.EBURON_VPS_HOSTS.split(",").map(s => s.trim()).filter(Boolean) : []),
];

/** IPs that resolve to this machine — treated as localhost aliases */
const LOCALHOST_ALIASES = new Set([
  "localhost", "127.0.0.1", "::1",
  "124.217.83.142",
  "2001:4860:7:50c::f9",
  ...(process.env.EBURON_LOCAL_IPS ? process.env.EBURON_LOCAL_IPS.split(",").map(s => s.trim()) : []),
]);

/** Preferred model names — first match wins */
const PREFERRED_MODELS = [
  "eburonmax/codemax-v3",
  "eburonmax/codemax-v3:latest",
  "codemax-v3",
  "codemax-v3:latest",
];

// ── External AI CLI definitions ───────────────────────────────────
interface ExternalCLI {
  name: string;
  processPatterns: string[];
  binaryNames: string[];
  defaultPort?: number;
  healthPath?: string;
  chatPath?: string;
  icon: string;
}

const EXTERNAL_CLIS: ExternalCLI[] = [
  { name: "codemax-ext-1", processPatterns: ["copilot", "github-copilot"], binaryNames: ["copilot", "github-copilot-cli"], icon: "🔌" },
  { name: "codemax-ext-2", processPatterns: ["codex"], binaryNames: ["codex"], icon: "🔌" },
  { name: "codemax-ext-3", processPatterns: ["opencode"], binaryNames: ["opencode"], defaultPort: 3333, healthPath: "/health", chatPath: "/api/chat", icon: "🔌" },
  { name: "codemax-ext-4", processPatterns: ["claude"], binaryNames: ["claude"], icon: "🔌" },
  { name: "codemax-ext-5", processPatterns: ["aider"], binaryNames: ["aider"], icon: "🔌" },
  { name: "codemax-ext-6", processPatterns: ["cursor"], binaryNames: ["cursor"], icon: "🔌" },
  { name: "codemax-ext-7", processPatterns: ["continue"], binaryNames: ["continue"], defaultPort: 65432, healthPath: "/health", chatPath: "/v1/chat/completions", icon: "🔌" },
  { name: "codemax-ext-8", processPatterns: ["cline"], binaryNames: ["cline"], icon: "🔌" },
];

/** Map port → known service for naming */
const PORT_SERVICE: Record<number, string> = {
  3333: "Eburon Codemax CLI",
  11434: "Ollama",
  1234: "LM Studio",
  65432: "codemax-ext-7",
};

/** Map port → external CLI name (for remote detection) */
const PORT_TO_EXT: Record<number, string> = {};
for (const cli of EXTERNAL_CLIS) {
  if (cli.defaultPort) PORT_TO_EXT[cli.defaultPort] = cli.name;
}

// ── Probe helpers (work with any host) ────────────────────────────

async function fetchWithTimeout(url: string, opts?: RequestInit & { timeoutMs?: number }): Promise<Response | null> {
  const ms = opts?.timeoutMs ?? 2500;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    clearTimeout(t);
    return res;
  } catch {
    clearTimeout(t);
    return null;
  }
}

/** Probe Ollama-style /api/tags on a host:port */
async function probeOllama(host: string, port: number): Promise<{ online: boolean; model?: string; version?: string }> {
  const base = `http://${host}:${port}`;
  const tagsRes = await fetchWithTimeout(`${base}/api/tags`);
  if (!tagsRes?.ok) return { online: false };
  try {
    const data = await tagsRes.json();
    const models: { name: string }[] = data.models ?? [];
    const preferred = models.find((m) =>
      PREFERRED_MODELS.some((p) => m.name === p || m.name.startsWith("eburonmax/codemax-v3") || m.name.startsWith("codemax-v3"))
    );
    const model = (preferred ?? models[0])?.name;
    // Try version
    let version: string | undefined;
    const verRes = await fetchWithTimeout(`${base}/api/version`, { timeoutMs: 2000 });
    if (verRes?.ok) { const d = await verRes.json(); version = d.version; }
    return { online: true, model, version };
  } catch { return { online: true }; }
}

/** Probe a generic LLM chat endpoint (OpenAI-compatible or Ollama) */
async function probeChatEndpoint(host: string, port: number): Promise<string | null> {
  const paths = ["/v1/chat/completions", "/api/chat"];
  for (const path of paths) {
    const url = `http://${host}:${port}${path}`;
    const res = await fetchWithTimeout(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [] }),
      timeoutMs: 2000,
    });
    if (res && (res.ok || res.status === 400 || res.status === 422)) {
      const text = await res.text().catch(() => "");
      if (text.trim().startsWith("{") || text.trim().startsWith("[")) return url;
    }
  }
  return null;
}

/** Probe health endpoints (bridge servers, OpenCode, etc.) */
async function probeHealth(host: string, port: number): Promise<{ version?: string; model?: string } | null> {
  const healthRes = await fetchWithTimeout(`http://${host}:${port}/health`, { timeoutMs: 2000 });
  if (!healthRes?.ok) return null;
  try {
    const d = await healthRes.json();
    if (d.provider === "ollama" || d.name?.includes("Eburon") || d.status === "ok" || d.status === "healthy") {
      return { model: d.model ?? undefined, version: d.version ?? undefined };
    }
    return {};
  } catch { return {}; }
}

/** Probe LM Studio /v1/models */
async function probeLMStudio(host: string, port: number): Promise<{ model?: string } | null> {
  const res = await fetchWithTimeout(`http://${host}:${port}/v1/models`, { timeoutMs: 2000 });
  if (!res?.ok) return null;
  try {
    const d = await res.json();
    return { model: d.data?.[0]?.id };
  } catch { return null; }
}

// ── Scan a single host across all ports ───────────────────────────

interface HostScanResult {
  host: string;
  port: number;
  service: string;
  url: string;
  model?: string;
  version?: string;
}

async function scanHost(host: string): Promise<HostScanResult[]> {
  const results: HostScanResult[] = [];

  const portResults = await Promise.all(SCAN_PORTS.map(async (port): Promise<HostScanResult | null> => {
    // 1. Try Ollama (port 11434 primarily, but could be any)
    if (port === 11434) {
      const ollama = await probeOllama(host, port);
      if (ollama.online) {
        return { host, port, service: "Ollama", url: `http://${host}:${port}/api/chat`, model: ollama.model, version: ollama.version };
      }
      return null;
    }

    // 2. Try LM Studio
    if (port === 1234) {
      const lm = await probeLMStudio(host, port);
      if (lm) return { host, port, service: "LM Studio", url: `http://${host}:${port}/v1/chat/completions`, model: lm.model };
    }

    // 3. Try health endpoint (bridge servers, OpenCode, etc.)
    const health = await probeHealth(host, port);
    if (health) {
      const extName = PORT_TO_EXT[port];
      const svcName = extName || PORT_SERVICE[port] || `Service :${port}`;
      const chatUrl = await probeChatEndpoint(host, port);
      if (chatUrl) return { host, port, service: svcName, url: chatUrl, model: health.model, version: health.version };
    }

    // 4. Try generic chat probe
    const chatUrl = await probeChatEndpoint(host, port);
    if (chatUrl) {
      const extName = PORT_TO_EXT[port];
      const svcName = extName || PORT_SERVICE[port] || `Service :${port}`;
      return { host, port, service: svcName, url: chatUrl };
    }

    return null;
  }));

  for (const r of portResults) { if (r) results.push(r); }
  return results;
}

// ── Main detection entry point ────────────────────────────────────

export async function detectCLIEndpoints(): Promise<CLIEndpoint[]> {
  const detected: CLIEndpoint[] = [];
  const now = new Date();

  // ── 1. Build list of all hosts to scan ──
  const hostsToScan: { label: string; host: string; isLocal: boolean }[] = [
    { label: "Localhost", host: "localhost", isLocal: true },
  ];

  // Add OLLAMA_URL host if it's remote
  const ollamaUrl = process.env.OLLAMA_URL;
  if (ollamaUrl) {
    try {
      const u = new URL(ollamaUrl);
      if (!LOCALHOST_ALIASES.has(u.hostname)) {
        hostsToScan.push({ label: `Remote ${u.hostname}`, host: u.hostname, isLocal: false });
      }
    } catch { /* bad URL */ }
  }

  // Add all VPS hosts
  for (const ip of REMOTE_HOSTS) {
    if (!LOCALHOST_ALIASES.has(ip) && !hostsToScan.some(h => h.host === ip)) {
      hostsToScan.push({ label: `VPS ${ip}`, host: ip, isLocal: false });
    }
  }

  // EBURON_CLI_ENDPOINT env override
  const envEndpoint = process.env.EBURON_CLI_ENDPOINT;
  if (envEndpoint) {
    detected.push({
      id: "env-configured",
      name: "Eburon Model (maximus-cli) — env",
      url: envEndpoint,
      status: "detecting",
      type: "http",
    });
  }

  // ── 2. Scan all hosts in parallel ──
  const scanResults = await Promise.all(hostsToScan.map(async ({ label, host, isLocal }) => {
    const services = await scanHost(host);
    return services.map(s => ({ ...s, label, isLocal }));
  }));

  for (const hostServices of scanResults) {
    for (const svc of hostServices) {
      const idPrefix = svc.isLocal ? "local" : `vps-${svc.host.replace(/[\.:]/g, "-")}`;
      const displayLabel = svc.isLocal ? "Localhost" : svc.label;

      detected.push({
        id: `${idPrefix}-${svc.port}`,
        name: `${displayLabel} · ${svc.service}${svc.model ? ` — ${svc.model.split(":")[0]}` : ""}`,
        url: svc.url,
        status: "online",
        type: "http",
        version: svc.version,
        model: svc.model,
        lastChecked: now,
      });
    }
  }

  // ── 3. Add offline placeholder for remote hosts with no services ──
  for (const { label, host, isLocal } of hostsToScan) {
    if (isLocal) continue;
    const hasAny = detected.some(d => d.url.includes(host));
    if (!hasAny) {
      detected.push({
        id: `vps-${host.replace(/[\.:]/g, "-")}-offline`,
        name: `${label} · Ollama`,
        url: `http://${host}:11434/api/chat`,
        status: "offline",
        type: "http",
        model: "eburonmax/codemax-v3",
        lastChecked: now,
      });
    }
  }

  // ── 4. Detect local external AI CLI tools (process + binary check) ──
  const externalCLIs = await detectLocalExternalCLIs();
  for (const ext of externalCLIs) {
    if (!detected.some(d => d.name.includes(ext.model ?? ""))) {
      detected.push(ext);
    }
  }

  // ── 5. SSH into remote hosts to detect AI CLI processes ──
  const sshUser = process.env.EBURON_SSH_USER || "root";
  const sshKey = process.env.EBURON_SSH_KEY; // optional path to private key
  const remoteHosts = hostsToScan.filter(h => !h.isLocal);
  const sshResults = await Promise.all(remoteHosts.map(async ({ label, host }) => {
    return detectRemoteCLIsViaSSH(host, sshUser, sshKey, label);
  }));
  for (const batch of sshResults) {
    for (const ext of batch) {
      if (!detected.some(d => d.id === ext.id)) detected.push(ext);
    }
  }

  return detected;
}

// ── Local external CLI detection (process list + binary check) ────

function binaryExists(name: string): boolean {
  try {
    execSync(`which ${name} 2>/dev/null`, { encoding: "utf-8", timeout: 1000 });
    return true;
  } catch { return false; }
}

async function detectLocalExternalCLIs(): Promise<CLIEndpoint[]> {
  const endpoints: CLIEndpoint[] = [];
  let extIndex = 1;

  let psList = "";
  try {
    psList = execSync("ps aux 2>/dev/null", { encoding: "utf-8", timeout: 2000 }).toLowerCase();
  } catch { /* no ps */ }

  for (const cli of EXTERNAL_CLIS) {
    const running = psList ? cli.processPatterns.some((p) => psList.includes(p.toLowerCase())) : false;
    const installed = cli.binaryNames.some((b) => binaryExists(b));

    if (!running && !installed) continue;

    const extModel = `codemax-ext-${extIndex}`;
    const status = running ? "online" as const : "offline" as const;

    let url: string | undefined;
    if (cli.defaultPort && cli.chatPath) {
      const probed = await probeChatEndpoint("localhost", cli.defaultPort);
      if (probed) url = probed;
      else url = `http://localhost:${cli.defaultPort}${cli.chatPath}`;
    }

    endpoints.push({
      id: `ext-${extIndex}`,
      name: `${cli.icon} ${cli.name}`,
      url: url || `ext://${cli.name}`,
      status,
      type: url ? "http" : "local",
      model: extModel,
      lastChecked: new Date(),
    });

    extIndex++;
  }

  return endpoints;
}

// ── SSH-based remote CLI detection ────────────────────────────────

/** All process patterns to look for on remote hosts */
const ALL_PROCESS_PATTERNS = EXTERNAL_CLIS.flatMap(c => c.processPatterns);

/** Run a command on a remote host via SSH (non-blocking, timeout-guarded) */
function sshExec(host: string, user: string, cmd: string, keyPath?: string): string {
  const keyFlag = keyPath ? `-i ${keyPath} ` : "";
  const sshCmd = `ssh ${keyFlag}-o ConnectTimeout=3 -o StrictHostKeyChecking=no -o BatchMode=yes ${user}@${host} "${cmd}" 2>/dev/null`;
  try {
    return execSync(sshCmd, { encoding: "utf-8", timeout: 8000 });
  } catch { return ""; }
}

async function detectRemoteCLIsViaSSH(
  host: string,
  user: string,
  keyPath: string | undefined,
  label: string
): Promise<CLIEndpoint[]> {
  const endpoints: CLIEndpoint[] = [];
  const now = new Date();

  // 1. Get remote process list + which binaries exist in one SSH call
  const combinedCmd = [
    "ps aux 2>/dev/null",
    ...EXTERNAL_CLIS.flatMap(c => c.binaryNames).map(b => `which ${b} 2>/dev/null`),
    "which ollama 2>/dev/null",
    "ollama list 2>/dev/null",
  ].join(" ; echo '---DELIM---' ; ");

  const rawOutput = sshExec(host, user, combinedCmd, keyPath);
  if (!rawOutput) return endpoints; // SSH not reachable

  const sections = rawOutput.split("---DELIM---").map(s => s.trim());
  const remotePsList = (sections[0] || "").toLowerCase();

  // Collect which binaries were found
  const foundBinaries = new Set<string>();
  for (let i = 1; i < sections.length; i++) {
    const line = sections[i].trim();
    if (line && !line.includes("not found") && line.startsWith("/")) {
      const bin = line.split("/").pop() || "";
      if (bin) foundBinaries.add(bin.toLowerCase());
    }
  }

  // 2. Check each external CLI
  let extIndex = 1;
  for (const cli of EXTERNAL_CLIS) {
    const running = remotePsList ? cli.processPatterns.some(p => remotePsList.includes(p.toLowerCase())) : false;
    const installed = cli.binaryNames.some(b => foundBinaries.has(b.toLowerCase()));

    if (!running && !installed) continue;

    const extModel = `codemax-ext-${extIndex}`;
    const status = running ? "online" as const : "offline" as const;

    // Try to probe the remote port if available
    let url: string | undefined;
    if (cli.defaultPort && cli.chatPath) {
      const probed = await probeChatEndpoint(host, cli.defaultPort);
      if (probed) url = probed;
      else url = `http://${host}:${cli.defaultPort}${cli.chatPath}`;
    }

    endpoints.push({
      id: `ssh-${host.replace(/[\.:]/g, "-")}-ext-${extIndex}`,
      name: `${label} · ${cli.icon} ${cli.name}`,
      url: url || `ssh://${user}@${host}/${cli.name}`,
      status,
      type: url ? "http" : "local",
      model: extModel,
      lastChecked: now,
    });

    extIndex++;
  }

  // 3. Check for Ollama on the remote host (via SSH, not just HTTP)
  const ollamaInstalled = foundBinaries.has("ollama");
  const ollamaSection = sections[sections.length - 1] || "";
  if (ollamaInstalled && !endpoints.some(e => e.url.includes(`${host}:11434`))) {
    // Parse model list from `ollama list` output
    let remoteModel: string | undefined;
    const modelLines = ollamaSection.split("\n").filter(l => l.trim() && !l.startsWith("NAME"));
    for (const line of modelLines) {
      const name = line.trim().split(/\s+/)[0];
      if (name && PREFERRED_MODELS.some(p => name === p || name.startsWith("eburonmax/codemax-v3") || name.startsWith("codemax-v3"))) {
        remoteModel = name;
        break;
      }
    }
    if (!remoteModel && modelLines.length > 0) remoteModel = modelLines[0].trim().split(/\s+/)[0];

    endpoints.push({
      id: `ssh-${host.replace(/[\.:]/g, "-")}-ollama`,
      name: `${label} · Ollama (SSH)${remoteModel ? ` — ${remoteModel.split(":")[0]}` : ""}`,
      url: `http://${host}:11434/api/chat`,
      status: ollamaInstalled ? "online" : "offline",
      type: "http",
      model: remoteModel || "eburonmax/codemax-v3",
      lastChecked: now,
    });
  }

  return endpoints;
}

// ── Public helper for sending messages ────────────────────────────

export async function sendMessageToCLI(
  endpoint: CLIEndpoint,
  messages: { role: string; content: string }[],
  onChunk?: (chunk: string) => void
): Promise<string> {
  const body = JSON.stringify({
    messages,
    stream: !!onChunk,
    ...(endpoint.model ? { model: endpoint.model } : {}),
  });

  const res = await fetch(endpoint.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  if (!res.ok) {
    throw new Error(`CLI responded with ${res.status}: ${res.statusText}`);
  }

  if (onChunk && res.body) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let full = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value);
      const lines = text.split("\n").filter(Boolean);
      for (const line of lines) {
        const clean = line.replace(/^data:\s*/, "");
        if (clean === "[DONE]") continue;
        try {
          const json = JSON.parse(clean);
          const delta = json.choices?.[0]?.delta?.content || json.message?.content || json.content || "";
          if (delta) { full += delta; onChunk(delta); }
        } catch {
          full += clean;
          onChunk(clean);
        }
      }
    }
    return full;
  }

  const json = await res.json();
  return json.choices?.[0]?.message?.content || json.message?.content || json.content || JSON.stringify(json);
}
