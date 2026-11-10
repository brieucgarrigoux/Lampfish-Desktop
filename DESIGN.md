# lampfish design system

The rules every page of lampfish follows. Values live as tokens in `:root` of `app/ui/main.css`; shared components live in `main.css` and `shell.css`. A raw value used twice becomes a token.

## Principles

- **The wallpaper is the star.** The window is dark, quiet and cold, so the desktop stays the most colorful thing on screen.
- **Flat, like Windows.** Cards, screens and wells are flat surfaces since November 2026: no light edge, metal frame, ring or inner shadow (the user saw them as old silver outlines). What stays drawn is light (lamps, lit text) and a few physical controls: the key of the security card, the knob of Sounds.
- **Explain, then act.** Every setting has an icon and one gray line that says what it is for. Every change to Windows can be undone.
- **Say what matters.** A verdict names the cause and its effect ("12 programs slow the start", "Windows takes longer to be ready"), never a bare count.

## Tokens

### Color

| Token | Use |
| --- | --- |
| `--wallpaper` | Page background |
| `--group`, `--group-up` | Lists and flat cards |
| `--raised` | Icon tiles, badges |
| `--sunken` | Fields, wells, readout lists |
| `--track`, `--meter` | Switch and slider rails, small gauges |
| `--screen`, `--glass` | Screens behind a bezel, lit text background |
| `--ink` | Darkest outline of a relief part |
| `--hover` | Hovered row or card |
| `--hairline`, `--hairline-strong` | Separators inside a group |
| `--text`, `--text-soft`, `--text-pale` | Titles, values and icons, explanations |
| `--fill` | Bars, meters and lit marks: `--accent` at night, `--accent-strong` by day |
| `--accent`, `--accent-strong`, `--on-accent` | Turquoise: `#1EBBAA` for text and strokes on dark, `#0F9D8F` for filled controls, `#08171A` for the text on those fills (white on `#0F9D8F` is only 3.4:1) |
| `--accent-dim`, `--accent-tint`, `--accent-ring` | Pressed, chosen row, focus |
| `--lit`, `--warn`, `--bad` | Lamp colors: fine (`#2ED9C6`), to watch, to fix |
| `--danger`, `--danger-dim` | Destructive actions only |
| `--plugin-claude` | The color of the Claude plugin, only on what the plugin shows (bars, dials, tag); the value is provisional until read in the official kit |

Turquoise marks a state (chosen, active, on). Surfaces are near-neutral dark grays with a hint of cool tint (`--wallpaper` `#090c0d`, `--group` `#121618`), so the turquoise only appears where something is on or chosen; text is white. `#08171A` is the ink for text on turquoise fills and the plate of the application icon. Accent transparencies use `color-mix(in srgb, var(--accent) X%, transparent)`.

### Text

| Token | Size | Role |
| --- | --- | --- |
| `--text-micro` | 10.5 | Tick labels, screen numbers on a card |
| `--text-badge` | 11.5 | Small labels and counts |
| `--text-caption` | 12 | Gray explanation lines, captions |
| `--text-value` | 12.5 | Commands, values in a row |
| `--text-body` | 14 | Buttons, row titles, list values (the body size of Windows) |
| `--text-base` | 14 | Default body size |
| `--text-title` | 20 | Card titles (the subtitle of Windows) |
| `--text-lead` | 18 | Wordmark, weather temperature |
| `--text-heading` | 28 | Page titles, semibold (the title of Windows), IP address, the plus sign of add tiles |
| `--text-clock` | 28 | Clock, large values of Network |
| `--text-counter` | 30 | Counter values |
| `--text-rate` | 40 | Speed test result |

Named exceptions: the screen number on the map of Display (26), the dot glyphs of the weather icon (9), and the center of the rings of Folders, which scales with the ring (`clamp`).

Fonts: `--display` (Geist, the font of the logo) for titles, the clock and lit text from 14 px up, `--numbers` (Segoe) with `font-variant-numeric: tabular-nums` for figures and anything smaller, `--system` (Segoe) where the text must match what a canvas or a generated wallpaper draws. No fixed-width font.

### Shape and time

- Radius, as Windows 11 draws them: `--radius-control` and `--radius-small` 4 (buttons, fields, cards of a settings list, anything inside the page), `--radius-group`, `--radius-card` and `--radius-shell` 8 (cards, shells, toasts, flyouts). The assistant keeps its compact text sizes (`companion.css`).
- Spacing: 28 above and 12 below a section title on a page, 18 and 10 in the side panel.
- Icon tiles: 26, 30 or 44 px. Icons: `--icon` 16, `--icon-nav` 20, `--icon-big` 32 (see Icons).
- Time: `--fast` (.12 s) for hover and color changes, .2 to .45 s for fades and reveals. Motion stops when the system asks for reduced motion.
- Movement: nothing jumps. An element that changes place slides from where it was (`slide`, `glide` and `glideRebuilt` of `main.js`); a dragged element follows the pointer, lifted by `--float`, while its neighbors make room, and settles in its slot when released (`dragOrder`).

