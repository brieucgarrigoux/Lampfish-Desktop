# Changelog

All notable changes to Bramble are listed here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- A question mark next to the title of every page opens a short note on what the page is for, what it reads and what it changes, with a link to the full list in Settings.
- Settings: a Plugins section lists what is added to lampfish, starting with Claude usage. What comes from a plugin carries its tag and its own color, on Home and in the companion.
- Settings, Companion: the tabs of the companion window can be hidden or shown one by one.
- Home: a row of actions under the header, each one a single click: Capture, Note, Convert, Free up memory, Refresh icons and Straighten. The Desktop tab of the companion also refreshes the folder icons.
- Audio: a new service that shows every output and input of the PC as a tile, with its format, live level, volume and mute. A click makes a device the default for every app, with Undo. Devices that are not plugged in are folded under one line.
- Audio: a keyboard shortcut, off by default, switches to the next output from any app and shows its name in a small bubble. It is Ctrl + Alt + F11 unless other keys are chosen.
- Health: a Privacy card turns off, for this user, the sharing settings of Windows such as the advertising ID, the suggestions and the typing data, with Undo. A setting locked by an organization is shown and left alone.
- Themes: a theme also brings back the audio output it was made with, when that device is plugged in.
- The bar can be arranged: Arrange the bar, at its foot, lets you drag a service inside its family, move the families, and hide a service with a click. Ctrl 1 to 9 follow the new order. Reset puts the bar back, with Undo.
- Notes: a new service for notes in Markdown, with a formatting bar, a reading view where tasks can be ticked, and search. They save themselves at each change, as the pill next to their name says. The notes are plain .md files, in Bramble's folder or in a folder of an Obsidian vault, and open in Obsidian with one click; a change made in Obsidian shows up, Bramble never overwrites it without asking, and a chosen folder that goes missing is said.
- Shelf: a new service that keeps copies of files dropped on it and every capture. A card dragged out drops its file in another app, and Copy puts the file and its picture in the clipboard at once.
- Capture: a zone, a window or a whole screen, now or in 3 seconds. The image goes to the shelf and the clipboard, and a click on the note that follows opens it to draw on: pen, line, arrow, frame, ellipse, highlighter, numbered steps, text, pixelation and crop.
- Companion: a round button that sits anywhere on the screen, off until turned on, opens a small window to write a note, take a capture or glance at the processor, memory, theme, audio output and last notes. Ctrl Alt S captures, Ctrl Alt N writes a note and Ctrl Alt B shows or hides it, each shortcut can be changed or turned off.
- Claude usage: when turned on in Settings, Connections, Bramble reads the sign-in of Claude Code and shows the session and the week used of a Claude plan, on Home and in the companion. The answer comes from a call Anthropic does not document, so an unexpected answer is shown as unknown.
- Home: the cards of Notes, Shelf and Claude usage can be pinned.
- A short welcome on the very first start: what Bramble does, a wallpaper to pick, and four choices (start with Windows, check for updates, the companion, weather on Home). Home then keeps a First steps card until its five steps are done or it is hidden.
- Home can be customized: any service can have its card at the bottom, the cards and the three blocks move with a drag or the arrow keys, and a block can be hidden. Reset Home puts it back, with Undo.
- What is dragged follows the pointer and the rest slides out of its way, in the bar, on Home and in the categories of Arrange, instead of jumping.

