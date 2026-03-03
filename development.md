# Eburon Codemax — Developer Guide

> **Version**: 0.1.0 (Web) / 2.0.0 (CLI)  
> **Node**: ≥ 18.0.0  
> **Author**: Jo Lernout — Eburon Technologies  
> **License**: Eburon AI Private Model License (EAPML) v1.0

This document is the complete reference for reproducing the Eburon Codemax platform from scratch — an **AI-powered autonomous coding agent** with a Next.js web UI, multi-backend LLM routing, and a one-click deployment pipeline.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Tech Stack](#2-tech-stack)
3. [Directory Structure](#3-directory-structure)
4. [LLM Backend — Ollama & Models](#4-llm-backend--ollama--models)
5. [Multi-Endpoint Agent System](#5-multi-endpoint-agent-system)
6. [API Routes Reference](#6-api-routes-reference)
7. [Frontend — Web UI](#7-frontend--web-ui)
8. [CLI — Terminal Agent](#8-cli--terminal-agent)
9. [Offline Skills & Datasets](#9-offline-skills--datasets)
10. [Authentication — Firebase](#10-authentication--firebase)
11. [Database — Supabase + PostgreSQL](#11-database--supabase--postgresql)
12. [Deployment Pipeline](#12-deployment-pipeline)
13. [Environment Variables](#13-environment-variables)
14. [Development Workflow](#14-development-workflow)
15. [Services & External Accounts](#15-services--external-accounts)
16. [Aliases & Conventions](#16-aliases--conventions)

---

## 1. Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                     BROWSER / CLIENT                         │
│  Next.js React App → Chat UI + Code Editor + Live Preview    │
└────────────────────────┬─────────────────────────────────────┘
                         │  HTTPS (Vercel) or localhost:3000
                         ▼
┌──────────────────────────────────────────────────────────────┐
│                   NEXT.JS API LAYER                           │
│                                                              │
│  /api/chat ───────► Ollama (localhost / VPS / tunnel)         │
│       │                                                      │
│       ├──bridge──► OpenCode Agent (localhost:3333)             │
│       │                                                      │
│       └──fallback► localhost:11434 (always)                   │
│                                                              │
│  /api/detect ────► Scans all reachable LLM endpoints          │
│  /api/deploy ────► GitHub API → Vercel Deployments API        │
│  /api/sandbox ───► VPS nginx or local HTML preview            │
│  /api/vision ────► Ollama vision model (moondream)            │
│  /api/memory ────► Embeddings-based long-term memory          │
│  /api/orchestrate► Multi-agent SSE planner                    │
│  /api/db/* ──────► Supabase PostgreSQL (sessions, files)      │
└──────────────────────────────────────────────────────────────┘
                         │
              ┌──────────┼──────────┐
              ▼          ▼          ▼
         ┌────────┐ ┌────────┐ ┌────────────┐
         │ Ollama │ │ VPS    │ │ OpenCode   │
         │ :11434 │ │ :11434 │ │ :3333      │
         │ (local)│ │(remote)│ │ (agent)    │
         └────────┘ └────────┘ └────────────┘
              │
              ▼
     ┌─────────────────┐
     │ eburonmax/       │
     │ codemax-v3       │
     │ (32K ctx, 16K    │
     │  output, t=0.3)  │
     └─────────────────┘
```

**Core idea**: The web UI sends user prompts to `/api/chat`, which routes to the best available Ollama endpoint. The LLM streams back code in fenced blocks. The frontend parses the stream in real time, builds a file tree, renders a live preview in an iframe, and auto-deploys the result to GitHub + Vercel.

---

## 2. Tech Stack

### Frontend
| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | **Next.js** (App Router) | 15.2.1 |
| UI | **React** | 19.x |
| Styling | **Tailwind CSS** | 3.4.1 |
| Icons | **Lucide React** | latest |
| ZIP export | **JSZip** | latest |
| Auth | **Firebase Auth** (Google OAuth) | 12.10.0 |

### Backend (API Routes — serverless on Vercel)
| Layer | Technology |
|-------|-----------|
| Runtime | Node.js (Vercel Functions, 60s timeout) |
| LLM Proxy | Ollama REST API (NDJSON streaming) |
| Database | Supabase PostgreSQL (`pg` driver) |
| Browser Agent | Browserbase SDK + Puppeteer Core |
| Deploy | GitHub Git Data API + Vercel Deployments v13 |

### CLI (local terminal agent)
| Layer | Technology |
|-------|-----------|
| Language | TypeScript → compiled to ESM JS |
| TUI | blessed (terminal split-pane layout) |
| REPL | readline with custom commands |
| LLM | Direct Ollama `/api/chat` with tool calling |

### Infrastructure
| Service | Purpose |
|---------|---------|
| **Vercel** | Hosts Next.js web app (region: `iad1`) |
| **Supabase** | PostgreSQL database + auth |
| **Firebase** | Google OAuth login for web UI |
| **Cloudflare Tunnels** | Expose local Ollama to Vercel (ephemeral URLs) |
| **Browserbase** | Cloud headless browser for screenshots |
| **GitHub** | Code storage + deployment target |
| **Ollama** | Local LLM inference engine |

---

## 3. Directory Structure

```
eburon-autopilot/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── page.tsx                  # Main app (auth gate + chat + deploy)
│   │   ├── login/page.tsx            # Login page
│   │   ├── docs/page.tsx             # Documentation page
│   │   ├── layout.tsx                # Root layout
│   │   ├── globals.css               # Global styles
│   │   └── api/                      # 18 API routes (see §6)
│   │       ├── chat/route.ts         # 🔥 Central LLM proxy (319 lines)
│   │       ├── v1/chat/route.ts      # Authenticated external API
│   │       ├── opencode/chat/route.ts# OpenCode agent bridge
│   │       ├── detect/route.ts       # Endpoint scanner
│   │       ├── orchestrate/route.ts  # Multi-agent planner (SSE)
│   │       ├── vision/route.ts       # Image analysis
│   │       ├── skills/route.ts       # Skill context search
│   │       ├── memory/route.ts       # Embeddings memory
│   │       ├── memory/index-codebase/route.ts
│   │       ├── ollama/status/route.ts# Health + model pull
│   │       ├── sandbox/route.ts      # Code sandbox
│   │       ├── sandbox/deploy/route.ts
│   │       ├── deploy/client/route.ts# GitHub+Vercel deploy
│   │       └── db/
│   │           ├── messages/route.ts
│   │           ├── sessions/route.ts
│   │           ├── files/route.ts
│   │           ├── backup/route.ts
│   │           └── health/route.ts
│   │
│   ├── components/                   # React components (11 files)
│   │   ├── CodePanel.tsx             # Code editor + preview + deploy (639 lines)
│   │   ├── ChatMessages.tsx          # Message rendering
│   │   ├── ChatInput.tsx             # Input box + image upload
│   │   ├── ChatSidebar.tsx           # Session history
│   │   ├── Sidebar.tsx               # Navigation rail
│   │   ├── CLIStatus.tsx             # Endpoint status indicator
│   │   ├── AgentProgress.tsx         # Generation progress bar
│   │   ├── CodeGenerationStatus.tsx  # Build status badges
│   │   ├── GeneratedAppPreview.tsx   # App preview frame
│   │   ├── TemplateGallery.tsx       # Project templates
│   │   └── AuthProvider.tsx          # Firebase auth context
│   │
│   ├── lib/                          # Shared utilities (14 files)
│   │   ├── ollama.ts                 # Ollama health + model management (176 lines)
│   │   ├── cli-detector.ts           # Multi-endpoint scanner (575 lines)
│   │   ├── skills.ts                 # Skill search + formatting
│   │   ├── memory.ts                 # Embeddings memory store
│   │   ├── embeddings.ts             # Vector embedding generation
│   │   ├── orchestrator.ts           # Multi-agent orchestration
│   │   ├── browser-agent.ts          # Browserbase headless browser
│   │   ├── github-deploy.ts          # Git Data API deploy (118 lines)
│   │   ├── vercel-deploy.ts          # Vercel instant deploy (77 lines)
│   │   ├── parse-generated-files.ts  # Code block → file tree parser
│   │   ├── db.ts                     # PostgreSQL queries
│   │   ├── supabase.ts               # Supabase client
│   │   ├── firebase.ts               # Firebase client SDK
│   │   └── firebase-admin.ts         # Firebase Admin (server-side)
│   │
│   └── types/                        # TypeScript type definitions
│
├── cli/                              # Standalone CLI package (v2.0.0)
│   ├── src/
│   │   ├── cli.ts                    # Entry point (chat | tui | start)
│   │   ├── server.ts                 # Bridge HTTP server (:3333)
│   │   ├── core/
│   │   │   ├── agent.ts              # LLM agent with tool calling
│   │   │   ├── tools.ts              # 6 tools: read/write/shell/list/search/skills
│   │   │   ├── skills.ts             # Offline skill search engine
│   │   │   ├── config.ts             # Model/URL/context defaults
│   │   │   ├── session.ts            # Conversation persistence
│   │   │   ├── context.ts            # Context window management
│   │   │   ├── db.ts                 # Local SQLite
│   │   │   └── datasets/             # 12 bundled JSON skill packs
│   │   ├── repl/
│   │   │   ├── index.ts              # REPL loop
│   │   │   ├── commands.ts           # Slash commands (/help, /clear, etc.)
│   │   │   ├── renderer.ts           # Markdown terminal renderer
│   │   │   └── tool-display.ts       # Tool output formatting
│   │   └── tui/
│   │       ├── index.ts              # Blessed TUI manager
│   │       ├── layout.ts             # Split pane layout
│   │       ├── chat-pane.ts          # Chat panel
│   │       ├── code-pane.ts          # Code viewer panel
│   │       └── file-tree-pane.ts     # File browser panel
│   ├── dist/                         # Compiled JS output
│   └── package.json
│
├── public/                           # Static assets
├── bin/                              # CLI binary entry scripts
├── backups/                          # Conversation export backups
├── logs/                             # Application logs
│
├── next.config.ts                    # Next.js configuration
├── vercel.json                       # Vercel deployment config
├── tailwind.config.js                # Tailwind + Eburon brand colors
├── tsconfig.json                     # TypeScript config
├── postcss.config.js                 # PostCSS for Tailwind
├── package.json                      # Main app dependencies
├── Modelfile                         # Ollama model definition
├── setup.sh                          # First-run setup script
└── .env.example                      # Environment template
```

---

## 4. LLM Backend — Ollama & Models

### What is Ollama?
Ollama is a local LLM inference server. It runs open-weight models on your own hardware (GPU or CPU) via a REST API at `http://localhost:11434`.

### Primary Model: `eburonmax/codemax-v3`

The model is defined in `Modelfile`:

```dockerfile
FROM codemax:latest

PARAMETER temperature 0.3      # Low creativity — precise code output
PARAMETER top_p 0.85
PARAMETER top_k 30
PARAMETER repeat_penalty 1.02
PARAMETER num_ctx 32768        # 32K token context window
PARAMETER num_predict 16384    # 16K max output tokens
```

### Installing Ollama + Model

```bash
# 1. Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# 2. Start Ollama server
ollama serve

# 3. Create the custom model from Modelfile
cd eburon-autopilot
ollama create eburonmax/codemax-v3 -f Modelfile

# 4. Verify
ollama list    # Should show eburonmax/codemax-v3
curl http://localhost:11434/api/tags  # JSON list of models
```

### Ollama REST API (used by the app)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/` | GET | Health check ("Ollama is running") |
| `/api/version` | GET | Server version |
| `/api/tags` | GET | List installed models |
| `/api/chat` | POST | Chat completion (streaming NDJSON) |
| `/api/pull` | POST | Download/pull a model |

### Chat request format

```json
POST /api/chat
{
  "model": "eburonmax/codemax-v3",
  "messages": [
    { "role": "system", "content": "You are codemax-v3..." },
    { "role": "user", "content": "Build a todo app" }
  ],
  "stream": true
}
```

Response: NDJSON (one JSON object per line):
```
{"message":{"role":"assistant","content":"```html"},"done":false}
{"message":{"role":"assistant","content":" index.html\n<!DOCTYPE"},"done":false}
...
{"message":{"role":"assistant","content":""},"done":true}
```

### Other Models Used

| Model | Purpose | Used In |
|-------|---------|---------|
| `eburonmax/codemax-v3` | Code generation (primary) | `/api/chat`, CLI agent |
| `moondream` | Vision / image analysis | `/api/vision` |
| `llava`, `bakllava` | Vision fallbacks | `/api/vision` |
| `qwen2.5-coder:7b` | Orchestrator sub-agent | `/api/orchestrate` |
| `glm-4.7-flash` | OpenCode config alt model | `~/.config/opencode/opencode.json` |

---

## 5. Multi-Endpoint Agent System

The app can route to **multiple LLM backends** simultaneously. The UI shows a dropdown populated by the endpoint scanner.

### Endpoint Types

| Type | Label Example | How Detected | URL Pattern |
|------|--------------|--------------|-------------|
| **Localhost** | PH Local Server | HTTP probe `localhost:11434` | `http://localhost:11434` |
| **VPS** | PH Local Server | IP from `EBURON_VPS_HOSTS`, probe `:11434` | `http://168.231.78.113:11434` |
| **Tunnel** | EU Server | Probe `EBURON_TUNNEL_URL` | `https://xxx.trycloudflare.com` |
| **OpenCode** | PH Server2 | Probe `localhost:3333/global/health` | `/api/opencode/chat` (bridge) |
| **LM Studio** | — | Probe `localhost:1234` | `http://localhost:1234` |

### Endpoint Detection Flow (`src/lib/cli-detector.ts`)

```
1. Parse EBURON_VPS_HOSTS → probe each IP:11434/api/tags
2. Parse EBURON_TUNNEL_URL → probe tunnel URL
3. Probe localhost:11434 (skip if same IP as VPS)
4. Probe OPENCODE_URL/global/health (only if reachable)
5. SSH into VPS hosts → scan running processes
6. Return array of { id, name, url, status, models[] }
```

### Fallback Chain in `/api/chat`

```
User request → endpoint from dropdown
                    │
                    ▼
         ┌─── OpenCode bridge? ───┐
         │ YES                    │ NO
         ▼                       ▼
  Call localhost:3333     Call endpoint URL
  (fresh session/msg)    (Ollama /api/chat)
         │                       │
         │ FAIL                  │ FAIL
         ▼                       ▼
  Fall through ──────► localhost:11434/api/chat
                       model: eburonmax/codemax-v3
                              │
                              │ FAIL
                              ▼
                         Return 502
```

### Cloudflare Tunnel Setup (for remote access)

```bash
# Expose local Ollama to the internet (ephemeral URL)
cloudflared tunnel --url http://localhost:11434

# Output: https://random-words.trycloudflare.com
# Copy URL → set EBURON_TUNNEL_URL in .env.local
# ⚠️ URL changes every time you restart cloudflared
```

### OpenCode Agent Setup

```bash
# Install OpenCode (one-time)
curl -fsSL https://opencode.ai/install | bash

# Start the agent server
opencode serve --port 3333 --hostname 127.0.0.1

# Config at ~/.config/opencode/opencode.json:
{
  "provider": { "ollama": { "models": { "codemax-v3": {} } } },
  "model": { "provider": "ollama", "model": "codemax-v3" }
}

# Health check
curl http://127.0.0.1:3333/global/health
# → {"healthy":true,"version":"1.2.15"}
```

---

## 6. API Routes Reference

### Core AI Routes

#### `POST /api/chat` — Central LLM Proxy (319 lines)
The heart of the app. All AI messages flow through here.

**Request:**
```json
{
  "messages": [{"role": "user", "content": "Build a landing page"}],
  "endpointUrl": "http://localhost:11434",
  "stream": true,
  "model": "eburonmax/codemax-v3"
}
```

**Behavior:**
1. Injects system prompt (planner + builder instructions)
2. Searches skills DB for relevant context
3. Searches memory for relevant facts
4. Detects mode: ⚡ FAST (single HTML) or 🏗️ FULL (multi-file React)
5. Routes to chosen endpoint or OpenCode bridge
6. Streams NDJSON back to client
7. Falls back to `localhost:11434` on any failure

#### `POST /api/v1/chat` — Authenticated External API
Same as `/api/chat` but requires `Authorization: Bearer <firebase-token>` header. CORS-enabled for external clients.

#### `GET /api/detect` — Endpoint Scanner
Returns all reachable LLM endpoints:
```json
{
  "endpoints": [
    { "id": "ollama-localhost-11434", "name": "PH Local Server", "url": "http://localhost:11434", "status": "online", "models": ["eburonmax/codemax-v3"] }
  ],
  "timestamp": "2026-03-03T04:00:00.000Z"
}
```

#### `POST /api/opencode/chat` — OpenCode Bridge
Proxies chat to the OpenCode agent server. Creates a fresh session per request (avoids "busy" locks). 180-second timeout.

#### `POST /api/vision` — Image Analysis
Sends image + prompt to Ollama vision model (moondream). Used for multimodal context injection.

#### `POST /api/orchestrate` — Multi-Agent Planner (SSE)
Breaks complex tasks into sub-tasks, assigns to specialized agents, merges file output. Server-Sent Events streaming.

### Data & Memory Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/skills` | POST | Search offline skill datasets by query |
| `/api/memory` | GET/POST | Store/retrieve embeddings-based memory |
| `/api/memory/index-codebase` | POST | Index project files into memory |
| `/api/db/sessions` | GET/POST | CRUD chat sessions |
| `/api/db/messages` | GET/POST | CRUD messages within sessions |
| `/api/db/files` | GET/POST | Store/retrieve generated files |
| `/api/db/backup` | POST | Export session data to backup |
| `/api/db/health` | GET | Database connectivity check |

### Infrastructure Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/ollama/status` | GET | Ollama health check |
| `/api/ollama/status` | POST | Trigger model pull (streaming progress) |
| `/api/sandbox` | POST | Execute code in local sandbox |
| `/api/sandbox/deploy` | POST | Deploy to VPS nginx sandbox |
| `/api/deploy/client` | POST | Full GitHub + Vercel deployment |

---

## 7. Frontend — Web UI

### Main Page (`src/app/page.tsx` — 487 lines)

**Flow:**
1. Firebase auth gate → redirect to `/login` if not signed in
2. Load chat sessions from Supabase
3. Endpoint selector dropdown (populated by `/api/detect`)
4. Chat input → stream to `/api/chat` → real-time code parsing
5. Auto-deploy generated files to GitHub + Vercel
6. Auto-save to database + local backup

### Code Panel (`src/components/CodePanel.tsx` — 639 lines)

**Features:**
- **File tree**: Folder grouping, language-based color icons
- **Code editor**: Syntax highlighting (keywords, strings, types, functions), streaming cursor
- **Live preview**: 3-tier fallback system:
  1. **Blob preview** (instant) — HTML via `URL.createObjectURL()`, React via Babel standalone + CDN
  2. **VPS sandbox** — POST to `/api/sandbox/deploy` (timeout fallback)
  3. **Local sandbox** — POST to `/api/sandbox` (static files)
- **Device frames**: Mobile (375px), Tablet (768px), Desktop (1024px), Web (100%)
- **Standby page**: Shows `https://studious-potato-sooty.vercel.app/` when no code is generated
- **Deploy badge**: Links to live Vercel URL after deployment
- **ZIP download**: JSZip export with auto-detected CDN scripts

### CDN Auto-Injection

The preview detects framework usage in generated code and injects CDN scripts:

```javascript
// Detected patterns → injected CDNs:
"from 'react'"     → react@18, react-dom@18, babel-standalone
"tailwindcss"      → tailwindcss CDN
"lucide-react"     → lucide unpkg
"framer-motion"    → framer-motion unpkg
"react-router"     → react-router-dom unpkg
```

### Chat Components

| Component | Purpose |
|-----------|---------|
| `ChatMessages.tsx` | Renders message bubbles with markdown, code blocks |
| `ChatInput.tsx` | Input textarea, image upload, endpoint selector |
| `ChatSidebar.tsx` | Session history list, new/delete/rename |
| `CLIStatus.tsx` | Shows active endpoint name + connection status |
| `AgentProgress.tsx` | Progress bar during generation |
| `CodeGenerationStatus.tsx` | Build plan badge + file count |
| `TemplateGallery.tsx` | Starter project templates |

### System Prompt (injected in every request)

```
You are codemax-v3, an expert autonomous coding agent by Eburon AI.
You operate in two phases: PLAN then BUILD.

PHASE 1 — PLANNER: Output a numbered todo checklist, then pick
⚡ FAST (single-file HTML) or 🏗️ FULL (multi-file React app)

PHASE 2 — BUILDER: Output fenced code blocks with this EXACT format:
  ```language filepath
  code
  ```
```

This prompt tells the LLM to:
1. Always plan first (numbered checklist)
2. Pick a mode (fast single-file vs full multi-file)
3. Output code in parseable fenced blocks with file paths

---

## 8. CLI — Terminal Agent

### Three Modes

```bash
# Interactive REPL (default)
eburon chat

# Terminal UI with split panes (blessed)
eburon tui

# Launch web app + bridge server
eburon start
```

### CLI Entry Flow (`cli/src/cli.ts`)

```
eburon start:
  1. Check Ollama at OLLAMA_URL (supports any host/IP)
  2. Auto-pull model if missing (eburonmax/codemax-v3)
  3. Spawn bridge server on port 3333 (cli/dist/server.js)
  4. Spawn Next.js dev server on auto-detected port
  5. Print banner with all URLs
```

### Agent Tool Calling (`cli/src/core/agent.ts`)

The CLI agent uses Ollama's native tool calling format:

```json
{
  "model": "eburonmax/codemax-v3",
  "messages": [...],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "readFile",
        "description": "Read file contents",
        "parameters": { "type": "object", "properties": { "path": { "type": "string" } } }
      }
    }
  ]
}
```

### Available Tools

| Tool | Purpose | Auto-approved? |
|------|---------|---------------|
| `readFile` | Read filesystem files | ✅ Yes |
| `writeFile` | Create/modify files (shows diff) | ❌ Needs approval |
| `shellExec` | Run build/test commands | ❌ Needs approval (30s timeout) |
| `listFiles` | Directory listing with depth limit | ✅ Yes |
| `searchFiles` | Grep across project files | ✅ Yes |
| `querySkills` | Search offline knowledge base | ✅ Yes |

### Configuration (`cli/src/core/config.ts`)

```typescript
{
  model: "eburonmax/codemax-v3",     // env: EBURON_MODEL
  ollamaUrl: "http://localhost:11434", // env: OLLAMA_URL
  contextTokens: 8192,
  historyLimit: 50
}
```

### Building the CLI

```bash
cd cli
npm install
npm run build    # tsc → dist/ + copies datasets/
node dist/cli.js chat
```

---

## 9. Offline Skills & Datasets

The CLI ships with **12 bundled JSON skill packs** in `cli/src/core/datasets/`:

| Dataset | Contents |
|---------|----------|
| `react-patterns.json` | Hooks, components, state management, memo, context |
| `nextjs-patterns.json` | App Router, SSR/SSG, middleware, layouts, metadata |
| `tailwind-reference.json` | Utility classes, theming, responsive, dark mode |
| `typescript-patterns.json` | Generics, interfaces, type guards, discriminated unions |
| `pwa-guide.json` | Service workers, offline-first, manifest, push notifications |
| `api-design.json` | REST design, versioning, pagination, rate limiting |
| `auth-patterns.json` | JWT, OAuth2, sessions, RBAC, refresh tokens |
| `testing-patterns.json` | Vitest, Playwright, mocking, E2E, coverage |
| `database-patterns.json` | Schemas, migrations, indexing, relationships, ORMs |
| `css-ui-patterns.json` | Flexbox, Grid, animations, responsive, accessibility |
| `git-workflows.json` | Branching strategies, conventional commits, rebasing |
| `security-patterns.json` | XSS, CSRF, injection, CSP, CORS, sanitization |
| `deployment-patterns.json` | Docker, Vercel, PM2, nginx, CI/CD, env management |

These are searched by the `querySkills` tool and the `/api/skills` endpoint to inject relevant context into prompts — **no internet required**.

Additional datasets can be downloaded to `~/.eburon/skills/` from: `github.com/eburondeveloperph-gif/codemax-datasets`

---

## 10. Authentication — Firebase

### Setup

1. Create Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
2. Enable **Google** sign-in provider under Authentication → Sign-in Method
3. Add authorized domain: `your-app.vercel.app`
4. Copy config to env vars (see §13)

### How It Works

- **Client-side** (`src/lib/firebase.ts`): Firebase JS SDK → `signInWithPopup(GoogleAuthProvider)`
- **Server-side** (`src/lib/firebase-admin.ts`): Firebase Admin SDK → `verifyIdToken()` for API auth
- **Auth context** (`src/components/AuthProvider.tsx`): React context providing `user` + `loading` state
- **Auth gate** (`src/app/page.tsx`): Redirects to `/login` if `!user && !loading`
- **API auth** (`/api/v1/chat`): Validates `Authorization: Bearer <token>` header

---

## 11. Database — Supabase + PostgreSQL

### Schema

The app uses these tables (created via Supabase dashboard or migration):

```sql
-- Chat sessions
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  title TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Messages within sessions
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id),
  role TEXT NOT NULL,  -- 'user' | 'assistant' | 'system'
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Generated files
CREATE TABLE generated_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id),
  filename TEXT NOT NULL,
  content TEXT NOT NULL,
  language TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Memory embeddings (long-term facts)
CREATE TABLE memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding VECTOR(384),  -- pgvector extension
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Connection

```typescript
// src/lib/db.ts — uses pg driver directly
import { Pool } from "pg";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
```

---

## 12. Deployment Pipeline

### How Generated Apps Are Deployed

When a user generates an app, it's auto-deployed in two steps:

#### Step 1: Push to GitHub (`src/lib/github-deploy.ts`)

Uses the **Git Data API** (no git binary needed):

```
POST /repos/:owner/:repo/git/blobs     → Upload each file as blob
POST /repos/:owner/:repo/git/trees     → Create tree from blobs
POST /repos/:owner/:repo/git/commits   → Create commit pointing to tree
PATCH /repos/:owner/:repo/git/refs/heads/main → Update branch ref
```

**Directory structure in target repo:**
```
client/deployments/{userHash}/{slug}/{timestamp}/
  ├── index.html
  ├── styles.css
  └── app.js
```

- `userHash` = SHA-256 of Firebase UID (privacy)
- `slug` = sanitized app name
- `timestamp` = Unix epoch

#### Step 2: Deploy to Vercel (`src/lib/vercel-deploy.ts`)

Uses Vercel **Deployments API v13**:

```json
POST https://api.vercel.com/v13/deployments
{
  "name": "app-slug",
  "files": [
    { "file": "index.html", "data": "<base64>" },
    { "file": "styles.css", "data": "<base64>" }
  ],
  "projectSettings": {
    "framework": null,
    "buildCommand": "",
    "outputDirectory": "."
  }
}
```

Returns an instant live URL (no build step — static files).

#### Orchestration (`/api/deploy/client`)

```
POST /api/deploy/client
{ userId, appName, files: [{ path, content }] }
    │
    ├──► GitHub deploy (parallel)
    ├──► Vercel deploy (parallel)
    │
    └──► Response: { githubUrl, vercelUrl, commitSha }
```

### Standby Page

The studious-potato repo (`eburondeveloperph-gif/studious-potato`) auto-deploys to Vercel at:
`https://studious-potato-sooty.vercel.app/`

This Three.js HUD page is shown as the default preview in CodePanel when no app has been generated yet.

---

## 13. Environment Variables

See `.env.example` for the complete template. Here's a quick reference:

### Required for Web UI

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_FIREBASE_*` (8 vars) | Firebase client config |
| `DATABASE_URL` | Supabase PostgreSQL connection string |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` | Supabase public key |
| `OLLAMA_URL` | Primary Ollama endpoint |

### Required for Deployment

| Variable | Purpose |
|----------|---------|
| `GITHUB_PAT` | GitHub token with `repo` scope |
| `DEPLOY_REPO` | Target repo (e.g., `owner/repo`) |
| `VERCEL_DEPLOY_TOKEN` | Vercel API token |
| `VERCEL_DEPLOY_PROJECT` | Vercel project name |

### Optional

| Variable | Default | Purpose |
|----------|---------|---------|
| `EBURON_MODEL` | `eburonmax/codemax-v3` | Default model |
| `EBURON_VPS_HOSTS` | — | Comma-separated remote IPs |
| `EBURON_LOCAL_IPS` | — | This machine's public IPs |
| `EBURON_TUNNEL_URL` | — | Cloudflare tunnel for Ollama |
| `EBURON_SANDBOX_TUNNEL` | — | VPS sandbox tunnel |
| `OPENCODE_URL` | `http://127.0.0.1:3333` | OpenCode agent |
| `OPENCODE_PROVIDER` | `ollama` | OpenCode LLM provider |
| `OPENCODE_MODEL` | `codemax-v3` | OpenCode model |
| `BROWSERBASE_API_KEY` | — | Cloud browser API key |
| `BROWSERBASE_PROJECT_ID` | — | Cloud browser project |

---

## 14. Development Workflow

### First-Time Setup

```bash
# 1. Clone
git clone https://github.com/eburondeveloperph-gif/codemax-cli.git eburon-autopilot
cd eburon-autopilot

# 2. Install dependencies
npm install
cd cli && npm install && cd ..

# 3. Setup Ollama + model
ollama serve &
ollama create eburonmax/codemax-v3 -f Modelfile

# 4. Configure environment
cp .env.example .env.local
# Edit .env.local with your Firebase/Supabase/GitHub credentials

# 5. Build CLI
cd cli && npm run build && cd ..

# 6. Run development server
npm run dev     # → http://localhost:3000
```

### Daily Development

```bash
# Terminal 1: Ollama
ollama serve

# Terminal 2: (optional) OpenCode agent
opencode serve --port 3333 --hostname 127.0.0.1

# Terminal 3: (optional) Cloudflare tunnel
cloudflared tunnel --url http://localhost:11434
# → Copy URL to EBURON_TUNNEL_URL in .env.local

# Terminal 4: Next.js dev server
npm run dev

# Terminal 5: (optional) CLI dev
cd cli && npx ts-node --esm src/cli.ts chat
```

### Building for Production

```bash
# Build web app
npx next build

# Build CLI
cd cli && npm run build

# Deploy to Vercel (auto via git push, or manual)
npx vercel --prod
```

### Git Workflow

```bash
# Main branches
main     # Production — auto-deploys to Vercel
coder    # Development branch

# Commit format
feat: add new feature
fix: resolve bug
docs: update documentation
```

---

## 15. Services & External Accounts

To fully replicate this app, you need accounts on:

| Service | What You Need | URL |
|---------|--------------|-----|
| **Vercel** | Account + project for hosting | [vercel.com](https://vercel.com) |
| **Firebase** | Project with Google Auth enabled | [console.firebase.google.com](https://console.firebase.google.com) |
| **Supabase** | Project with PostgreSQL database | [supabase.com](https://supabase.com) |
| **GitHub** | Account + PAT with `repo` scope | [github.com](https://github.com) |
| **Cloudflare** | (Optional) For tunnel access | Install `cloudflared` CLI |
| **Browserbase** | (Optional) For cloud browser screenshots | [browserbase.com](https://browserbase.com) |
| **Ollama** | Local install on any machine with ≥8GB RAM | [ollama.com](https://ollama.com) |

---

## 16. Aliases & Conventions

### Naming

| Term | Meaning |
|------|---------|
| **Codemax** | The product name (Eburon Codemax) |
| **codemax-v3** | The LLM model (`eburonmax/codemax-v3`) |
| **PH Local Server** | Ollama on the Philippines local machine |
| **PH Server2** | OpenCode agent on localhost:3333 |
| **EU Server** | Ollama via Cloudflare tunnel (Belgium/EU VPS) |
| **FAST mode** | Single-file HTML generation (⚡) |
| **FULL mode** | Multi-file React/Next.js app (🏗️) |
| **Bridge** | API proxy route that wraps a different backend |
| **Standby page** | The Three.js HUD shown before app generation |

### Code Conventions

- **Runtime**: All API routes use `export const runtime = "nodejs"`
- **Streaming**: NDJSON format (`text/event-stream`, one JSON per line)
- **Timeouts**: Use manual `AbortController` + `setTimeout` (not `AbortSignal.timeout()`)
- **Self-fetch**: Never fetch your own API routes in server-side code (deadlock in dev mode)
- **Fallback**: Every external call must have a localhost fallback
- **Sessions**: Create fresh OpenCode sessions per request (avoid "busy" locks)
- **Linter**: Biome (`@biomejs/biome`) — `npx biome check`
- **Build**: `npx next build` — must pass with zero errors
- **TypeScript**: Strict mode, build errors are NOT ignored

### Key Technical Decisions

| Decision | Reason |
|----------|--------|
| Ollama over OpenAI API | Self-hosted, private, no API costs, offline-capable |
| NDJSON over SSE | Matches Ollama's native streaming format |
| Firebase over NextAuth | Google OAuth out-of-box, Realtime DB for future features |
| Supabase over direct Postgres | Dashboard, auth, storage, instant setup |
| `pg` driver over Prisma | Direct SQL control, lighter bundle for serverless |
| Vercel static deploy | No build step = instant URL, works with any file |
| Git Data API over `git push` | Works serverless (no git binary needed on Vercel) |
| Cloudflare tunnels | Free, instant, no port forwarding needed |
| Blob preview over iframe sandbox | Instant client-side rendering, no server round-trip |

---

## Quick Start (TL;DR)

```bash
# Clone → Install → Configure → Run
git clone <repo> && cd eburon-autopilot
npm install && cd cli && npm install && npm run build && cd ..
cp .env.example .env.local   # Fill in Firebase + Supabase + Ollama
ollama serve &
ollama create eburonmax/codemax-v3 -f Modelfile
npm run dev
# → Open http://localhost:3000, sign in with Google, start generating apps
```