## Materials

| Material | Tokens | Where |
| --- | --- | --- |
| Flat | `--group`, `--group-up` | Lists, settings, Personalization cards |
| Shell | `--group`, `--group-up` | The former cards in relief (`shell.css`), now flat like the groups of settings |
| Well | `--sunken` | Fields, readout lists, segment rails; `--well-inset`, `--glass-inset` and `--screen-inset` are kept empty |
| Brushed steel | `--steel` | Unused since November 2026: no metal frame anywhere |
| Glass | `--glass`, `--glass-sheen`, `--glass-inset` | Behind lit text and drawings in light |
| Screen | `--screen-face`, `--screen-inset` | Faces of the meters and of the sound screen |
| Light | `--lit`, `--warn`, `--bad`, `.led-text` | Lit letters, rings and drawings on glass |

- **Mica** (`material.css`, `Native.Mica`): on Windows 11 22H2 and later the main window is painted with Mica; the page lays a veil halfway between its gray and Mica (`rgba(9, 12, 13, .5)`, light `rgba(195, 202, 203, .5)`) and cards and shells turn translucent. `--wallpaper` stays opaque: it prints on accent chips and fills the drawer. Windows falls back to a plain color when inactive, on battery saver or without transparency.
- **The assistant's backdrop** (`companion.css`, `still()` and `veil()` of `companion.js`): Windows paints no material under the borderless assistant (Acrylic and Mica tried, it shows its plain fallback color). The page paints the wallpaper of its screen instead, blurred, cut where the window rests, from the still `Companion.SendStill` takes; the veil thickens on a bright wallpaper so the palest text keeps 4.5:1. The window slides; only its page fades (a window fading by transparency could never get a material).
- **The picture of the page** (`.contents::before`, `::after`): the fish of the brand in its glow, faint, at the head of every page, behind the content.

## Components

