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

echo
echo "=== SMOKE-CHECK OK ==="
