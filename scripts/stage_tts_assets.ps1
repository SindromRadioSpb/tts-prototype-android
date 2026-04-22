$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$TempRoot = Join-Path $RepoRoot ".tmp\tts-stage"
$RuntimeDir = Join-Path $RepoRoot "public\tts\runtime\sherpa-onnx"
$ModelDir = Join-Path $RepoRoot "public\tts\models\en"

$RuntimeBundleUrl = "https://github.com/k2-fsa/sherpa-onnx/releases/download/v1.12.37/sherpa-onnx-wasm-simd-1.12.36-vits-piper-en_US-libritts_r-medium.tar.bz2"
$ModelBundleUrl = "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-en_US-libritts_r-medium.tar.bz2"

New-Item -ItemType Directory -Force $TempRoot, $RuntimeDir, $ModelDir | Out-Null

$RuntimeArchive = Join-Path $TempRoot "runtime.tar.bz2"
$ModelArchive = Join-Path $TempRoot "model.tar.bz2"

Invoke-WebRequest -Uri $RuntimeBundleUrl -OutFile $RuntimeArchive
Invoke-WebRequest -Uri $ModelBundleUrl -OutFile $ModelArchive

tar -xjf $RuntimeArchive -C $TempRoot
tar -xjf $ModelArchive -C $TempRoot

$RuntimeExtractDir = Join-Path $TempRoot "sherpa-onnx-wasm-simd-1.12.36-vits-piper-en_US-libritts_r-medium"
$ModelExtractDir = Join-Path $TempRoot "vits-piper-en_US-libritts_r-medium"

Copy-Item (Join-Path $RuntimeExtractDir "sherpa-onnx-tts.worker.js") (Join-Path $RuntimeDir "sherpa-onnx-tts.worker.js") -Force
Copy-Item (Join-Path $RuntimeExtractDir "sherpa-onnx-tts.js") (Join-Path $RuntimeDir "sherpa-onnx-tts.js") -Force
Copy-Item (Join-Path $RuntimeExtractDir "sherpa-onnx-wasm-main-tts.js") (Join-Path $RuntimeDir "sherpa-onnx-wasm-main-tts.js") -Force
Copy-Item (Join-Path $RuntimeExtractDir "sherpa-onnx-wasm-main-tts.wasm") (Join-Path $RuntimeDir "sherpa-onnx-wasm-main-tts.wasm") -Force
Copy-Item (Join-Path $RuntimeExtractDir "sherpa-onnx-wasm-main-tts.data") (Join-Path $RuntimeDir "sherpa-onnx-wasm-main-tts.data") -Force

Copy-Item (Join-Path $ModelExtractDir "en_US-libritts_r-medium.onnx") (Join-Path $ModelDir "model.onnx") -Force
Copy-Item (Join-Path $ModelExtractDir "en_US-libritts_r-medium.onnx.json") (Join-Path $ModelDir "model.onnx.json") -Force
Copy-Item (Join-Path $ModelExtractDir "tokens.txt") (Join-Path $ModelDir "tokens.txt") -Force
if (Test-Path (Join-Path $ModelDir "espeak-ng-data")) {
  Remove-Item (Join-Path $ModelDir "espeak-ng-data") -Recurse -Force
}
Copy-Item (Join-Path $ModelExtractDir "espeak-ng-data") (Join-Path $ModelDir "espeak-ng-data") -Recurse -Force

@'
const fs = require("node:fs");
const path = require("node:path");
const base = path.join(process.cwd(), "public", "tts", "models", "en", "espeak-ng-data");
const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else files.push("/tts/models/en/espeak-ng-data/" + path.relative(base, full).replace(/\\/g, "/"));
  }
}
walk(base);
files.sort();
fs.writeFileSync(
  path.join(process.cwd(), "public", "tts", "models", "en", "espeak-ng-data.index.json"),
  JSON.stringify({ files }, null, 2) + "\n"
);
'@ | node -

Write-Host "Staged sherpa-onnx runtime + English Piper assets into public/tts/..."
