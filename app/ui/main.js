'use strict';

const Lampfish = { state: null, station: null, icons: null, arrange: null, mouse: null, network: null, files: null, hardware: null, tasks: null, moods: null, creator: null };
const VIEWS = ['home', 'modes', 'wallpaper', 'create', 'icons', 'mouse', 'station', 'display', 'audio', 'taskbar', 'arrange', 'notes', 'shelf', 'convert', 'assistant', 'plugins', 'health', 'tasks', 'files', 'duplicates', 'hardware', 'network', 'help', 'settings'];

const scrolls = {}, narrowLayout = matchMedia('(max-width: 900px)');
const scrollZones = () => narrowLayout.matches ? [document.scrollingElement] : [document.querySelector('.contents'), document.querySelector('.panel')];
const DOCKS = { wallpaper: 'Wallpaper', modes: 'Themes', display: 'Display', icons: 'Icons', arrange: 'Arrange', mouse: 'Mouse', station: 'Sounds', tasks: 'Tasks', hardware: 'Hardware', network: 'Network' };
const dockModule = view => Lampfish[view === 'modes' ? 'moods' : view];
function setDock(view) {
  const old = document.body.dataset.dock;
  if (old === view) return;
  const pick = $('dock-pick');
  pick.replaceChildren();
  delete pick.dataset.key;
  if (old) { if (old === 'tasks') { if (Lampfish.tasks) Lampfish.tasks.dock(false); } else if (dockModule(old)) dockModule(old).visible(false); }
  if (view) document.body.dataset.dock = view; else delete document.body.dataset.dock;
  if (view) {
    $('dock-title').textContent = tr(DOCKS[view]);
    const module = dockModule(view);
    if (view === 'tasks') { if (Lampfish.tasks) Lampfish.tasks.dock(true); } else if (module) { module.visible(true); if (module.renderDock) module.renderDock(); }
  }
  for (const t of document.querySelectorAll('.h-tile, [data-dock-to]')) t.setAttribute('aria-pressed', String((t.dataset.view || t.dataset.dockTo) === view));
  dispatchEvent(new Event('resize'));
}
function dockTo(view) { setDock(document.body.dataset.dock === view ? null : view); }
$('dock-close').addEventListener('click', () => setDock(null));
$('dock-open').addEventListener('click', () => { const view = document.body.dataset.dock; setDock(null); if (view) showView(view); });
addEventListener('keydown', e => { if (e.key === 'Escape' && document.body.dataset.dock && !(e.target.matches && e.target.matches('input:not([type="checkbox"]), select, textarea'))) setDock(null); });

// In a narrow window the side panel would fall far below the page: it opens as a drawer from the Options button instead.
// A Windows slideshow that changes the picture often makes a live wallpaper blink: the note offers to slow it down.
function slideshowNote(s) {
  const show = !!(s && s.active && !s.slowed && s.minutes > 0 && s.minutes < 1440);
  $('w-slide').hidden = !show;
  if (!show) return;
  const title = $('w-slide-text').firstChild;
  if (title && title.nodeType === 3) title.nodeValue = tr('Windows changes its own wallpaper every {0} minutes', s.minutes);
}
$('w-slide-go').addEventListener('click', () => send('winbg.slow'));

const OWN_PANEL = ['home', 'help', 'settings', 'display', 'audio', 'taskbar', 'convert', 'shelf', 'tasks', 'modes'];
// Services that live inside another page since November 2026: their old name opens that page at their part.
const PART_OF = { duplicates: 'files', assistant: 'settings', plugins: 'settings' };
const setPanel = open => document.body.classList.toggle('panel-open', open);
$('panel-toggle').addEventListener('click', () => setPanel(true));
$('panel-close').addEventListener('click', () => setPanel(false));
addEventListener('keydown', e => { if (e.key === 'Escape' && document.body.classList.contains('panel-open')) setPanel(false); });

function showView(view) {
  if (PART_OF[view]) {
    showView(PART_OF[view]);
    // The part may still be filling in (Hardware draws its board when shown): scroll again once it has its height.
    const reach = () => { const part = document.querySelector('.view.only-' + view); if (part) part.scrollIntoView({ block: 'start' }); };
    requestAnimationFrame(reach);
    setTimeout(reach, 350);
    return;
  }
  const previous = document.body.dataset.view;
  if (document.body.dataset.dock) setDock(null);
  setPanel(false);
  $('panel-toggle').hidden = OWN_PANEL.includes(view);
  if (previous && previous !== view) scrolls[previous] = scrollZones().map(z => z.scrollTop);
  document.body.dataset.view = view;
  if (previous !== view) scrollZones().forEach((z, i) => { z.scrollTop = (scrolls[view] || [])[i] || 0; });
  for (const b of document.querySelectorAll('.service')) {
    if (b.dataset.view === view) { b.setAttribute('aria-current', 'page'); b.scrollIntoView({ block: 'nearest' }); }
    else b.removeAttribute('aria-current');
  }
  try { localStorage.setItem('view', view); } catch (e) { }
  if (Lampfish.station) Lampfish.station.visible(view === 'station');
  if (Lampfish.icons) Lampfish.icons.visible(view === 'icons');
  if (Lampfish.mouse) Lampfish.mouse.visible(view === 'mouse');
  if (Lampfish.network) Lampfish.network.visible(view === 'network');
  if (Lampfish.arrange) Lampfish.arrange.visible(view === 'arrange');
  if (Lampfish.files) Lampfish.files.visible(view === 'files');
  if (Lampfish.hardware) Lampfish.hardware.visible(view === 'hardware');
  if (Lampfish.tasks) Lampfish.tasks.visible(view === 'tasks');
  if (Lampfish.creator) Lampfish.creator.visible(view === 'create');
  if (Lampfish.display) Lampfish.display.visible(view === 'display');
  if (Lampfish.audio) Lampfish.audio.visible(view === 'audio');
  if (Lampfish.taskbar) Lampfish.taskbar.visible(view === 'taskbar');
  if (Lampfish.notes) Lampfish.notes.visible(view === 'notes');
  if (Lampfish.shelf) Lampfish.shelf.visible(view === 'shelf');
  if (Lampfish.convert) Lampfish.convert.visible(view === 'convert');
  if (Lampfish.health) Lampfish.health.visible(view === 'health');
  if (Lampfish.duplicates) Lampfish.duplicates.visible(view === 'files');
  send('audioPreview', { value: view === 'create' });
  if (Lampfish.home) Lampfish.home.visible(view === 'home');
  if (Lampfish.welcome) Lampfish.welcome.viewed(view);
}
for (const b of document.querySelectorAll('.service')) b.addEventListener('click', () => showView(b.dataset.view));
const iconRail = matchMedia('(max-width: 620px), (max-width: 900px) and (max-height: 1000px)');
function railTitles() {
  for (const b of document.querySelectorAll('.rail .service')) {
    if (iconRail.matches) b.title = b.textContent.trim(); else b.removeAttribute('title');
  }
}
iconRail.addEventListener('change', railTitles);
railTitles();

const LEVEL_BARS = 48, levelTarget = new Array(LEVEL_BARS).fill(0), levelShown = new Array(LEVEL_BARS).fill(0);
const levelBars = Array.from({ length: LEVEL_BARS }, () => { const i = document.createElement('i'); $('level-bars').append(i); return i; });
let levelLoop = 0;
function levelFrame() {
  levelLoop = 0;
  let moving = false;
  for (let i = 0; i < LEVEL_BARS; i++) {
    levelShown[i] += (levelTarget[i] - levelShown[i]) * .3;
    if (Math.abs(levelTarget[i] - levelShown[i]) > .003) moving = true; else levelShown[i] = levelTarget[i];
    const v = levelShown[i];
    levelBars[i].style.transform = `scaleY(${(.1 + v * .9).toFixed(3)})`;
    levelBars[i].style.opacity = (.35 + v * .65).toFixed(2);
  }
  if (moving) levelLoop = requestAnimationFrame(levelFrame);
}

