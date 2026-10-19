# Changelog

All notable changes to Bramble are listed here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Interface zoom: an Interface size choice in Settings and Ctrl plus, Ctrl minus, Ctrl 0 or Ctrl wheel.
- Library: wallpapers made in Create can be edited again, and thumbnails play when hovered.
- Sounds: Expand all and Collapse all for the library.
- Create: its own service to build a wallpaper from your logo and background. Six themes (Midnight, Ember, Aurora, Sunset, Neon, Graphite), five kinds of particles (fireflies, stars, embers, snow, bokeh), an edge shade, a glow, a wave ring or ripples that follow the sound, and a live preview where the logo and the text are dragged, resized with the wheel or a corner handle. The result is a plain folder in `wallpapers\`.
- Moods, in a tab of the Wallpaper service: saves the wallpaper, its effects, the cursor theme and the sounds as one mood, applies it in one click, and can start it every day at a set time or when a chosen number of screens is connected. Night, Focus and Cinema models are built from the current setup.
- Wallpaper: an option to make the wallpaper pulse with the sound playing on the PC. It reads the level Windows reports for every active audio output, without administrator rights and without recording anything.
- Hardware: a card for the devices plugged in now (USB devices and controllers, mouse, keyboard, camera, audio, Bluetooth, storage).
- Network: a Security card under the speed test gauge, with a verdict, three checks (encryption, Windows profile, VPN), the next step to take and a shortcut to the Windows network settings.
- Charts in Hardware and Network show a guide, the value and the time on hover, with a short explanation of what the line is.
- Sounds: two events for the speed test, when it starts and when its results are ready.
- Tasks: its own service listing what is running, grouped by program, with icon, description, publisher, memory and processor use. Filters by kind (apps, developer, background, system) and sortable columns. Programs with a window are asked to close like the X button would; others need a second confirming click. System programs and Bramble itself cannot be ended.
- Arrange: an icon size slider for the desktop icons.
- Settings: a switch for the weather on Home, which is the only call that sends your approximate location to outside services.
- Arrange: every arrangement is remembered. Undo steps back one arrangement at a time (up to ten), and Back to original restores the icons as they were before Bramble first touched them.
- White-line berry and app icon variants (dark, light, violet), in `brand/`.
- Powered by Bramble badge in Settings, About, and in the README.

### Fixed
- Arrange: layouts reach the bottom and right edges of the screen. The grid lost a whole row (about 127 px) and now spreads the leftover space between the icons.
- Settings: clicking a language several times in a row no longer breaks the window.
- French: Start time, Number of screens, Kind of program, Enable and Favorite were still in English, and the Wi-Fi security names (WPA2-Personal) are kept as Windows reports them.
- Icons: the preview size (small, medium, large) now changes the tiles.
- Arrange: the screen map is centered and no longer slides in from the corner, and the icon size slider shows its real position and refreshes the map after a change.

### Changed
- Create: controls on the right, snap guides and a thirds grid, click to type the text, outlines only on hover, small renders as theme thumbnails, particles that no longer reshuffle, effects that can be combined (pulse, ripples, wave ring, vibration), three text styles, a slowly turning gradient.
- Cards in Hardware, Network, Sounds and Create share one casing, and Hardware values sit in a recessed display with a status LED.
- Network: the security seal holds a lit, bevelled shield behind a glass dome.
- Previews in the app react to sound.
- A wallpaper needs a second click (or a second press of Delete) to be removed.
- The violet plate with the white line berry is the official app icon.
- Network: the security card has a control panel look (chrome seal, LED meter, jewel lamps, physical key).
- Sounds: the sound is drawn as a smooth, mirrored waveform with a playhead.
- Hardware: connected devices sit in the first row with battery and temperature.
- Hardware: Power and screens comes first, the middle group is named Performance, and the page is lighter (the details panel is patched in place, the bars animate with transforms).
- The sound reaction eases toward the level, the logo wallpaper draws expanding ripples on each beat, and the level meter in Wallpaper is a symmetrical waveform.
- README: new header, a Badge section, and the services under their own heading.
- Icons: Reset everything names the folders it will reset.
- Hardware: the red zone of the temperature dial now covers 85 to 100 degrees.
- Sounds: the level meter runs from left to right.
- The vertical scroll bar turns violet when hovered.
- Arrange: Undo and Back to original sit under the screen map.
- Settings are written to a temporary file first, so a power cut can no longer leave a corrupted settings file.
- The error log rotates at 256 KB (the previous one is kept as errors.old.log).
- Wallpaper pages can no longer read Bramble's own files (settings, log) from the page.
- When the WebView2 Runtime is missing, Bramble says so and offers the download page.
- New app icon: the white-line berry on a violet plate (executable, taskbar, tray). The header and About keep the plain berry.

## [0.1.0] - 2026-10-19

First public version.

### Added
- Wallpaper: animated wallpapers behind the desktop icons (video, GIF, animated image, HTML page), live preview, blur, saturation, dim, slideshow, pause in full screen and on battery. A Bramble logo wallpaper is included.
- Icons: folder icons from the Windows library (retro pixel and modern), your own icons, favorites, preview size, apply to subfolders, refresh Windows icons, reset every customized folder, right-click menu in File Explorer.
- Mouse: cursor themes, three original pixel-art themes (Berry, Snow, Night), per-role cursors, pointer size buttons, speed, precision, double-click, wheel, trails, shadow, Ctrl locate.
- Sounds: a sound for twelve system events, docking station detection, volume knob that also changes the sound playing, sound library folded by pack, six designed packs (Retro 8-bit, Crystal, Sci-fi, Glass, Chime, Analog), Windows sounds read in place, loudness matching, import of MP3, AAC, OGG, FLAC and WAV.
- Arrange: live map of every screen with the wallpaper behind, sorts, eight arrangements (left, right, top, bottom, frame, center, corners, blocks), layouts saved per screen setup. Unchecking Auto arrange puts every icon back exactly where it was.
- Folders: disk usage as rings, without administrator rights, copy path and names.
- Network: connection and Wi-Fi details, live traffic, a trust level for the current network (Trusted, Be careful, Risky) worked out from the Wi-Fi encryption, the Windows network profile and an active VPN, and a speed test with a dial, jitter, loss, loaded latency graded A to F, what each use needs, test history and a download fallback to OVH when Cloudflare limits tests.
- Hardware: processor, memory, graphics, storage, network, battery with ten lit segments, a temperature card with a needle dial, and screens (brand, size, connection), with a health summary.
- Home page: time, today's weather (Open-Meteo, location from the IP address), the current wallpaper with the real desktop icons on it, one card per service, a power card.
- Settings page (language, start with Windows, data folder, error log, about), English interface with French translation.
- A resizable sidebar and floating scrollbars that never shift the layout.
- Bramble follows its folder: if it is moved or renamed, the desktop shortcut and the start with Windows are repaired.