- **Row** (`.row`, `.toggle`, `.setting`): icon in a `.glyph`, title and one gray line, control on the right. Title and line each fit on one line.
- **Glyph** (`.glyph`): every list icon, in `--text-soft` on `--raised`, a 30 px tile around a 16 px icon. It turns turquoise only when its row is on or chosen.
- **Switch**: the switch of Windows, one size for all (`.toggle input`, `.toggler input`, `.cr-switch`): 40 by 20, empty with a ring and a 12 px dot when off, filled with the accent and a dark dot (white in day mode) when on, the dot grows to 14 px under the pointer.
- **Settings group**: a `.group` made of settings (`.toggle`, `.row--setting`, `.setting`, `.row.action`, `.h-q`, `.tr-row`) is one block with thin rules between its settings, like an open group of the Settings app of Windows (separate cards showed the dark veil of Mica between them). Lists of data (programs, files) are not touched.
- **Appearance words**: Light, Dark, Use system setting, with a link to the Colors page of Windows (`display.colors`).
- **Slider**: `fill()` of `main.js` paints the filled part from `min` and `max`. A muted slider is dimmed (`.is-muted`), a disabled one too.
- **Segments**, **time select** (`.time-select`), **chips** (`.tool-chip`), **links** (`.link` with a 16 px icon).
- **Buttons**: main `.button--accent`, or `.keycap-pill` for the main action of a shell; secondary `.button`; card header action = chip; title line action = link. Armed red (`--danger-dim`, text and ring `--danger`) is the only red button.
- **Ring dial** (`.dials`, `.dial`, filled by `dials(zone, list)` of `dials.js`, shared by every page): a flat ring, no metal, no glow, the number alone in the middle. Only on Home, Network and in the assistant. a value and its share. `.dials--small` on Home and in the companion, `.dials--led` with lit figures in Health. Each dial shows details in a bubble on hover or keyboard focus.
- **Instruments** (`thermometer`, `batteryRelief`, `wifiRelief` in `instruments.js`): used instead of a ring wherever they exist. A ring is only for what has no instrument.
- **Measure rows** (`.dials--rows`, `.meter`, drawn by the same `dials()`): name and line, value, a bar, and the curve of the last minutes kept in memory (60 points, nothing written). Tasks, Health and Hardware.
- **The moving mark** (`mark.js`, data from `src/mark.py`): every `img[data-live-mark]` (bar, About, first run) becomes the official mark drawn as one path that bends, never cut pieces (a cut piece shows a step at its joint while it turns). Between its gestures (one of five, every 1.8 to 3.5 s) the tail always sways, its strength drifting between faint and clear (a steady sway looked unnatural, a tail at rest looked dead), the rod bends a little and the lamp follows, the little fin waves on its own rhythm, the eye blinks, the glow breathes, the whole fish rocks gently from side to side (under 3 degrees, two slow waves); the pointer on the mark itself (not the whole button) starts one gesture; while a `.loading` runs the gestures come every second or so; `swim` also floats (not in the bar). The mouth never moves (it would bend the teeth). Still when Windows asks for less motion. 60 frames a second and gestures drawn on one curve through their keys: 30 frames and an ease on each step looked jerky.
- **Bezel** (`.bezel`, `.bezel__glass`): a flat screen tinted by its lamp, with a verdict in `.led-text` and a gray line.
- **Seal** (`.seal`): a flat round tinted with its lamp color with a face or a shield drawn in light (`faceLight`, `shieldLight`). Never in a diagram.
- **Readouts** (`.readouts`, `.readout`): a well with rows of icon, title, effect, value and action.
- **Bubble** (`.chart-tip`): title, note and label and value lines.
- **Drawer**: the side panel opens over the page in a narrow window, from the Options button.
- **Toast**: 8 s, with Undo for any change.
- **Zoom** (`.zoom-pill`): at the foot of the bar on the left, always on screen, never over a page. Value above minus and plus in a narrow bar, on one line from 140 px. Its size ignores the zoom, so that plus stays under the pointer between two clicks, and it sticks to the foot when the bar scrolls.
- **Bar on the left** (`.rail`): Home, a Go to search (Ctrl K), then one button per family (icon, name, arrow) that opens its services in a flyout next to the bar, on click. The name of every button is always written: under the icon in a narrow bar, beside it from 140 px, and in the flyout when the window is too small for names. The family that holds the page on screen carries a lit bar on the edge of the bar. Arranging the bar shows every family open, one under the other. Two levels at most.
- **Help** (`help.js`, `help.css`, answers and search in `help-bot.js`, shared with the Help tab of the assistant): a page above Settings with a guided bot. It greets and then offers chips; each answer is one or two short sentences, may read live state (memory, battery), and carries at most two actions that open a page or run an existing action; the search matches words of the questions and answers in the current language, without AI or network. `check.mjs` proves every action is one the app handles.
- **Page help** (`.page-help`): a round question mark after the title of every page (in the header on Home); the pointer on it (or the keyboard focus) dims the page and lays up to six small cards over it, gone 0.7 s after the pointer has left the mark and the cards, never with a press (`.help-card`, table in `help-cards.js`), each a title of three to five words pointing at a part of the page lit by a ring; the pointer on a card unfolds its sentence. Cards never overlap and stay in the window (below, above, the other side, beside, over a large part); a part not on screen leaves its card out. Escape, a click beside the cards or the question mark again closes them. A last link opens the page's row of What lampfish reads and changes. Never on a single setting: the gray line is its help.
- **Actions row** (`.h-actions` on Home): the everyday actions as chips (`.tool-chip` with a 16 px icon), one click each, right under the header. An action that has a page opens it, the others act from Home with their usual toast.
- **Home cards** (`.h-shortcuts`): a grid of columns that follows the width of the page, a card in any cell, an empty cell left empty, one to three cells across and one or two down. A card dropped on another pushes it down.
- **Delete in two clicks** (a note): the control arms on the first click, says so in red, and deletes on a second one within 4 seconds. Undo stays for 8 seconds after. A removal that touches one file keeps Undo only; this one was asked for because a note is easy to lose by a stray click.
- **Day** (`light.css`, `data-theme="light"` on the root, set by `applyLight` of `base.js`): tokens first, then the parts drawn once. The page is a gray (`#c3cacb`, groups `#d3d9da`, never white: `#d4dadb` already hurt the eyes), the accent text is darker (`#044e46`) and filled controls use `#0a7469` to keep 4.5:1 with white text, and the fish is the black mark. Instruments exist in daylight too: steel frames, pale faces (`--glass`), dark print, no glow, depth from shadow and outline. A face stays the lightest surface of the screen. A canvas asks `isDay()` for its colors and redraws on `themechange`. The title bar and the tray menu follow. Anything drawn over a picture keeps light text.
- **State** (`.state`): a lamp (`--lit`, `--warn`, `--bad`, or gray for waiting) and a gray word, no background and no capsule. A state that is normal says nothing; only what is on, chosen, to watch or to fix gets a lamp. Never a tinted capsule.
- **Saved state** (`.n-saved` in Notes): a state next to the name that says a change is saved by itself, and when it is not written yet. A page that saves on its own shows it this way rather than with a Save button.
- **Main button with a menu** (`.s-capture` in Shelf): the main action on the left, a narrow arrow on the right that opens the other ways to do it, as rows with a glyph, a title and a gray line.
- **Floating menu and lifted element**: `--group-up`, a `--hairline-strong` edge and the `--float` shadow. A veil over a block in an edit mode is `--veil`.
- **Warning note** (`.warning-note`): amber, under the group it is about, only before a reset.

