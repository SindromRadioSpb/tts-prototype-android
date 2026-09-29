param([string]$Compiler="$env:LOCALAPPDATA/Programs/Inno Setup 6/ISCC.exe")
$ErrorActionPreference='Stop'
$root=Split-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) -Parent
if(-not(Test-Path -LiteralPath $Compiler)){throw 'Install Inno Setup 6 before building the pilot installer.'}
& $Compiler /Q (Join-Path $PSScriptRoot '../installer.iss')
if($LASTEXITCODE -ne 0){throw 'Installer build failed'}
$artifact=Join-Path $root '.tmp/tutor-installer/LinguistProTutor-0.1.0-beta.2.exe'
$hash=(Get-FileHash -LiteralPath $artifact -Algorithm SHA256).Hash.ToLowerInvariant()
$manifest=[ordered]@{version='0.1.0-beta.2';url='/api/tutor/downloads/LinguistProTutor-0.1.0-beta.2.exe';sha256=$hash;unsigned=$true;audience='limited-pilot';requires=@('Windows','Docker Desktop','supported Hermes 0.21.5')}
[IO.File]::WriteAllText((Join-Path (Split-Path $artifact) 'latest.json'),($manifest|ConvertTo-Json),[Text.UTF8Encoding]::new($false))
Write-Output ($manifest|ConvertTo-Json -Compress)
