# Bramble Desktop

A Windows app to customize and monitor your PC, in one dark, quiet window.

Bramble sits in the system tray and brings together what usually takes five different tools:

| Service | What it does |
| --- | --- |
| **Home** | The time, today's weather, your current wallpaper with your real desktop icons on it, and the state of every service at a glance. |
| **Wallpaper** | Animated wallpapers behind the desktop icons: videos, GIFs, animated images, HTML pages. Pauses on battery or when a window covers the screen. |
| **Icons** | Gives any folder an icon from the Windows library (sorted retro pixel / modern) or your own, from the app or the right-click menu. |
| **Mouse** | Cursor themes (including three original pixel-art themes), per-role cursors, pointer size, speed, double-click, wheel and extras. |
| **Sounds** | A sound for twelve system events (startup, lock, sleep, charger, USB devices, docking station), with a sound library, loudness matching and import. |
| **Arrange** | A live map of your screens (one, two, three or more) to sort and lay out desktop icons, with layouts saved per screen setup. |
| **Folders** | What takes up space on a drive, as rings (in the spirit of DaisyDisk), without administrator rights. |
| **Network** | Connection details, live traffic, and a speed test with jitter, loaded latency (graded A to F) and history. |
| **Hardware** | Processor, memory, graphics, storage, battery and screens, read live, with a plain-language health summary. |

The interface is in English, with a French translation (automatic, following the Windows language, or chosen in Settings).

## Requirements

- Windows 10 or 11 (64-bit)
- [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/) (already installed on Windows 11)
- .NET Framework 4.8 (included in Windows 10 and 11)

## Install

Download `Bramble-<version>.zip` from the [latest release](../../releases/latest), unzip it anywhere and run `Bramble.exe`.
The executable is not signed yet: Windows SmartScreen may ask for confirmation the first time ("More info", then "Run anyway").

## Build from source

```powershell
powershell -ExecutionPolicy Bypass -File src\build.ps1
```

The script uses the C# compiler that ships with Windows (no Visual Studio needed). On first run it downloads the official WebView2 SDK from NuGet into `app\lib\`.

`src\publish.ps1` builds and zips a release into `dist\`. Other generators, in Python 3: `src\icon.py` (app icon), `src\cursors.py` (cursor themes), `src\sounds.py` (sound packs).

## Project layout

```
Bramble.exe          built by src\build.ps1
app\ui\              the settings window (HTML, CSS, JavaScript), translations in locales\
app\player\          the page that plays a wallpaper
app\cursor-themes\   Bramble cursor themes
wallpapers\          wallpapers
sounds\              sound packs
src\                 C# code, build scripts and generators
brand\               logo and badge
```

## Versioning

Bramble follows [Semantic Versioning](https://semver.org/): `MAJOR.MINOR.PATCH`. While the version starts with `0.`, anything may still change. Each release is a Git tag (`v0.1.0`) with a GitHub release, and every change is listed in [CHANGELOG.md](CHANGELOG.md).

## License

[MIT](LICENSE)