webview.addEventListener('message', e => {
  const m = e.data;
  if (m.type === 'appearance') return;
  if (m.type === 'audio.level') {
    levelTarget.push(m.level); levelTarget.shift();
    const previews = Lampfish.state && Lampfish.state.reactive ? '#hero-preview iframe, .cr-stage iframe, .wallpaper-map iframe, #h-wallpaper iframe' : '.cr-stage iframe';
    for (const f of document.querySelectorAll(previews)) { try { f.contentWindow.postMessage({ lampfish: 'audio', level: m.level }, '*'); } catch (e) { } }
    if (!levelLoop && document.body.dataset.view === 'wallpaper') levelLoop = requestAnimationFrame(levelFrame);
    return;
  }

  if (Lampfish.home && m.type && (m.type.startsWith('network.') || m.type.startsWith('hardware.') || m.type === 'arrange.map' || m.type === 'tasks.list')) Lampfish.home.event(m);
  if (m.type === 'network.infos' && Lampfish.hardware) Lampfish.hardware.wifiInfo(m);
  if (m.type === 'home.places') { renderPlaces(m); return; }
  if (m.type && m.type.startsWith('home.')) { if (Lampfish.home) Lampfish.home.event(m); return; }
  if (m.type && m.type.startsWith('station.')) { if (Lampfish.station) Lampfish.station.event(m); return; }
  if (m.type && m.type.startsWith('icons.')) { if (Lampfish.icons) Lampfish.icons.event(m); return; }
  if (m.type && m.type.startsWith('mouse.')) { if (Lampfish.mouse) Lampfish.mouse.event(m); return; }
  if (m.type && m.type.startsWith('vip.')) { if (Lampfish.mouse) Lampfish.mouse.event(m); return; }
  if (m.type && m.type.startsWith('network.')) { if (Lampfish.network) Lampfish.network.event(m); return; }
  if (m.type && m.type.startsWith('arrange.')) { if (Lampfish.arrange) Lampfish.arrange.event(m); return; }
  if (m.type && m.type.startsWith('files.')) { if (Lampfish.files) Lampfish.files.event(m); return; }
  if (m.type && m.type.startsWith('creator.')) { if (Lampfish.creator) Lampfish.creator.event(m); return; }
  if (m.type && m.type.startsWith('tasks.')) { if (Lampfish.tasks) Lampfish.tasks.event(m); return; }
  if (m.type && m.type.startsWith('hardware.')) { if (Lampfish.hardware) Lampfish.hardware.event(m); return; }
  if (m.type && m.type.startsWith('moods.')) { if (Lampfish.moods) Lampfish.moods.event(m); return; }
  if (m.type && m.type.startsWith('display.')) { if (Lampfish.display) Lampfish.display.event(m); return; }
  if (m.type === 'audio.devices' || m.type === 'audio.levels') { if (Lampfish.audio) Lampfish.audio.event(m); return; }
  if (m.type && m.type.startsWith('notes.')) { if (Lampfish.notes) Lampfish.notes.event(m); return; }
  if (m.type && m.type.startsWith('shelf.')) { if (Lampfish.shelf) Lampfish.shelf.event(m); return; }
  if (m.type && m.type.startsWith('health.')) { if (Lampfish.health) Lampfish.health.event(m); return; }
  if (m.type && m.type.startsWith('duplicates.')) { if (Lampfish.duplicates) Lampfish.duplicates.event(m); return; }
  if (m.type && m.type.startsWith('convert.')) { if (Lampfish.convert) Lampfish.convert.event(m); return; }
  if (m.type && m.type.startsWith('taskbar.')) { if (Lampfish.taskbar) Lampfish.taskbar.event(m); return; }
  if (m.type === 'window.closed') { if (Lampfish.creator) Lampfish.creator.reset(); return; }
  render(m);
});

const DURATION_REMOVAL = 8000;
let removalShown = null;

function render(state) {
  if (!state || !Array.isArray(state.wallpapers)) return;
  const before = Lampfish.state;
  Lampfish.state = state;
  $('startup').checked = state.startup;
  $('mica-follows-row').hidden = !state.mica;
  $('mica-follows').checked = state.micaFollows !== false;
  $('weather').checked = state.weather;
  $('allow-test').checked = state.speedTest !== false;
  showViews(state.hiddenViews || []);
  if (Lampfish.layout) Lampfish.layout.state(state.layout || {});
  if (Lampfish.welcome) Lampfish.welcome.state(state);
  $('allow-ip').checked = state.publicIp !== false;
  $('allow-claude').checked = !!(state.claude && state.claude.on);
  $('claude-row').hidden = !(state.claude && state.claude.on);
  $('claude-state').textContent = claudeText(state.claude);
  renderCompanion(state.companion);
  if (Lampfish.help) Lampfish.help.state();
  $('place-row').hidden = !state.weather;
  if (!state.weather) $('place-results').hidden = true;
  $('place-state').textContent = state.weatherPlace || tr('Automatic, from the IP address');
  $('place-state').translate = !state.weatherPlace;
  $('place-auto').hidden = !state.weatherPlace;
  check('language', state.language || 'auto');
  check('zoom', String(state.zoom || 100));
  check('skin', state.skin || 'dark');
  if (state.day !== undefined) applyLight(state.day);
  if (state.mica !== undefined) document.documentElement.classList.toggle('mica', !!state.mica);
  if (zoomAsked == null) { zoomNow = state.zoom || 100; settleZoom(); }
  renderUpdates(state.updates);
  if (state.about) {
    $('about-version').textContent = tr('Version {0} · built on {1}', state.about.version, new Date(state.about.compile).toLocaleDateString(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' }));
    $('about-folder').textContent = state.about.folder;
    $('folder-lampfish').title = state.about.folder;
    $('about-errors').textContent = tr(state.about.errors ? 'Some errors were logged' : 'No errors logged');
  }
  renderWallpaper(state, before);
  if (Lampfish.station && state.station) Lampfish.station.state(state.station);
  if (Lampfish.icons && state.icons) Lampfish.icons.state(state.icons);
  if (Lampfish.mouse && state.mouse) Lampfish.mouse.state(state.mouse);
  if (Lampfish.arrange && state.arrange) Lampfish.arrange.state(state.arrange);
  if (Lampfish.arrange && state.grid) Lampfish.arrange.grid(state.grid);
  slideshowNote(state.windowsSlideshow);
  if (Lampfish.files && state.files) Lampfish.files.state(state.files);
  if (Lampfish.duplicates && state.duplicates) Lampfish.duplicates.state(state.duplicates);
  if (Lampfish.moods && state.moods) Lampfish.moods.state(state.moods);
  if (Lampfish.home) Lampfish.home.state();
  if (Lampfish.display) Lampfish.display.state();

  if (state.view && VIEWS.includes(state.view)) showView(state.view);

  const undoable = state.undoable || (state.removed ? tr('“{0}” removed', state.removed) : null);
  if (undoable && undoable !== removalShown) toast(undoable, true, DURATION_REMOVAL);
  if (!undoable && removalShown) $('toast').classList.remove('visible');
  removalShown = undoable;
  if (state.announcement) toast(state.announcement, false, 4000);
}

const UPDATE_STATES = {
  never: 'Not checked yet', checking: 'Checking…', latest: 'lampfish is up to date', none: 'No published version found yet', failed: 'GitHub could not be reached, try again later',
  installing: 'Installing, lampfish restarts by itself', damaged: 'The download was damaged, nothing was installed', downloadFailed: 'The download failed, try again later',
};
function renderUpdates(u) {
  if (!u) return;
  $('updates-auto').checked = u.auto;
  const ready = u.status === 'available';
  $('update-state').textContent = ready ? tr('Version {0} is available', u.version)
    : u.status === 'downloading' ? tr('Downloading version {0}, {1} %', u.version, u.progress)
    : tr(UPDATE_STATES[u.status] || UPDATE_STATES.never);
  $('update-check').innerHTML = icon(ready ? 'download-simple' : 'arrows-clockwise');
  $('update-check').append(tr(ready ? (u.installable ? 'Install it' : 'Download it') : 'Check now'));
  $('update-check').classList.toggle('update-ready', ready);
  $('update-check').disabled = ['checking', 'downloading', 'installing'].includes(u.status);
  document.querySelector('.service--settings').classList.toggle('has-update', ready);
}

let toastTimer = 0, toastUndo = null;
// A change made in the page alone, like the settings of Create, brings its own undo; the others ask the program.
function toast(text, undoable, duration, undo, label) {
  const t = $('toast');
  toastUndo = undo || null;
  $('undo').textContent = label || tr('Undo');
  $('toast-text').textContent = text;
  $('undo').hidden = !undoable;
  t.style.setProperty('--duration', duration + 'ms');
  t.classList.remove('visible');
  void t.offsetWidth;
  t.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('visible'), duration);
}
$('undo').addEventListener('click', () => {
  $('toast').classList.remove('visible');
  if (toastUndo) { const undo = toastUndo; toastUndo = null; undo(); }
  else send('undo');
});
// Reset everything, in every service: a first click arms the row and says what will happen, a second one within 6 s confirms.
const WARNING = icon('warning');
function confirmReset(button, warning, run) {
  let timer = 0, note = null;
  const disarm = () => {
    clearTimeout(timer);
    timer = 0;
    button.classList.remove('armed');
    if (note) { note.remove(); note = null; }
  };
  button.addEventListener('click', () => {
    if (timer) { disarm(); run(); return; }
    button.dataset.confirm = tr('Click again');
    button.classList.add('armed');
    note = document.createElement('p');
    note.className = 'warning-note';
    note.setAttribute('role', 'alert');
    note.innerHTML = WARNING + '<span></span>';
    note.querySelector('span').textContent = tr(typeof warning === 'function' ? warning() : warning);
    (button.closest('.group, .security__next') || button).after(note);
    timer = setTimeout(disarm, 6000);
  });
  button.addEventListener('blur', () => setTimeout(() => { if (timer && document.activeElement !== button) disarm(); }, 150));
}
confirmReset($('w-reset'), 'Light, speed, blur, saturation, dim, framing, slideshow, frame rate, pauses and sound reaction go back to default. The wallpaper stays.', () => send('resetWallpaper'));
confirmReset($('s-reset'), 'Every event gets its first sound back, only the events on by default stay on, and the volume goes back to 100 %.', () => send('station.resetAll'));
confirmReset($('r-reset'), 'The icons go back to where they were before lampfish first moved them, and the screen, arrangement, sort and category order go back to default.', () => send('arrange.resetAll'));

let depth = 0;
const carriesFiles = e => [...e.dataTransfer.types].includes('Files');
const DROP_HINTS = { wallpaper: 'Videos, GIFs, images or HTML pages', icons: 'ICO files or images', mouse: 'Cursor files, .cur or .ani', station: 'MP3, AAC, OGG, FLAC or WAV sounds', shelf: 'Any file: a copy goes on the shelf', convert: 'Files to convert: images, PDF, text, Office' };
addEventListener('dragenter', e => {
  const view = document.body.dataset.view;
  // A card of Shelf on its way out to another app is not a file coming in.
  if (!carriesFiles(e) || !DROP_HINTS[view] || (Lampfish.shelf && Lampfish.shelf.out)) return;
  e.preventDefault();
  $('drop-hint').textContent = tr(DROP_HINTS[view]);
  if (++depth === 1) document.body.classList.add('drag');
});
addEventListener('dragleave', () => {
  if (depth > 0 && --depth === 0) document.body.classList.remove('drag');
});
addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = carriesFiles(e) ? 'copy' : 'none'; });
addEventListener('drop', e => {
  e.preventDefault();
  depth = 0;
  document.body.classList.remove('drag');
  const files = e.dataTransfer.files;
  if (!files.length || (Lampfish.shelf && Lampfish.shelf.out)) return;
  const view = document.body.dataset.view;
  const action = { icons: 'icons.drop', mouse: 'mouse.drop', wallpaper: 'drop', shelf: 'shelf.drop', convert: 'convert.drop' }[view];
  if (view === 'station' && Lampfish.station) Lampfish.station.ingest([...files]);
  else if (action) {
    try { webview.postMessageWithAdditionalObjects({ action }, files); }
    catch (x) { toast(tr('Only files saved on this PC can be added: save it first, then drop the file'), false, 5000); }
  }
});

