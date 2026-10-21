# Builds Bramble.exe with the C# compiler that ships with Windows (.NET Framework 4.8).
# On first run, downloads the official WebView2 SDK from NuGet into app\lib\, with the license that must ship with its DLLs.
$ErrorActionPreference = 'Stop'
$src = $PSScriptRoot
$root = Split-Path $src -Parent
$lib = Join-Path $root 'app\lib'
$version = '1.0.4258.31'
$sha256 = '56f7f4b8bf9aee4b8efefbbdd4f67d5f74ebd1b100ed0806da71bf76af481aa9'

if (-not (Test-Path "$lib\WebView2Loader.dll") -or -not (Test-Path "$lib\WebView2-LICENSE.txt")) {
    $tmp = Join-Path $env:TEMP "webview2-$version"
    New-Item -ItemType Directory -Force $tmp, $lib | Out-Null
    Invoke-WebRequest "https://www.nuget.org/api/v2/package/Microsoft.Web.WebView2/$version" -OutFile "$tmp\pkg.zip"
    if ((Get-FileHash "$tmp\pkg.zip" -Algorithm SHA256).Hash -ne $sha256) { throw "WebView2 SDK checksum mismatch" }
    Expand-Archive "$tmp\pkg.zip" "$tmp\x" -Force
    Copy-Item "$tmp\x\lib\net462\Microsoft.Web.WebView2.Core.dll", "$tmp\x\lib\net462\Microsoft.Web.WebView2.WinForms.dll", "$tmp\x\runtimes\win-x64\native\WebView2Loader.dll" $lib
    Copy-Item "$tmp\x\LICENSE.txt" "$lib\WebView2-LICENSE.txt"
    Copy-Item "$tmp\x\NOTICE.txt" "$lib\WebView2-NOTICE.txt"
    Remove-Item $tmp -Recurse -Force
}

# Delete icon.ico to regenerate it from brand\logo.
$ico = Join-Path $src 'icon.ico'
if (-not (Test-Path $ico)) {
    python (Join-Path $src 'icon.py')
    if ($LASTEXITCODE -ne 0) { throw "Icon generation failed" }
}

$csc = "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
# Path options are quoted whole because the folder name may contain spaces.
& $csc /nologo /target:winexe /platform:x64 /optimize+ "/out:$root\Bramble.exe" "/win32icon:$ico" "/resource:$ico,icon.ico" `
    /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.Web.Extensions.dll /r:Microsoft.VisualBasic.dll /r:System.Management.dll `
    "/r:$lib\Microsoft.Web.WebView2.Core.dll" "/r:$lib\Microsoft.Web.WebView2.WinForms.dll" `
    "$src\*.cs"
if ($LASTEXITCODE -ne 0) { throw "Build failed" }
Copy-Item "$src\Bramble.exe.config" $root
Write-Host "OK: $root\Bramble.exe"
