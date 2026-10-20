# Changelog

All notable changes to Bramble are listed here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Modes start when a chosen app opens or when headphones are plugged in, and the previous setup comes back when the app closes or the headphones are removed (unless something was changed meanwhile). A mode can also open apps or files when it is applied.
- Mouse: your own cursor themes. Cursors changed by hand show Modified with Save as a theme and Discard; your themes can be renamed, updated, duplicated and removed (with undo), and any theme can be duplicated to start from it.
- Network: the connection test shows a signal travelling to the next step, a turning ring on the step being measured, and each finished step pops and shows its result; a bubble explains each step.
- `Bramble.exe --quit` closes a running Bramble.
- Wallpaper per screen: a selector under the large preview picks every screen or one of them, and a badge on each wallpaper shows the screens it covers. Slideshow, modes, removal and Next wallpaper follow it.
- Wallpapers fade through black when they change.
- Power saving: a Frame rate choice (30 or 60 images a second) for every HTML wallpaper, and the wallpaper pauses while the session is locked.
- Shuffle for the slideshow and for Next wallpaper, without repeating the current wallpaper or showing it on two screens when there is a choice.
- Videos, GIFs and images pulse lightly with the sound when React to sound is on.
- A dark tray menu: Open Bramble, Next wallpaper, Pause or resume the wallpaper, Modes, Sounds and Quit.
- Undo after applying a mode, resetting the cursors, applying an icon to subfolders, resetting every folder icon, loading a sound pair and clearing the test history. Removing a mode can be undone instead of confirmed.
- Back to original for the mouse and folder icons: Bramble remembers how they were before it first changed them, pointer speed, precision, double-click, wheel and extras included.
- Modes: start on mains power or on battery, export a mode to a file and import one, with a preview first (a wallpaper or cursor theme missing on this PC is reported, nothing is ever run).
- Tasks: search by name, description or publisher (Ctrl F, Escape clears it), and a sheet for each program with its publisher, version, size and location, whether it starts with Windows and its open network connections.
- Hardware: Copy summary puts the main specs in the clipboard, ready to paste in a message.
- Home, rebuilt in two columns that fit the window: the desktop preview with Pause, Next and the modes, This PC (processor, memory, disk, battery, network), and shortcuts to Icons, Arrange, Mouse, Sounds and Tasks.
- Settings: a Connections group that lists every outside service Bramble talks to and when, and an update check (off by default, once a day, or Check now).
- Keyboard: Ctrl 1 to 9 open the services in the order of the bar, Ctrl Tab the next one, Ctrl comma the settings.
- The window remembers its size, position and maximized state.

### Changed
- Moods are now called Modes and have their own place at the top of the bar.
- Create: the name and the Create button sit next to the title instead of covering the themes, every setting of the panel has its icon, Click to type and Add your logo stay on one line however small the box, and the editor starts fresh after the window is closed.
- Arrange: the icon size is one of five sizes (Very small to Very large) instead of a slider, and icons are laid out again after a size change so they never overlap.
- Arrange: every arrangement is even, with the same margin left and right, the last row close to the taskbar and an exact centre. Arranging turns off Windows' Align icons to grid, which pulled the icons back to its own grid.
- Network: the security lights are smaller, set into the card with a soft glow, and each check keeps its explanation on one line.
- Sounds: the lights above the volume knob turn grey only when the sounds are off or silenced.
- Mouse: role names sit further from the selection frame, and Bramble Glass is no longer pixelated in the theme list.
- The Person cursor of the pixel themes has a new badge.
- The tray tooltip just says Bramble.
- One design system across the app: the same corner radii, text sizes, switches, buttons, selection and focus ring everywhere, and explanation lines easier to read.
- The title bar is dark, like the window.
- Cards keep their relief without the heavy shadow, with a fine light edge instead.
- The chosen row of a list has a violet tint and a violet icon (Sounds, Icons, Folders, Tasks), and pressed tool buttons share one style.
- The rail gets more compact on short windows so every service stays visible.
- Narrow windows scroll as one page below 900 px, and the window can now be as small as 720 x 560.
- Home opens first on a new install, and each service keeps its scroll position.
- Browser shortcuts (print, find, reload) no longer work in the window.
- Previews in Home, Wallpaper and Arrange react to sound only when React to sound is on.
- The large preview shows the wallpaper at the proportions of the real screen, and fades in.
- Hovering a wallpaper fades its animation in instead of reloading it.
- Edit and Remove sit together on a wallpaper card, and Remove asks to Confirm.
- Arrange shows the sort in use, and each screen of the map shows its own wallpaper with its number under it.
- Mouse: the pointer size reads in pixels in the panel too, role names fit on two lines, and each role's tooltip names its file.
- Network: the step being measured fills its line as the test goes.
- Settings are regrouped: General, Connections, Data, About.
- The drop zone is a dashed frame that says which files are expected, and loading states share one small spinner.
- Starting with Windows uses the --background option (--discret still works).

