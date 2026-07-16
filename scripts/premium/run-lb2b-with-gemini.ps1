$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$secureKey = Read-Host 'LB2-B Gemini API key' -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
$plainKey = $null

try {
    $plainKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    if ([string]::IsNullOrWhiteSpace($plainKey)) {
        throw 'LB2B_GEMINI_KEY_EMPTY'
    }

    $startInfo = [Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = 'node'
    $startInfo.WorkingDirectory = $repoRoot
    $startInfo.UseShellExecute = $false
    # Windows PowerShell 5.1 exposes Arguments but not ProcessStartInfo.ArgumentList.
    # The value is a fixed repository path, never user-controlled input.
    $startInfo.Arguments = 'scripts/premium/lesson-quality-lb2b.js --config docs/research/lesson-quality/2026-07-16/lb2b-run-config-flash-lite-free.json --out docs/research/lesson-quality/2026-07-16/lb2b-flash-lite-free-run'
    $startInfo.EnvironmentVariables['LB2B_GEMINI_KEY'] = $plainKey

    $process = [Diagnostics.Process]::Start($startInfo)
    $process.WaitForExit()
    exit $process.ExitCode
}
finally {
    $plainKey = $null
    $secureKey = $null
    if ($bstr -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
}
