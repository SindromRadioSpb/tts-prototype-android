param([string]$Tag = 'linguistpro/hermes-webui-c2:20260929-3')
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$context = Join-Path $repoRoot '.tmp/hermes-m0/build'
New-Item -ItemType Directory -Force -Path $context | Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Dockerfile.webui') -Destination (Join-Path $context 'Dockerfile')
foreach ($name in @('preserve_audio_bridge.py', 'test_audio_bridge.py', 'patch_installer.py')) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination $context
}
Copy-Item -LiteralPath (Join-Path $repoRoot 'docs/planning/hermes-education-scaleup/2026-07-21/hermes-side/c1-practice/webui-bridge/patch_streaming.py') -Destination (Join-Path $context 'legacy_audio_patch.py')
$prototype = Join-Path $repoRoot 'docs/research/hermes-education-scaleup/rnd-c2-2026-07-25/prototype'
foreach ($name in @('webui-extension', 'token-sidecar')) {
    New-Item -ItemType Directory -Force -Path (Join-Path $context $name) | Out-Null
}
foreach ($name in @('manifest.json', 'c2-live.js', 'c2-live.css', 'start-c2-webui.sh')) {
    Copy-Item -LiteralPath (Join-Path $prototype "webui-extension/$name") -Destination (Join-Path $context 'webui-extension')
}
Copy-Item -LiteralPath (Join-Path $prototype 'token-sidecar/c2_token_sidecar.py') -Destination (Join-Path $context 'token-sidecar')
docker build --tag $Tag $context
if ($LASTEXITCODE -ne 0) { throw 'HERMES_WEBUI_BUILD_FAILED' }