- Taskbar: a new service that shows and changes what Windows lets a user set for the taskbar (alignment, search, Task View, Widgets, the show desktop corner, seconds in the clock, combining windows, the taskbar on every screen, automatic hiding), with Undo and a button that puts everything back as it was.
- Convert: a new service that changes the kind of a file on the PC, with nothing sent anywhere. Images become PNG, JPG, BMP, GIF, TIFF, an icon or a PDF; a PDF becomes images, is merged, cut or turned; text and Office documents become a PDF. The results go to the Shelf, and any card of the Shelf can be sent to it.
- Go to: Ctrl K opens a search that goes to any service by name. Home is an item of the bar.
- Home: the cards sit in any cell of a grid, an empty cell stays empty, and a button in the corner of a card changes its size.
- Arrange: Straighten the icons seats every desktop icon in the nearest cell of the grid, with Undo.
- Day mode: Settings, Appearance offers Dark, Day (a soft light gray page, the fish in black) or Like Windows. The windows, the title bar, the companion window and its button follow; the dials and screens stay dark like the instruments they are.
- Magnetic grid: the cells of the desktop grid show on every screen while the desktop is in front, and Windows seats every icon let go in the nearest one, with its own Align to grid, turned on with the grid and put back as it was when the grid goes off. It can be turned on in Arrange or from the Desktop tab of the companion, and replaces the Align to grid switch.
- Companion: a Desktop tab (grid, straighten, hide the icons, wallpaper previous, pause and next), and the Claude session and week as two dials next to the processor and memory. The Home card of Claude usage shows both as bars.
- Wallpaper: a note offers to slow down the slideshow of Windows when it changes the picture more than once a day, because each change makes a live wallpaper blink. Undo and uninstalling put the interval back.
- Companion: tabs for the Shelf, Audio, Notes and Convert, a dashboard with the dials, the disk, the theme (changed with arrows) and the audio output, and the window grows out of the button.

### Changed
- Home: the cards shown until you choose yours are Convert, Notes, Health, Arrange, Sounds and Tasks; Icons and Mouse stay a click away in Pin to Home.
- Every page has one of two widths: 900 px for settings and lists, 1120 px for a gallery, a plan or instruments; Convert is centered like the others.
- The interface size control at the bottom right shows only under the pointer, with the keyboard, or for a moment after a zoom, so it no longer covers the page.
- The first screen of the welcome says in a line what each family holds.
- The bar on the left: each family is one button that opens its services beside it, and the arrow keys walk its buttons.
- A state is a lamp and a word instead of a tinted capsule, and a state that is normal says nothing: the Up to 10 pill of Startup and the All good pill of Hardware are gone.
- Shelf is called Dépôt in French.
- The interface moves from violet to turquoise on dark gray surfaces, the application is now called lampfish, and the bar, the window and the application icon carry the new fish mark.
- Folders is now called Storage, the word Windows uses for the space on its drives.
- Sounds: the volume and the microphone of Windows moved to Audio.
- Network: the top card shows the connection on the glass of a round seal, the Wi-Fi lit in violet, instead of an icon and separate signal bars. The security level is three lit arcs instead of three bars.
- The frames of seals, ring dials and screens are brushed steel, like the dial of the speed test.
- Home: the face and the shield each have their own bubble, and the shield opens Protection.
- Health: when the PC is too hot, the finding names the program that uses the processor the most, with Tasks, or offers to choose the power mode.
- Health: the Processor measure names the program that uses it the most.
- Home keeps three columns in a laptop window and uses more of a large screen.
- The arrow keys of the bar open the service they move to.
- Network: how far the network can be trusted shows only in the Security card, no longer also at the top.
- Display: a click on a screen of the map makes it the main screen, as in Arrange.
- Themes: the three steps are drawn larger, with a plain mouse instead of the cursor in use.
- Home: in a narrow window, the wallpaper controls sit in one row beside the preview, and two columns put them under it.

