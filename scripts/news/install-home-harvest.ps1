# Hourly harvest from the home PC of the outlets closed to the server (docs/superpowers/specs/2026-11-26-news-sources-expansion-design.md §6.1):
# C14, and the outlets whose Cloudflare answers the server's address with 403 (2026-11-26: Hai Po, Colbo, Kol Ha'ir,
# Geektime, Hayadan). -Outlet takes a comma list; each outlet must be switched to «с ПК» in /news-editor.html → «Издания»,
# or the server refuses its batches.
# Creates a Windows Task Scheduler task that runs scripts/news/harvest.js in push mode every hour.
# The key file holds the lpr_ key issued in /news-editor.html → «Сбор с ПК» (shown once).
#   powershell -ExecutionPolicy Bypass -File scripts\news\install-home-harvest.ps1 -KeyFile C:\Users\me\linguistpro-c14.key -Outlet c14,haipo,colbo,kolhair,geektime,hayadan
param(
  [Parameter(Mandatory = $true)][string]$KeyFile,
  [string]$RepoDir = '',
  [string]$OutDir = (Join-Path $env:USERPROFILE 'linguistpro-c14'),
  [string]$Origin = 'https://linguistpro.kolosei.com',
  [string]$Outlet = 'c14',
  [string]$TaskName = 'LinguistPro C14 harvest'
)
$ErrorActionPreference = 'Stop'
$Outlet = (($Outlet -split ',') | ForEach-Object { $_.Trim() } | Where-Object { $_ -match '^[a-z0-9]+$' }) -join ','
if (-not $Outlet) { throw 'Outlet list is empty' }
# Windows PowerShell 5.1 has no $PSScriptRoot inside param(): the repository folder is found here.
if (-not $RepoDir) { $RepoDir = (Resolve-Path (Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) '..\..')).Path }
if (-not (Test-Path $KeyFile)) { throw "Key file not found: $KeyFile" }
# The task runs in the repository folder: relative paths would point there, so make them absolute now.
$KeyFile = (Resolve-Path $KeyFile).Path
$OutDir = [System.IO.Path]::GetFullPath($OutDir)
$node = (Get-Command node).Source
$script = Join-Path $RepoDir 'scripts\news\harvest.js'
New-Item -ItemType Directory -Force $OutDir | Out-Null
$log = Join-Path $OutDir 'harvest.log'
# cmd /c keeps a log of every run next to the harvest database.
$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"`"$node`" `"$script`" --only $Outlet --out `"$OutDir`" --push $Origin --key-file `"$KeyFile`" >> `"$log`" 2>&1`"" -WorkingDirectory $RepoDir
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Hours 1)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Description "LinguistPro: harvest $Outlet at home and hand it to the server every hour" -Force | Out-Null
Write-Output "Task '$TaskName' runs every hour while you are signed in. Log: $log (clear it from time to time)"
Write-Output "Run once now:  Start-ScheduledTask -TaskName '$TaskName'"
Write-Output "Remove:        Unregister-ScheduledTask -TaskName '$TaskName' -Confirm:`$false"
