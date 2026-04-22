param(
  [switch]$SkipNodeInstall,
  [switch]$SkipDbMigrate,
  [switch]$SkipAiLocalInstall,
  [switch]$WithHebrewLocal,
  [int]$NodePort = 3000,
  [int]$AiLocalPort = 8765,
  [int]$HebrewLocalPort = 8766
)

$ErrorActionPreference = "Stop"

function Info([string]$msg) {
  Write-Host "[start_all] $msg"
}

function Fail([string]$msg) {
  Write-Host "[start_all] ERROR: $msg" -ForegroundColor Red
  exit 1
}

$RepoRoot = Split-Path -Parent $PSScriptRoot
$AiLocalRoot = Join-Path $RepoRoot "ai-local"
$AiLocalPython = Join-Path $AiLocalRoot ".venv\Scripts\python.exe"

if (!(Test-Path $RepoRoot)) {
  Fail "Repo root not found: $RepoRoot"
}

if (!(Test-Path $AiLocalRoot)) {
  Fail "ai-local directory not found: $AiLocalRoot"
}

$NodeSetupParts = @(
  "`$ErrorActionPreference = 'Stop'",
  "Set-Location '$RepoRoot'",
  "`$env:PREMIUM_V2 = '1'",
  "`$env:PORT = '$NodePort'"
)
if (-not $SkipNodeInstall) {
  $NodeSetupParts += "npm install --no-audit --no-fund"
}
if (-not $SkipDbMigrate) {
  $NodeSetupParts += "npm run db:migrate"
}
$NodeSetupParts += "npm start"
$NodeCommand = $NodeSetupParts -join "; "

$AiLocalSetupParts = @(
  "`$ErrorActionPreference = 'Stop'",
  "Set-Location '$AiLocalRoot'"
)
if (!(Test-Path $AiLocalPython)) {
  $AiLocalSetupParts += "python -m venv .venv"
}
if (-not $SkipAiLocalInstall) {
  $AiLocalSetupParts += "& '$AiLocalPython' -m pip install -e ."
}
$AiLocalSetupParts += "& '$AiLocalPython' -m uvicorn ai_local.main:app --host 127.0.0.1 --port $AiLocalPort"
$AiLocalCommand = $AiLocalSetupParts -join "; "

Start-Process powershell -ArgumentList @(
  "-NoExit",
  "-Command",
  $NodeCommand
)

Start-Process powershell -ArgumentList @(
  "-NoExit",
  "-Command",
  $AiLocalCommand
)

if ($WithHebrewLocal) {
  $HebrewCommand = @(
    "`$ErrorActionPreference = 'Stop'",
    "Set-Location '$RepoRoot'",
    "`$env:TTS_HEBREW_LOCAL_EXPERIMENTAL = 'true'",
    "`$env:TTS_HEBREW_LOCAL_LICENSE_MODE = 'noncommercial'",
    "uv run --with fastapi --with uvicorn --with huggingface_hub --with phonikud --with phonikud-onnx --with piper-onnx --with soundfile uvicorn ai-local.hebrew_tts_sidecar:app --host 127.0.0.1 --port $HebrewLocalPort"
  ) -join "; "

  Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    $HebrewCommand
  )
}

Info "Started Node server window on port $NodePort"
Info "Started ai-local window on port $AiLocalPort"
if ($WithHebrewLocal) {
  Info "Started Hebrew Local Piper window on port $HebrewLocalPort"
} else {
  Info "Hebrew Local Piper not started (product-disabled by default)"
}
Info "Open: http://localhost:$NodePort/"
Info "For phone in the same network: http://<PC-IP>:$NodePort/"
