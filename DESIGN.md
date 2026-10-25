# Bramble design system

The rules every page of Bramble follows. Values live as tokens in `:root` of `app/ui/main.css`; shared components live in `main.css` and `shell.css`. A raw value used twice becomes a token.

## Principles

- **The wallpaper is the star.** The window is dark, quiet and cold, so the desktop stays the most colorful thing on screen.
- **Relief is measured.** Flat lists and cards are the default. Relief (shell, metal, glass, light) is for the PC family (Health, Tasks, Folders, Duplicates, Hardware, Network), which reads the machine itself, and for the one main action of a page.
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
| `--text-body` | 13 | Buttons, row titles, list values |
| `--text-base` | 14 | Default body size |
| `--text-title` | 16 | Card titles |
| `--text-lead` | 18 | Wordmark, weather temperature |
| `--text-heading` | 20 | Page titles, IP address, the plus sign of add tiles |
| `--text-clock` | 28 | Clock, large values of Network |
| `--text-counter` | 30 | Counter values |
| `--text-rate` | 40 | Speed test result |

Named exceptions: the screen number on the map of Display (26), the dot glyphs of the weather icon (9), and the center of the rings of Folders, which scales with the ring (`clamp`).

Fonts: `--display` for titles and lit text, `--numbers` with `font-variant-numeric: tabular-nums` for figures. No fixed-width font.

### Shape and time

- Radius: `--radius-shell` 16 (relief shells), `--radius-card` 12 (flat cards, previews, toasts), `--radius-group` 10 (lists, wells), `--radius-control` 8 (buttons, fields, tiles), `--radius-small` 6 (inner parts), 99px for switches, scroll bars and round controls only. A nested element keeps a concentric radius. Only bars and strokes of 1 to 4 px may use a raw radius.
- Spacing: 28 above and 12 below a section title on a page, 18 and 10 in the side panel.
- Icon tiles: 26, 30 or 44 px.
- Time: `--fast` (.12 s) for hover and color changes, .2 to .45 s for fades and reveals. Motion stops when the system asks for reduced motion.
- Movement: nothing jumps. An element that changes place slides from where it was (`slide`, `glide` and `glideRebuilt` of `main.js`); a dragged element follows the pointer, lifted by `--float`, while its neighbors make room, and settles in its slot when released (`dragOrder`).

## Materials

| Material | Tokens | Where |
| --- | --- | --- |
| Flat | `--group`, `--group-up` | Lists, settings, Personalization cards |
| Shell | `--shell`, `--shell-edge`, `--shell-lift` | Cards in relief of the PC family, the zoom pill |
| Well | `--sunken` + inset shadow | Fields, readout lists, segment rails |
| Brushed steel | `--steel`, `--steel-edge` | Frames of bezels, seals, ring dials and the speed test dial: a turning sheen, the same thin edge all around so the frame keeps one width |
| Glass | `--glass`, `--glass-sheen`, `--glass-inset` | Behind lit text and drawings in light |
| Light | `--lit`, `--warn`, `--bad`, `.led-text` | Lit letters, rings and drawings on glass |

## Components

- **Row** (`.row`, `.toggle`, `.setting`): icon in a `.glyph`, title and one gray line, control on the right. Title and line each fit on one line.
- **Glyph** (`.glyph`): every list icon, stroke in `--text-soft` on `--raised`, 30 px. It turns turquoise only when its row is on or chosen.
- **Switch**: one drawing (`.toggle input`, `.toggler input` compact, `.cr-switch`).
- **Slider**: `fill()` of `main.js` paints the filled part from `min` and `max`. A muted slider is dimmed (`.is-muted`), a disabled one too.
- **Segments**, **time select** (`.time-select`), **chips** (`.tool-chip`), **links** (`.link` with a 14 px icon).
- **Buttons**: main `.button--accent`, or `.keycap-pill` for the main action of a shell; secondary `.button`; card header action = chip; title line action = link. Armed red (`--danger-dim`, text and ring `--danger`) is the only red button.
- **Ring dial** (`.dials`, `.dial`, filled by `dials(zone, list)` of `dials.js`, shared by every page): a value and its share. `.dials--small` on Home and in the companion, `.dials--led` with lit figures in Health. Each dial shows details in a bubble on hover or keyboard focus.
- **Instruments** (`thermometer`, `batteryRelief`, `wifiRelief` in `main.js`): used instead of a ring wherever they exist. A ring is only for what has no instrument.
- **Bezel** (`.bezel`, `.bezel__glass`): a rectangular screen in a brushed steel frame with a verdict in `.led-text` and a gray line.
- **Seal** (`.seal`): a round anodized frame with a face or a shield drawn in light (`faceLight`, `shieldLight`). Never in a diagram.
- **Readouts** (`.readouts`, `.readout`): a well with rows of icon, title, effect, value and action.
- **Bubble** (`.chart-tip`): title, note and label and value lines.
- **Drawer**: the side panel opens over the page in a narrow window, from the Options button.
- **Toast**: 8 s, with Undo for any change.
- **Zoom pill** (`.zoom-pill`): bottom right, invisible until the pointer or the keyboard reaches it, shown for a moment after a zoom.
- **Bar on the left** (`.rail`): Home, a Go to search (Ctrl K), then one button per family (icon, name, arrow) that opens its services in a flyout next to the bar, on click. The name of every button is always written: under the icon in a narrow bar, beside it from 140 px, and in the flyout when the window is too small for names. The family that holds the page on screen carries a lit bar on the edge of the bar. Arranging the bar shows every family open, one under the other. Two levels at most.
- **Page help** (`.page-help`): a round question mark after the title of every page (in the header on Home) that opens a bubble (`.page-help__tip`) with the line, the Reads, Changes and To undo of the page, taken from What lampfish reads and changes, and a link to it. Never on a single setting: the gray line is its help.
- **Plugin tag** (`.plugin-tag`): an outlined word, Plugin, after the name of what a plugin adds. What a plugin shows (its bars, its dials) is drawn in the color of the plugin (`--plugin-claude` for Claude, the one exception to turquoise for a state), never the interface around it.
- **Actions row** (`.h-actions` on Home): the everyday actions as chips (`.tool-chip` with a 16 px icon), one click each, right under the header. An action that has a page opens it, the others act from Home with their usual toast.
- **Home cards** (`.h-shortcuts`): a grid of columns that follows the width of the page, a card in any cell, an empty cell left empty, one to three cells across and one or two down. A card dropped on another pushes it down.
- **Delete in two clicks** (a note): the control arms on the first click, says so in red, and deletes on a second one within 4 seconds. Undo stays for 8 seconds after. A removal that touches one file keeps Undo only; this one was asked for because a note is easy to lose by a stray click.
- **Day** (`light.css`, `data-theme="light"` on the root, set by `applyLight` of `base.js`): only the tokens change, the page is a soft gray (`#d4dadb`, never white: white hurt the eyes) with groups a little lighter, the accent text is darker (`#06655c`) to keep 4.5:1, and the fish is the black mark. Instruments (dials, screens, meters) stay dark glass. Anything drawn over a picture keeps light text.
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

- Screws, decorative separator lines, stripes of gloss, mirror chrome. Brushed steel is for frames only.
- Green, decorative gradients, red outside destructive actions.
- Fixed-width fonts, whole words in capitals, em dashes.
- Two radii for the same element type, a raw value used twice.
- A setting without an icon and an explanation line.
- A change to Windows that cannot be undone.
