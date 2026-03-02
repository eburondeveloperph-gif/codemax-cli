"use client";

import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import Link from "next/link";

type Section = "overview" | "cli" | "tui" | "web" | "api" | "database" | "config";

const NAV: { id: Section; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "📖" },
  { id: "cli", label: "CLI (REPL)", icon: "⌨️" },
  { id: "tui", label: "TUI Mode", icon: "🖥️" },
  { id: "web", label: "Web App", icon: "🌐" },
  { id: "api", label: "API v1", icon: "🔑" },
  { id: "database", label: "Database", icon: "🗄️" },
  { id: "config", label: "Configuration", icon: "⚙️" },
];

function CodeBlock({ children, lang }: { children: string; lang?: string }) {
  return (
    <pre className="bg-gray-800/60 border border-gray-700/50 rounded-lg p-4 overflow-x-auto text-sm leading-relaxed">
      <code className={`language-${lang ?? "bash"} text-gray-200`}>{children}</code>
    </pre>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xl font-bold text-white mt-10 mb-4 flex items-center gap-2">{children}</h2>;
}
function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="text-lg font-semibold text-gray-200 mt-6 mb-2">{children}</h3>;
}
function P({ children }: { children: React.ReactNode }) {
  return <p className="text-gray-400 leading-relaxed mb-3">{children}</p>;
}

// ─── Section Content ────────────────────────────────────────────────

function OverviewSection() {
  return (
    <div>
      <H2>📖 Overview</H2>
      <P>
        <strong className="text-white">Eburon Copilot</strong> is a multi-mode AI coding agent powered by the <strong className="text-cyan-400">codemax-v3</strong> model — a 29.9B parameter Mixture-of-Experts model optimized for production-grade code generation.
      </P>
      <P>It operates in four modes:</P>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 my-4">
        {[
          { name: "CLI (REPL)", desc: "Interactive AI coding agent in your terminal", cmd: "eburon chat" },
          { name: "TUI", desc: "Split-pane terminal UI", cmd: "eburon tui" },
          { name: "Web App", desc: "Web frontend with live code preview", cmd: "eburon start" },
          { name: "API v1", desc: "Authenticated REST API for programmatic access", cmd: "POST /api/v1/chat" },
        ].map((m) => (
          <div key={m.name} className="bg-gray-800/40 border border-gray-700/50 rounded-lg p-4">
            <div className="font-semibold text-white text-sm">{m.name}</div>
            <div className="text-gray-500 text-xs mt-1">{m.desc}</div>
            <code className="text-cyan-400 text-xs mt-2 block">{m.cmd}</code>
          </div>
        ))}
      </div>

      <H3>Quick Start</H3>
      <CodeBlock lang="bash">{`# Install
git clone https://github.com/eburondeveloperph-gif/codemax-cli.git
cd codemax-cli
chmod +x setup.sh && ./setup.sh

# Launch (choose one)
eburon chat          # Interactive REPL
eburon tui           # Terminal UI
eburon start         # Web app at localhost:3000
eburon "fix bug"     # Single-shot prompt`}</CodeBlock>

      <H3>Requirements</H3>
      <ul className="text-gray-400 text-sm space-y-1 ml-4 list-disc">
        <li>Node.js 18+</li>
        <li>Ollama running locally with the <code className="text-cyan-400">eburonmax-codemax-v3:latest</code> model</li>
        <li>PostgreSQL 14+ (for persistence, optional)</li>
      </ul>
    </div>
  );
}