## Writing

- English in the code, French in `app/ui/locales/fr.json`. Every visible string goes through `tr()` or a translated text node; names typed by the user carry `translate="no"`.
- No capitals for whole words (`text-transform: uppercase` is never used; only the first letter of the date on Home and in the companion is raised). No em dash.
- As little text as possible, no "you". In French: no "vous", no "votre", no imperative in "-ez".
- No filler: no sentence that only reassures or repeats the obvious. A footer without useful information keeps only its button.
- A gray line that does not fit in a 340 px panel is shortened, in both languages.

## Layout

- Two page widths, both centered: 900 px for pages of settings and lists (Settings, Display, Audio, Taskbar, Notes, Convert, Health, Duplicates), 1120 px for pages with a gallery, a plan or instruments (Themes, Wallpaper, Create, Icons, Mouse, Sounds, Arrange, Shelf, Tasks, Storage, Hardware, Network). Home goes to 1560 px.
- One narrow breakpoint at 900 px: the page scrolls as a whole and the side panel becomes a drawer. The window of a 125 % laptop is about 780 px wide, so the narrow layout is an everyday layout.
- Bar of icons only below 620 px wide or when the height is short.
- Home stacks its columns below 760 px of content (container query `home`).
- Minimum window size 720 × 560.
- A row that appears with an option opens with `reveal(el, show)`, never with a jump.

## Never

- Screws, decorative separator lines, stripes of gloss, mirror chrome, metal frames, edges that stand out in relief.
- Green, decorative gradients, red outside destructive actions.
- Fixed-width fonts, whole words in capitals, em dashes.
- Two radii for the same element type, a raw value used twice.
- A setting without an icon and an explanation line.
- A change to Windows that cannot be undone.

## Text position

Segoe sits its capitals 0.064 em under the middle of the line. `main.css` declares two aliases, `LF Display` and `LF Text`, with `ascent-override` 105.5 % and `descent-override` 27.5 %: same line height, text centered at the usual display scales. `LF Geist` uses 102 % and 31 %: the same line height, and ascent minus descent equals its capital height (0.71 em), so its capitals sit exactly in the middle. Always use `--display`, `--numbers` or `--system`, never a font name. Text in a ring also uses `text-box: trim-both cap alphabetic`.

## Home grid

Blocks and cards share `.h-board`. `.h-main` and `.h-shortcuts` take no box (`display: contents`), so a block never moves in the page and the live preview never reloads. A block has no size of its own: `blockSize()` gives it a share of the width and the rows its content needs. The row that ends a block is only as tall as the block needs (`fitRows()`), so a block never leaves a hole under it; while arranging, every row keeps one height so the cells line up. Places are saved with their number of columns (`TileCols`): with another number, at another zoom or window size, everything flows again in the same order, without holes, and the places are not rewritten.

## Icons

One registry, one family. Every icon is a symbol of `app/ui/icons.svg`: Phosphor regular (MIT, 256 grid), and where Phosphor has nothing for a meaning, a drawing of lampfish in the same grammar (names starting with `lf-`, in `src/icons-own.json`): 256 grid, stroke 16, round caps and joins, one color, no opacity.

- In html an icon is `<svg class="ph" aria-hidden="true"><use href="icons.svg#name"/></svg>`; in a script it is `icon(name, cls)` of `base.js`. A table of icons holds names, never markup.
- `python src/icons.py <unpacked @phosphor-icons/core>` writes `icons.svg` from the names the pages use, copies the Phosphor license and draws the tray images (lampfish must be closed for those). A name found nowhere stops it. `src/check.ps1` fails on a name missing from `icons.svg` and on a drawing left inside an icon.
- Three sizes: `--icon` 16 (buttons, rows, chips, links, inside a 26 or 30 px tile), `--icon-nav` 20 (bar on the left, tabs, navigation lists), `--icon-big` 32 (drop zones, empty states).
- An icon takes the color of its text (`fill: currentColor`): a state changes `color`, never a stroke.
- One meaning, one icon, everywhere (Undo, Reset, Refresh, Open in File Explorer, Delete, Copy).
- Instruments and data drawings (gauges, thermometer, Wi-Fi in relief, curves, arrangement thumbnails, the picture of the taskbar) are drawn by their script: they show values and are not icons.
- Never add a button without an icon, a data row or a segment excepted.