### Fixed
- Home: the header stayed on one line only in a wide window; Customize is a button that keeps its place.
- Create: the gray lines of the side panel were cut at the usual width of the panel.
- French: the lines of the magnetic grid, the taskbar choices, the appearance choice and a few others were cut.
- A message that is not a state could stop the page with an error.
- Shelf: a file added from an old folder landed at the end of the list and looked as if nothing had happened; Open the folder did nothing; the Mouse folder button also opened the Shelf.
- Audio: the highlight of a card stopped at the volume.
- Taskbar: a setting that Windows 11 refuses to change (Widgets on 25H2) no longer looks changed with an Undo; the toggle goes back and a note opens Windows Settings.
- Companion: the button no longer follows the pointer after a release that never reached it, the window shows only once it is drawn instead of a black rectangle, and the button answers a click with a press, a pulse and a halo.
- Bar: the lamp of a family no longer overlaps its name, the flyout no longer swaps when the pointer crosses another family on its way, and the selected service has the same flat look as the other selections.
- Convert: the page starts from what there is to do, and keeps the last files made.
- Desktop icons: the last row of a full column stops 8 px above the taskbar instead of 23.
- Notes: Delete, the bin of a row and the Delete key ask for a second click, within 4 seconds, before a note goes.
- Companion: the button could vanish while it was dragged, or move on a plain click, or stay hidden after a failed capture. It now stays in front, except for a game, a film or a presentation.
- Health: the program named as the busiest could be the page engine of Bramble itself, Microsoft Edge WebView2. Its processes now count for the app that shows them.
- Sounds: Reset everything turned on the dock sounds. Only the sound of the speed test is on by default.
- Home: HTML wallpapers filled a quarter of their thumbnail in the side panel.
- Duplicates: the ring of the Search button turned in jerks during a search.
- Health: a program turned off in Startup could switch back on while Health was still reading the PC, and needed a second click.
- Main screen: the desktop icons are placed once Windows has finished moving them, and put back if Windows moves them again. Layouts saved with other screens keep their positions, and the automatic restore of a layout no longer pulls the icons back to the old main screen.
- Home: in a narrow window, the weather kept its details and fell on a line of its own.

## [0.4.0] - 2026-10-22

### Added
- Settings: What Bramble reads and changes lists, for every service, what it reads, what it changes in Windows and how to undo it, folded until it is opened.
- Duplicates, a new service in the PC family: it finds files of 1 MB or more stored twice on a drive or in a folder, compared byte for byte, and keeps searching while another page is open. Copies in Downloads or named as a copy are ticked under Safe to clean; the same file in two folders of the user waits, unticked, under Look first. Projects, game libraries and synced folders are left out. Clean up first shows the space freed and the files kept, then sends the ticked copies to the Recycle Bin; each copy also has its own bin, the last copy always stays, and Restore puts a file back in its folder.
- Folders: the folder being read sits in a small card under the rings.
- Settings: each service can leave the bar and the shortcuts of Home, from its line in What Bramble reads and changes; it keeps working. The connection test and the public IP can be turned off.
- Health is also on Home: the lit face and the lit shield say how the PC is doing and open Health. In a narrow window, the side panel of Home opens as a drawer over the page instead of below it.
- The bar on the left has a small button to fold or unfold every family at once, on the line of the first family. The names of the services and the section titles turn violet under the pointer.
- Wallpaper, Create, Sounds and Arrange: Reset everything at the bottom of the side panel, as in Icons. A first click shows what will be reset, a second confirms, and Undo stays for 8 seconds. Create keeps the logo, the text and the picture; Wallpaper keeps the wallpaper; Arrange puts the icons back where they were before Bramble first moved them.
- Themes: a cross on the cover of a theme removes it, with Undo.
- Arrange: a click on a screen of the map that is not the main one makes it the main screen.
- Display and Arrange: the desktop icons follow the main screen. Those of the old main screen move to the new one, cell for cell, and an arrangement made by Bramble is made again on the new main screen.
- Home: Processor, Memory, Disk, Battery and Network open their details in the side panel instead of leaving Home; Disk leads to the analysis of what takes space.
- A small control at the bottom right changes the interface size and shows its percentage; a click on the percentage goes back to 100 %. It keeps its own size whatever the zoom and stays put when the window moves to a screen with another scale. Settings keeps its Small, Default, Large and Larger sizes.
- Themes: the three steps at the top, from set up to save to bring back, are three numbered icons on a dotted path that explain the service, and Import is a button.
- Health, a new service at the head of the PC family. Why is my PC slow? measures the processor, memory, disk activity, days since the last restart, free space and heat, gives a verdict with a lit face and turns what is too high into a finding with its button. Protection checks the antivirus, firewall, Windows updates, a pending restart, disk encryption, Secure Boot and account control. Startup names the programs that start with Windows and what they cost. Health needs no administrator rights.
- Home: the desktop preview opens the wallpapers in the side panel (pick one, light, speed, effects, sound), a Themes card under the wallpaper, with its icon and the active theme, opens every theme with a click to apply it, and the Display title, which replaces Quick settings, opens the brightness of each screen and the choice of the main screen.
- Settings: Weather location picks the city of the weather by name (searched with Open-Meteo), for when the IP address gives a wrong place. Automatic goes back to the IP address.
- Bramble comes as an installer, Bramble-Setup-<version>.exe, instead of a zip: it installs for the current user without administrator rights, with a desktop shortcut and Start with Windows as options, checks that .NET Framework 4.8 and the WebView2 Runtime are there, and appears in the installed apps of Windows. Installing a new version over the old one keeps the settings and files.
- Uninstalling puts back what would break without Bramble: cursors and cursor schemes that use its files, folder icons taken from its own icons, the right-click menu, Start with Windows and its shortcuts. It asks whether to keep the settings and files for a later install.
- Settings: when a new version is out and Bramble was installed with the installer, Install it downloads it, checks that the file is exactly the one published on GitHub, installs it and restarts Bramble, with the settings kept.
- Windows controls: dark mode in Display and on Home, the volume of Windows and the microphone in Sounds and on Home, and whether File Explorer shows file extensions and hidden files in Folders. Each change can be undone, a theme can hold dark mode, and What Bramble reads and changes lists them.
- Health, Startup: each program that starts with Windows shows its own icon, its publisher and a switch that stops it from starting with Windows, as the startup apps of Windows do, with Undo. Programs set for every user say so and lead to Windows, which asks for administrator rights.
- Ring dials and the instruments of Home give details in a bubble on hover or keyboard focus (frequency, busiest program, free and total space, thresholds), in Home, Tasks, Duplicates, Hardware and Health.
- Home: a click on the active theme turns it off and brings back the setup from before it, with Undo.

