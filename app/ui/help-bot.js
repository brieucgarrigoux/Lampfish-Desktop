'use strict';

// The answers of Help, shared by the Help page and the Help tab of the assistant. Plain data, no AI and no network.
// A topic: q is the question as a chip, a the answer, live the name of a HELP_LIVE line put before it, words what a search
// also matches, do up to two actions, next the follow-up chips. An action runs on the main page with view (showView),
// send (the same message an existing button sends) or call (HELP_CALLS of help.js); in the assistant it runs its own
// assistant entry (tab, act, send or view), or opens the page of view, and is left out otherwise. src/check.mjs checks
// every action and every text against the app.
const HELP_BOT = {
  greeting: 'Hi. Where to start?',
  start: ['slow', 'wallpaper', 'undo', 'theme', 'icons-hide', 'other'],
  often: ['paused', 'notes', 'undo', 'capture'],
  pages: {
    home: 'Home', modes: 'Themes', wallpaper: 'Wallpaper', create: 'Create', icons: 'Icons', mouse: 'Mouse', station: 'Sounds',
    display: 'Display', audio: 'Audio', taskbar: 'Taskbar', arrange: 'Arrange', notes: 'Notes', shelf: 'Shelf', convert: 'Convert',
    health: 'Health', tasks: 'Tasks', files: 'Storage', network: 'Network', settings: 'Settings',
  },
  topics: {
    slow: {
      q: 'My PC is slow', live: 'memory',
      a: 'Health names what slows the PC: memory, startup programs, a full disk or heat.',
      words: 'slow lag freeze memory ram processor cpu heavy hot startup speed',
      do: [
        { label: 'Free up memory', icon: 'broom', call: 'free-memory', assistant: { view: 'tasks' } },
        { label: 'Open Health', icon: 'heartbeat', view: 'health' },
      ],
      next: ['disk', 'network', 'battery'],
    },
    wallpaper: {
      q: 'Change the wallpaper',
      a: 'Next shows the following one of the library. Wallpaper holds them all, and takes videos, GIFs, images and web pages.',
      words: 'wallpaper background picture video image change next animated live',
      do: [
        { label: 'Next wallpaper', icon: 'skip-forward', send: 'next', assistant: { send: 'companion.wallpaper', args: { op: 'next' } } },
        { label: 'Open Wallpaper', icon: 'image', view: 'wallpaper' },
      ],
      next: ['paused', 'theme'],
    },
    paused: {
      q: 'Why does the wallpaper stop?', live: 'paused', hint: 'Paused in full screen and on battery',
      a: 'It pauses in full screen and on battery when those options are on, so games and the battery come first.',
      words: 'stop stops paused frozen still full screen game battery moving',
      do: [
        { label: 'Pause or resume', icon: 'pause', send: 'pause', assistant: { send: 'companion.wallpaper', args: { op: 'pause' } } },
        { label: 'Open Wallpaper', icon: 'image', view: 'wallpaper' },
      ],
      next: ['battery', 'wallpaper'],
    },
    undo: {
      q: 'Undo a change', hint: 'Undo in every message, for 8 seconds',
      a: 'Every change shows a message with Undo for 8 seconds. Later, Back to original on each page puts Windows back as it was.',
      words: 'undo back cancel revert restore original mistake reset',
      do: [
        { label: 'What each service changes', icon: 'shield-check', call: 'transparency', assistant: { view: 'settings' } },
      ],
      next: ['theme', 'icons-straighten'],
    },
    theme: {
      q: 'Save my setup as a theme',
      a: 'Themes keeps the wallpaper, cursors, sounds and effects under one name, and brings them back in one click.',
      words: 'theme save setup profile mode look preset',
      do: [
        { label: 'Save the current setup', icon: 'floppy-disk', call: 'new-theme' },
        { label: 'Open Themes', icon: 'swatches', view: 'modes' },
      ],
      next: ['wallpaper', 'cursor', 'sounds'],
    },
    'icons-hide': {
      q: 'Hide the desktop icons',
      a: 'Nothing is deleted: the icons only stop showing, and Show the icons brings them back.',
      words: 'hide icons desktop clean empty show',
      do: [
        { label: 'Hide the icons', icon: 'eye-slash', send: 'arrange.hide', args: { value: true }, assistant: { send: 'companion.icons', args: { hidden: true } } },
        { label: 'Show the icons', icon: 'eye', send: 'arrange.hide', args: { value: false }, assistant: { send: 'companion.icons', args: { hidden: false } } },
      ],
      next: ['icons-straighten', 'icons-refresh'],
    },
    'icons-straighten': {
      q: 'Straighten the desktop icons',
      a: 'Each icon goes to the nearest cell of the grid. Arrange also lines them up on a side or in blocks.',
      words: 'straighten align tidy arrange grid messy order icons',
      do: [
        { label: 'Straighten the icons', icon: 'align-left', send: 'arrange.align', assistant: { send: 'companion.straighten' } },
        { label: 'Open Arrange', icon: 'grid-nine', view: 'arrange' },
      ],
      next: ['icons-hide', 'icons-refresh', 'undo'],
    },
    'icons-refresh': {
      q: 'An icon looks old',
      a: 'File Explorer sometimes keeps an old picture. Refresh icons asks Windows to draw them again.',
      words: 'refresh old icon folder wrong picture cache redraw',
      do: [
        { label: 'Refresh icons', icon: 'arrows-clockwise', send: 'icons.refresh', assistant: { send: 'companion.refresh' } },
        { label: 'Open Icons', icon: 'folder-star', view: 'icons' },
      ],
      next: ['icons-straighten', 'icons-hide'],
    },
    cursor: {
      q: 'Make the cursor bigger',
      a: 'Mouse sets the size of the cursor, its colors and the pointer speed. Back to original puts the cursors of Windows back.',
      words: 'cursor pointer mouse bigger size larger arrow see',
      do: [{ label: 'Open Mouse', icon: 'cursor', view: 'mouse' }],
      next: ['theme', 'size'],
    },
    sounds: {
      q: 'Play sounds on events',
      a: 'Sounds plays a sound when the PC locks, sleeps, wakes or a USB device comes in. Each event has its switch.',
      words: 'sound sounds event usb lock sleep noise audio play',
      do: [{ label: 'Open Sounds', icon: 'waveform', view: 'station' }],
      next: ['theme'],
    },
    capture: {
      q: 'Capture the screen', hint: 'A zone, a window or the whole screen',
      a: 'Drag a zone or click a window. The capture goes to the clipboard and to the Shelf, ready to annotate.',
      words: 'capture screenshot screen snip print image clipboard',
      do: [
        { label: 'Capture now', icon: 'scan', send: 'capture.start', args: { delay: 0 }, assistant: { send: 'companion.capture', args: { delay: 0 } } },
        { label: 'Open Shelf', icon: 'tray', view: 'shelf' },
      ],
      next: ['notes', 'convert'],
    },
    notes: {
      q: 'Where are my notes?', live: 'notes', hint: 'A folder chosen, or an Obsidian vault',
      a: 'Each note is a Markdown file in one folder: the one chosen in Notes, or an Obsidian vault.',
      words: 'notes note markdown obsidian folder write text vault',
      do: [
        { label: 'New note', icon: 'note-pencil', call: 'new-note', assistant: { tab: 'note' } },
        { label: 'Open Notes', icon: 'note', view: 'notes' },
      ],
      next: ['capture', 'convert'],
    },
    convert: {
      q: 'Convert a file',
      a: 'Images, PDF and text, on this PC. The originals are never touched and the results go to the Shelf.',
      words: 'convert pdf image png jpg word merge format file',
      do: [{ label: 'Open Convert', icon: 'arrows-left-right', view: 'convert', assistant: { tab: 'convert' } }],
      next: ['capture', 'notes'],
    },
    network: {
      q: 'The network is slow',
      a: 'Network tests the router, the Internet, the DNS and the speed, step by step, only when asked.',
      words: 'network internet wifi slow connection speed router dns offline',
      do: [{ label: 'Open Network', icon: 'wifi-high', view: 'network' }],
      next: ['slow'],
    },
    battery: {
      q: 'The battery drains fast', live: 'battery',
      a: 'Energy saver in Display and Pause on battery in Wallpaper save the most.',
      words: 'battery power drain energy saver laptop charge',
      do: [
        { label: 'Open Display', icon: 'monitor', view: 'display' },
        { label: 'Open Wallpaper', icon: 'image', view: 'wallpaper' },
      ],
      next: ['paused', 'slow'],
    },
    disk: {
      q: 'The disk is full',
      a: 'Storage shows what takes the place, folder by folder. Duplicates finds copies of the same file.',
      words: 'disk full space storage free files big duplicates copies',
      do: [
        { label: 'Open Storage', icon: 'hard-drives', view: 'files' },
        { label: 'Find duplicates', icon: 'files', view: 'duplicates' },
      ],
      next: ['slow'],
    },
    startup: {
      q: 'Start lampfish with Windows', live: 'startup',
      a: 'The switch is in Settings, under General.',
      words: 'start startup windows boot launch open automatically login',
      do: [{ label: 'Open Settings', icon: 'gear', view: 'settings', assistant: { tab: 'quick' } }],
      next: ['size', 'language'],
    },
    size: {
      q: 'Make the interface bigger', live: 'zoom',
      a: 'Ctrl and the wheel, Ctrl + and Ctrl -, or the zoom at the foot of the bar.',
      words: 'size zoom bigger smaller text small large interface scale read',
      do: [
        { label: 'Bigger', icon: 'plus', call: 'zoom-in' },
        { label: 'Smaller', icon: 'minus', call: 'zoom-out' },
      ],
      next: ['cursor', 'language'],
    },
    language: {
      q: 'Change the language',
      a: 'Settings, General: Automatic follows Windows, or English and French.',
      words: 'language english french translate',
      do: [{ label: 'Open Settings', icon: 'gear', view: 'settings' }],
      next: ['size', 'startup'],
    },
    other: {
      q: 'Something else', pages: true,
      a: 'Each page has a question mark by its title that shows what its parts do. All the pages:',
      words: 'else other help page pages list everything',
      next: [],
    },
  },
};