function CLISection() {
  return (
    <div>
      <H2>⌨️ CLI (REPL) Mode</H2>
      <P>
        An interactive AI coding agent in your terminal.
        Supports streaming responses, tool calling with approval flow, session persistence, and slash commands.
      </P>

      <H3>Launch</H3>
      <CodeBlock>{`eburon chat
# or
npx eburon chat`}</CodeBlock>

      <H3>Features</H3>
      <ul className="text-gray-400 text-sm space-y-2 ml-4 list-disc">
        <li><strong className="text-white">Streaming output</strong> — real-time token streaming with markdown rendering</li>
        <li><strong className="text-white">Tool calling</strong> — reads files, writes files, executes shell commands, searches code</li>
        <li><strong className="text-white">Approval flow</strong> — write/shell operations require confirmation (<code className="text-cyan-400">y/n/a</code>)</li>
        <li><strong className="text-white">Session persistence</strong> — conversations saved to PostgreSQL + JSON fallback</li>
        <li><strong className="text-white">Project context</strong> — auto-detects git repo, package.json, file structure</li>
      </ul>

      <H3>Slash Commands</H3>
      <CodeBlock>{`/help       Show all commands
/clear      Clear conversation history
/model      Show current model info
/session    Show session details
/files      List project files
/context    Show detected project context
/compact    Summarize and compact history
/history    Show conversation history
/config     Show configuration`}</CodeBlock>

      <H3>Tool Approval</H3>
      <P>When the agent wants to modify files or run commands:</P>
      <CodeBlock>{`🔧 writeFile → src/utils.ts
  + export function parseDate(s: string): Date {
  +   return new Date(s);
  + }

  Allow? [y]es / [n]o / [a]lways: y`}</CodeBlock>

      <H3>Single-Shot Mode</H3>
      <CodeBlock>{`# Execute a prompt and exit
eburon "create a React hook for dark mode"
eburon "explain this error: TypeError: Cannot read property 'map' of undefined"`}</CodeBlock>
    </div>
  );
}

function TUISection() {
  return (
    <div>
      <H2>🖥️ TUI Mode</H2>
      <P>
        A full terminal UI with split panes. Features a file tree, chat pane,
        code viewer, and input bar, all navigable with keyboard shortcuts.
      </P>

      <H3>Launch</H3>
      <CodeBlock>{`eburon tui`}</CodeBlock>

      <H3>Layout</H3>
      <CodeBlock>{`┌──────────┬────────────────────────┬──────────────────┐
│ Files    │ Chat                   │ Code Viewer      │
│          │                        │                  │
│ src/     │ You: create a util     │ // src/utils.ts  │
│  app/    │                        │ export function  │
│  lib/    │ Agent: Here's the...   │   parse(...) {}  │
│  ...     │                        │                  │
├──────────┴────────────────────────┴──────────────────┤
│ > Type here...                              Status   │
└──────────────────────────────────────────────────────┘`}</CodeBlock>

      <H3>Keyboard Shortcuts</H3>
      <div className="bg-gray-800/40 border border-gray-700/50 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-gray-700/50">
            <th className="text-left text-gray-300 px-4 py-2">Key</th>
            <th className="text-left text-gray-300 px-4 py-2">Action</th>
          </tr></thead>
          <tbody className="text-gray-400">
            <tr className="border-b border-gray-800"><td className="px-4 py-1.5"><code>Tab</code></td><td className="px-4 py-1.5">Cycle pane focus forward</td></tr>
            <tr className="border-b border-gray-800"><td className="px-4 py-1.5"><code>Shift+Tab</code></td><td className="px-4 py-1.5">Cycle pane focus backward</td></tr>
            <tr className="border-b border-gray-800"><td className="px-4 py-1.5"><code>Enter</code></td><td className="px-4 py-1.5">Send message</td></tr>
            <tr className="border-b border-gray-800"><td className="px-4 py-1.5"><code>Escape</code></td><td className="px-4 py-1.5">Focus input bar</td></tr>
            <tr><td className="px-4 py-1.5"><code>Ctrl+Q</code></td><td className="px-4 py-1.5">Quit</td></tr>
          </tbody>
        </table>
      </div>

      <H3>File Browser</H3>
      <P>Click or navigate to files in the left pane to view them in the code viewer. The agent can also display written/read files automatically.</P>
    </div>
  );
}