$('startup').addEventListener('change', () => send('startup'));
$('mica-follows').addEventListener('change', e => send('display.micaFollows', { value: e.target.checked }));
$('weather').addEventListener('change', () => { send('weather'); send('home.weather'); });
$('allow-test').addEventListener('change', () => send('speedTest', { value: $('allow-test').checked }));

// A service can leave the bar; it keeps working, and Settings or the edit mode of the bar bring it back. Its card on Home is pinned apart.
let hiddenViews = [];
function showViews(list) {
  hiddenViews = list;
  for (const b of document.querySelectorAll('.rail .service[data-view]')) b.hidden = list.includes(b.dataset.view);
  for (const input of document.querySelectorAll('.tr-row [data-show]')) input.checked = !list.includes(input.dataset.show);
}
for (const row of document.querySelectorAll('.tr-row[data-view]')) {
  const view = row.dataset.view;
  if (view === 'home' || view === 'help' || view === 'settings' || view in PART_OF) continue;
  const box = document.createElement('span');
  box.className = 'toggler tr-show';
  box.title = tr('Shown in the bar');
  box.innerHTML = '<input type="checkbox" checked>';
  const input = box.firstChild;
  input.dataset.show = view;
  input.setAttribute('aria-label', tr('Shown in the bar'));
  box.addEventListener('click', e => e.stopPropagation());
  input.addEventListener('change', () => send('hideView', { view, hidden: !input.checked }));
  row.querySelector('summary .chevron').before(box);
}
$('allow-ip').addEventListener('change', () => send('publicIp', { value: $('allow-ip').checked }));
$('allow-claude').addEventListener('change', e => send('claude.toggle', { on: e.target.checked }));

// Companion: on or off, and its three shortcuts, each with its own switch and keys.
$('companion-on').addEventListener('change', e => send('companion.set', { on: e.target.checked }));
const companionKeys = {};
for (const row of document.querySelectorAll('[data-companion-key]')) {
  const which = row.dataset.companionKey;
  row.querySelector('input').addEventListener('change', e => send('companion.keyOn', { which, on: e.target.checked }));
  companionKeys[which] = shortcutKeys(row.querySelector('button'), row.querySelector('small'), k => send('companion.key', Object.assign({ which }, k)));
}
const COMPANION_TABS = [['dashboard', 'Dashboard', 'squares-four'], ['quick', 'Settings', 'sliders'], ['claude', 'Claude', 'chart-pie-slice'], ['note', 'Note', 'note'], ['capture', 'Capture', 'scan'], ['shelf', 'Shelf', 'tray'], ['audio', 'Audio', 'speaker-high'], ['notes', 'Notes', 'notebook'], ['convert', 'Convert', 'arrows-left-right'], ['desktop', 'Desktop', 'desktop']];
let companionHidden = [];
for (const [id, label, symbol] of COMPANION_TABS) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'tool-chip';
  b.dataset.tab = id;
  b.innerHTML = icon(symbol);
  b.append(tr(label));
  b.setAttribute('aria-pressed', 'true');
  b.addEventListener('click', () => {
    const hidden = companionHidden.includes(id) ? companionHidden.filter(x => x !== id) : [...companionHidden, id];
    if (hidden.length >= COMPANION_TABS.length) return;
    send('companion.tabs', { hidden });
  });
  $('companion-tabs').append(b);
}
function renderCompanion(c) {
  if (!c) return;
  $('companion-on').checked = c.on;
  companionHidden = c.hiddenTabs || [];
  $('companion-tabs-row').hidden = !c.on;
  for (const b of $('companion-tabs').children) b.setAttribute('aria-pressed', String(!companionHidden.includes(b.dataset.tab)));
  for (const row of document.querySelectorAll('[data-companion-key]')) {
    const k = c[row.dataset.companionKey];
    row.hidden = !c.on;
    row.querySelector('input').checked = k.on;
    companionKeys[row.dataset.companionKey].show(k.label, k.on ? k.error : null);
  }
}

// What the Claude usage line says, shared by Settings, Home and the companion.
const CLAUDE_STATES = { missing: 'Claude Code is not signed in on this PC', expired: 'The sign-in of Claude Code has expired: open Claude Code to renew it', offline: 'No answer from Anthropic for now', unknown: 'Anthropic answered in a way lampfish does not know yet', reading: 'Reading' };
function claudeText(c) {
  if (!c || !c.on) return '';
  const u = c.usage;
  if (c.status !== 'ok' || !u) return tr(CLAUDE_STATES[c.status] || 'Reading');
  return [u.session && tr('Session {0} %, resets in {1}', u.session.percent, resetIn(u.session.resets)), u.week && tr('Week {0} %', u.week.percent)].filter(Boolean).join(' · ');
}

const PIN = icon('map-pin', 'glyph');
let placeTimer = 0;
$('place-search').addEventListener('input', e => {
  clearTimeout(placeTimer);
  const query = e.target.value.trim();
  placeTimer = setTimeout(() => send('home.search', { query }), query.length < 2 ? 0 : 350);
});
$('place-auto').addEventListener('click', () => send('home.automatic'));

function renderPlaces(m) {
  const zone = $('place-results'), query = $('place-search').value.trim();
  const rows = m.places.map(p => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'row action';
    b.translate = false;
    b.innerHTML = '<span class="caption">' + PIN + '<span><small></small></span></span>';
    b.querySelector('small').textContent = p.label;
    b.querySelector('small').before(p.name);
    b.addEventListener('click', () => {
      send('home.place', p);
      $('place-search').value = '';
      zone.hidden = true;
    });
    return b;
  });
  if (!rows.length && query.length >= 2) {
    const e = document.createElement('div');
    e.className = 'row empty';
    e.textContent = tr(m.failed ? 'Open-Meteo could not be reached, try again later' : 'No city found');
    rows.push(e);
  }
  zone.replaceChildren(...rows);
  zone.hidden = !rows.length;
}
$('updates-auto').addEventListener('change', e => send('updates.auto', { value: e.target.checked }));
$('update-check').addEventListener('click', () => {
  const u = (Lampfish.state && Lampfish.state.updates) || {};
  send(u.status !== 'available' ? 'updates.check' : u.installable ? 'updates.install' : 'updates.open');
});
$('folder-lampfish').addEventListener('click', () => send('folderLampfish'));
$('log-errors').addEventListener('click', () => send('log'));

for (const p of document.querySelectorAll('.caption small')) if (p.textContent) p.title = p.textContent;

for (const b of $('language').children) b.addEventListener('click', () => {
  if (b.getAttribute('aria-checked') === 'true') return;
  check('language', b.dataset.value);
  send('language', { value: b.dataset.value });
});
$('quit').addEventListener('click', () => send('quit'));

const TYPES = { video: 'Video', gif: 'GIF', image: 'Image', html: 'Live' };
let keyGrid = '', keyHero = null;

let hero = null, heroDirect = false, heroSet = '', reload = 0;

const lightText = v => v + ' %';
const speedText = v => '×' + Math.pow(2, (v - 50) / 25).toLocaleString(LOCALE, { maximumFractionDigits: 2 });