### Fixed
- Folders: Run the analysis again lost its icon and its explanation, the analyzed source lost its icon, and the centre of the rings cut its numbers.
- Hardware: the disk read speed was labelled Playing, long values crushed the labels in the panel, and a card left alone on the last row now spans the width.
- Mouse: the 16 px pointer size read as 1, and cursor themes whose files were deleted showed empty cards.
- Wallpaper: the armed Remove button covered Edit, and No wallpaper selected was misspelled.
- Arrange: undoing the removal of a layout did nothing.
- Modes: Active stayed shown after the settings had changed, and two modes with the same settings were both shown as Active.
- Mouse: cursors picked by hand were saved in a hidden theme named Bramble that looked like a built-in one. It is now one of your themes.
- Arrange: Align to grid read and changed the wrong Windows setting, so it never worked and the arrangements could not be even.
- The thumbnail of a wallpaper edited in Create showed the old version until Bramble restarted.
- The window could not be opened again after another program had closed it.
- Windows Search showed a blank Bramble when the Start menu shortcut kept an old icon path. Bramble now repairs it, like the desktop shortcut.
- Home: 1 events on read wrong.
- Desktop: when File Explorer recreates the window behind the icons, the wallpaper reattaches instead of reloading every screen, and wallpaper windows are attached the way Windows expects.
- Cursors: the click point of the pixel themes was half a cell off (arrow tip, precision cross, hand), the pixel themes get a 16 px size, Bramble Glass gets a 48 px size for its animated cursors, and the busy cursors turn at the same pace.
- Create: the draft survives a language change, and its duplicate Reset row is gone.
- Dropping an image from a browser explains that it must be saved first.
- Frozen previews no longer repaint (Aurora and wallpapers made in Create), and wallpapers made in Create no longer draw faster than 60 images a second.

## [0.2.0] - 2026-10-19

