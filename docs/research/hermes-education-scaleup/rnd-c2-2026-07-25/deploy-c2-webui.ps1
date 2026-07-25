[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$oldImage = 'linguistpro/hermes-webui-c1:20260724-1'
$newImage = 'linguistpro/hermes-webui-c2:20260725-1'
$composePath = 'G:\HERMES_AGENT\docker-compose.hermex.yml'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..\..')).Path
$prototypeDir = Join-Path $PSScriptRoot 'prototype'
$dockerfile = Join-Path $prototypeDir 'webui-extension\Dockerfile'
$receiptDir = Join-Path $repoRoot '.tmp\h3-c2-deploy'
$receiptPath = Join-Path $receiptDir 'receipt.json'
$backupPath = "$composePath.c2-rollback"
$deploymentStarted = $false
$previousPasswordPresent = Test-Path Env:HERMES_WEBUI_PASSWORD
$previousPassword = if ($previousPasswordPresent) { $env:HERMES_WEBUI_PASSWORD } else { $null }

function Write-Receipt([string]$status, [string]$detail) {
    New-Item -ItemType Directory -Force $receiptDir | Out-Null
    [ordered]@{
        status = $status
        detail = $detail
        timestamp = [DateTimeOffset]::Now.ToString('o')
        old_image = $oldImage
        new_image = $newImage
        compose = $composePath
    } | ConvertTo-Json | Set-Content -LiteralPath $receiptPath -Encoding utf8
}

function Wait-WebuiHealth {
    for ($attempt = 1; $attempt -le 30; $attempt++) {
        try {
            $health = Invoke-RestMethod -Uri 'http://localhost:8787/health' -TimeoutSec 3
            if ($health.status -eq 'ok') { return $true }
        } catch {}
        Start-Sleep -Seconds 2
    }
    return $false
}

try {
    if (-not (Test-Path -LiteralPath $composePath -PathType Leaf)) { throw 'COMPOSE_NOT_FOUND' }
    if (-not (Test-Path -LiteralPath $dockerfile -PathType Leaf)) { throw 'DOCKERFILE_NOT_FOUND' }
    docker version --format '{{.Server.Version}}' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'DOCKER_UNAVAILABLE' }

    $before = Get-Content -Raw -LiteralPath $composePath
    $oldNeedle = "image: $oldImage"
    $newNeedle = "image: $newImage"
    $oldAnchorCount = [regex]::Matches($before, [regex]::Escape($oldNeedle)).Count
    $newAnchorCount = [regex]::Matches($before, [regex]::Escape($newNeedle)).Count
    if (($oldAnchorCount + $newAnchorCount) -ne 1) {
        throw "EXPECTED_C1_OR_C2_IMAGE_ANCHOR_COUNT:$oldAnchorCount,$newAnchorCount"
    }
    $configuredImage = if ($oldAnchorCount -eq 1) { $oldImage } else { $newImage }
    $runningImage = docker inspect hermes-webui --format '{{.Config.Image}}'
    if ($LASTEXITCODE -ne 0 -or $runningImage.Trim() -ne $configuredImage) {
        throw "RUNNING_IMAGE_MISMATCH:configured=$configuredImage;running=$runningImage"
    }
    if ([string]::IsNullOrWhiteSpace($env:HERMES_WEBUI_PASSWORD)) {
        $containerEnvironmentJson = docker inspect hermes-webui --format '{{json .Config.Env}}'
        if ($LASTEXITCODE -ne 0) { throw 'RUNNING_CONTAINER_ENV_UNAVAILABLE' }
        $containerEnvironment = $containerEnvironmentJson | ConvertFrom-Json
        $passwordEntry = $containerEnvironment | Where-Object { $_ -like 'HERMES_WEBUI_PASSWORD=*' } | Select-Object -First 1
        if ([string]::IsNullOrWhiteSpace($passwordEntry)) { throw 'RUNNING_CONTAINER_PASSWORD_UNAVAILABLE' }
        $env:HERMES_WEBUI_PASSWORD = $passwordEntry.Substring('HERMES_WEBUI_PASSWORD='.Length)
        $containerEnvironmentJson = $null
        $containerEnvironment = $null
        $passwordEntry = $null
    }
    if (-not (Wait-WebuiHealth)) { throw 'PREDEPLOY_HEALTH_FAILED' }

    docker build --pull=false --file $dockerfile --tag $newImage $prototypeDir
    if ($LASTEXITCODE -ne 0) { throw 'IMAGE_BUILD_FAILED' }
    docker image inspect $newImage --format '{{.Id}}' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'CANDIDATE_IMAGE_MISSING' }

    if ($configuredImage -eq $oldImage) {
        Copy-Item -LiteralPath $composePath -Destination $backupPath -Force
    } elseif (-not (Test-Path -LiteralPath $backupPath -PathType Leaf)) {
        throw 'C1_ROLLBACK_COMPOSE_MISSING'
    }
    $rollback = Get-Content -Raw -LiteralPath $backupPath
    if ([regex]::Matches($rollback, [regex]::Escape($oldNeedle)).Count -ne 1) {
        throw 'C1_ROLLBACK_IMAGE_ANCHOR_INVALID'
    }
    $after = $before.Replace($oldNeedle, $newNeedle)
    Set-Content -LiteralPath $composePath -Value $after -Encoding utf8 -NoNewline

    docker compose --file $composePath config --quiet
    if ($LASTEXITCODE -ne 0) { throw 'COMPOSE_CONFIG_INVALID' }
    $deploymentStarted = $true
    docker compose --file $composePath up -d --no-deps --force-recreate hermes-webui
    if ($LASTEXITCODE -ne 0) { throw 'WEBUI_RECREATE_FAILED' }
    if (-not (Wait-WebuiHealth)) { throw 'POSTDEPLOY_HEALTH_FAILED' }

    $deployedImage = docker inspect hermes-webui --format '{{.Config.Image}}'
    if ($deployedImage.Trim() -ne $newImage) { throw "DEPLOYED_IMAGE_MISMATCH:$deployedImage" }
    Write-Receipt 'PASS' "deployed=$deployedImage"
    Write-Host "C2_WEBUI_DEPLOY_PASS receipt=$receiptPath"
} catch {
    $failure = $_.Exception.Message
    if ($deploymentStarted -and (Test-Path -LiteralPath $backupPath -PathType Leaf)) {
        Copy-Item -LiteralPath $backupPath -Destination $composePath -Force
        docker compose --file $composePath up -d --no-deps --force-recreate hermes-webui | Out-Null
        Wait-WebuiHealth | Out-Null
    }
    $failureStatus = if ($deploymentStarted) { 'FAIL_ROLLED_BACK' } else { 'FAIL_NO_MUTATION' }
    Write-Receipt $failureStatus $failure
    throw "C2_WEBUI_DEPLOY_FAILED:$failure; receipt=$receiptPath"
} finally {
    if ($previousPasswordPresent) {
        $env:HERMES_WEBUI_PASSWORD = $previousPassword
    } else {
        Remove-Item Env:HERMES_WEBUI_PASSWORD -ErrorAction SilentlyContinue
    }
    $previousPassword = $null
}