const CURSORS = {
  light: { text: lightText, normal: 50 },
  speed: { text: speedText, normal: 50 },
  blur: { text: v => v + ' %', normal: 0 },
  saturation: { text: v => v * 2 + ' %', normal: 50 },
  dim: { text: v => v + ' %', normal: 0 },
};
const withoutExtension = name => name.replace(/\.[a-z0-9]{2,5}$/i, '');
const currentWallpaper = () => Lampfish.state && Lampfish.state.wallpapers ? Lampfish.state.wallpapers.find(f => f.name === Lampfish.state.current) : null;
function wallpaperFor(key) {
  const state = Lampfish.state;
  if (!state || !state.wallpapers) return null;
  const d = (state.displays || []).find(x => x.key === key);
  return state.wallpapers.find(f => f.name === (d && d.wallpaper ? d.wallpaper : state.current));
}


// Drawings in light on the glass of a round seal: the dots of the screen, then the lines lit by the lamp color of their card.
// Filters of an inline SVG are found by id in the whole page, so each drawing needs its own ids.
function litDrawing(id, lines, fill) {
  return `<svg class="seal__face" viewBox="0 0 64 64" aria-hidden="true"><defs><filter id="${id}-bloom" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2"/></filter></defs>${fill || ''}`
    + `<g fill="none" stroke-linecap="round" stroke-linejoin="round"><g style="stroke:var(--lamp)" stroke-width="6" opacity=".5" filter="url(#${id}-bloom)">${lines}</g><g style="stroke:var(--lamp-hi)" stroke-width="3.2">${lines}</g></g></svg>`;
}
const SHIELD = 'M32 11 49 17v13c0 10.6-6.8 18.4-17 22.6C21.8 48.4 15 40.6 15 30V17z';
function shieldLight(id, level) {
  const mark = { high: 'M24.5 31 29.8 36.3 40 25.5', medium: 'M32 22.5V32.5M32 39.5v.5', low: 'M26.5 25.5l11 11M37.5 25.5l-11 11' }[level] || 'M32 22.5V32.5M32 39.5v.5';
  return litDrawing(id, `<path d="${SHIELD}"/><path d="${mark}"/>`, `<path d="${SHIELD}" style="fill:var(--lamp)" opacity=".14"/>`);
}
function faceLight(id, level) {
  const mouth = { high: 'M21 36.5Q32 47 43 36.5', medium: 'M22 40.5H42', low: 'M21 44Q32 34 43 44' }[level] || 'M22 40.5H42';
  return litDrawing(id, `<path d="M24.5 24.5v4.5M39.5 24.5v4.5"/><path d="${mouth}"/>`);
}

// An element moved in the page slides from where it was instead of jumping. `from` is its old place on screen.
function slide(el, from, duration = 200) {
  if (!from || calm.matches || !el.isConnected) return;
  if (el._slide) el._slide.cancel();
  const now = el.getBoundingClientRect(), dx = from.left - now.left, dy = from.top - now.top;
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
  el._slide = el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration, easing: 'cubic-bezier(.2, .7, .3, 1)' });
  el._slide.onfinish = el._slide.oncancel = () => { el._slide = null; };
}
const sliding = el => !!el._slide;

// Runs change(), then lets each element glide from its old place to its new one.
function glide(elements, change) {
  const before = new Map(elements.map(el => [el, el.getBoundingClientRect()]));
  change();
  for (const [el, from] of before) slide(el, from);
}

// For a list rebuilt from scratch: the new elements glide from the places of the old ones with the same key.
function glideRebuilt(zone, key, rebuild) {
  const before = new Map([...zone.children].map(el => [el.dataset[key], el.getBoundingClientRect()]));
  rebuild();
  for (const el of zone.children) slide(el, before.get(el.dataset[key]));
}

// In an edit mode an item moves among its peers with the pointer, or with the arrow keys while it has the focus.
// The grabbed item follows the pointer and its peers glide out of its way; at the end it settles in its place.
// move(item, other, after) places it, done() saves the order, group() lists every element that may shift (peers by default),
// skip is a selector of parts that do not start a drag. A click that ends a drag is flagged so it does not count.
function dragOrder(item, { peers, active, done, move, focus, group, skip }) {
  let start = null, dragging = false, last = null, home = null, origin = null;
  const place = move || ((a, b, after) => b.parentElement.insertBefore(a, after ? b.nextSibling : b));
  const shifting = group || peers;
  // Where the item sits in the layout, without the offset that makes it follow the pointer.
  const spot = () => { const t = item.style.transform; item.style.transform = ''; const r = item.getBoundingClientRect(); item.style.transform = t; return r; };
  const follow = e => {
    if (!start || e.pointerId !== start.id) return;
    if (!dragging) {
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < 6) return;
      dragging = true;
      if (item._slide) item._slide.cancel();
      origin = home = spot();
      item.classList.add('grabbed');
    }
    const list = peers();
    const under = list.find(x => { if (x === item || sliding(x)) return false; const r = x.getBoundingClientRect(); return e.clientX >= r.left && e.clientX < r.right && e.clientY >= r.top && e.clientY < r.bottom; });
    if (!under) last = null;
    else if (under !== last) {
      last = under;
      glide(shifting().filter(x => x !== item), () => place(item, under, list.indexOf(under) > list.indexOf(item)));
      home = spot();
    }
    item.style.transform = `translate(${e.clientX - start.x - (home.left - origin.left)}px, ${e.clientY - start.y - (home.top - origin.top)}px) scale(1.02)`;
  };
  const end = e => {
    if (!start || e.pointerId !== start.id) return;
    removeEventListener('pointermove', follow);
    removeEventListener('pointerup', end);
    removeEventListener('pointercancel', end);
    const moved = dragging;
    start = null;
    dragging = false;
    item.classList.remove('grabbed');
    if (!moved) return;
    const from = item.getBoundingClientRect();
    item.style.transform = '';
    slide(item, from, 180);
    item._dragged = true;
    setTimeout(() => { item._dragged = false; }, 0);
    done();
  };
  // The page listens rather than the item: moving the item in the page would release a pointer capture.
  item.addEventListener('pointerdown', e => {
    if (e.button !== 0 || !active() || (skip && e.target.closest(skip))) return;
    start = { x: e.clientX, y: e.clientY, id: e.pointerId };
    dragging = false;
    last = null;
    addEventListener('pointermove', follow);
    addEventListener('pointerup', end);
    addEventListener('pointercancel', end);
  });
  item.addEventListener('keydown', e => {
    const step = { ArrowUp: -1, ArrowLeft: -1, ArrowDown: 1, ArrowRight: 1 }[e.key];
    if (!step || !active() || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
    e.preventDefault();
    e.stopPropagation();
    const list = peers(), other = list[list.indexOf(item) + step];
    if (!other) return;
    glide(shifting(), () => place(item, other, step > 0));
    (focus || item).focus();
    done();
  });
}

// A button that records a global shortcut: a click, then the keys; Escape cancels. Ctrl or Alt is needed, except with an F key.
// save({ mods, key, label }) gets the Windows modifiers (Alt 1, Ctrl 2, Shift 4) and virtual key; show(label, error) paints the saved state.
const KEY_NAMED = { Space: 0x20, PageUp: 0x21, PageDown: 0x22, End: 0x23, Home: 0x24, ArrowLeft: 0x25, ArrowUp: 0x26, ArrowRight: 0x27, ArrowDown: 0x28, Insert: 0x2D, Delete: 0x2E,
  Semicolon: 0xBA, Equal: 0xBB, Comma: 0xBC, Minus: 0xBD, Period: 0xBE, Slash: 0xBF, Backquote: 0xC0, BracketLeft: 0xDB, Backslash: 0xDC, BracketRight: 0xDD, Quote: 0xDE };
const KEY_SHOWN = { Space: 'Space', PageUp: 'Page Up', PageDown: 'Page Down', ArrowLeft: 'Left', ArrowUp: 'Up', ArrowRight: 'Right', ArrowDown: 'Down' };
function virtualKey(code) {
  let x;
  if ((x = /^Key([A-Z])$/.exec(code))) return [x[1].charCodeAt(0), x[1]];
  if ((x = /^Digit(\d)$/.exec(code))) return [0x30 + Number(x[1]), x[1]];
  if ((x = /^Numpad(\d)$/.exec(code))) return [0x60 + Number(x[1]), 'Num ' + x[1]];
  if ((x = /^F(\d{1,2})$/.exec(code)) && x[1] >= 1 && x[1] <= 24) return [0x6F + Number(x[1]), code];
  if (code in KEY_NAMED) return [KEY_NAMED[code], KEY_SHOWN[code] || null];
  return null;
}
function shortcutKeys(button, help, save) {
  let recording = false, label = '', error = null;
  button.classList.add('shortcut-keys');
  button.translate = false;
  help.classList.add('shortcut-help');
  const paint = () => {
    button.classList.toggle('is-recording', recording);
    button.innerHTML = icon('keyboard');
    button.append(recording ? tr('Press the keys…') : label);
    help.classList.toggle('is-error', error === 'taken' && !recording);
    help.textContent = recording ? tr('Press the keys, or Escape') : tr(error === 'taken' ? 'Already used by another app, choose other keys' : 'Click, then press the new keys');
  };
  const stop = () => { if (!recording) return; recording = false; paint(); };
  button.addEventListener('click', () => { recording = !recording; paint(); });
  button.addEventListener('blur', stop);
  addEventListener('keydown', e => {
    if (!recording) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.key === 'Escape') { stop(); return; }
    if (['Control', 'Alt', 'Shift', 'Meta', 'AltGraph'].includes(e.key)) return;
    const found = virtualKey(e.code);
    if (!found) return;
    if (!e.ctrlKey && !e.altKey && !/^F\d/.test(e.code)) { help.textContent = tr('Add Ctrl or Alt to the key'); return; }
    const mods = (e.altKey ? 1 : 0) | (e.ctrlKey ? 2 : 0) | (e.shiftKey ? 4 : 0);
    const text = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', found[1] || e.key.toUpperCase()].filter(Boolean).join(' + ');
    stop();
    save({ mods, key: found[0], label: text });
  }, true);
  return { show(l, e) { label = l; error = e; if (!recording) paint(); }, stop };
}