### Changed
- Home: This PC shows small ring dials for the processor, memory and disk, and the instruments of Hardware for the rest: a needle thermometer for heat, cells in relief for the battery and lit arcs for Wi-Fi; each opens its details in the side panel.
- Every list icon is drawn in the same gray across the app: those of Line quality and What the connection can do in Network were white.
- In a narrow window, the bar on the left keeps only its icons when the window is not tall enough to show every service, and the side panel opens as a drawer from an Options button instead of falling below the page.
- Sounds: an event that is off shows its sound dimmed instead of struck through. Arrange no longer repeats that one click arranges the icons.
- Network: the security card draws its shield in light, with a tick, a warning or a cross after the level (the old shield kept its tick when something was wrong), shows its verdict on a screen in a metal bezel and lists its checks.
- Tasks: the card at the top shows three ring dials, memory in use, what can be freed and the processor; a click on the second opens Free up memory.
- Hardware: the top card shows a ring dial for the processor, memory, graphics, storage, battery and heat, with the same thresholds as Health; a click shows the details, and the cards below keep their history and details without repeating the value. Connected devices names the USB devices plugged in.
- Home: when Cloudflare cannot give the approximate location for the weather, country.is (free and open source) takes over, and Settings lists it with the other connections.
- Network: the Wi-Fi details (network, band, channel, standard, protection, speed) are read from the Wi-Fi API of Windows instead of the text of a command, whose wording changes with the language and the version of Windows.
- Mouse: Bramble Glass comes first among the Bramble cursor themes, in the library and in the Home panel.
- Health: the verdict names what slows the PC and its effect, such as "12 programs slow the start" with "Windows takes longer to be ready", instead of a count of things; with several causes, all are named.
- Screens, seals and ring dials are made of dark anodized metal and black glass with a faint reflection, instead of shiny chrome and stripes of gloss.
- Home: the face and the shield of Health sit in the top bar. A wide window shows three columns (wallpaper, This PC, Display and Sounds) that fit a full-screen laptop window without scrolling; a narrow one puts the wallpaper preview beside its buttons. The Wi-Fi drawn in relief also replaces the signal bars of Network and fills the Network card of Hardware.
- Themes: the three steps at the top show the current wallpaper, cursor and sounds, then a theme card, then what brings it back (a click, a time, a headset), without the line under them.
- Health: the bubble of each measure ring says in a word how it is doing (Moderate, Busy, Restarted lately, Enough room, Warm).