function WebSection() {
  return (
    <div>
      <H2>🌐 Web App</H2>
      <P>
        A web interface with a chat sidebar and live code preview panel.
        Automatically detects running Ollama instances and displays generated files in a VS Code-like editor.
      </P>

      <H3>Launch</H3>
      <CodeBlock>{`eburon start
# Opens http://localhost:3000`}</CodeBlock>

      <H3>Features</H3>
      <ul className="text-gray-400 text-sm space-y-2 ml-4 list-disc">
        <li><strong className="text-white">Chat sidebar</strong> — multiple conversations, rename, delete</li>
        <li><strong className="text-white">Code preview panel</strong> — renders generated files with syntax highlighting, file tabs, line numbers</li>
        <li><strong className="text-white">Streaming</strong> — real-time SSE streaming from the model</li>
        <li><strong className="text-white">Auto-detection</strong> — finds Ollama endpoints at common ports</li>
        <li><strong className="text-white">Persistence</strong> — all sessions, messages, and files saved to PostgreSQL</li>
      </ul>

      <H3>Code Generation</H3>
      <P>
        For best results, ask the model to generate complete files. The preview panel parses code blocks
        formatted with file paths and displays them as tabs:
      </P>
      <CodeBlock lang="markdown">{`\`\`\`tsx src/components/Button.tsx
export function Button({ label }: { label: string }) {
  return <button className="btn">{label}</button>;
}
\`\`\``}</CodeBlock>
    </div>
  );
}