// Rows that depend on an option open and close smoothly: a row that pops in or out makes everything under it jump.
const calm = matchMedia('(prefers-reduced-motion: reduce)'), loadedAt = performance.now();
function reveal(el, show) {
  if (!el || (el._reveal ? el._wanted === show : el.hidden === !show)) return;
  if (el._reveal) el._reveal.cancel();
  el._wanted = show;
  const parent = el.parentElement;
  if (calm.matches || !parent || !parent.offsetParent || performance.now() - loadedAt < 800) { el._reveal = null; el.hidden = !show; return; }
  el.hidden = false;
  const style = getComputedStyle(el);
  const open = { height: el.offsetHeight + 'px', minHeight: style.minHeight, paddingTop: style.paddingTop, paddingBottom: style.paddingBottom, opacity: 1 };
  const shut = { height: '0px', minHeight: '0px', paddingTop: '0px', paddingBottom: '0px', opacity: 0 };
  el.style.overflow = 'hidden';
  const a = el._reveal = el.animate(show ? [shut, open] : [open, shut], { duration: show ? 220 : 180, easing: show ? 'cubic-bezier(.2, .7, .3, 1)' : 'ease-in' });
  a.onfinish = () => { el._reveal = null; el.style.overflow = ''; if (!show) el.hidden = true; };
  a.oncancel = () => { el.style.overflow = ''; };
}

let heroScreen = '';
try { heroScreen = localStorage.getItem('wallpaper.screen') || ''; } catch (e) { }
const heroDisplay = () => { const list = (Lampfish.state && Lampfish.state.displays) || []; return list.find(d => d.key === heroScreen) || list.find(d => d.primary) || list[0]; };
const shownWallpaper = () => heroScreen ? wallpaperFor(heroScreen) : currentWallpaper();

function renderScreens(state) {
  const list = state.displays || [];
  if (heroScreen && !list.some(d => d.key === heroScreen)) heroScreen = '';
  const zone = $('hero-screens');
  zone.hidden = list.length < 2;
  const key = list.map(d => d.key).join('|') + '#' + heroScreen;
  if (zone.dataset.key === key) return;
  zone.dataset.key = key;
  zone.replaceChildren(...[{ key: '', n: tr('All') }, ...list].map(d => {
    const b = document.createElement('button');
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(d.key === heroScreen));
    b.textContent = d.n;
    b.title = d.key ? tr('Screen {0}', d.n) + (d.primary ? tr(' (main)') : '') + '\n' + d.w + ' × ' + d.h : tr('Every screen');
    b.addEventListener('click', () => {
      heroScreen = d.key;
      try { localStorage.setItem('wallpaper.screen', heroScreen); } catch (e) { }
      renderWallpaper(Lampfish.state, Lampfish.state);
    });
    return b;
  }));
}

function fitHero() {
  const d = heroDisplay(), box = $('hero-preview'), s = d && d.scale ? d.scale : 1;
  const vw = d ? d.w / s : 1920, vh = d ? d.h / s : 1080;
  const k = Math.max(box.clientWidth / vw, box.clientHeight / vh) || .5;
  $('hero').style.setProperty('--vw', vw.toFixed(1));
  $('hero').style.setProperty('--vh', vh.toFixed(1));
  $('hero').style.setProperty('--k', k.toFixed(5));
  return k;
}
new ResizeObserver(() => { fitHero(); if (Lampfish.state) heroEffects(Number($('blur').value), Number($('saturation').value), Number($('dim').value)); }).observe($('hero'));

function renderWallpaper(state, before) {
  $('pause').textContent = state.paused ? 'Resume' : 'Pause';
  renderScreens(state);
  fitHero();

  $('hero').classList.toggle('paused', state.paused);
  $('hero').classList.toggle('on-battery', state.onBattery);
  $('hero-type').textContent = state.onBattery ? 'Paused on battery' : (shownWallpaper() ? TYPES[shownWallpaper().type] : '');

  for (const id in CURSORS) {
    $(id).value = state[id];
    $(id + '-value').textContent = CURSORS[id].text(state[id]);
    fill($(id));
  }
  heroEffects(state.blur, state.saturation, state.dim);
  check('fit', state.fit);
  $('w-reset').disabled = Object.keys(CURSORS).every(id => state[id] === CURSORS[id].normal) && state.fit === 'fill' && !state.slideshow && !state.shuffle
    && (state.frameRate || 60) === 60 && state.pauseAuto && !state.pauseOnBattery && !state.reactive;
  check('slideshow', String(state.slideshow));
  check('frameRate', String(state.frameRate || 60));
  $('shuffle').checked = !!state.shuffle;
  $('pauseAuto').checked = state.pauseAuto;
  $('pauseOnBattery').checked = state.pauseOnBattery;
  $('reactive').checked = state.reactive;
  reveal($('level-row'), state.reactive);

  const wallpaper = shownWallpaper();
  $('speed').disabled = !!wallpaper && wallpaper.type === 'gif';

  const key = state.wallpapers.map(f => f.name + '@' + f.stamp).join('|');
  if (key !== keyGrid) { keyGrid = key; buildGrid(); }
  if (document.body.dataset.dock === 'wallpaper') renderWallpaperDock();
  const list = state.displays || [], split = list.length > 1 && list.some(d => d.wallpaper);
  for (const card of document.querySelectorAll('.card')) {
    card.classList.toggle('current', !!wallpaper && card.dataset.name === wallpaper.name);
    const using = split ? list.filter(d => (d.wallpaper || state.current) === card.dataset.name) : [];
    card.querySelector('.badge-screens').replaceChildren(...using.map(d => Object.assign(document.createElement('i'), { textContent: d.n, title: tr('Screen {0}', d.n) })));
  }
  $('count').textContent = state.wallpapers.length;
  const keyV = (wallpaper ? wallpaper.name + '@' + wallpaper.stamp : '') + '|' + state.fit + '|' + heroScreen;
  if (keyV !== keyHero) { keyHero = keyV; buildHero(); }
  else adjustHero(state.light, state.speed);
  if (!before || before.paused !== state.paused || before.onBattery !== state.onBattery) freezeHero();
}

function urlHero(wallpaper, light, speed) {
  const settings = `light=${light}&speed=${speed}&fit=${Lampfish.state.fit}&v=${wallpaper.stamp}`;
  if (wallpaper.type === 'html') return `${wallpaper.url}?${settings}`;
  return `/app/player/player.html?type=${wallpaper.type}&src=${encodeURIComponent(wallpaper.url)}&${settings}`;
}

function buildHero() {
  const wallpaper = shownWallpaper(), state = Lampfish.state;
  const zone = $('hero-preview');
  zone.replaceChildren();
  hero = null; heroDirect = false;
  $('hero-name').textContent = wallpaper ? withoutExtension(wallpaper.name) : '';
  $('hero-name').title = wallpaper ? wallpaper.name : '';
  $('hero-type').textContent = wallpaper ? TYPES[wallpaper.type] : '';
  if (!wallpaper) {
    zone.innerHTML = '<div class="empty">No wallpaper selected</div>';
    return;
  }
  hero = document.createElement('iframe');
  hero.tabIndex = -1;
  hero.className = 'arriving';
  const frame = hero;
  frame.addEventListener('load', () => setTimeout(() => frame.classList.remove('arriving'), 120), { once: true });
  hero.src = urlHero(wallpaper, state.light, state.speed);
  heroSet = state.light + '|' + state.speed;
  zone.append(hero);
}

function adjustHero(light, speed) {
  const key = light + '|' + speed;
  if (!hero || key === heroSet) return;
  heroSet = key;
  if (heroDirect) {
    hero.contentWindow.postMessage({ lampfish: 'adjust', light, speed }, '*');
    return;
  }
  clearTimeout(reload);
  reload = setTimeout(() => {
    const wallpaper = shownWallpaper();
    if (wallpaper && hero) hero.src = urlHero(wallpaper, light, speed);
  }, 250);
}