### Fixed
- The interface size control at the bottom right takes the new size at once and keeps its place, even with quick clicks or the mouse wheel; the Options button above it keeps the same size.
- The dot on a service of the bar that has news sits at the end of its line when the bar shows the names.
- In a narrow window, the bar on the left scrolled away with the page and jumped back at each click: it now stays in place.
- Display: making another screen the main one failed with a laptop and an external screen at different scales; the screens now move together in one change. Wallpapers chosen for one screen, in themes too, and saved icon arrangements follow the move.
- Arrange: Corners and Blocks share the icons evenly between their blocks, in category order, as in their pictures: one block per category gave one huge block and lone icons. While the main screen changes, the map waits for the screens and the icons to settle.
- Settings: the cities found for the weather open inside the card, under the search field.
- Arrange: Left, Right, Top, Bottom and Center no longer start a new line for each category, which left lines with a single icon: the categories follow each other in their order, and Center is a compact block as in its picture. The sides of Frame stay on the rows of the grid, so both sides line up.
- Arrange: the names of the icons in the first column spilled a few pixels onto the next screen, and those of the last column were cut: Windows draws an icon and its name wider than its cell, and the margins now take that width into account. The map of Arrange and the Home preview use the same width.
- Hardware: the battery and the thermometer are centered in their screen.
- Ring dials sit exactly in the middle of their seal at every interface scale, the glass around them is lit evenly, and the metal frame of rings, seals and screens keeps the same width all around: its lower half used to fade into the background.
- Home: Heat, Battery and Wi-Fi no longer grow taller than their drawing.
- Themes: the three steps at the top are evenly spaced.

## [0.3.0] - 2026-10-21

