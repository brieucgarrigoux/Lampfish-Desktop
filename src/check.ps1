# Compiles to a temporary file, then runs the static checks of check.mjs. Prints one line per check; details go to the log.
param([switch]$NoBuild)
$ErrorActionPreference = 'Stop'
$src = $PSScriptRoot
$log = Join-Path $env:TEMP 'lampfish-check.log'
Set-Content $log '' -Encoding utf8
$failed = $false

if (-not $NoBuild) {
    $exe = Join-Path $env:TEMP 'lampfish-check.exe'
    try {
        & (Join-Path $src 'build.ps1') -Output $exe *>&1 | Out-File $log -Append -Encoding utf8
        Remove-Item $exe -Force -ErrorAction SilentlyContinue
        Write-Host 'ok    compile'
    }
    catch {
        $failed = $true
        Write-Host 'FAIL  compile'
        Get-Content $log | Select-String 'error CS' | Select-Object -First 8 | ForEach-Object { Write-Host "      $($_.Line.Trim())" }
    }
}

& node (Join-Path $src 'check.mjs') $log
if ($LASTEXITCODE -ne 0) { $failed = $true }

if ($failed) { Write-Host "Check failed. Details: $log"; exit 1 }
Write-Host 'Check passed.'
