param(
  [string]$Port = "8799"
)

$ErrorActionPreference = "Stop"
$AiLocalRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$BuildRoot = (Resolve-Path (Join-Path $AiLocalRoot ".companion-build")).Path
$ManagedRoot = Join-Path $env:LOCALAPPDATA "LinguistPro\LocalASR"
$PairingFile = Join-Path $ManagedRoot "state\pairing-token"
$Ffmpeg = "C:\ProgramData\chocolatey\lib\ffmpeg\tools\ffmpeg\bin\ffmpeg.exe"
if (-not (Test-Path -LiteralPath $PairingFile)) { throw "Installed Companion pairing token is missing" }
if (-not (Test-Path -LiteralPath $Ffmpeg)) { throw "FFmpeg 8.1 is missing" }

$PairingBefore = (Get-FileHash -LiteralPath $PairingFile -Algorithm SHA256).Hash.ToLowerInvariant()
$Token = (Get-Content -LiteralPath $PairingFile -Raw).Trim()
$Headers = @{ Origin = "https://linguistpro.kolosei.com"; Authorization = "Bearer $Token" }
$SmokeRoot = Join-Path $BuildRoot ("installed-media-" + [Guid]::NewGuid().ToString("N"))
$ResolvedBuildRoot = [IO.Path]::GetFullPath($BuildRoot).TrimEnd('\') + '\'
$ResolvedSmokeRoot = [IO.Path]::GetFullPath($SmokeRoot)
if (-not $ResolvedSmokeRoot.StartsWith($ResolvedBuildRoot, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Installed smoke root escaped the build directory"
}
New-Item -ItemType Directory -Path $SmokeRoot | Out-Null
$Fixture = Join-Path $SmokeRoot "installed-ready.mp4"
$Download = Join-Path $SmokeRoot "downloaded-ready.mp4"
$JobId = $null
$Deleted = $false

function Expect-HttpStatus([scriptblock]$Call, [int]$Expected) {
  try {
    & $Call | Out-Null
    throw "Expected HTTP $Expected but request succeeded"
  } catch {
    $Actual = [int]$_.Exception.Response.StatusCode
    if ($Actual -ne $Expected) { throw }
  }
}

try {
  & $Ffmpeg -hide_banner -loglevel error -f lavfi -i "testsrc2=size=320x240:rate=25" `
    -f lavfi -i "sine=frequency=880:sample_rate=48000" -t 2 `
    -c:v libx264 -profile:v main -level:v 3.1 -pix_fmt yuv420p `
    -c:a aac -profile:a aac_low -movflags +faststart -shortest -y $Fixture
  if ($LASTEXITCODE -ne 0) { throw "Installed smoke fixture failed" }

  Expect-HttpStatus {
    Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$Port/v1/media/jobs/no-such" `
      -Headers @{ Origin = "https://linguistpro.kolosei.com" } -TimeoutSec 5
  } 401
  Expect-HttpStatus {
    Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$Port/v1/media/jobs/no-such" `
      -Headers @{ Origin = "https://evil.example"; Authorization = "Bearer $Token" } -TimeoutSec 5
  } 403

  $Created = Invoke-RestMethod -Method Post `
    -Uri "http://127.0.0.1:$Port/v1/media/jobs?filename=installed-ready.mp4" `
    -Headers $Headers -ContentType "video/mp4" -InFile $Fixture -TimeoutSec 30
  $JobId = $Created.job_id
  for ($Attempt = 0; $Attempt -lt 80; $Attempt++) {
    $Status = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/v1/media/jobs/$JobId" `
      -Headers $Headers -TimeoutSec 5
    if (@("COMPLETE", "FAILED", "BLOCKED", "CANCELED", "WAITING_FOR_DECISION") -contains $Status.state) { break }
    Start-Sleep -Milliseconds 250
  }
  $Report = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/v1/media/jobs/$JobId/report" `
    -Headers $Headers -TimeoutSec 5
  Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$Port/v1/media/jobs/$JobId/file" `
    -Headers $Headers -OutFile $Download -TimeoutSec 30
  $DownloadSha = (Get-FileHash -LiteralPath $Download -Algorithm SHA256).Hash.ToLowerInvariant()
  $Receipt = Invoke-RestMethod -Method Delete -Uri "http://127.0.0.1:$Port/v1/media/jobs/$JobId" `
    -Headers $Headers -TimeoutSec 5
  $Deleted = $true
  $PairingAfter = (Get-FileHash -LiteralPath $PairingFile -Algorithm SHA256).Hash.ToLowerInvariant()
  $Result = [ordered]@{
    unauth_status = 401
    wrong_origin_status = 403
    state = $Status.state
    outcome = $Report.report.outcome
    target_contract = $Report.report.target_contract
    identity_equal = $Report.source_sha256 -eq $Report.output_sha256
    download_sha_matches = $DownloadSha -eq $Report.output_sha256
    audio_profile = $Report.report.codec_summary.audio_profile
    video_codec = $Report.report.codec_summary.video_codec
    delete_schema = $Receipt.schema
    deleted_source = $Receipt.deleted_source
    deleted_output = $Receipt.deleted_output
    pairing_preserved = $PairingBefore -eq $PairingAfter
    mt_model_root_preserved = Test-Path -LiteralPath (Join-Path $ManagedRoot "models\mt")
  }
  $Result | ConvertTo-Json
  if ($Result.state -ne "COMPLETE" -or $Result.outcome -ne "READY" -or
      -not $Result.identity_equal -or -not $Result.download_sha_matches -or
      $Result.delete_schema -ne "media-job-delete-receipt-v1" -or
      -not $Result.deleted_source -or -not $Result.deleted_output -or
      -not $Result.pairing_preserved -or -not $Result.mt_model_root_preserved) {
    throw "Installed Companion Media Readiness gate failed"
  }
} finally {
  if ($JobId -and -not $Deleted) {
    try {
      Invoke-RestMethod -Method Delete -Uri "http://127.0.0.1:$Port/v1/media/jobs/$JobId" `
        -Headers $Headers -TimeoutSec 5 | Out-Null
    } catch {}
  }
  if (Test-Path -LiteralPath $SmokeRoot) {
    Remove-Item -LiteralPath $SmokeRoot -Recurse -Force
  }
}
