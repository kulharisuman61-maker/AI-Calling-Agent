#!/usr/bin/env bash
set -euo pipefail

cleanup() {
  if [[ -n "${BACKEND_PID:-}" ]]; then
    kill "$BACKEND_PID" 2>/dev/null || true
  fi
  if [[ -n "${FRONTEND_PID:-}" ]]; then
    kill "$FRONTEND_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

echo "Starting AI Calling backend on http://localhost:3002"
npm run dev:backend &
BACKEND_PID=$!

echo "Starting AI Calling frontend on http://localhost:3001"
npm run dev:frontend &
FRONTEND_PID=$!

wait "$BACKEND_PID" "$FRONTEND_PID"
