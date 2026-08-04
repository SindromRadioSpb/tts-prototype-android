param(
  [string]$Python = "py -3.11",
  [switch]$SkipInstaller
)

$ErrorActionPreference = "Stop"
$AiLocalRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$RepoRoot = (Resolve-Path (Join-Path $AiLocalRoot "..")).Path
$BuildRoot = Join-Path $AiLocalRoot ".companion-build"
$VenvRoot = Join-Path $BuildRoot "venv"
$VenvPython = Join-Path $VenvRoot "Scripts\python.exe"
$DistRoot = Join-Path $AiLocalRoot "dist"
$ArtifactRoot = Join-Path $AiLocalRoot "artifacts"

New-Item -ItemType Directory -Force -Path $BuildRoot,$ArtifactRoot | Out-Null

if (-not (Test-Path -LiteralPath $VenvPython)) {
  $PythonParts = $Python -split " "
  & $PythonParts[0] $PythonParts[1..($PythonParts.Count - 1)] -m venv $VenvRoot
  if ($LASTEXITCODE -ne 0) { throw "Failed to create build virtual environment" }
}

& $VenvPython -m pip install --upgrade "pip<26" wheel
if ($LASTEXITCODE -ne 0) { throw "Failed to prepare build pip tooling" }
& $VenvPython -m pip install "$AiLocalRoot[runtime]" "pyinstaller>=6.10,<7" `
  "nvidia-cudnn-cu12==9.10.2.21" "nvidia-cublas-cu12==12.1.3.1"
if ($LASTEXITCODE -ne 0) { throw "Failed to install pinned Companion build dependencies" }

function Resolve-ExactFfmpegBinary([string]$Name) {
  $Candidates = @(
    "C:\ProgramData\chocolatey\lib\ffmpeg\tools\ffmpeg\bin\$Name.exe"
    Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Gyan.FFmpeg_*\ffmpeg-8.1-*\bin\$Name.exe" -File -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName
    (Get-Command $Name -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -ErrorAction SilentlyContinue)
  ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }
  foreach ($Candidate in $Candidates) {
    $VersionLine = & $Candidate -version 2>$null | Select-Object -First 1
    if ($LASTEXITCODE -eq 0 -and $VersionLine -match "^$Name version 8\.1") {
      return (Resolve-Path -LiteralPath $Candidate).Path
    }
  }
  throw "An actual FFmpeg 8.1 $Name executable (not a package-manager shim) is required"
}

$Ffmpeg = Resolve-ExactFfmpegBinary "ffmpeg"
$Ffprobe = Resolve-ExactFfmpegBinary "ffprobe"
$Notices = Join-Path $AiLocalRoot "THIRD_PARTY_NOTICES.md"
$GuideRu = Join-Path $RepoRoot "docs\LOCAL_ASR_COMPANION_GUIDE.md"
$GuideEn = Join-Path $RepoRoot "docs\LOCAL_ASR_COMPANION_GUIDE.en.md"
$GuideHe = Join-Path $RepoRoot "docs\LOCAL_ASR_COMPANION_GUIDE.he.md"
$SitePackages = Join-Path $VenvRoot "Lib\site-packages"
$CudnnBin = Join-Path $SitePackages "nvidia\cudnn\bin"
$CublasBin = Join-Path $SitePackages "nvidia\cublas\bin"
$CudaBinaryArgs = @()
Get-ChildItem $CudnnBin,$CublasBin -File -Filter *.dll | ForEach-Object {
  $CudaBinaryArgs += @("--add-binary", "$($_.FullName);cuda")
}
$CudnnLicense = Join-Path $SitePackages "nvidia_cudnn_cu12-9.10.2.21.dist-info\licenses\License.txt"
$CublasLicense = Join-Path $SitePackages "nvidia_cublas_cu12-12.1.3.1.dist-info\License.txt"
$InstallerName = "LinguistProLocalAsrCompanion-0.3.0-beta.2-unsigned-internal.exe"
$PreviousInstaller = Join-Path $ArtifactRoot $InstallerName
foreach ($PriorArtifact in @($PreviousInstaller, (Join-Path $ArtifactRoot "build-report.json"))) {
  if (Test-Path -LiteralPath $PriorArtifact) {
    Remove-Item -LiteralPath $PriorArtifact -Force
  }
}

& $VenvPython -m PyInstaller `
  --noconfirm `
  --clean `
  --onedir `
  --console `
  --hide-console hide-early `
  --name LinguistProLocalAsrCompanion `
  --distpath $DistRoot `
  --workpath (Join-Path $BuildRoot "pyinstaller") `
  --specpath $BuildRoot `
  --collect-all faster_whisper `
  --collect-all ctranslate2 `
  --collect-all transformers `
  --collect-all sentencepiece `
  --collect-all safetensors `
  --collect-all av `
  --collect-all tokenizers `
  --hidden-import uvicorn.logging `
  --hidden-import uvicorn.loops.auto `
  --hidden-import uvicorn.protocols.http.auto `
  --hidden-import uvicorn.protocols.websockets.auto `
  --hidden-import uvicorn.lifespan.on `
  --hidden-import ai_local.mt_convert_worker `
  --add-binary "$Ffmpeg;bin" `
  --add-binary "$Ffprobe;bin" `
  --add-data "$Notices;." `
  --add-data "$GuideRu;docs" `
  --add-data "$GuideEn;docs" `
  --add-data "$GuideHe;docs" `
  --add-data "$CudnnLicense;licenses/nvidia-cudnn-cu12" `
  --add-data "$CublasLicense;licenses/nvidia-cublas-cu12" `
  $CudaBinaryArgs `
  (Join-Path $AiLocalRoot "ai_local\companion.py")
if ($LASTEXITCODE -ne 0) { throw "PyInstaller failed; no installer may be produced from stale dist output" }

$BuiltExe = Join-Path $DistRoot "LinguistProLocalAsrCompanion\LinguistProLocalAsrCompanion.exe"
if (-not (Test-Path -LiteralPath $BuiltExe)) { throw "Frozen Companion executable was not produced" }

$SignTool = Get-Command signtool -ErrorAction SilentlyContinue
$CodeSigningCerts = @(Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert -ErrorAction SilentlyContinue)
$SigningStatus = if ($SignTool -and $CodeSigningCerts.Count -gt 0) { "AVAILABLE_NOT_APPLIED" } else { "UNSIGNED_INTERNAL_ONLY" }

$SmokeRoot = Join-Path $BuildRoot ("frozen-smoke-" + [Guid]::NewGuid().ToString("N"))
$ResolvedBuildRoot = [IO.Path]::GetFullPath($BuildRoot).TrimEnd('\') + '\'
$ResolvedSmokeRoot = [IO.Path]::GetFullPath($SmokeRoot)
if (-not $ResolvedSmokeRoot.StartsWith($ResolvedBuildRoot, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Frozen smoke root escaped the build directory"
}
New-Item -ItemType Directory -Force -Path $SmokeRoot | Out-Null
$OriginalLocalAppData = $env:LOCALAPPDATA
$StartProcess = $null
$StopProcess = $null
$StopFailure = $null
$Health = $null
$HealthError = $null
try {
  $env:LOCALAPPDATA = $SmokeRoot
  $StartProcess = Start-Process -FilePath $BuiltExe -ArgumentList "--start" -WindowStyle Hidden -PassThru
  if (-not $StartProcess.WaitForExit(30000)) {
    Stop-Process -Id $StartProcess.Id -Force
    throw "Frozen Companion --start launcher did not exit within 30 seconds"
  }
  if ($StartProcess.ExitCode -ne 0) {
    throw "Frozen Companion --start launcher failed with exit $($StartProcess.ExitCode)"
  }
  for ($Attempt = 0; $Attempt -lt 20; $Attempt++) {
    try {
      $Health = Invoke-RestMethod -Uri "http://127.0.0.1:8799/healthz" -TimeoutSec 2
      break
    } catch {
      $HealthError = $_.Exception.Message
      Start-Sleep -Milliseconds 500
    }
  }
} finally {
  try {
    $StopProcess = Start-Process -FilePath $BuiltExe -ArgumentList "--stop" -WindowStyle Hidden -PassThru
    if (-not $StopProcess.WaitForExit(30000)) {
      Stop-Process -Id $StopProcess.Id -Force
      $StopFailure = "Frozen Companion --stop launcher did not exit within 30 seconds"
    }
  } catch {
    $StopFailure = "Frozen Companion cleanup failed: $($_.Exception.Message)"
  } finally {
    $env:LOCALAPPDATA = $OriginalLocalAppData
    if (Test-Path -LiteralPath $SmokeRoot) {
      Remove-Item -LiteralPath $SmokeRoot -Recurse -Force
    }
  }
}
if ($StopFailure) { throw $StopFailure }
if ($StopProcess.ExitCode -ne 0) {
  throw "Frozen Companion --stop launcher failed with exit $($StopProcess.ExitCode)"
}
if (-not $Health) { throw "Frozen Companion did not reach loopback health: $HealthError" }
$FfmpegLine = & $Ffmpeg -version | Select-Object -First 1
$BuildReport = [ordered]@{
  schema = "linguistpro-local-ai-companion-build-v2"
  generated_at = [DateTime]::UtcNow.ToString("o")
  source_commit = (git -C $RepoRoot rev-parse HEAD)
  source_worktree_dirty = [bool](@(git -C $RepoRoot status --porcelain --untracked-files=normal).Count)
  companion_version = "0.3.0-beta.2"
  signing_status = $SigningStatus
  frozen_executable = $BuiltExe
  frozen_smoke = [ordered]@{
    start_exit_code = $StartProcess.ExitCode
    health_status = $Health.status
    health_models = @($Health.models.psobject.Properties.Name)
    stop_exit_code = $StopProcess.ExitCode
  }
  ffmpeg = $FfmpegLine
  ffmpeg_binary = $Ffmpeg
  ffprobe_binary = $Ffprobe
  cuda_runtime = [ordered]@{
    cudnn_package = "nvidia-cudnn-cu12==9.10.2.21"
    cublas_package = "nvidia-cublas-cu12==12.1.3.1"
    bundled_dlls = @(Get-ChildItem $CudnnBin,$CublasBin -File -Filter *.dll | Select-Object -ExpandProperty Name)
  }
  model_bundled = $false
  mt_model_bundled = $false
  mt_install_source = "exact pinned Hugging Face revision with post-conversion runtime SHA-256 gate"
  external_distribution_authorized = $false
}

if (-not $SkipInstaller) {
  $IsccCandidates = @(@(
    (Get-Command iscc -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -ErrorAction SilentlyContinue),
    "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe",
    "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
    "$env:ProgramFiles\Inno Setup 6\ISCC.exe"
  ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) })
  if (-not $IsccCandidates) { throw "Inno Setup 6 is required to build the installable artifact" }
  $Iscc = $IsccCandidates | Select-Object -First 1
  & $Iscc (Join-Path $AiLocalRoot "installer\LinguistProLocalAsr.iss")
  if ($LASTEXITCODE -ne 0) { throw "Inno Setup compiler failed" }
  if (-not (Test-Path -LiteralPath $PreviousInstaller)) { throw "Inno Setup did not produce the expected installer" }
}

$ProducedArtifacts = @(Get-ChildItem -LiteralPath $ArtifactRoot -File | Where-Object { $_.Name -ne "build-report.json" } | ForEach-Object {
  [ordered]@{
    name = $_.Name
    bytes = $_.Length
    sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    authenticode_status = (Get-AuthenticodeSignature -LiteralPath $_.FullName).Status.ToString()
  }
})
$BuildReport.artifacts = $ProducedArtifacts
$BuildReport | ConvertTo-Json -Depth 8 | Set-Content -Encoding utf8 (Join-Path $ArtifactRoot "build-report.json")

Write-Host "Companion build complete. Signing status: $SigningStatus"
Write-Host "Artifacts: $ArtifactRoot"
