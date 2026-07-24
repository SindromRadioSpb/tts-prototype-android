param(
    [Parameter(Mandatory = $true)][string]$Manifest,
    [Parameter(Mandatory = $true)][string]$OutputDir
)

$ErrorActionPreference = 'Stop'
$manifestPath = (Resolve-Path -LiteralPath $Manifest).Path
$outputPath = [System.IO.Path]::GetFullPath($OutputDir)
[System.IO.Directory]::CreateDirectory($outputPath) | Out-Null

Add-Type -AssemblyName System.Speech
$synth = [System.Speech.Synthesis.SpeechSynthesizer]::new()
try {
    $synth.SelectVoice('Microsoft Asaf')
    $rows = Import-Csv -LiteralPath $manifestPath -Delimiter "`t"
    foreach ($row in $rows) {
        $tokens = $row.sentence.Split(' ', [System.StringSplitOptions]::RemoveEmptyEntries)
        $index = [int]$row.target_index
        $punctuation = if ($tokens[$index] -match '([.!?]+)$') { $Matches[1] } else { '' }
        $tokens[$index] = $row.spoken_target_vocalized + $punctuation
        $utterance = $tokens -join ' '
        $destination = Join-Path $outputPath $row.audio_file
        $synth.SetOutputToWaveFile($destination)
        $synth.Speak($utterance)
        $synth.SetOutputToNull()
    }
}
finally {
    $synth.Dispose()
}

Get-ChildItem -LiteralPath $outputPath -Filter '*.wav' | Measure-Object | Select-Object Count