function APISection() {
  const { user, getIdToken } = useAuth();
  const [token, setToken] = useState<string | null>(null);

  const copyToken = async () => {
    const t = await getIdToken();
    if (t) {
      setToken(t);
      navigator.clipboard.writeText(t);
    }
  };

  return (
    <div>
      <H2>🔑 API v1 (Authenticated)</H2>
      <P>
        The API v1 provides programmatic access to the codemax-v3 model. All requests require
        a <strong className="text-white">Firebase Auth</strong> Bearer token.
      </P>

      <div className="bg-yellow-900/20 border border-yellow-700/30 rounded-lg p-4 my-4">
        <div className="text-yellow-400 font-semibold text-sm">🔒 Authentication Required</div>
        <p className="text-yellow-200/70 text-sm mt-1">
          Sign in with Google or email to get your API token. Include it as <code>Authorization: Bearer &lt;token&gt;</code> in all API requests.
        </p>
      </div>

      {user && (
        <div className="bg-gray-800/40 border border-gray-700/50 rounded-lg p-4 my-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-white text-sm font-medium">Signed in as {user.email}</div>
              <div className="text-gray-500 text-xs">UID: {user.uid}</div>
            </div>
            <button
              onClick={copyToken}
              className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium rounded px-3 py-1.5 transition"
            >
              {token ? "✓ Copied!" : "Copy Token"}
            </button>
          </div>
          {token && (
            <div className="mt-3">
              <code className="text-xs text-gray-400 break-all block bg-gray-900 rounded p-2 max-h-20 overflow-y-auto">{token}</code>
            </div>
          )}
        </div>
      )}

      {!user && (
        <div className="my-4">
          <Link href="/login" className="inline-flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 text-white font-medium rounded-lg px-4 py-2 transition text-sm">
            Sign in to get your API token →
          </Link>
        </div>
      )}

      <H3>Base URL</H3>
      <CodeBlock>{`https://your-domain.com/api/v1`}</CodeBlock>

      <H3>POST /api/v1/chat</H3>
      <P>Send a chat completion request.</P>

      <CodeBlock lang="bash">{`curl -X POST http://localhost:3000/api/v1/chat \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer <YOUR_FIREBASE_TOKEN>" \\
  -d '{
    "messages": [
      { "role": "user", "content": "Create a React counter component" }
    ],
    "model": "eburonmax-codemax-v3:latest",
    "stream": true
  }'`}</CodeBlock>

      <H3>Request Body</H3>
      <div className="bg-gray-800/40 border border-gray-700/50 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-gray-700/50">
            <th className="text-left text-gray-300 px-4 py-2">Field</th>
            <th className="text-left text-gray-300 px-4 py-2">Type</th>
            <th className="text-left text-gray-300 px-4 py-2">Description</th>
          </tr></thead>
          <tbody className="text-gray-400">
            <tr className="border-b border-gray-800"><td className="px-4 py-1.5"><code>messages</code></td><td className="px-4 py-1.5">array</td><td className="px-4 py-1.5"><strong className="text-white">Required.</strong> Chat messages array</td></tr>
            <tr className="border-b border-gray-800"><td className="px-4 py-1.5"><code>model</code></td><td className="px-4 py-1.5">string</td><td className="px-4 py-1.5">Model name (default: <code>eburonmax-codemax-v3:latest</code>)</td></tr>
            <tr><td className="px-4 py-1.5"><code>stream</code></td><td className="px-4 py-1.5">boolean</td><td className="px-4 py-1.5">Enable SSE streaming (default: <code>true</code>)</td></tr>
          </tbody>
        </table>
      </div>

      <H3>Response (non-streaming)</H3>
      <CodeBlock lang="json">{`{
  "model": "eburonmax-codemax-v3:latest",
  "message": {
    "role": "assistant",
    "content": "Here's a React counter component..."
  },
  "user": {
    "uid": "abc123",
    "email": "user@example.com"
  }
}`}</CodeBlock>

      <H3>Error Responses</H3>
      <div className="bg-gray-800/40 border border-gray-700/50 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-gray-700/50">
            <th className="text-left text-gray-300 px-4 py-2">Status</th>
            <th className="text-left text-gray-300 px-4 py-2">Meaning</th>
          </tr></thead>
          <tbody className="text-gray-400">
            <tr className="border-b border-gray-800"><td className="px-4 py-1.5"><code>401</code></td><td className="px-4 py-1.5">Missing or invalid Bearer token</td></tr>
            <tr className="border-b border-gray-800"><td className="px-4 py-1.5"><code>400</code></td><td className="px-4 py-1.5">Invalid request body or missing messages</td></tr>
            <tr><td className="px-4 py-1.5"><code>502</code></td><td className="px-4 py-1.5">Cannot reach model server (Ollama)</td></tr>
          </tbody>
        </table>
      </div>

      <H3>JavaScript / TypeScript SDK Example</H3>
      <CodeBlock lang="typescript">{`import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { initializeApp } from "firebase/app";

const app = initializeApp({ /* your config */ });
const auth = getAuth(app);

// Sign in & get token
const cred = await signInWithEmailAndPassword(auth, "you@email.com", "password");
const token = await cred.user.getIdToken();

// Call API
const res = await fetch("http://localhost:3000/api/v1/chat", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": \`Bearer \${token}\`,
  },
  body: JSON.stringify({
    messages: [{ role: "user", content: "Hello!" }],
  }),
});

const data = await res.json();
console.log(data.message.content);`}</CodeBlock>

      <H3>Python Example</H3>
      <CodeBlock lang="python">{`import requests

TOKEN = "your-firebase-id-token"

response = requests.post(
    "http://localhost:3000/api/v1/chat",
    headers={
        "Content-Type": "application/json",
        "Authorization": f"Bearer {TOKEN}",
    },
    json={
        "messages": [{"role": "user", "content": "Hello!"}],
        "stream": False,
    },
)

print(response.json()["message"]["content"])`}</CodeBlock>
    </div>
  );
}