// Lines read from what the page already knows (facts of help.js or companion.js); a fact it does not have says nothing.
const HELP_LIVE = {
  memory: f => f.memory == null ? '' : f.memory >= 75 ? tr('Memory is {0} % full right now: that is the main cause.', f.memory) : tr('Memory is {0} % full right now, so it is not the cause.', f.memory),
  paused: f => !f.paused ? '' : f.onBattery ? tr('The wallpaper is paused right now, because the PC runs on battery.') : tr('The wallpaper is paused right now.'),
  battery: f => !f.battery ? '' : f.battery.mains ? tr('The battery is at {0} %, plugged in.', f.battery.charge) : tr('The battery is at {0} %.', f.battery.charge),
  startup: f => f.startup == null ? '' : f.startup ? tr('It is on: lampfish opens with Windows.') : tr('It is off for now.'),
  zoom: f => f.zoom ? tr('The interface is at {0} % now.', f.zoom) : '',
  notes: f => f.notes == null ? '' : f.notes === 1 ? tr('There is 1 note right now.') : f.notes ? tr('There are {0} notes right now.', f.notes) : tr('There is no note yet.'),
};

// The search: accents and case left out, each word of the question against the words of each topic, in the language on screen.
// A word found in few topics weighs more than one found everywhere, and a word of the question counts three times a word of the answer.
const helpPlain = text => String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const HELP_SKIP = new Set(['the', 'and', 'how', 'can', 'does', 'why', 'what', 'where', 'are', 'for', 'with', 'this', 'that', 'from', 'have', 'there',
  'les', 'des', 'une', 'est', 'pour', 'comment', 'avec', 'que', 'qui', 'pas', 'mon', 'mes', 'son', 'ses', 'sur', 'dans', 'sont', 'fait', 'faire', 'peut', 'plus']);
const helpWords = text => helpPlain(text).split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !HELP_SKIP.has(w));
function helpSearch(query, limit = 5) {
  const asked = [...new Set(helpWords(query))];
  if (!asked.length) return [];
  const hits = (word, list) => list.some(w => w.startsWith(word) || (word.length >= 5 && w.length >= 4 && word.startsWith(w)));
  const topics = Object.entries(HELP_BOT.topics).map(([id, t]) => ({ id, title: helpWords(tr(t.q)), rest: helpWords([tr(t.a), tr(t.words), t.words].join(' ')) }));
  const found = asked.map(w => topics.map(t => (hits(w, t.title) ? 3 : 0) + (hits(w, t.rest) ? 1 : 0)));
  const weight = found.map(row => 1 / Math.max(1, row.filter(Boolean).length));
  return topics.map((t, k) => ({ id: t.id, score: found.reduce((s, row, i) => s + row[k] * weight[i], 0) }))
    .filter(r => r.score > 0).sort((a, b) => b.score - a.score).slice(0, limit).map(r => r.id);
}