function heroEffects(blur, saturation, dim) {
  const filters = [];
  if (blur > 0) filters.push(`blur(${(blur * 0.3 * (Number($('hero').style.getPropertyValue('--k')) || .5)).toFixed(2)}px)`);
  if (saturation != 50) filters.push(`saturate(${saturation / 50})`);
  $('hero-effects').style.backdropFilter = filters.join(' ') || 'none';
  $('hero-effects').style.background = `rgba(0, 0, 0, ${dim / 100 * 0.75})`;
}

function check(group, value) {
  for (const b of $(group).children) b.setAttribute('aria-checked', String(b.dataset.value === value));
}

function freezeHero() {
  if (hero && heroDirect) hero.contentWindow.postMessage({ lampfish: 'freeze', value: Lampfish.state.paused || Lampfish.state.onBattery }, '*');
}

addEventListener('message', e => {
  if (!hero || e.source !== hero.contentWindow || !e.data || e.data.lampfish !== 'ready') return;
  heroDirect = true;
  heroSet = '';
  adjustHero(Number($('light').value), Number($('speed').value));
  freezeHero();
});

function buildGrid() {
  const grid = $('grid');
  grid.replaceChildren();
  for (const wallpaper of Lampfish.state.wallpapers) {
    const card = document.createElement('article');
    card.className = 'card';
    card.tabIndex = 0;
    card.dataset.name = wallpaper.name;
    card.innerHTML = `<div class="preview"></div>
      <div class="footer"><span class="name"></span><span class="badge-screens"></span><span class="badge">${TYPES[wallpaper.type]}</span></div>
      <div class="card-actions">${wallpaper.custom ? '<button class="edit" tabindex="-1">Edit</button>' : ''}${wallpaper.bundled ? '' : '<button class="remove" tabindex="-1">Remove</button>'}</div>`;
    card.querySelector('.name').textContent = withoutExtension(wallpaper.name);
    card.querySelector('.name').translate = false;
    card.querySelector('.name').title = wallpaper.name;
    card.querySelector('.preview').append(preview(wallpaper, card));

    const choose = () => send('choose', { name: wallpaper.name, screen: heroScreen });
    const button = card.querySelector('.remove');
    let armed = 0;
    const disarm = () => { clearTimeout(armed); armed = 0; if (!button) return; button.textContent = tr('Remove'); button.classList.remove('armed'); };
    const remove = () => {
      if (!button) return;
      if (armed) { disarm(); send('remove', { name: wallpaper.name }); return; }
      button.textContent = tr('Confirm');
      button.classList.add('armed');
      armed = setTimeout(disarm, 3000);
    };
    card.addEventListener('mouseleave', disarm);
    const edit = card.querySelector('.edit');
    if (edit) edit.addEventListener('click', e => { e.stopPropagation(); send('creator.open', { name: wallpaper.name }); });
    card.addEventListener('click', choose);
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(); }
      if (e.key === 'Delete') { e.preventDefault(); remove(); }
    });

    if (button) button.addEventListener('click', e => { e.stopPropagation(); remove(); });
    grid.append(card);
  }

  const add = document.createElement('button');
  add.className = 'add';
  add.innerHTML = '<strong>+</strong>Add';
  add.addEventListener('click', () => send('add'));
  grid.append(add);
}

function renderWallpaperDock() {
  const zone = $('dock-pick'), state = Lampfish.state;
  if (document.body.dataset.dock !== 'wallpaper' || !state || !state.wallpapers) return;
  const key = state.wallpapers.map(f => f.name + '@' + f.stamp).join('|') + '#' + LANGUAGE;
  if (zone.dataset.key !== key || !zone.firstChild) {
    zone.dataset.key = key;
    const grid = document.createElement('div');
    grid.className = 'dock-wallpapers';
    grid.append(...state.wallpapers.map(wallpaper => {
      const b = document.createElement('button');
      b.className = 'dock-wallpaper';
      b.dataset.name = wallpaper.name;
      b.innerHTML = '<span class="preview"></span><span class="dock-wallpaper__name"></span>';
      b.firstChild.append(preview(wallpaper, b));
      b.lastChild.textContent = withoutExtension(wallpaper.name);
      b.lastChild.translate = false;
      b.title = wallpaper.name;
      b.addEventListener('click', () => send('choose', { name: wallpaper.name }));
      return b;
    }));
    zone.replaceChildren(Object.assign(document.createElement('h2'), { textContent: tr('Wallpapers') }), grid);
    foldSections(zone, 'dock-wallpaper');
  }
  const current = shownWallpaper();
  for (const b of zone.querySelectorAll('.dock-wallpaper')) b.setAttribute('aria-pressed', String(!!current && b.dataset.name === current.name));
}
Lampfish.wallpaper = { visible() { }, renderDock: renderWallpaperDock };

function livePreview(wallpaper, card) {
  if (wallpaper.type !== 'html') return preview(wallpaper, card);
  const e = Lampfish.state || {};
  const frame = document.createElement('iframe');
  frame.src = wallpaper.url + '?light=' + (e.light != null ? e.light : 50) + '&speed=' + (e.speed != null ? e.speed : 50) + '&fit=' + (e.fit || 'fill') + '&v=' + wallpaper.stamp;
  frame.tabIndex = -1;
  return frame;
}

function preview(wallpaper, card, light = 50, speed = 50) {
  if (wallpaper.type === 'html') {
    const frame = document.createElement('iframe');
    frame.src = `${wallpaper.url}?light=${light}&speed=${speed}&thumbnail=1&v=${wallpaper.stamp}`;
    frame.loading = 'lazy';
    frame.tabIndex = -1;
    let live = null, leaving = 0;
    card.addEventListener('mouseenter', () => {
      clearTimeout(leaving);
      if (live) { live.classList.add('shown'); return; }
      live = document.createElement('iframe');
      live.className = 'live';
      live.tabIndex = -1;
      live.addEventListener('load', () => { if (live && card.matches(':hover')) live.classList.add('shown'); });
      live.src = `${wallpaper.url}?light=${light}&speed=${speed}&v=${wallpaper.stamp}`;
      frame.after(live);
    });
    card.addEventListener('mouseleave', () => {
      if (!live) return;
      live.classList.remove('shown');
      leaving = setTimeout(() => { if (live) { live.remove(); live = null; } }, 320);
    });
    return frame;
  }
  if (wallpaper.type === 'video') {
    const video = Object.assign(document.createElement('video'), { src: wallpaper.url + '#t=0.5', muted: true, loop: true, preload: 'metadata' });
    card.addEventListener('mouseenter', () => video.play());
    card.addEventListener('mouseleave', () => video.pause());
    return video;
  }
  return Object.assign(document.createElement('img'), { src: wallpaper.url, loading: 'lazy', alt: '' });
}

$('grid').addEventListener('keydown', e => {
  const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: 'up', ArrowDown: 'down' }[e.key];
  if (!step) return;
  const cases = [...$('grid').children];
  const i = cases.indexOf(document.activeElement);
  if (i < 0) return;
  const columns = getComputedStyle($('grid')).gridTemplateColumns.split(' ').length;
  const j = step === 'up' ? i - columns : step === 'down' ? i + columns : i + step;
  if (cases[j]) { e.preventDefault(); cases[j].focus(); }
});

const TASKBAR_APPS = [
  '<svg viewBox="0 0 24 24"><path fill="#47a0ff" d="M3 3.5h8.2v8.2H3zM12.8 3.5H21v8.2h-8.2zM3 13.3h8.2v8.2H3zM12.8 13.3H21v8.2h-8.2z"/></svg>',
  '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="13" rx="2.4" fill="#f4c542"/><path d="M3 9.5h18v7.6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" fill="#ffd966"/><path d="M3 8.6a2.4 2.4 0 0 1 2.4-2.4h4l1.6 2z" fill="#e0a82e"/></svg>',
  '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="#1d7fe6"/><path d="M12 3a9 9 0 0 0-9 9h10a3 3 0 0 0 0-6h-1z" fill="#34d399"/><path d="M5.5 13c2-3.6 6.4-4.4 10-2.6 1.6.8 2.6 2.2 3 3.6-1.8-1.4-3.8-1.8-6-1.4-2.4.4-4.4 2-7 .4z" fill="#0a3a8a" opacity=".55"/></svg>',
  '<svg viewBox="0 0 24 24"><rect x="3" y="4.5" width="18" height="15" rx="3" fill="#191e1f" stroke="#4d5355" stroke-width="1"/><path d="m7.5 9.5 3 2.5-3 2.5M12.5 15h4" fill="none" stroke="#a9cac4" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  '<svg viewBox="0 0 24 24"><image href="/brand/logo/logo-lampfish-192.png" x="2" y="2" width="20" height="20"/></svg>',
].map((svg, i) => `<i${i === 4 ? ' class="on"' : ''}>${svg}</i>`).join('');
const TASKBAR_TRAY = icon('caret-up') + icon('wifi-high') + icon('speaker-low') + icon('battery-medium');

