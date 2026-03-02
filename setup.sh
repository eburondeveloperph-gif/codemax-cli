#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════╗
# ║  EBURON CODEMAX  —  setup.sh                                   ║
# ║  One-shot installer & launcher                                  ║
# ║  Usage:  bash setup.sh                                          ║
# ║  Or:     curl -fsSL https://<your-host>/setup.sh | bash        ║
# ╚══════════════════════════════════════════════════════════════════╝
set -e

BOLD="\033[1m"
CYAN="\033[36m"
GREEN="\033[32m"
YELLOW="\033[33m"
RED="\033[31m"
VIOLET="\033[35m"
DIM="\033[2m"
RESET="\033[0m"

REPO_URL="https://github.com/eburondeveloperph-gif/codemax-cli.git"
MODEL="eburonmax/codemax-v3"
APP_DIR="${EBURON_DIR:-$HOME/eburon-codemax}"

banner() {
  echo ""
  echo -e "${VIOLET}${BOLD}  ╭──────────────────────────────────────────╮${RESET}"
  echo -e "${VIOLET}${BOLD}  │  ⚡ EBURON CODEMAX  —  Setup & Deploy    │${RESET}"
  echo -e "${VIOLET}${BOLD}  │  Autonomous coding agent by Eburon AI    │${RESET}"
  echo -e "${VIOLET}${BOLD}  ╰──────────────────────────────────────────╯${RESET}"
  echo ""
}

step() { echo -e "${CYAN}${BOLD}  →${RESET} $1"; }
ok()   { echo -e "${GREEN}  ✔${RESET} $1"; }
warn() { echo -e "${YELLOW}  ⚠${RESET} $1"; }
fail() { echo -e "${RED}  ✖${RESET} $1"; exit 1; }

# ── Detect OS ─────────────────────────────────────────────────────
OS="$(uname -s)"
case "$OS" in
  Darwin*) PLATFORM="macOS" ;;
  Linux*)  PLATFORM="Linux" ;;
  *)       PLATFORM="Unknown" ;;
esac

banner
echo -e "${DIM}  Platform: $PLATFORM  ·  Node: $(node --version 2>/dev/null || echo 'not found')${RESET}"
echo ""

# ── 1. Prerequisites ──────────────────────────────────────────────
step "Checking prerequisites…"

command -v node &>/dev/null || fail "Node.js not found. Install from https://nodejs.org"
command -v npm  &>/dev/null || fail "npm not found. Install from https://nodejs.org"

NODE_MAJOR=$(node --version | sed 's/v//' | cut -d. -f1)
[ "$NODE_MAJOR" -ge 18 ] || fail "Node.js 18+ required (found $(node --version))"
ok "Node.js $(node --version)"

command -v git &>/dev/null || fail "git not found. Install git first."

if ! command -v ollama &>/dev/null; then
  warn "Ollama not found. Installing…"
  if [ "$PLATFORM" = "macOS" ]; then
    brew install --cask ollama 2>/dev/null || curl -fsSL https://ollama.com/install.sh | sh
  else
    curl -fsSL https://ollama.com/install.sh | sh
  fi
fi
ok "Ollama $(ollama --version 2>/dev/null | head -1)"

# ── 2. Clone / update project ─────────────────────────────────────
# Check if we're already inside the cloned repo
if [ -f "$(pwd)/package.json" ] && grep -q "eburon-autopilot\|codemax-cli" "$(pwd)/package.json" 2>/dev/null; then
  APP_DIR="$(pwd)"
  ok "Running from project directory: $APP_DIR"
elif [ -d "$APP_DIR/.git" ]; then
  step "Updating existing install at $APP_DIR…"
  cd "$APP_DIR" && git pull --quiet
  ok "Updated to latest"
else
  step "Cloning Eburon Codemax from GitHub…"
  git clone "$REPO_URL" "$APP_DIR" || fail "Clone failed. Check your internet connection."
  cd "$APP_DIR"
  ok "Cloned to $APP_DIR"
fi

cd "$APP_DIR"
ok "Project directory: $APP_DIR"

