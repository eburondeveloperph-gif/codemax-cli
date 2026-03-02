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

REPO_URL="https://github.com/eburonmax/eburon-autopilot"
MODEL="eburonmax/codemax-v3"
APP_DIR="${EBURON_DIR:-$HOME/eburon-autopilot}"

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

command -v ollama &>/dev/null || {
  warn "Ollama not found. Installing…"
  if [ "$PLATFORM" = "macOS" ]; then
    brew install --cask ollama 2>/dev/null || curl -fsSL https://ollama.com/install.sh | sh
  else
    curl -fsSL https://ollama.com/install.sh | sh
  fi
}
ok "Ollama $(ollama --version 2>/dev/null | head -1)"

# ── 2. Project setup ──────────────────────────────────────────────
# If running via curl (not inside repo), clone first
if [ ! -f "package.json" ] || ! grep -q "eburon-autopilot" package.json 2>/dev/null; then
  step "Cloning Eburon Autopilot…"
  git clone "$REPO_URL" "$APP_DIR" 2>/dev/null || {
    warn "Could not clone (repo may be private). Using current directory."
    APP_DIR="$(pwd)"
  }
  cd "$APP_DIR"
else
  APP_DIR="$(pwd)"
fi

ok "Project directory: $APP_DIR"

# ── 3. Install npm dependencies ───────────────────────────────────
step "Installing app dependencies…"
npm install --silent
ok "App dependencies installed"

step "Building Eburon Codemax CLI…"
cd cli && npm install --silent && npm run build --silent && cd ..
ok "CLI built at cli/dist/"

# ── 4. Pull model ─────────────────────────────────────────────────
step "Checking model: $MODEL"
if ollama list 2>/dev/null | grep -q "eburonmax/codemax-v3"; then
  ok "Model $MODEL already present"
else
  step "Pulling $MODEL from Ollama Hub (this may take a while…)"
  ollama pull "$MODEL"
  ok "Model $MODEL ready"
fi

# ── 5. Create Modelfile alias ─────────────────────────────────────
if [ -f "Modelfile" ] && ! ollama list 2>/dev/null | grep -q "^codemax-v3"; then
  step "Creating local codemax-v3 alias…"
  ollama create codemax-v3 -f Modelfile 2>/dev/null && ok "Local alias codemax-v3 created" || true
fi

# ── 6. Launch ─────────────────────────────────────────────────────
echo ""
echo -e "${VIOLET}${BOLD}  ╭──────────────────────────────────────────╮${RESET}"
echo -e "${VIOLET}${BOLD}  │  Setup complete! Starting Eburon Codemax │${RESET}"
echo -e "${VIOLET}${BOLD}  ╰──────────────────────────────────────────╯${RESET}"
echo ""

exec node cli/dist/cli.js start