function taskbars(e) {
  const margins = [[e.ty - e.y, e.h, 'top'], [e.y + e.h - e.ty - e.th, e.h, 'bottom'], [e.tx - e.x, e.w, 'left'], [e.x + e.w - e.tx - e.tw, e.w, 'right']];
  const bars = [];
  for (const [size, total, side] of margins) {
    if (size < 4) continue;
    const bar = document.createElement('div');
    bar.className = 'taskbar taskbar--' + side;
    bar.style[side === 'top' || side === 'bottom' ? 'height' : 'width'] = (size / total * 100).toFixed(3) + '%';
    if (side === 'bottom' || side === 'top') {
      const now = new Date();
      bar.innerHTML = `<span class="taskbar__apps">${TASKBAR_APPS}</span><span class="taskbar__tray">${TASKBAR_TRAY}<span class="taskbar__clock"><b>${now.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' })}</b><b>${now.toLocaleDateString(LOCALE)}</b></span></span>`;
    }
    bars.push(bar);
  }
  return bars;
}

function throttle(f, ms) {
  let last = 0, waiting = 0;
  return v => {
    clearTimeout(waiting);
    const rest = last + ms - Date.now();
    if (rest <= 0) { last = Date.now(); f(v); }
    else waiting = setTimeout(() => { last = Date.now(); f(v); }, rest);
  };
}
for (const id in CURSORS) {
  const cursor = $(id), { text, normal } = CURSORS[id];
  const live = throttle(value => send(id, { value, live: true }), 80);
  cursor.addEventListener('input', () => {
    $(id + '-value').textContent = text(cursor.value);
    fill(cursor);
    adjustHero(Number($('light').value), Number($('speed').value));
    heroEffects(Number($('blur').value), Number($('saturation').value), Number($('dim').value));
    live(Number(cursor.value));
  });
  cursor.addEventListener('change', () => send(id, { value: Number(cursor.value) }));

  cursor.addEventListener('dblclick', () => {
    if (cursor.disabled || Number(cursor.value) === normal) return;
    cursor.value = normal;
    cursor.dispatchEvent(new Event('input'));
    cursor.dispatchEvent(new Event('change'));
  });
}
for (const group of ['fit', 'slideshow', 'frameRate'])
  for (const b of $(group).children)
    b.addEventListener('click', () => {
      check(group, b.dataset.value);
      send(group, { value: group === 'fit' ? b.dataset.value : Number(b.dataset.value) });
    });
$('shuffle').addEventListener('change', e => send('shuffle', { value: e.target.checked }));
$('pauseAuto').addEventListener('change', e => send('pauseAuto', { value: e.target.checked }));
$('pauseOnBattery').addEventListener('change', e => send('pauseOnBattery', { value: e.target.checked }));
$('reactive').addEventListener('change', e => send('reactive', { value: e.target.checked }));
$('pause').addEventListener('click', () => send('pause'));
$('folder').addEventListener('click', () => send('folder'));
$('windows-colors').addEventListener('click', () => send('display.colors'));

// A question mark by the title of every page lays small cards over the page, each pointing at one of its parts (HELP_CARDS of
// help-cards.js). The veil under them takes the clicks, so a click beside the cards closes them without touching the page.
(function pageHelp() {
  const rows = {};
  for (const r of document.querySelectorAll('.tr-row[data-view]')) rows[r.dataset.view] = r;
  const layer = document.createElement('div');
  layer.className = 'help-layer';
  layer.hidden = true;
  layer.setAttribute('role', 'dialog');
  layer.setAttribute('aria-label', tr('About this page'));
  document.body.append(layer);
  let openFor = null, openView = '', unfolded = -1, anchors = [], again = 0, frame = 0;
  const onScreen = r => r.width > 0 && r.height > 0 && r.bottom > 8 && r.top < innerHeight - 8 && r.right > 8 && r.left < innerWidth - 8;
  const find = selector => [...document.querySelectorAll(selector)].find(e => !layer.contains(e) && e.checkVisibility() && onScreen(e.getBoundingClientRect()));
  const meets = (a, b) => a.left < b.right + 6 && a.right + 6 > b.left && a.top < b.bottom + 6 && a.bottom + 6 > b.top;
  const fits = b => b.left >= 8 && b.top >= 8 && b.right <= innerWidth - 8 && b.bottom <= innerHeight - 8;
  const within = (b, r) => b.left >= r.left && b.top >= r.top && b.right <= r.right && b.bottom <= r.bottom;
  const clampX = (x, w) => Math.max(8, Math.min(innerWidth - w - 8, x));
  const clampY = (y, h) => Math.max(8, Math.min(innerHeight - h - 8, y));
  const clamp = (v, low, high) => Math.max(low, Math.min(high, v));

  // Below, above, the same on the other side, then beside the element, and over it when it is large enough.
  const spots = (r, w, h) => [
    ['below', clampX(r.left + 12, w), r.bottom + 10, 'start'], ['above', clampX(r.left + 12, w), r.top - h - 10, 'start'],
    ['below', clampX(r.right - w - 12, w), r.bottom + 10, 'end'], ['above', clampX(r.right - w - 12, w), r.top - h - 10, 'end'],
    ['right', r.right + 10, clampY(r.top, h)], ['left', r.left - w - 10, clampY(r.top, h)],
    ['over', clampX(r.left + 12, w), r.top + 12], ['over', clampX(r.left + 12, w), r.bottom - h - 12],
  ];
  function place(card, r, placed, avoid) {
    const w = card.offsetWidth, h = card.offsetHeight;
    for (const [side, left, top, align] of spots(r, w, h)) {
      const b = { left, top, right: left + w, bottom: top + h };
      if (!fits(b) || placed.some(p => meets(p, b)) || avoid.some(a => a !== r && meets(a, b))) continue;
      if (side === 'over' && !within(b, r)) continue;
      card.dataset.side = side;
      card.dataset.align = align || '';
      card.style.left = left + 'px';
      card.style.top = top + 'px';
      if (side === 'below' || side === 'above') card.style.setProperty('--tip', clamp((align === 'end' ? r.right - Math.min(40, r.width / 2) : r.left + Math.min(40, r.width / 2)) - left - 5, 10, w - 20) + 'px');
      else card.style.setProperty('--tip', clamp(r.top + Math.min(20, r.height / 2) - top - 5, 8, h - 18) + 'px');
      return b;
    }
    return null;
  }

  // A card above its part grows upward and a card on the left of its part grows leftward, so its pointer stays on the part;
  // it is kept inside the window, and its pointer follows the shift.
  function unfold(card, on) {
    const line = card.querySelector('.help-card__line');
    if (!line || on === !line.hidden) return;
    if (on) for (const other of layer.querySelectorAll('.help-card.is-open')) if (other !== card) unfold(other, false);
    if (on) Object.assign(card.dataset, { left: card.style.left, top: card.style.top, tip: card.style.getPropertyValue('--tip') });
    const w0 = card.offsetWidth, h0 = card.offsetHeight;
    line.hidden = !on;
    card.classList.toggle('is-open', on);
    card.setAttribute('aria-expanded', String(on));
    if (!on) { card.style.left = card.dataset.left; card.style.top = card.dataset.top; card.style.setProperty('--tip', card.dataset.tip); return; }
    const side = card.dataset.side, left0 = parseFloat(card.dataset.left), top0 = parseFloat(card.dataset.top);
    const w = card.offsetWidth, h = card.offsetHeight;
    let left = side === 'left' || card.dataset.align === 'end' ? left0 - (w - w0) : left0;
    let top = side === 'above' ? top0 - (h - h0) : top0;
    left = clampX(left, w); top = clampY(top, h);
    card.style.left = left + 'px';
    card.style.top = top + 'px';
    const tip = parseFloat(card.dataset.tip) || 0;
    if (side === 'below' || side === 'above') card.style.setProperty('--tip', clamp(tip + left0 - left, 10, w - 20) + 'px');
    else card.style.setProperty('--tip', clamp(tip + top0 - top, 8, h - 18) + 'px');
  }

  function render() {
    if (!openFor) return;
    const focused = layer.contains(document.activeElement) ? document.activeElement.dataset.card : null;
    let list = (HELP_CARDS[openView] || []).map(([selector, title, line], i) => ({ i, el: find(selector), title: tr(title), line: tr(line) })).filter(c => c.el).slice(0, 6);
    if (!list.length && rows[openView]) {
      const row = rows[openView];
      list = [{ i: 0, el: openFor, title: row.querySelector('summary .caption > span').firstChild.textContent.trim(), line: row.querySelector('summary small').textContent }];
    }
    anchors = list.map(c => c.el);
    const veil = Object.assign(document.createElement('div'), { className: 'help-veil' });
    veil.addEventListener('click', close);
    const cards = list.map(c => {
      const card = Object.assign(document.createElement('button'), { type: 'button', className: 'help-card' });
      card.dataset.card = c.i;
      card.setAttribute('aria-expanded', String(c.i === unfolded));
      const title = Object.assign(document.createElement('span'), { className: 'help-card__title', textContent: c.title });
      const line = Object.assign(document.createElement('span'), { className: 'help-card__line', textContent: c.line, hidden: true });
      card.append(title, line);
      // Hover only: a card unfolds its sentence while the pointer is on it, in place, over its neighbors. Laying all the cards
      // out again made the taller card jump elsewhere, leave the pointer, fold and come back, over and over.
      card.addEventListener('pointerenter', () => { clearTimeout(fold); unfolded = c.i; unfold(card, true); });
      card.addEventListener('pointerleave', () => { fold = setTimeout(() => { if (openFor && unfolded === c.i) { unfolded = -1; unfold(card, false); } }, 250); });
      return card;
    });
    const more = Object.assign(document.createElement('button'), { type: 'button', className: 'link help-more', innerHTML: icon('info') });
    more.append(tr('Details in Settings'));
    const row = rows[openView];
    more.addEventListener('click', () => { close(); showView('settings'); row.open = true; row.closest('.tr-fold').open = true; row.scrollIntoView({ block: 'center' }); });
    layer.replaceChildren(veil, ...cards, more);
    layer.hidden = false;

    const rects = list.map(c => c.el.getBoundingClientRect());
    const small = rects.filter(r => r.width * r.height < innerWidth * innerHeight * .12);
    const button = openFor.getBoundingClientRect(), start = onScreen(button) ? [button] : [];
    const w = more.offsetWidth, h = more.offsetHeight;
    const linkSpot = [[button.right + 8, button.top + (button.height - h) / 2], [clampX(button.left, w), button.bottom + 8], [clampX(button.left, w), button.top - h - 8], [innerWidth - w - 8, innerHeight - h - 8]]
      .map(([left, top]) => ({ left, top, right: left + w, bottom: top + h })).find(b => fits(b) && !start.some(p => meets(p, b)));
    if (linkSpot) { more.style.left = linkSpot.left + 'px'; more.style.top = linkSpot.top + 'px'; start.push(linkSpot); }
    else more.hidden = true;
    // Cards are placed folded, in order, and never move after: unfolding one only lets it grow where it is.
    const placed = [...start], shown = new Set();
    cards.forEach((card, k) => {
      const b = place(card, rects[k], placed, small) || place(card, rects[k], placed, []);
      if (b) { placed.push(b); shown.add(k); }
    });
    cards.forEach((card, k) => {
      if (!shown.has(k)) { card.remove(); return; }
      const r = rects[k];
      veil.after(Object.assign(document.createElement('div'), { className: 'help-ring', style: `left:${r.left - 3}px;top:${r.top - 3}px;width:${r.width + 6}px;height:${r.height + 6}px` }));
      if (list[k].i === unfolded) unfold(card, true);
    });
    const target = focused != null ? layer.querySelector(`.help-card[data-card="${focused}"]`) : layer.querySelector('.help-card');
    if (target) target.focus({ preventScroll: true });
  }

  const close = () => {
    if (!openFor) return;
    layer.hidden = true;
    layer.replaceChildren();
    openFor.setAttribute('aria-expanded', 'false');
    openFor = null;
    anchors = [];
    unfolded = -1;
    clearTimeout(again);
    cancelAnimationFrame(frame);
  };
  let fold = 0;
  const open = (button, view) => {
    openFor = button;
    openView = view;
    unfolded = -1;
    button.setAttribute('aria-expanded', 'true');
    render();
  };
  const button = view => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'page-help';
    b.innerHTML = '<span class="page-help__mark" aria-hidden="true">?</span><span class="page-help__label"></span>';
    b.translate = false;
    b.querySelector('.page-help__label').textContent = tr('About this page');
    b.setAttribute('aria-expanded', 'false');
    // The question mark is a button: a press lays the cards, another takes them away; only the cards answer the pointer.
    b.addEventListener('click', e => { e.stopPropagation(); if (openFor === b) close(); else { close(); open(b, view); } });
    return b;
  };
  for (const section of document.querySelectorAll('.view')) {
    const view = [...section.classList].map(c => /^only-(\w+)$/.exec(c)).filter(Boolean).map(m => m[1])[0];
    if (!view || !rows[view]) continue;
    const h1 = section.querySelector('h1');
    if (h1) h1.append(button(view));
    else if (view === 'home') section.querySelector('.h-tools').append(button(view));
  }
  addEventListener('keydown', e => { if (e.key === 'Escape' && openFor) { const b = openFor; close(); b.focus({ preventScroll: true }); } });
  addEventListener('scroll', e => { if (openFor && (e.target === document || [openFor, ...anchors].some(a => e.target.contains && e.target.contains(a)))) close(); }, true);
  // A zoom of the interface resizes the page as a window would; the page settles its layout a moment later.
  addEventListener('resize', () => {
    if (!openFor) return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(render);
    clearTimeout(again);
    again = setTimeout(render, 350);
  });
  new MutationObserver(close).observe(document.body, { attributes: true, attributeFilter: ['data-view', 'data-dock'] });
})();

