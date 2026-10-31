# Builds Lampfish.exe with the C# compiler that ships with Windows (.NET Framework 4.8).
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

# PDFsharp (MIT) reads, merges and writes the PDF files of Convert. The 1.50 line needs nothing else.
$pdfVersion = '1.50.5147'
$pdfSha256 = '23B2DB22069C7BCD8849A1B48345CF2A3A6485592CACC4EFB5D217E9C83141A1'
if (-not (Test-Path "$lib\PdfSharp.dll") -or -not (Test-Path "$lib\PDFsharp-LICENSE.txt")) {
    $tmp = Join-Path $env:TEMP "pdfsharp-$pdfVersion"
    New-Item -ItemType Directory -Force $tmp, $lib | Out-Null
    Invoke-WebRequest "https://www.nuget.org/api/v2/package/PDFsharp/$pdfVersion" -OutFile "$tmp\pkg.zip"
    if ((Get-FileHash "$tmp\pkg.zip" -Algorithm SHA256).Hash -ne $pdfSha256) { throw "PDFsharp checksum mismatch" }
    Expand-Archive "$tmp\pkg.zip" "$tmp\x" -Force
    Copy-Item "$tmp\x\lib\net20\PdfSharp.dll" $lib
    @"
PDFsharp, https://github.com/empira/PDFsharp

Copyright (c) 2005-2016 empira Software GmbH, Troisdorf (Germany)

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
"@ | Set-Content "$lib\PDFsharp-LICENSE.txt" -Encoding utf8
    Remove-Item $tmp -Recurse -Force
}

$ico = Join-Path $src 'icon.ico'

$csc = "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
# Path options are quoted whole because the folder name may contain spaces.
& $csc /nologo /target:winexe /platform:x64 /optimize+ "/out:$root\Lampfish.exe" "/win32icon:$ico" "/resource:$ico,icon.ico" `
    /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.Web.Extensions.dll /r:Microsoft.VisualBasic.dll /r:System.Management.dll `
    "/lib:$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\WPF" /r:System.Runtime.WindowsRuntime.dll /r:PresentationCore.dll /r:WindowsBase.dll /r:System.Xaml.dll /r:Microsoft.CSharp.dll `
    "/r:$lib\Microsoft.Web.WebView2.Core.dll" "/r:$lib\Microsoft.Web.WebView2.WinForms.dll" "/r:$lib\PdfSharp.dll" `
    "$src\*.cs"
if ($LASTEXITCODE -ne 0) { throw "Build failed" }
Copy-Item "$src\Lampfish.exe.config" $root
Write-Host "OK: $root\Lampfish.exe"
