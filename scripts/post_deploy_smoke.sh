#!/usr/bin/env bash
set -euo pipefail

FRONTEND_URL="${FRONTEND_URL:-http://localhost:3000}"
BACKEND_URL="${BACKEND_URL:-http://localhost:8000}"

echo "[smoke] FRONTEND_URL=${FRONTEND_URL}"
echo "[smoke] BACKEND_URL=${BACKEND_URL}"

check_http_200() {
  local url="$1"
  local label="$2"
  local status
  status="$(curl -s -o /dev/null -w "%{http_code}" "$url")"
  if [[ "$status" != "200" ]]; then
    echo "[smoke][FAIL] ${label}: expected 200, got ${status} (${url})"
    return 1
  fi
  echo "[smoke][OK] ${label}: 200"
}

check_http_200 "${BACKEND_URL}/api/v1/health" "backend health"
check_http_200 "${FRONTEND_URL}/" "frontend home"
check_http_200 "${FRONTEND_URL}/login" "frontend login"

echo "[smoke] all checks passed"
