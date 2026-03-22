$ErrorActionPreference = "Stop"

function Fail([string]$msg) {
  Write-Host ""
  Write-Host "SMOKE-CHECK FAILED: $msg" -ForegroundColor Red
  exit 1
}

function Info([string]$msg) {
  Write-Host "INFO: $msg"
}

function HasFile([string]$p) { return Test-Path $p }

function AssertLastExit([string]$action) {
  if ($LASTEXITCODE -ne 0) {
    Fail "$action failed with exit code $LASTEXITCODE."
  }
}

function GetNodeMajor() {
  $v = node -p "process.versions.node"
  AssertLastExit "node version check"
  $major = [int]($v.Split('.')[0])
  return $major
}

function EnsureGitRepo() {
  try {
    $inside = (git rev-parse --is-inside-work-tree) 2>$null
    if ($inside -ne "true") { Fail "Not inside a git repository." }
  } catch { Fail "Git is not available or not a git repository." }
}

function EnsureNodeVersion() {
  $major = GetNodeMajor
  if ($major -lt 18) { Fail "Node.js >= 18 is required. Current major: $major" }
}

function InstallDeps() {
  if (HasFile "package-lock.json") {
    npm ci --no-audit --no-fund
    AssertLastExit "npm ci"
  } else {
    Info "package-lock.json not found -> using npm install"
    npm install --no-audit --no-fund
    AssertLastExit "npm install"
  }
}

function CheckTrackedArtifacts() {
  $paths = @("node_modules", "data/app.db", "audio-cache", "gemini-cache")
  foreach ($p in $paths) {
    $out = (git ls-files -- "$p") 2>$null
    if ($out -and $out.Trim().Length -gt 0) {
      Fail "Forbidden artifact is tracked by git: '$p'. Remove from index (git rm --cached ...) and add to .gitignore."
    }
  }
}

function RunDbMigrate() {
  $dbPathForLog = if ($env:DB_PATH) { $env:DB_PATH } else { "<default: data/app.db>" }
  $migrationsDirForLog = if ($env:MIGRATIONS_DIR) { $env:MIGRATIONS_DIR } else { "<default: migrations/>" }
  Info "Running npm script: db:migrate"
  Info ("DB_PATH=" + $dbPathForLog)
  Info ("MIGRATIONS_DIR=" + $migrationsDirForLog)
  npm run db:migrate
  AssertLastExit "npm run db:migrate"
}

function PickDbCheckArgs([string]$dbPath) {
  if (!(HasFile "tools/smoke-dbcheck-pick.js")) {
    Info "tools/smoke-dbcheck-pick.js not found -> using fallback args"
    return @("__NO_ASSET__", "0", "0")
  }

  $out = & node tools/smoke-dbcheck-pick.js $dbPath 2>$null
  if (!$out -or $out.Trim().Length -eq 0) {
    Info "Could not pick db-check args -> using fallback args"
    return @("__NO_ASSET__", "0", "0")
  }

  $parts = $out -split "`t"
  if ($parts.Length -lt 3) {
    Info "Unexpected picker output -> using fallback args"
    return @("__NO_ASSET__", "0", "0")
  }

  return @($parts[0], $parts[1], $parts[2])
}

function RunDbCheck() {
  if (!(HasFile "tools/step8_2-db-check.js")) {
    Info "DB check tool not found (tools/step8_2-db-check.js). Skipping."
    return
  }

  # dbPath: берем DB_PATH если задан, иначе дефолт как в migrate-cli (root/data/app.db)
  $dbPath = if ($env:DB_PATH) { $env:DB_PATH } else { "data/app.db" }

  $args = PickDbCheckArgs $dbPath
  $assetKey = $args[0]
  $sentenceId = $args[1]
  $textId = $args[2]

  Info "Running DB check tool: node tools/step8_2-db-check.js <dbPath> <assetKey> <sentenceId> <textId>"
  Info "dbPath=$dbPath"
  Info "assetKey=$assetKey"
  Info "sentenceId=$sentenceId"
  Info "textId=$textId"

  node tools/step8_2-db-check.js $dbPath $assetKey $sentenceId $textId
  AssertLastExit "DB check tool"
}

function RunApiSmoke() {
  if (!(HasFile "scripts/api-smoke.js")) {
    Info "API smoke script not found (scripts/api-smoke.js). Skipping."
    return
  }

  Info "Running API smoke: npm run test:api-smoke"
  npm run test:api-smoke
  AssertLastExit "API smoke"
}

Write-Host "=== SMOKE-CHECK v2.1 (PowerShell) ==="

EnsureGitRepo

Write-Host "1) Toolchain"
node -v
AssertLastExit "node -v"
npm -v
AssertLastExit "npm -v"
EnsureNodeVersion

Write-Host "2) Git status"
git status
AssertLastExit "git status"
git diff --stat
AssertLastExit "git diff --stat"

Write-Host "3) Guard: forbidden tracked artifacts"
CheckTrackedArtifacts

Write-Host "4) Install dependencies"
InstallDeps

Write-Host "5) DB migrate (npm run db:migrate)"
RunDbMigrate

Write-Host "6) DB check tool (args auto-pick)"
RunDbCheck

Write-Host "7) API smoke"
RunApiSmoke

Write-Host ""
Write-Host "=== SMOKE-CHECK OK ===" -ForegroundColor Green
