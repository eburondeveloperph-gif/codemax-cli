# Eburon Codemax CLI

> Autonomous coding agent powered by **codemax-v3** via [opencode](https://opencode.ai)  
> Created by **Master E**, Eburon AI — founded by **Jo Lernout**

---

## Features

- **Interactive TUI** — opencode-style terminal UI with conversation history
- **Streaming output** — real-time code generation in the terminal
- **Web bridge** — Ollama-compatible HTTP server so the Eburon Codepilot web app can connect
- **Slash commands** — `/help`, `/clear`, `/model`, `/session`, `/exit`
- **Humorous loading** — rotating jokes while codemax-v3 thinks

---

## Quick Start

```bash
# From the cli/ directory
npm install
npm run build

# Interactive mode
node dist/cli.js

# Single-shot mode
node dist/cli.js "create a React todo app with TypeScript"

# Start bridge server (for the web app)
node dist/server.js
```

---

## Bridge Server

The bridge server runs on **port 3001** and exposes an Ollama-compatible API:

| Endpoint       | Method | Description              |
|----------------|--------|--------------------------|
| `/api/chat`    | POST   | Ollama-format chat proxy |
| `/api/tags`    | GET    | Returns `codemax-v3`     |
| `/health`      | GET    | Server health check      |

The Eburon Codepilot web app auto-detects this server on startup.

---

## CLI Commands

| Command     | Description              |
|-------------|--------------------------|
| `/help`     | Show available commands  |
| `/clear`    | Clear conversation       |
| `/model`    | Show model info          |
| `/session`  | Show session stats       |
| `/exit`     | Quit                     |

---

## Environment Variables

| Variable           | Default                          | Description              |
|--------------------|----------------------------------|--------------------------|
| `OPENCODE_PATH`    | `~/.opencode/bin/opencode`       | Path to opencode binary  |
| `EBURON_CLI_PORT`  | `3001`                           | Bridge server port       |
| `EBURON_DEBUG`     | *(unset)*                        | Show verbose stderr      |

---

## Model

The CLI uses **`ollama/codemax-v3`** — a custom autonomous agent model:

- **Base**: `codemax:latest` (Ollama)
- **System prompt**: Autonomous agent identity as *codemax-v3*, created by Master E of Eburon AI
- **Context**: 8192 tokens
- **Temperature**: 0.7