### Added
- The titled sections of the side panel, and the three families of the bar on the left, fold and unfold with a click on their title, including the panels that a service redraws (hardware details, theme settings, Create). They stay folded until Bramble is closed and always start unfolded. A folded family shows a dot when it holds the service being shown, and a bar narrowed to icons shows everything.
- Arrange: My arrangements keeps the icons as they are now under a name, with a small picture of each, so they can be put back later. Save current sits next to Undo and Back to original, and the same tiles are in the Home panel.
- Home is a control center: a click on Icons, Arrange, Mouse, Sounds or Tasks opens that service in the side panel, with a link to the full page, instead of leaving Home. Arrange offers the arrangements and your saved ones, Mouse the cursor themes, Sounds the volume and every event, Icons its folders.
- Display: a Brightness setting for each screen that allows it, the laptop screen and external screens that accept commands from the PC (DDC/CI).
- Folders: a Languages card shows the share of each programming language in the analyzed folder, like on GitHub, leaving out dependencies, app data and system folders.
- The services of the left bar can be reached with the up and down arrow keys, Home and End.
- Display, a new service for the screen: a map of the screens to pick the main one (where the Start menu and new windows open, with undo), Warm screen with its strength for warmer colors in the evening (through the color filter of Windows accessibility, which goes away with Bramble), a link to the Night light of Windows, when the screen turns off and when the PC goes to sleep, plugged in and on battery, and Energy saver kept on whenever the PC runs on battery. Every change can be undone.
- Home: the same warm screen, energy saver, screen and sleep settings as shortcuts under This PC.
- Home: a Previous button next to Pause and Next, so the wallpapers can be walked in both directions.
- Tasks: a Memory card at the top shows how full the memory is and how much closing the programs not in use would free, with a Free up memory button. It lists the programs that can be closed without risk, never Windows, security, drivers, file sync, remote access, programs playing sound, Bramble or the app in use. The ticked ones close like with their X, programs without a window stop, after a warning and a confirming click. Above 80 %, the memory row of Home leads there.
- Mouse: the cursor library is sorted by family. All shows every theme; Bramble, Windows and My cursors show their themes, then each of their cursors, so one cursor of a Bramble theme can replace a single role.
- Themes: each theme has an icon on its cover, picked among 13 in its settings (Night, Focus and Cinema get a moon, a target and a film), a theme can warm the screen (Night does), and three steps at the top explain how themes work.
- Themes are visual: each theme shows its own wallpaper as a cover, dimmed as it will be on the desktop, with its cursors, sounds and triggers as icons, and a play button applies it. A click opens its settings in the side panel (what it brings back, when it starts by itself, what it opens, export, remove). A New theme tile saves the current setup, and the models show the current wallpaper with their effect.
- Arrange: the screen map draws each icon at its real size, with its name under it.
- Themes start when a chosen app opens or when headphones are plugged in, and the previous setup comes back when the app closes or the headphones are removed (unless something was changed meanwhile). A theme can also open apps or files when it is applied.
- Mouse: your own cursor themes. Cursors changed by hand show Modified with Save as a theme and Discard; your themes can be renamed, updated, duplicated and removed (with undo), and any theme can be duplicated to start from it.
- Network: the connection test shows a signal travelling to the next step, a turning ring on the step being measured, and each finished step pops and shows its result; a bubble explains each step.
- `Bramble.exe --quit` closes a running Bramble.
- Wallpaper per screen: a selector under the large preview picks every screen or one of them, and a badge on each wallpaper shows the screens it covers. Slideshow, themes, removal and Next wallpaper follow it.
- Wallpapers fade through black when they change.
- Power saving: a Frame rate choice (30 or 60 images a second) for every HTML wallpaper, and the wallpaper pauses while the session is locked.
- Shuffle for the slideshow, without repeating the current wallpaper or showing it on two screens when there is a choice. Previous and Next follow the order of the Wallpaper page.
- Videos, GIFs and images pulse lightly with the sound when React to sound is on.
- A dark tray menu: Open Bramble, Next wallpaper, Pause or resume the wallpaper, Themes, Sounds and Quit.
- Undo after applying a theme, resetting the cursors, applying an icon to subfolders, resetting every folder icon, loading a sound pair and clearing the test history. Removing a theme can be undone instead of confirmed.
- Back to original for the mouse and folder icons: Bramble remembers how they were before it first changed them, pointer speed, precision, double-click, wheel and extras included.
- Themes: start on mains power or on battery, export a theme to a file and import one, with a preview first (a wallpaper or cursor theme missing on this PC is reported, nothing is ever run).
- Tasks: search by name, description or publisher (Ctrl F, Escape clears it), and a sheet for each program with its publisher, version, size and location, whether it starts with Windows and its open network connections.
- Hardware: Copy summary puts the main specs in the clipboard, ready to paste in a message.
- Home, rebuilt in two columns that fit the window: the desktop preview with Pause, Next and the themes, This PC (processor, memory, disk, battery, network), and shortcuts to Icons, Arrange, Mouse, Sounds and Tasks.
- Settings: a Connections group that lists every outside service Bramble talks to and when, and an update check (off by default, once a day, or Check now).
- Keyboard: Ctrl 1 to 9 open the services in the order of the bar, Ctrl Tab the next one, Ctrl comma the settings.
- The window remembers its size, position and maximized state.

