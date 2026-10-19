# Builds the release zip attached to a GitHub release: dist\Bramble-<version>.zip
# Ships only what the app needs to run: never settings, logs, caches, or the user's own icons, cursors and sounds.
$ErrorActionPreference = 'Stop'
$src = $PSScriptRoot
$root = Split-Path $src -Parent
& (Join-Path $src 'build.ps1')

$v = (Get-Item (Join-Path $root 'Bramble.exe')).VersionInfo
$version = "$($v.FileMajorPart).$($v.FileMinorPart).$($v.FileBuildPart)"
$dist = Join-Path $root 'dist'
$tmp = Join-Path $env:TEMP "bramble-$version"
if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
New-Item -ItemType Directory -Force (Join-Path $tmp 'Bramble'), $dist | Out-Null
$target = Join-Path $tmp 'Bramble'

Copy-Item (Join-Path $root 'Bramble.exe'), (Join-Path $root 'Bramble.exe.config'), (Join-Path $root 'README.md'), (Join-Path $root 'CHANGELOG.md'), (Join-Path $root 'LICENSE') $target
foreach ($d in 'app\ui', 'app\player', 'app\sounds', 'app\templates', 'app\lib', 'app\cursor-themes', 'brand\logo', 'brand\badge', 'wallpapers') {
    Copy-Item (Join-Path $root $d) (Join-Path $target $d) -Recurse -Force
}
Get-ChildItem (Join-Path $target 'wallpapers') -Filter *.lnk | Remove-Item -Force
foreach ($f in 'berry-white.png', 'berry-black.png') { Remove-Item (Join-Path $target "brand\logo\$f") -ErrorAction SilentlyContinue }
Get-ChildItem (Join-Path $target 'brand\badge') | Where-Object { $_.Name -notin 'powered-by-bramble-color-dark.png', 'powered-by-bramble-pill.png' } | Remove-Item -Force
New-Item -ItemType Directory -Force (Join-Path $target 'sounds') | Out-Null
Get-ChildItem (Join-Path $root 'sounds') -Directory | Where-Object { $_.Name -ne 'My sounds' } | ForEach-Object {
    Copy-Item $_.FullName (Join-Path $target "sounds\$($_.Name)") -Recurse
}

$zip = Join-Path $dist "Bramble-$version.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path $target -DestinationPath $zip
Remove-Item $tmp -Recurse -Force
Write-Host "OK: $zip ($([math]::Round((Get-Item $zip).Length / 1MB, 1)) MB)"
