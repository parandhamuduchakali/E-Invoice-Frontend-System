#!/usr/bin/env bash
# Starts the FastAPI backend and the Vite frontend together (macOS / Linux / Git Bash).
#
#   ./scripts/dev-all.sh                       # backend :8000, frontend :5173
#   BACKEND_PORT=8001 FRONTEND_PORT=5180 ./scripts/dev-all.sh
#
# BACKEND_DIR defaults to the sibling folder E-Invoice-Backend-system.
# PYTHON defaults to the backend's venv python if present, else `python`.

set -euo pipefail

FRONTEND_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_DIR="${BACKEND_DIR:-$FRONTEND_DIR/../E-Invoice-Backend-system}"
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"

if [ -z "${PYTHON:-}" ]; then
  for candidate in "$BACKEND_DIR/venv/bin/python" "$BACKEND_DIR/.venv/bin/python" "/c/venvs/einvoice/Scripts/python.exe"; do
    if [ -x "$candidate" ]; then PYTHON="$candidate"; break; fi
  done
  PYTHON="${PYTHON:-python}"
fi

echo "Backend : $BACKEND_DIR  (http://127.0.0.1:$BACKEND_PORT, docs at /docs)"
echo "Frontend: $FRONTEND_DIR  (http://127.0.0.1:$FRONTEND_PORT, proxy -> :$BACKEND_PORT)"

(cd "$BACKEND_DIR" && "$PYTHON" -m uvicorn app.main:app --reload --host 127.0.0.1 --port "$BACKEND_PORT") &
BACKEND_PID=$!
trap 'kill $BACKEND_PID 2>/dev/null || true' EXIT INT TERM

cd "$FRONTEND_DIR"
VITE_PROXY_TARGET="http://127.0.0.1:$BACKEND_PORT" npx vite --port "$FRONTEND_PORT" --strictPort