function DatabaseSection() {
  return (
    <div>
      <H2>🗄️ Database</H2>
      <P>
        All sessions, messages, generated files, and tool executions are persisted to PostgreSQL.
        The CLI falls back to JSON files if the database is unavailable.
      </P>

      <H3>Setup</H3>
      <CodeBlock>{`# Create the database
createdb eburon_copilot

# Run the schema (included in setup.sh)
psql eburon_copilot < schema.sql

# Or set a custom connection
export DATABASE_URL="postgresql://user:pass@host:5432/eburon_copilot"`}</CodeBlock>

      <H3>Schema</H3>
      <div className="bg-gray-800/40 border border-gray-700/50 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-gray-700/50">
            <th className="text-left text-gray-300 px-4 py-2">Table</th>
            <th className="text-left text-gray-300 px-4 py-2">Description</th>
          </tr></thead>
          <tbody className="text-gray-400">
            <tr className="border-b border-gray-800"><td className="px-4 py-1.5"><code>sessions</code></td><td className="px-4 py-1.5">Chat sessions with source (web/cli/tui/api), model, cwd</td></tr>
            <tr className="border-b border-gray-800"><td className="px-4 py-1.5"><code>messages</code></td><td className="px-4 py-1.5">All messages (user, assistant, system, tool)</td></tr>
            <tr className="border-b border-gray-800"><td className="px-4 py-1.5"><code>generated_files</code></td><td className="px-4 py-1.5">Code files generated by the model</td></tr>
            <tr className="border-b border-gray-800"><td className="px-4 py-1.5"><code>tool_executions</code></td><td className="px-4 py-1.5">Tool call logs (name, args, result, duration)</td></tr>
            <tr><td className="px-4 py-1.5"><code>app_metadata</code></td><td className="px-4 py-1.5">Key-value settings store</td></tr>
          </tbody>
        </table>
      </div>

      <H3>API Endpoints</H3>
      <CodeBlock>{`GET  /api/db/health     — Database health check
GET  /api/db/sessions   — List sessions (filterable by source)
POST /api/db/sessions   — Create a session
GET  /api/db/messages?session_id=xxx — Get messages
POST /api/db/files      — Save generated files`}</CodeBlock>
    </div>
  );
}