# ── 3. Install npm dependencies ───────────────────────────────────
step "Installing app dependencies…"
npm install --silent
ok "App dependencies installed"

step "Building Eburon Codemax CLI…"
cd cli && npm install --silent && npm run build --silent && cd ..
ok "CLI built at cli/dist/"

# ── 4. Install global `codemax` command ───────────────────────────
step "Installing global 'codemax' command…"
CLI_ENTRY="$APP_DIR/cli/dist/cli.js"

# Try to install into a directory on PATH
INSTALL_DIR=""
for candidate in "/usr/local/bin" "$HOME/.local/bin" "$HOME/bin"; do
  if [ -d "$candidate" ] || mkdir -p "$candidate" 2>/dev/null; then
    INSTALL_DIR="$candidate"
    break
  fi
done

if [ -n "$INSTALL_DIR" ]; then
  cat > "$INSTALL_DIR/codemax" << WRAPPER
#!/usr/bin/env bash
exec node "$CLI_ENTRY" "\$@"
WRAPPER
  chmod +x "$INSTALL_DIR/codemax"

  # Also create `eburon-codemax` alias
  cat > "$INSTALL_DIR/eburon-codemax" << WRAPPER
#!/usr/bin/env bash
exec node "$CLI_ENTRY" "\$@"
WRAPPER
  chmod +x "$INSTALL_DIR/eburon-codemax"

  # Also create `eburon` alias (primary command)
  cat > "$INSTALL_DIR/eburon" << WRAPPER
#!/usr/bin/env bash
exec node "$CLI_ENTRY" "\$@"
WRAPPER
  chmod +x "$INSTALL_DIR/eburon"

  ok "Global commands installed: eburon  /  codemax  /  eburon-codemax"

  # Warn if the install dir isn't in PATH
  if ! echo "$PATH" | grep -q "$INSTALL_DIR"; then
    warn "$INSTALL_DIR is not in your PATH."
    warn "Add this to your shell profile (.zshrc / .bashrc):"
    echo ""
    echo -e "    ${CYAN}export PATH=\"$INSTALL_DIR:\$PATH\"${RESET}"
    echo ""
  fi
else
  warn "Could not determine a writable bin directory. Run directly with:"
  echo -e "    ${CYAN}node $CLI_ENTRY start${RESET}"
fi

# ── 5. Pull model ─────────────────────────────────────────────────
step "Checking model: $MODEL"
if ollama list 2>/dev/null | grep -q "eburonmax/codemax-v3"; then
  ok "Model $MODEL already present"
else
  step "Pulling $MODEL from Ollama Hub (19 GB — grab a coffee ☕)…"
  ollama pull "$MODEL"
  ok "Model $MODEL ready"
fi

# ── 6. Create Modelfile alias ─────────────────────────────────────
if [ -f "Modelfile" ] && ! ollama list 2>/dev/null | grep -q "^codemax-v3"; then
  step "Creating local codemax-v3 alias…"
  ollama create codemax-v3 -f Modelfile 2>/dev/null && ok "Local alias codemax-v3 created" || true
fi

# ── 7. Launch ─────────────────────────────────────────────────────
echo ""
echo -e "${VIOLET}${BOLD}  ╭──────────────────────────────────────────────────╮${RESET}"
echo -e "${VIOLET}${BOLD}  │  ✅  Setup complete!                              │${RESET}"
echo -e "${VIOLET}${BOLD}  │                                                  │${RESET}"
echo -e "${VIOLET}${BOLD}  │  Modes:                                          │${RESET}"
echo -e "${VIOLET}${BOLD}  │    eburon chat     Interactive REPL (Codex-style) │${RESET}"
echo -e "${VIOLET}${BOLD}  │    eburon tui      Terminal UI (OpenCode-style)   │${RESET}"
echo -e "${VIOLET}${BOLD}  │    eburon start    Web app + CLI server (v0)      │${RESET}"
echo -e "${VIOLET}${BOLD}  │    eburon [prompt]  Single-shot generation        │${RESET}"
echo -e "${VIOLET}${BOLD}  ╰──────────────────────────────────────────────────╯${RESET}"
echo ""

exec node "$APP_DIR/cli/dist/cli.js" chat
