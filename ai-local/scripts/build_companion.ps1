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
    "C:\ProgramData\chocolatey\lib\ffmpeg\tools\ffmpeg\bin\$Name.exe";
    Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Gyan.FFmpeg_*\ffmpeg-8.1-*\bin\$Name.exe" -File -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName;
    (Get-Command $Name -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -ErrorAction SilentlyContinue)
  ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }
  foreach ($Candidate in $Candidates) {
    $VersionOutput = @(& $Candidate -version 2>$null)
    $VersionExitCode = $LASTEXITCODE
    $VersionLine = $VersionOutput | Select-Object -First 1
    if ($VersionExitCode -eq 0 -and $VersionLine -match "^$Name version 8\.1") {
      return (Resolve-Path -LiteralPath $Candidate).Path
    }
  }
  throw "An actual FFmpeg 8.1 $Name executable (not a package-manager shim) is required"
}

$Ffmpeg = Resolve-ExactFfmpegBinary "ffmpeg"
$Ffprobe = Resolve-ExactFfmpegBinary "ffprobe"
$TorchVersion = & $VenvPython -c "import torch; print(torch.__version__)"
if ($LASTEXITCODE -ne 0) { throw "Pinned torch runtime is required for MADLAD conversion" }
$AccelerateVersion = & $VenvPython -c "import accelerate; print(accelerate.__version__)"
if ($LASTEXITCODE -ne 0) { throw "Pinned accelerate runtime is required for MADLAD conversion" }
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
$InstallerName = "LinguistProLocalAsrCompanion-0.3.0-beta.5-unsigned-internal.exe"
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
  --collect-all accelerate `
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
$MtRuntimeCheckJson = & $BuiltExe --mt-runtime-check
if ($LASTEXITCODE -ne 0) { throw "Frozen Companion MT runtime self-check failed" }
try {
  $MtRuntimeCheck = $MtRuntimeCheckJson | ConvertFrom-Json
} catch {
  throw "Frozen Companion MT runtime self-check returned invalid JSON"
}
if ($MtRuntimeCheck.status -ne "ok" -or $MtRuntimeCheck.torch -notlike "2.5.1*" -or $MtRuntimeCheck.accelerate -ne "1.13.0") {
  throw "Frozen Companion MT runtime self-check returned unpinned dependencies"
}

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
$OriginalBuildSmokePort = $env:AI_LOCAL_BUILD_SMOKE_PORT
$OriginalPairingToken = $env:AI_LOCAL_PAIRING_TOKEN
$SmokePairingToken = [Guid]::NewGuid().ToString("N") + [Guid]::NewGuid().ToString("N")
$PortProbe = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
$PortProbe.Start()
$SmokePort = ([Net.IPEndPoint]$PortProbe.LocalEndpoint).Port
$PortProbe.Stop()
$StartProcess = $null
$StopProcess = $null
$StopFailure = $null
$Health = $null
$HealthError = $null
$MediaStatus = $null
$MediaReport = $null
$MediaDelete = $null
try {
  $env:LOCALAPPDATA = $SmokeRoot
  $env:AI_LOCAL_BUILD_SMOKE_PORT = [string]$SmokePort
  $env:AI_LOCAL_PAIRING_TOKEN = $SmokePairingToken
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
      $Health = Invoke-RestMethod -Uri "http://127.0.0.1:$SmokePort/healthz" -TimeoutSec 2
      break
    } catch {
      $HealthError = $_.Exception.Message
      Start-Sleep -Milliseconds 500
    }
  }
  if (-not $Health) { throw "Frozen Companion did not reach loopback health: $HealthError" }

  $Fixture = Join-Path $SmokeRoot "frozen-ready-fixture.mp4"
  & $Ffmpeg -hide_banner -loglevel error -f lavfi -i "testsrc2=size=320x240:rate=25" `
    -f lavfi -i "sine=frequency=1000:sample_rate=48000" -t 2 `
    -c:v libx264 -profile:v main -level:v 3.1 -pix_fmt yuv420p `
    -c:a aac -profile:a aac_low -movflags +faststart -shortest -y $Fixture
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $Fixture)) {
    throw "Failed to create the frozen Media Readiness fixture"
  }
  $MediaHeaders = @{ Authorization = "Bearer $SmokePairingToken"; Origin = "http://127.0.0.1:3000" }
  $MediaPath = "/v1/media/jobs?filename=frozen-ready-fixture.mp4"
  $MediaCreate = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:$SmokePort$MediaPath" `
    -Headers $MediaHeaders -ContentType "video/mp4" -InFile $Fixture -TimeoutSec 30
  for ($Attempt = 0; $Attempt -lt 60; $Attempt++) {
    $MediaStatus = Invoke-RestMethod -Uri "http://127.0.0.1:$SmokePort/v1/media/jobs/$($MediaCreate.job_id)" `
      -Headers $MediaHeaders -TimeoutSec 5
    if (@("COMPLETE", "FAILED", "BLOCKED", "CANCELED", "WAITING_FOR_DECISION") -contains $MediaStatus.state) { break }
    Start-Sleep -Milliseconds 250
  }
  if ($MediaStatus.state -ne "COMPLETE" -or $MediaStatus.report.outcome -ne "READY") {
    throw "Frozen Companion Media Readiness job did not reach READY"
  }
  $MediaReport = Invoke-RestMethod -Uri "http://127.0.0.1:$SmokePort/v1/media/jobs/$($MediaCreate.job_id)/report" `
    -Headers $MediaHeaders -TimeoutSec 5
  if ($MediaReport.output_sha256 -ne $MediaReport.source_sha256 -or -not $MediaReport.verification.original_bytes) {
    throw "Frozen Companion READY identity proof failed"
  }
  $MediaDelete = Invoke-RestMethod -Method Delete -Uri "http://127.0.0.1:$SmokePort/v1/media/jobs/$($MediaCreate.job_id)" `
    -Headers $MediaHeaders -TimeoutSec 5
  if ($MediaDelete.schema -ne "media-job-delete-receipt-v1" -or -not $MediaDelete.deleted_source -or -not $MediaDelete.deleted_output) {
    throw "Frozen Companion media delete receipt failed"
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
    $env:AI_LOCAL_BUILD_SMOKE_PORT = $OriginalBuildSmokePort
    $env:AI_LOCAL_PAIRING_TOKEN = $OriginalPairingToken
    if (Test-Path -LiteralPath $SmokeRoot) {
      Remove-Item -LiteralPath $SmokeRoot -Recurse -Force
    }
  }
}
if ($StopFailure) { throw $StopFailure }
if ($StopProcess.ExitCode -ne 0) {
  throw "Frozen Companion --stop launcher failed with exit $($StopProcess.ExitCode)"
}
$FfmpegLine = & $Ffmpeg -version | Select-Object -First 1
$BuildReport = [ordered]@{
  schema = "linguistpro-local-ai-companion-build-v2"
  generated_at = [DateTime]::UtcNow.ToString("o")
  source_commit = (git -C $RepoRoot rev-parse HEAD)
  source_worktree_dirty = [bool](@(git -C $RepoRoot status --porcelain --untracked-files=normal).Count)
  source_input_changes = @(
    git -C $RepoRoot status --porcelain --untracked-files=normal -- `
      ai-local/ai_local ai-local/pyproject.toml ai-local/installer ai-local/scripts/build_companion.ps1 `
      ai-local/THIRD_PARTY_NOTICES.md docs/LOCAL_ASR_COMPANION_GUIDE.md `
      docs/LOCAL_ASR_COMPANION_GUIDE.en.md docs/LOCAL_ASR_COMPANION_GUIDE.he.md
  )
  companion_version = "0.3.0-beta.5"
  signing_status = $SigningStatus
  frozen_executable = $BuiltExe
  frozen_smoke = [ordered]@{
    start_exit_code = $StartProcess.ExitCode
    health_status = $Health.status
    health_models = @($Health.models.psobject.Properties.Name)
    stop_exit_code = $StopProcess.ExitCode
  }
  frozen_media_readiness = [ordered]@{
    state = $MediaStatus.state
    outcome = $MediaReport.report.outcome
    target_contract = $MediaReport.report.target_contract
    source_sha256 = $MediaReport.source_sha256
    output_sha256 = $MediaReport.output_sha256
    original_bytes = $MediaReport.verification.original_bytes
    delete_schema = $MediaDelete.schema
    deleted_source = $MediaDelete.deleted_source
    deleted_output = $MediaDelete.deleted_output
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
  mt_conversion_runtime = [ordered]@{
    torch = $TorchVersion
    accelerate = $AccelerateVersion
  }
  mt_runtime_check = $MtRuntimeCheck
  external_distribution_authorized = $true
  distribution_scope = "OWNER_AND_TRUSTED_USERS_OUT_OF_BAND"
  public_hosting_authorized = $false
}
$BuildReport.source_input_dirty = [bool](@($BuildReport.source_input_changes).Count)

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

$ProducedArtifacts = @(Get-ChildItem -LiteralPath $ArtifactRoot -File | Where-Object { $_.Name -eq $InstallerName } | ForEach-Object {
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
