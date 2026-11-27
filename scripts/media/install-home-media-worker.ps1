# The home PC worker of the Mediatheque video queue (docs/superpowers/specs/2026-11-27-mediatheque-video-pipeline-design.md §5.3).
# Creates a Windows Task Scheduler task that runs scripts/media/home-worker.js every 10 minutes: it takes the queued
# YouTube videos one by one, downloads the audio with yt-dlp, runs the ASR tool (windowed-review, CUDA) and hands the
# ASR ZIP to the server. The key file holds the same lpr_ key as the news harvest (/news-editor.html -> "Sbor s PK").
#   powershell -ExecutionPolicy Bypass -File scripts\media\install-home-media-worker.ps1 -KeyFile C:\Users\me\linguistpro-c14.key
param(
  [Parameter(Mandatory = $true)][string]$KeyFile,
  [string]$RepoDir = '',
  [string]$WorkDir = 'F:\LinguistPro_MediaQueue',
  [string]$AsrRoot = 'F:\datasets_models\LinguistPro_ASR_Tool',
  [string]$Origin = 'https://linguistpro.kolosei.com',
  [string]$TaskName = 'LinguistPro media worker'
)
$ErrorActionPreference = 'Stop'
# Windows PowerShell 5.1 has no $PSScriptRoot inside param(): the repository folder is found here.
if (-not $RepoDir) { $RepoDir = (Resolve-Path (Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) '..\..')).Path }
if (-not (Test-Path $KeyFile)) { throw "Key file not found: $KeyFile" }
if (-not (Test-Path (Join-Path $AsrRoot 'asr_tool.py'))) { throw "ASR tool not found in $AsrRoot" }
# The worker spawns yt-dlp directly: only a real .exe works (a .cmd/.ps1/.bat shim would fail to start).
$ytDlp = (Get-Command yt-dlp -ErrorAction Stop).Source
if ([System.IO.Path]::GetExtension($ytDlp) -ne '.exe') { throw "yt-dlp must be an .exe (found $ytDlp). Install it with: winget install yt-dlp.yt-dlp" }
# The task runs in the repository folder: relative paths would point there, so make them absolute now.
$KeyFile = (Resolve-Path $KeyFile).Path
$WorkDir = [System.IO.Path]::GetFullPath($WorkDir)
$node = (Get-Command node).Source
$script = Join-Path $RepoDir 'scripts\media\home-worker.js'
New-Item -ItemType Directory -Force $WorkDir | Out-Null
$log = Join-Path $WorkDir 'worker.log'
# cmd /c keeps a log of every run next to the downloaded audio.
$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"`"$node`" `"$script`" --push $Origin --key-file `"$KeyFile`" --work `"$WorkDir`" --asr-root `"$AsrRoot`" --yt-dlp `"$ytDlp`" >> `"$log`" 2>&1`"" -WorkingDirectory $RepoDir
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 10)
# A 2-hour video takes minutes on the GPU; several queued videos can take hours, so the limit is generous.
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 6) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Description 'LinguistPro: queued YouTube videos -> audio -> ASR -> server, every 10 minutes' -Force | Out-Null
Write-Output "Task '$TaskName' runs every 10 minutes while you are signed in. Log: $log"
Write-Output "Run once now:  Start-ScheduledTask -TaskName '$TaskName'"
Write-Output "Remove:        Unregister-ScheduledTask -TaskName '$TaskName' -Confirm:`$false"
