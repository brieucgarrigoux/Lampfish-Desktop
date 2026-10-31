# Builds the installer attached to a GitHub release: dist\Lampfish-Setup-<version>.exe
# Ships only what the app needs to run: never settings, logs, caches, or the user's own icons, cursors and sounds.
$ErrorActionPreference = 'Stop'
$src = $PSScriptRoot
$root = Split-Path $src -Parent
& (Join-Path $src 'build.ps1')

$v = (Get-Item (Join-Path $root 'Lampfish.exe')).VersionInfo
$version = "$($v.FileMajorPart).$($v.FileMinorPart).$($v.FileBuildPart)"
$dist = Join-Path $root 'dist'
$tmp = Join-Path $env:TEMP "lampfish-$version"
if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
New-Item -ItemType Directory -Force (Join-Path $tmp 'Lampfish'), $dist | Out-Null
$target = Join-Path $tmp 'Lampfish'

Copy-Item (Join-Path $root 'Lampfish.exe'), (Join-Path $root 'Lampfish.exe.config'), (Join-Path $root 'README.md'), (Join-Path $root 'CHANGELOG.md'), (Join-Path $root 'LICENSE') $target
foreach ($d in 'app\ui', 'app\player', 'app\sounds', 'app\templates', 'app\lib', 'app\cursor-themes', 'brand\logo', 'brand\badge') {
    Copy-Item (Join-Path $root $d) (Join-Path $target $d) -Recurse -Force
}
# Only the wallpapers that come with Lampfish: the ones made or added on this PC stay here.
New-Item -ItemType Directory -Force (Join-Path $target 'wallpapers') | Out-Null
foreach ($f in 'lampfish-logo.html', 'lampfish-dusk.html', 'lampfish.html', 'aurora.html') { Copy-Item (Join-Path $root "wallpapers\$f") (Join-Path $target 'wallpapers') }
Get-ChildItem (Join-Path $target 'brand\badge') | Where-Object { $_.Name -notin 'powered-by-lampfish-color-dark.png', 'powered-by-lampfish-pill.png' } | Remove-Item -Force
New-Item -ItemType Directory -Force (Join-Path $target 'sounds') | Out-Null
Get-ChildItem (Join-Path $root 'sounds') -Directory | Where-Object { $_.Name -ne 'My sounds' } | ForEach-Object {
    Copy-Item $_.FullName (Join-Path $target "sounds\$($_.Name)") -Recurse
}

$iscc = @((Get-Command ISCC.exe -ErrorAction SilentlyContinue).Source, "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe", "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe") | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $iscc) { throw "Inno Setup 6 is missing: winget install JRSoftware.InnoSetup" }
& $iscc /Q "/DVersion=$version" "/DSource=$target" "/O$dist" (Join-Path $src 'installer.iss')
if ($LASTEXITCODE -ne 0) { throw "Installer build failed" }
Remove-Item $tmp -Recurse -Force
$setup = Join-Path $dist "Lampfish-Setup-$version.exe"
# Versions up to 0.4 only look for this name: the same file under it keeps their Update button working.
Copy-Item $setup (Join-Path $dist "Bramble-Setup-$version.exe") -Force
Write-Host "OK: $setup ($([math]::Round((Get-Item $setup).Length / 1MB, 1)) MB)"