### Added
- Interface zoom: an Interface size choice in Settings and Ctrl plus, Ctrl minus, Ctrl 0 or Ctrl wheel.
- Library: wallpapers made in Create can be edited again, and thumbnails play when hovered.
- Sounds: Expand all and Collapse all for the library.
- Mouse: animated cursors play in the role grid when hovered or clicked.
- Mouse: a 16 px pointer size, a smooth, antialiased theme with a light glint (Bramble Glass).
- Create: its own service to build a wallpaper from your logo and background. Six themes (Midnight, Ember, Aurora, Sunset, Neon, Graphite), five kinds of particles (fireflies, stars, embers, snow, bokeh), an edge shade, a glow, a wave ring or ripples that follow the sound, and a live preview where the logo and the text are dragged, resized with the wheel or a corner handle. The result is a plain folder in `wallpapers\`.
- Moods, in a tab of the Wallpaper service: saves the wallpaper, its effects, the cursor theme and the sounds as one mood, applies it in one click, and can start it every day at a set time or when a chosen number of screens is connected. Night, Focus and Cinema models are built from the current setup.
- Wallpaper: an option to make the wallpaper pulse with the sound playing on the PC. It reads the level Windows reports for every active audio output, without administrator rights and without recording anything.
- Hardware: a card for the devices plugged in now (USB devices and controllers, mouse, keyboard, camera, audio, Bluetooth, storage).
- Network: a Security card under the speed test gauge, with a verdict, three checks (encryption, Windows profile, VPN), the next step to take and a shortcut to the Windows network settings.
- Charts in Hardware and Network show a guide, the value and the time on hover, with a short explanation of what the line is.
- Sounds: an event for the start of the speed test.
- Network: a soft note plays each time a step of the test completes (router, Internet, DNS, download, upload), following the Sounds switches and volume. The notes are synthesized by `src\sounds.py` into `app\sounds`.
- Wallpapers: Bramble logo is the default and comes first, then Bramble dusk, Bramble and Aurora. Aurora is four soft flowing ribbons with a luminous edge over a starry sky, Bramble has drifting haze, dust and a vignette.
- Wallpapers: Bramble logo is rebuilt on the Create engine (deep violet gradient, embers, glow, wave ring, ripples) and a second one, Bramble dusk, joins it. Both come from `src\wallpapers.py`.
- Tasks: its own service listing what is running, grouped by program, with icon, description, publisher, memory and processor use. Filters by kind (apps, developer, background, system) and sortable columns. Programs with a window are asked to close like the X button would; others need a second confirming click. System programs and Bramble itself cannot be ended.
- Arrange: an icon size slider for the desktop icons.
- Settings: a switch for the weather on Home, which is the only call that sends your approximate location to outside services.
- Arrange: every arrangement is remembered. Undo steps back one arrangement at a time (up to ten), and Back to original restores the icons as they were before Bramble first touched them.
- White-line berry and app icon variants (dark, light, violet), in `brand/`.
- Powered by Bramble badge in Settings, About, and in the README.

### Fixed
- Narrow windows: below 900 px the rail stays pinned and the side panel moves below the content, and below 620 px the rail shows icons only. A window snapped to half the screen keeps every menu reachable.
- Create: the edge shade darkens all four edges.
- Arrange: layouts reach the bottom and right edges of the screen. The grid lost a whole row (about 127 px) and now spreads the leftover space between the icons.
- Settings: clicking a language several times in a row no longer breaks the window.
- French: Start time, Number of screens, Kind of program, Enable and Favorite were still in English, and the Wi-Fi security names (WPA2-Personal) are kept as Windows reports them.
- Icons: the preview size (small, medium, large) now changes the tiles.
- Create: the active gradient direction was highlighted on the opposite arrow.
- Network: the test card no longer shifts when the test ends, the lines under the gauge keep their height.
- Narrow windows: the Home header wraps and the Tasks tabs scroll instead of overflowing.
- Arrange: the screen map is centered and no longer slides in from the corner, and the icon size slider shows its real position and refreshes the map after a change.

### Changed
- Selection no longer uses corner brackets: a flat violet pill in the rail, an accent ring elsewhere.
- Hardware is a 12 column dashboard: processor beside memory, then graphics, temperature and battery, then devices, screens, storage and network. The status LEDs are gone.
- Sounds: the console is a 28 band LED equalizer driven by the real spectrum of the sound, the volume dial lights its LEDs as it turns, and Listen and the connection test share one pill button.
- Create: every slider resets, ten gradient presets and eight directions, shadow and drift are sliders, a color for rings and ripples, a vibration strength, Particles can stop reacting, wave ring and pulse are on by default.
- Create: controls on the right, snap guides and a thirds grid, click to type the text, outlines only on hover, small renders as theme thumbnails, particles that no longer reshuffle, effects that can be combined (pulse, ripples, wave ring, vibration), three text styles, a slowly turning gradient.
- Cards in Hardware, Network and Sounds share one casing, Hardware values sit in a recessed display, and the Create panel uses the same flat groups as the other panels.
- Network: the security seal holds a lit, bevelled shield behind a glass dome, the verdict and the three checks use LEDs in metal housings, and the test steps are a stepper with icons.
- Previews in the app (Wallpaper, Create, Home and Arrange) react to sound.
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
