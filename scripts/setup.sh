#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# SMEazy — First-time setup script
# Tested on: Ubuntu 22.04 / 24.04, macOS 13+
# Run: bash scripts/setup.sh
# ─────────────────────────────────────────────────────────────────────────────

BOLD="\e[1m"; GREEN="\e[32m"; YELLOW="\e[33m"; RED="\e[31m"; RESET="\e[0m"

info()    { echo -e "${GREEN}[setup]${RESET} $*"; }
warn()    { echo -e "${YELLOW}[warn] $*${RESET}"; }
die()     { echo -e "${RED}[error] $*${RESET}"; exit 1; }
section() { echo -e "\n${BOLD}▶ $*${RESET}"; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

section "Checking prerequisites"

# ── Rust ──────────────────────────────────────────────────────────────────────
if ! command -v cargo &>/dev/null; then
  warn "Rust not found. Installing via rustup..."
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable
  source "$HOME/.cargo/env"
fi
RUST_VER=$(rustc --version | awk '{print $2}')
info "Rust $RUST_VER ✓"

# ── Node.js ───────────────────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  die "Node.js not found. Install Node.js 18+ from https://nodejs.org"
fi
NODE_VER=$(node --version)
info "Node.js $NODE_VER ✓"

# ── Docker ────────────────────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  die "Docker not found. Install Docker Desktop from https://docker.com/get-started"
fi
info "Docker $(docker --version | awk '{print $3}' | tr -d ',') ✓"

if ! command -v docker-compose &>/dev/null && ! docker compose version &>/dev/null 2>&1; then
  die "Docker Compose not found. It ships with Docker Desktop."
fi
info "Docker Compose ✓"

# ── sqlx-cli ──────────────────────────────────────────────────────────────────
section "Installing sqlx-cli"
if ! command -v sqlx &>/dev/null; then
  info "Installing sqlx-cli (needed for DB migrations)..."
  cargo install sqlx-cli --no-default-features --features postgres,rustls
  info "sqlx-cli installed ✓"
else
  info "sqlx-cli already installed ✓"
fi

# ── .env ──────────────────────────────────────────────────────────────────────
section "Environment config"
if [ ! -f "$ROOT/.env" ]; then
  cp "$ROOT/.env.example" "$ROOT/.env"
  info "Created .env from .env.example"
  warn "Review .env and set JWT_SECRET to a strong random value before production!"
else
  info ".env already exists ✓"
fi

# ── Start Docker services ─────────────────────────────────────────────────────
section "Starting PostgreSQL and Redis"
cd "$ROOT/docker"

if docker compose version &>/dev/null 2>&1; then
  COMPOSE="docker compose"
else
  COMPOSE="docker-compose"
fi

$COMPOSE up -d postgres redis
info "Waiting for PostgreSQL to be ready..."
for i in $(seq 1 30); do
  if $COMPOSE exec -T postgres pg_isready -U smeazy -d smeazy &>/dev/null; then
    info "PostgreSQL ready ✓"; break
  fi
  [ "$i" -eq 30 ] && die "PostgreSQL didn't start in time. Check: docker compose logs postgres"
  sleep 1
done

cd "$ROOT"

# ── Run migrations ────────────────────────────────────────────────────────────
section "Running database migrations"
source "$ROOT/.env" 2>/dev/null || true
export DATABASE_URL="${DATABASE_URL:-postgres://smeazy:smeazy@localhost:5432/smeazy}"
sqlx migrate run --source "$ROOT/migrations"
info "Migrations applied ✓"

# ── Frontend deps ─────────────────────────────────────────────────────────────
section "Installing frontend dependencies"
cd "$ROOT/frontend"
npm install
info "Frontend dependencies installed ✓"

# ── Prefetch Rust crates ──────────────────────────────────────────────────────
section "Fetching Rust dependencies (first build will be slow)"
cd "$ROOT"
cargo fetch 2>&1 | grep -E "^(error|Downloading|Fetching)" || true
info "Rust crates fetched ✓"

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}✅  Setup complete!${RESET}"
echo ""
echo "  Next steps:"
echo "    1. Build + run the API:     cd $ROOT && cargo run -p smeazy-api"
echo "    2. Run the frontend (new terminal):"
echo "       cd $ROOT/frontend && npm run dev"
echo "    3. Open http://localhost:3000"
echo ""
echo "  Optional DB admin UI (pgAdmin):"
echo "    cd docker && docker compose --profile tools up -d pgadmin"
echo "    Then open http://localhost:5050 (admin@smeazy.local / admin)"
echo ""
