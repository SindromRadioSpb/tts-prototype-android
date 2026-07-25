param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('cafe', 'directions', 'plans')]
    [string]$Scenario,

    [Parameter(Mandatory = $true)]
    [string]$Device
)

$ErrorActionPreference = 'Stop'
$prototypeDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$runner = Join-Path $prototypeDir 'c2-session.mjs'
$secretLine = docker exec hermes-agent sh -lc "grep '^GEMINI_API_KEY=' /home/hermes/.hermes/.env | head -1"
if (-not $secretLine -or -not $secretLine.StartsWith('GEMINI_API_KEY=')) {
    throw 'GEMINI_API_KEY_NOT_FOUND_IN_HERMES'
}

$env:C2_GEMINI_API_KEY = $secretLine.Substring($secretLine.IndexOf('=') + 1)
$processExitCode = 0
try {
    & node $runner --scenario $Scenario --device $Device --confirm-free-tier YES_I_CONFIRMED_FREE_TIER
    $processExitCode = $LASTEXITCODE
}
finally {
    Remove-Item Env:C2_GEMINI_API_KEY -ErrorAction SilentlyContinue
    $secretLine = $null
}
exit $processExitCode
