param(
    [int]$Port = 8765,
    [string]$AllowedProductionOrigin = 'https://linguistpro.kolosei.com'
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$python = Join-Path $repoRoot '.tmp\h3-c1-venv\Scripts\python.exe'
$entry = Join-Path $PSScriptRoot 'c1_companion.py'
$details = Join-Path $repoRoot '.tmp\h3-c1-results\details.json'
$profile = Join-Path $repoRoot '.tmp\c1-experimental\profile.json'
$token = Join-Path $repoRoot '.tmp\c1-experimental\token.txt'
$scratch = Join-Path $repoRoot '.tmp\c1-experimental\requests'
$phonikud = Join-Path $repoRoot '.tmp\phonikud-1.0.int8.onnx'
$torchHome = Join-Path $repoRoot '.tmp\torch-cache'

foreach ($required in @($python, $entry, $phonikud)) {
    if (-not (Test-Path -LiteralPath $required -PathType Leaf)) {
        throw "C1 companion prerequisite is missing: $required"
    }
}

if (-not (Test-Path -LiteralPath $profile -PathType Leaf)) {
    if (-not (Test-Path -LiteralPath $details -PathType Leaf)) {
        throw "Local calibration details are missing: $details"
    }
    & $python $entry build-profile --details $details --output $profile
    if ($LASTEXITCODE -ne 0) { throw "C1 profile build failed with exit $LASTEXITCODE" }
}

$env:PYTHONUTF8 = '1'
$env:TORCH_HOME = $torchHome
& $python $entry serve `
    --profile $profile `
    --phonikud-model $phonikud `
    --torch-home $torchHome `
    --scratch-dir $scratch `
    --token-file $token `
    --port $Port `
    --allowed-origin $AllowedProductionOrigin `
    --allowed-origin 'http://localhost:3000' `
    --allowed-origin 'http://127.0.0.1:3000'