addEventListener('DOMContentLoaded', () => {
  let view = 'home';
  try { const v = localStorage.getItem('view'); if (VIEWS.includes(v)) view = v; } catch (e) { }
  showView(view);
  send('state');
});

const ZOOMS = [80, 90, 100, 115, 130, 150];
// The zoom is applied by the window before the page hears of it: the pill waits for the pixel ratio to reach the zoom asked
// instead of following the state, which made it grow then shrink. The pixel ratio also changes when the window moves to a
// screen with another scale, which is not a zoom. Quick clicks count from the zoom asked last, not the last one confirmed.
let zoomNow = 100, zoomBase = devicePixelRatio, zoomAsked = null, zoomWait = 0;
// The zoom and the Options button keep their size whatever the zoom. A script hears of a zoom one frame late, so their
// counter-scale comes from media queries on the resolution, which apply in the very frame the zoom changes.
const zoomSheet = document.head.appendChild(document.createElement('style'));
let zoomSheetBase = 0;
function zoomRules() {
  if (Math.abs(zoomSheetBase - zoomBase) < .001) return;
  zoomSheetBase = zoomBase;
  zoomSheet.textContent = ZOOMS.map(z => {
    const r = zoomBase * z / 100;
    return `@media (min-resolution: ${(r - .005).toFixed(4)}dppx) and (max-resolution: ${(r + .005).toFixed(4)}dppx) { :root { --zoom: ${z / 100}; } }`;
  }).join('\n');
}
function settleZoom() {
  zoomAsked = null;
  zoomBase = devicePixelRatio / (zoomNow / 100);
  zoomRules();
  paintZoom(zoomNow);
}
function paintZoom(zoom) {
  $('zoom-value').textContent = Math.round(zoom) + ' %';
  $('zoom-out').disabled = zoom <= ZOOMS[0];
  $('zoom-in').disabled = zoom >= ZOOMS[ZOOMS.length - 1];
}
function zoomTo(value) {
  if (value === zoomNow) return;
  zoomNow = zoomAsked = value;
  paintZoom(value);
  send('zoom', { value });
  clearTimeout(zoomWait);
  zoomWait = setTimeout(settleZoom, 1500);
}
function zoomBy(step) {
  let i = ZOOMS.reduce((best, z, k) => Math.abs(z - zoomNow) < Math.abs(ZOOMS[best] - zoomNow) ? k : best, 0);
  i = Math.max(0, Math.min(ZOOMS.length - 1, i + step));
  zoomTo(ZOOMS[i]);
}
addEventListener('resize', () => {
  if (zoomAsked == null) { zoomBase = devicePixelRatio / (zoomNow / 100); zoomRules(); return; }
  if (Math.round(devicePixelRatio / zoomBase * 100) === zoomAsked) { clearTimeout(zoomWait); settleZoom(); }
});
zoomRules();
for (const b of $('zoom').children) b.addEventListener('click', () => zoomTo(Number(b.dataset.value)));
for (const b of $('skin').children) b.addEventListener('click', () => send('skin', { value: b.dataset.value }));
$('zoom-out').addEventListener('click', () => zoomBy(-1));
$('zoom-in').addEventListener('click', () => zoomBy(1));
$('zoom-value').addEventListener('click', () => zoomTo(100));
addEventListener('keydown', e => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
  if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomBy(1); }
  else if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomBy(-1); }
  else if (e.key === '0' || e.code === 'Digit0' || e.code === 'Numpad0') { e.preventDefault(); zoomTo(100); }
});
addEventListener('keydown', e => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
  const view = document.body.dataset.view, digit = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
  // The order of the bar as arranged, without the services it hides.
  const bar = [...document.querySelectorAll('.rail .service[data-view]')].filter(b => !b.hidden).map(b => b.dataset.view);
  if (digit && !e.shiftKey) { e.preventDefault(); if (bar[Number(digit[1]) - 1]) showView(bar[Number(digit[1]) - 1]); }
  else if (e.key === 'Tab') { e.preventDefault(); showView(bar[(bar.indexOf(view) + (e.shiftKey ? bar.length - 1 : 1)) % bar.length]); }
  else if (e.key === ',') { e.preventDefault(); showView('settings'); }
  else if (e.key.toLowerCase() === 'f' && view === 'tasks' && $('t-search')) { e.preventDefault(); $('t-search').focus(); $('t-search').select(); }
});
// The arrow keys of the bar are handled in rail.js.
let zoomWheel = 0;
addEventListener('wheel', e => {
  if (!e.ctrlKey) return;
  e.preventDefault();
  if (Date.now() - zoomWheel < 160) return;
  zoomWheel = Date.now();
  zoomBy(e.deltaY < 0 ? 1 : -1);
}, { passive: false });
