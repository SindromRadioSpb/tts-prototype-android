#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo
  echo "SMOKE-CHECK FAILED: $1" >&2
  exit 1
}

info() {
  echo "INFO: $1"
}

ensure_git_repo() {
  git rev-parse --is-inside-work-tree >/dev/null 2>&1 || fail "Not inside a git repository."
}

ensure_node_version() {
  local v major
  v="$(node -p "process.versions.node")"
  major="${v%%.*}"
  [[ "${major}" -ge 18 ]] || fail "Node.js >= 18 is required. Current: ${v}"
}

install_deps() {
  if [[ -f package-lock.json ]]; then
    npm ci --no-audit --no-fund
  else
    info "package-lock.json not found -> using npm install"
    npm install --no-audit --no-fund
  fi
}

check_tracked_artifacts() {
  local p out
  for p in "node_modules" "data/app.db" "audio-cache" "gemini-cache"; do
    out="$(git ls-files -- "$p" || true)"
    [[ -z "${out}" ]] || fail "Forbidden artifact is tracked by git: '$p'. Remove from index (git rm --cached ...) and add to .gitignore."
  done
}

run_db_migrate() {
  info "Running npm script: db:migrate"
  info "DB_PATH=${DB_PATH:-<default: data/app.db>}"
  info "MIGRATIONS_DIR=${MIGRATIONS_DIR:-<default: migrations/>}"
  npm run db:migrate
}

pick_dbcheck_args() {
  local db_path="$1"
  if [[ -f tools/smoke-dbcheck-pick.js ]]; then
    node tools/smoke-dbcheck-pick.js "$db_path" 2>/dev/null || true
  fi
}

run_db_check() {
  [[ -f tools/step8_2-db-check.js ]] || { info "DB check tool not found. Skipping."; return 0; }

  local db_path="${DB_PATH:-data/app.db}"

  local picked
  picked="$(pick_dbcheck_args "$db_path")"

  local asset_key sentence_id text_id
  if [[ -n "${picked}" ]]; then
    IFS=$'\t' read -r asset_key sentence_id text_id <<< "${picked}"
  else
    asset_key="__NO_ASSET__"
    sentence_id="0"
    text_id="0"
  fi

  info "Running DB check tool: node tools/step8_2-db-check.js <dbPath> <assetKey> <sentenceId> <textId>"
  info "dbPath=${db_path}"
  info "assetKey=${asset_key}"
  info "sentenceId=${sentence_id}"
  info "textId=${text_id}"

  node tools/step8_2-db-check.js "$db_path" "$asset_key" "$sentence_id" "$text_id"
}

run_api_smoke() {
  [[ -f scripts/api-smoke.js ]] || { info "API smoke script not found. Skipping."; return 0; }
  info "Running API smoke: npm run test:api-smoke"
  npm run test:api-smoke
}

run_unit_tests() {
  info "Running unit tests: npm test (node --test)"
  npm test
}

run_i18n_smoke() {
  [[ -f tests/i18n.smoke.js ]] || { info "i18n smoke not found. Skipping."; return 0; }
  info "Running i18n smoke (incl. P0-1/P1-1 keys): npm run smoke:i18n"
  npm run smoke:i18n
}

run_docs_route_smoke() {
  [[ -f scripts/docs-route-smoke.js ]] || { info "docs-route smoke not found. Skipping."; return 0; }
  info "Running docs-route smoke (P0-3): npm run smoke:docs"
  npm run smoke:docs
}

run_multitab_smoke() {
  [[ -f scripts/multitab/owner-follower-smoke.js ]] || { info "multitab smoke not found. Skipping."; return 0; }
  info "Running multitab smoke (P0-1; skips if no browser): npm run smoke:multitab"
  npm run smoke:multitab
}

echo "=== SMOKE-CHECK v2.1 (bash) ==="

ensure_git_repo

echo "1) Toolchain"
node -v
npm -v
ensure_node_version

echo "2) Git status"
git status
git diff --stat || true

echo "3) Guard: forbidden tracked artifacts"
check_tracked_artifacts

echo "4) Install dependencies"
install_deps

echo "5) DB migrate (npm run db:migrate)"
run_db_migrate

echo "6) DB check tool (args auto-pick)"
run_db_check

echo "7) API smoke"
run_api_smoke

echo "8) Unit tests (node --test, incl. P0-1 DbUnavailableError)"
run_unit_tests

echo "9) i18n smoke (P0-1 / P1-1 key coverage)"
run_i18n_smoke

echo "10) docs-route smoke (P0-3 privacy/docs)"
run_docs_route_smoke

echo "11) multitab smoke (P0-1 owner/follower)"
run_multitab_smoke

echo
echo "=== SMOKE-CHECK OK ==="