function ConfigSection() {
  return (
    <div>
      <H2>⚙️ Configuration</H2>
      <P>Environment variables and CLI configuration options.</P>

      <H3>Environment Variables</H3>
      <div className="bg-gray-800/40 border border-gray-700/50 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-gray-700/50">
            <th className="text-left text-gray-300 px-4 py-2">Variable</th>
            <th className="text-left text-gray-300 px-4 py-2">Default</th>
            <th className="text-left text-gray-300 px-4 py-2">Description</th>
          </tr></thead>
          <tbody className="text-gray-400">
            <tr className="border-b border-gray-800"><td className="px-4 py-1.5"><code>OLLAMA_URL</code></td><td className="px-4 py-1.5"><code>http://localhost:11434</code></td><td className="px-4 py-1.5">Ollama API endpoint</td></tr>
            <tr className="border-b border-gray-800"><td className="px-4 py-1.5"><code>EBURON_MODEL</code></td><td className="px-4 py-1.5"><code>eburonmax-codemax-v3:latest</code></td><td className="px-4 py-1.5">Model name</td></tr>
            <tr className="border-b border-gray-800"><td className="px-4 py-1.5"><code>DATABASE_URL</code></td><td className="px-4 py-1.5"><code>postgresql://master@localhost:5432/eburon_copilot</code></td><td className="px-4 py-1.5">PostgreSQL connection string</td></tr>
            <tr className="border-b border-gray-800"><td className="px-4 py-1.5"><code>EBURON_AUTO_APPROVE_READS</code></td><td className="px-4 py-1.5"><code>true</code></td><td className="px-4 py-1.5">Auto-approve file reads</td></tr>
            <tr className="border-b border-gray-800"><td className="px-4 py-1.5"><code>EBURON_AUTO_APPROVE_WRITES</code></td><td className="px-4 py-1.5"><code>false</code></td><td className="px-4 py-1.5">Auto-approve file writes</td></tr>
            <tr><td className="px-4 py-1.5"><code>EBURON_AUTO_APPROVE_SHELL</code></td><td className="px-4 py-1.5"><code>false</code></td><td className="px-4 py-1.5">Auto-approve shell commands</td></tr>
          </tbody>
        </table>
      </div>

      <H3>CLI Flags</H3>
      <CodeBlock>{`eburon chat                   # Start REPL
eburon tui                    # Start TUI
eburon start                  # Start web app + bridge
eburon "prompt here"          # Single-shot mode`}</CodeBlock>

      <H3>Tool Definitions</H3>
      <P>The agent has access to these built-in tools:</P>
      <div className="bg-gray-800/40 border border-gray-700/50 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-gray-700/50">
            <th className="text-left text-gray-300 px-4 py-2">Tool</th>
            <th className="text-left text-gray-300 px-4 py-2">Approval</th>
            <th className="text-left text-gray-300 px-4 py-2">Description</th>
          </tr></thead>
          <tbody className="text-gray-400">
            <tr className="border-b border-gray-800"><td className="px-4 py-1.5"><code>readFile</code></td><td className="px-4 py-1.5">Auto</td><td className="px-4 py-1.5">Read file contents</td></tr>
            <tr className="border-b border-gray-800"><td className="px-4 py-1.5"><code>writeFile</code></td><td className="px-4 py-1.5">Manual</td><td className="px-4 py-1.5">Write/create files with diff preview</td></tr>
            <tr className="border-b border-gray-800"><td className="px-4 py-1.5"><code>shellExec</code></td><td className="px-4 py-1.5">Manual</td><td className="px-4 py-1.5">Execute shell commands</td></tr>
            <tr className="border-b border-gray-800"><td className="px-4 py-1.5"><code>listFiles</code></td><td className="px-4 py-1.5">Auto</td><td className="px-4 py-1.5">List directory contents</td></tr>
            <tr><td className="px-4 py-1.5"><code>searchFiles</code></td><td className="px-4 py-1.5">Auto</td><td className="px-4 py-1.5">Grep/search file contents</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main Docs Page ─────────────────────────────────────────────────

const SECTIONS: Record<Section, () => React.ReactElement> = {
  overview: OverviewSection,
  cli: CLISection,
  tui: TUISection,
  web: WebSection,
  api: APISection,
  database: DatabaseSection,
  config: ConfigSection,
};

export default function DocsPage() {
  const [active, setActive] = useState<Section>("overview");
  const { user, signOut } = useAuth();
  const Content = SECTIONS[active];

  return (
    <div className="min-h-screen bg-gray-950 flex">
      {/* Sidebar */}
      <aside className="w-64 border-r border-gray-800 bg-gray-950 flex flex-col shrink-0 sticky top-0 h-screen">
        {/* Header */}
        <div className="p-5 border-b border-gray-800">
          <Link href="/" className="flex items-center gap-3">
            <img src="https://eburon.ai/icon-eburon.svg" alt="Eburon" className="w-8 h-8" />
            <div>
              <div className="text-white font-bold text-sm">Eburon AI</div>
              <div className="text-gray-500 text-xs">Documentation</div>
            </div>
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {NAV.map((item) => (
            <button
              key={item.id}
              onClick={() => setActive(item.id)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2.5 transition ${
                active === item.id
                  ? "bg-cyan-600/10 text-cyan-400 font-medium"
                  : "text-gray-400 hover:bg-gray-800/50 hover:text-gray-200"
              }`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        {/* User */}
        <div className="p-4 border-t border-gray-800">
          {user ? (
            <div className="space-y-2">
              <div className="text-xs text-gray-400 truncate">{user.email}</div>
              <div className="flex gap-2">
                <Link href="/" className="text-xs text-cyan-400 hover:underline">App</Link>
                <span className="text-gray-700">·</span>
                <button onClick={signOut} className="text-xs text-gray-500 hover:text-red-400">Sign out</button>
              </div>
            </div>
          ) : (
            <Link href="/login" className="block text-center text-sm bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg py-2 transition">
              Sign in
            </Link>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 max-w-4xl mx-auto px-8 py-10">
        <Content />

        {/* Footer */}
        <div className="mt-16 pt-6 border-t border-gray-800 flex items-center justify-between">
          <span className="text-gray-600 text-xs">© 2026 <a href="https://eburon.ai/" className="hover:text-gray-400">Eburon AI</a>. All rights reserved.</span>
          <span className="text-gray-700 text-xs">codemax-v3 · EAPML v1.0</span>
        </div>
      </main>
    </div>
  );
}
