#!/usr/bin/env bash
set -euo pipefail

# Read-only smoke test for staging API.
# No POST/PATCH/PUT/DELETE on business endpoints.
#
# Required env vars:
# - SUPABASE_URL
# - SUPABASE_ANON_KEY
# - API_BASE_URL (e.g. https://api-staging.dringdring.me/api/v1)
# - TEST_EMAIL
# - TEST_PASSWORD

if [[ -z "${SUPABASE_URL:-}" || -z "${SUPABASE_ANON_KEY:-}" || -z "${API_BASE_URL:-}" || -z "${TEST_EMAIL:-}" || -z "${TEST_PASSWORD:-}" ]]; then
  echo "Missing env vars."
  echo "Required: SUPABASE_URL SUPABASE_ANON_KEY API_BASE_URL TEST_EMAIL TEST_PASSWORD"
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required"
  exit 1
fi

TOKEN="$(curl -sS -X POST "${SUPABASE_URL}/auth/v1/token?grant_type=password" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${TEST_EMAIL}\",\"password\":\"${TEST_PASSWORD}\"}" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin).get("access_token",""))')"

if [[ -z "$TOKEN" ]]; then
  echo "Login failed for ${TEST_EMAIL}"
  exit 1
fi

echo "Login OK: ${TEST_EMAIL}"

check_get() {
  local path="$1"
  local code
  local size
  code="$(curl -sS -o /tmp/smoke_resp.json -w "%{http_code}" "${API_BASE_URL}${path}" -H "Authorization: Bearer ${TOKEN}")"
  size="$(wc -c < /tmp/smoke_resp.json | tr -d ' ')"
  echo "GET ${path} -> ${code} (${size} bytes)"
  if [[ "$code" -ge 500 ]]; then
    echo "Blocking: ${path} returned ${code}"
    exit 1
  fi
}

check_get "/health"
check_get "/me"
check_get "/regions/me/billing"
check_get "/regions/me/internal-billing"
check_get "/clients/admin"
check_get "/couriers"
check_get "/cities"
check_get "/shops/admin"
check_get "/shops/hqs"
check_get "/tariffs"
check_get "/dispatch/deliveries?month=2026-02"
check_get "/billing/documents?month=2026-02"
check_get "/billing/documents/lines?month=2026-02"
check_get "/stats/eco?month=2026-02"
check_get "/stats/rewards?month=2026-02"

echo "Smoke read-only completed."