### Changed
- Home: the Icons panel no longer shows the preview size and the subfolders options, which only mean something next to the icon library of the Icons page.
- The bar on the left is grouped in families: Personalization (Themes, Wallpaper, Create, Icons, Mouse, Sounds), Desktop (Display, Arrange) and PC (Tasks, Folders, Hardware, Network). Ctrl 1 to 9 follow this order.
- The wallpapers that come with Bramble can no longer be removed.
- A web page wallpaper is called Live instead of HTML, on Home and on its card.
- Folders: the sources say what they cover (the whole drive, Windows included, or the personal folder with its path) and the home folder is called Personal folder.
- Icons: Maintenance, with Refresh icons and Reset everything, comes first in the side panel.
- Tasks: the Memory card is rebuilt like the Network security card, with a lamp, a segmented meter, three checks (in use, available, can be freed) and a violet Free up memory key. The usage sits in a small screen, a ring gauge with the percentage replaces the icon, and the key has the violet style of Network and Sounds. Programs from 60 MB are now offered, never the terminals. The list stays on screen while programs close, each one showing Closing.
- Sounds: one Sounds on switch instead of Sounds on and Silent, which did the same thing, and the list of events is titled Events.
- Create: the preview adapts to the height of the window, so the themes stay visible without scrolling.
- Settings that appear with an option (React to sound in Create and Wallpaper, Screen and sleep on Home, the icons of a theme) open and close smoothly instead of making everything under them jump.
- The small taskbar drawn in previews shows the violet app icon.
- The bar on the left shows the name of each service beside its icon, with the Bramble name at the top. Dragging its edge still narrows it to icons with names below.
- Create: React to sound comes first in the panel.
- Arrange: the first row keeps the same space from the top of the screen as the longest name of the last row from the taskbar, instead of touching the top edge.
- Home: the desktop preview draws the icons at their real size and place.
- Explanation lines that did not fit are shorter (Wallpaper, Create, Arrange, Network, Hardware), and the French texts no longer address the reader.
- Moods are now called Themes and have their own place at the top of the bar.
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
- Home: Previous and Next showed the wallpapers in a random order. They now follow the order of the Wallpaper page, and only the slideshow shuffles.
- Arrange: the violet ring stayed on the last arrangement after restoring one of your own. It now sits on the saved arrangement that matches the desktop, and goes back to the arrangement in use as soon as the icons change.
- Create: changing the size or the amount of particles reshuffled all of them on the screen, and embers lost their size when they came back. The size now applies while drawing and the amount only adds or removes particles.
- Arrange: changing the icon size several times in a row, or on a layout Bramble did not make, piled the icons on the same rows. The layout from before the first click is now kept until the last one, and every icon keeps its cell or takes the nearest free one.
- Tasks: after Free up memory, a program still closing came back in the list for a few seconds. Bramble now waits for the programs to quit, closes every window of an app, and says what really closed and what is still open (an app can hide in the notification area instead of quitting).
- Arrange: Frame left an empty cell between two categories, which looked like missing icons, and filled a second ring from one side only. The frame now spaces its icons evenly when it is not full and centers the extra icons on its top and bottom rows.
- Arrange: in Corners, a big category spilled into the corner of another one; each category is now a compact block in its corner, with room left between blocks. In Center, each category starts its own row.
- React to sound could stay still after an audio output changed (a screen with speakers, headphones, another default output) until it was turned off and on again.
- The Bramble wallpaper started without bubbles when its preview was loaded while hidden, on Home.
- Icons could end up outside every screen after auto arrange was turned off, after Undo or Back to original, when the screens had changed in between.
- The bar and the side panel stayed narrow after the window had been narrow for a moment.
- Empty lists (Network addresses and test history, Sounds history, Folders) showed their message floating over the page.
- French: names given in Bramble (themes, layouts, own cursor themes, wallpapers) were translated when they matched a word of the interface.
- Folders: Run the analysis again lost its icon and its explanation, the analyzed source lost its icon, and the centre of the rings cut its numbers.
- Hardware: the disk read speed was labelled Playing, long values crushed the labels in the panel, and a card left alone on the last row now spans the width.
- Mouse: the 16 px pointer size read as 1, and cursor themes whose files were deleted showed empty cards.
- Wallpaper: the armed Remove button covered Edit, and No wallpaper selected was misspelled.
- Arrange: undoing the removal of a layout did nothing.
- Themes: Active stayed shown after the settings had changed, and two themes with the same settings were both shown as Active.
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
