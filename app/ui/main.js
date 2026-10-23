'use strict';

const webview = window.chrome.webview;
const send = (action, data = {}) => webview.postMessage({ action, ...data });
const $ = id => document.getElementById(id);

addEventListener('error', e => { if (/ResizeObserver loop/.test(e.message)) return;  try { send('pageError', { text: e.message + ' · ' + (e.filename || '').replace(/^.*\//, '') + ':' + e.lineno }); } catch (x) { } });
addEventListener('unhandledrejection', e => { try { send('pageError', { text: String(e.reason) }); } catch (x) { } });

const LANGUAGE = window.LANGUAGE || 'en';
const LOCALE = LANGUAGE === 'fr' ? 'fr-FR' : 'en-US';
const DICT = window.TRANSLATION || {};
function tr(text, ...values) {
  let r = DICT[text] || text;
  values.forEach((v, i) => { r = r.split('{' + i + '}').join(v); });
  return r;
}
const ATTRIBUTES_TRANSLATED = ['title', 'aria-label', 'placeholder', 'alt'];
function translateAttributes(e) {
  if (!e.translate) return;
  for (const a of ATTRIBUTES_TRANSLATED) {
    const v = e.getAttribute(a), c = v && v.trim();
    if (c && DICT[c] && DICT[c] !== c) e.setAttribute(a, DICT[c]);
  }
}
function translateNode(n) {
  if (n.nodeType === 3) {
    if (n.parentElement && !n.parentElement.translate) return;
    const v = n.nodeValue, c = v.trim();
    if (c && DICT[c] && DICT[c] !== c) n.nodeValue = v.replace(c, DICT[c]);
    return;
  }
  if (n.nodeType !== 1 || n.tagName === 'SCRIPT' || n.tagName === 'STYLE' || !n.translate) return;
  translateAttributes(n);
  for (const e of n.childNodes) translateNode(e);
}
if (LANGUAGE !== 'en') {
  document.documentElement.lang = LANGUAGE;
  translateNode(document.body);
  new MutationObserver(list => {
    for (const m of list) {
      if (m.type === 'childList') m.addedNodes.forEach(translateNode);
      else if (m.type === 'characterData') translateNode(m.target);
      else translateAttributes(m.target);
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRIBUTES_TRANSLATED });
}
const Bramble = { state: null, station: null, icons: null, arrange: null, mouse: null, network: null, files: null, hardware: null, tasks: null, moods: null, creator: null };
const VIEWS = ['home', 'modes', 'wallpaper', 'create', 'icons', 'mouse', 'station', 'display', 'audio', 'arrange', 'health', 'tasks', 'files', 'duplicates', 'hardware', 'network', 'settings'];

const scrolls = {}, narrowLayout = matchMedia('(max-width: 900px)');
const scrollZones = () => narrowLayout.matches ? [document.scrollingElement] : [document.querySelector('.contents'), document.querySelector('.panel')];
const DOCKS = { wallpaper: 'Wallpaper', modes: 'Themes', display: 'Display', icons: 'Icons', arrange: 'Arrange', mouse: 'Mouse', station: 'Sounds', tasks: 'Tasks', hardware: 'Hardware', network: 'Network' };
const dockModule = view => Bramble[view === 'modes' ? 'moods' : view];
function setDock(view) {
  const old = document.body.dataset.dock;
  if (old === view) return;
  const pick = $('dock-pick');
  pick.replaceChildren();
  delete pick.dataset.key;
  if (old) { if (old === 'tasks') { if (Bramble.tasks) Bramble.tasks.dock(false); } else if (dockModule(old)) dockModule(old).visible(false); }
  if (view) document.body.dataset.dock = view; else delete document.body.dataset.dock;
  if (view) {
    $('dock-title').textContent = tr(DOCKS[view]);
    const module = dockModule(view);
    if (view === 'tasks') { if (Bramble.tasks) Bramble.tasks.dock(true); } else if (module) { module.visible(true); if (module.renderDock) module.renderDock(); }
  }
  for (const t of document.querySelectorAll('.h-tile, [data-dock-to]')) t.setAttribute('aria-pressed', String((t.dataset.view || t.dataset.dockTo) === view));
  dispatchEvent(new Event('resize'));
}
function dockTo(view) { setDock(document.body.dataset.dock === view ? null : view); }
$('dock-close').addEventListener('click', () => setDock(null));
$('dock-open').addEventListener('click', () => { const view = document.body.dataset.dock; setDock(null); if (view) showView(view); });
addEventListener('keydown', e => { if (e.key === 'Escape' && document.body.dataset.dock && !(e.target.matches && e.target.matches('input:not([type="checkbox"]), select, textarea'))) setDock(null); });

// In a narrow window the side panel would fall far below the page: it opens as a drawer from the Options button instead.
const OWN_PANEL = ['home', 'settings', 'display', 'audio', 'health', 'tasks', 'modes'];
const setPanel = open => document.body.classList.toggle('panel-open', open);
$('panel-toggle').addEventListener('click', () => setPanel(true));
$('panel-close').addEventListener('click', () => setPanel(false));
addEventListener('keydown', e => { if (e.key === 'Escape' && document.body.classList.contains('panel-open')) setPanel(false); });

function showView(view) {
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
  if (Bramble.station) Bramble.station.visible(view === 'station');
  if (Bramble.icons) Bramble.icons.visible(view === 'icons');
  if (Bramble.mouse) Bramble.mouse.visible(view === 'mouse');
  if (Bramble.network) Bramble.network.visible(view === 'network');
  if (Bramble.arrange) Bramble.arrange.visible(view === 'arrange');
  if (Bramble.files) Bramble.files.visible(view === 'files');
  if (Bramble.hardware) Bramble.hardware.visible(view === 'hardware');
  if (Bramble.tasks) Bramble.tasks.visible(view === 'tasks');
  if (Bramble.creator) Bramble.creator.visible(view === 'create');
  if (Bramble.display) Bramble.display.visible(view === 'display');
  if (Bramble.audio) Bramble.audio.visible(view === 'audio');
  if (Bramble.health) Bramble.health.visible(view === 'health');
  if (Bramble.duplicates) Bramble.duplicates.visible(view === 'duplicates');
  send('audioPreview', { value: view === 'create' });
  if (Bramble.home) Bramble.home.visible(view === 'home');
}
for (const b of document.querySelectorAll('.service')) b.addEventListener('click', () => showView(b.dataset.view));
const iconRail = matchMedia('(max-width: 620px), (max-width: 900px) and (max-height: 1000px)');
function railTitles() {
  for (const b of document.querySelectorAll('.rail .service:not(.logo-home)')) {
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
  if (m.type === 'audio.level') {
    levelTarget.push(m.level); levelTarget.shift();
    const previews = Bramble.state && Bramble.state.reactive ? '#hero-preview iframe, .cr-stage iframe, .wallpaper-map iframe, #h-wallpaper iframe' : '.cr-stage iframe';
    for (const f of document.querySelectorAll(previews)) { try { f.contentWindow.postMessage({ bramble: 'audio', level: m.level }, '*'); } catch (e) { } }
    if (!levelLoop && document.body.dataset.view === 'wallpaper') levelLoop = requestAnimationFrame(levelFrame);
    return;
  }

  if (Bramble.home && m.type && (m.type.startsWith('network.') || m.type.startsWith('hardware.') || m.type === 'arrange.map' || m.type === 'tasks.list')) Bramble.home.event(m);
  if (m.type === 'network.infos' && Bramble.hardware) Bramble.hardware.wifiInfo(m);
  if (m.type === 'home.places') { renderPlaces(m); return; }
  if (m.type && m.type.startsWith('home.')) { if (Bramble.home) Bramble.home.event(m); return; }
  if (m.type && m.type.startsWith('station.')) { if (Bramble.station) Bramble.station.event(m); return; }
  if (m.type && m.type.startsWith('icons.')) { if (Bramble.icons) Bramble.icons.event(m); return; }
  if (m.type && m.type.startsWith('mouse.')) { if (Bramble.mouse) Bramble.mouse.event(m); return; }
  if (m.type && m.type.startsWith('network.')) { if (Bramble.network) Bramble.network.event(m); return; }
  if (m.type && m.type.startsWith('arrange.')) { if (Bramble.arrange) Bramble.arrange.event(m); return; }
  if (m.type && m.type.startsWith('files.')) { if (Bramble.files) Bramble.files.event(m); return; }
  if (m.type && m.type.startsWith('creator.')) { if (Bramble.creator) Bramble.creator.event(m); return; }
  if (m.type && m.type.startsWith('tasks.')) { if (Bramble.tasks) Bramble.tasks.event(m); return; }
  if (m.type && m.type.startsWith('hardware.')) { if (Bramble.hardware) Bramble.hardware.event(m); return; }
  if (m.type && m.type.startsWith('moods.')) { if (Bramble.moods) Bramble.moods.event(m); return; }
  if (m.type && m.type.startsWith('display.')) { if (Bramble.display) Bramble.display.event(m); return; }
  if (m.type === 'audio.devices' || m.type === 'audio.levels') { if (Bramble.audio) Bramble.audio.event(m); return; }
  if (m.type && m.type.startsWith('health.')) { if (Bramble.health) Bramble.health.event(m); return; }
  if (m.type && m.type.startsWith('duplicates.')) { if (Bramble.duplicates) Bramble.duplicates.event(m); return; }
  if (m.type === 'window.closed') { if (Bramble.creator) Bramble.creator.reset(); return; }
  render(m);
});

const DURATION_REMOVAL = 8000;
let removalShown = null;

function render(state) {
  const before = Bramble.state;
  Bramble.state = state;
  $('startup').checked = state.startup;
  $('weather').checked = state.weather;
  $('allow-test').checked = state.speedTest !== false;
  showViews(state.hiddenViews || []);
  $('allow-ip').checked = state.publicIp !== false;
  $('place-row').hidden = !state.weather;
  if (!state.weather) $('place-results').hidden = true;
  $('place-state').textContent = state.weatherPlace || tr('Automatic, from the IP address');
  $('place-state').translate = !state.weatherPlace;
  $('place-auto').hidden = !state.weatherPlace;
  check('language', state.language || 'auto');
  check('zoom', String(state.zoom || 100));
  if (zoomAsked == null) { zoomNow = state.zoom || 100; settleZoom(); }
  renderUpdates(state.updates);
  if (state.about) {
    $('about-version').textContent = tr('Version {0} · built on {1}', state.about.version, new Date(state.about.compile).toLocaleDateString(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' }));
    $('about-folder').textContent = state.about.folder;
    $('folder-bramble').title = state.about.folder;
    $('about-errors').textContent = tr(state.about.errors ? 'Some errors were logged' : 'No errors logged');
  }
  renderWallpaper(state, before);
  if (Bramble.station && state.station) Bramble.station.state(state.station);
  if (Bramble.icons && state.icons) Bramble.icons.state(state.icons);
  if (Bramble.mouse && state.mouse) Bramble.mouse.state(state.mouse);
  if (Bramble.arrange && state.arrange) Bramble.arrange.state(state.arrange);
  if (Bramble.files && state.files) Bramble.files.state(state.files);
  if (Bramble.duplicates && state.duplicates) Bramble.duplicates.state(state.duplicates);
  if (Bramble.moods && state.moods) Bramble.moods.state(state.moods);
  if (Bramble.home) Bramble.home.state();
  if (Bramble.display) Bramble.display.state();

  if (state.view && VIEWS.includes(state.view)) showView(state.view);

  const undoable = state.undoable || (state.removed ? tr('“{0}” removed', state.removed) : null);
  if (undoable && undoable !== removalShown) toast(undoable, true, DURATION_REMOVAL);
  if (!undoable && removalShown) $('toast').classList.remove('visible');
  removalShown = undoable;
  if (state.announcement) toast(state.announcement, false, 4000);
}

const UPDATE_STATES = {
  never: 'Not checked yet', checking: 'Checking…', latest: 'Bramble is up to date', none: 'No published version found yet', failed: 'GitHub could not be reached, try again later',
  installing: 'Installing, Bramble restarts by itself', damaged: 'The download was damaged, nothing was installed', downloadFailed: 'The download failed, try again later',
};
function renderUpdates(u) {
  if (!u) return;
  $('updates-auto').checked = u.auto;
  const ready = u.status === 'available';
  $('update-state').textContent = ready ? tr('Version {0} is available', u.version)
    : u.status === 'downloading' ? tr('Downloading version {0}, {1} %', u.version, u.progress)
    : tr(UPDATE_STATES[u.status] || UPDATE_STATES.never);
  $('update-check').textContent = tr(ready ? (u.installable ? 'Install it' : 'Download it') : 'Check now');
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
const WARNING = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4 21 19.5H3z"/><path d="M12 10v4.5M12 17h.01"/></svg>';
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
confirmReset($('r-reset'), 'The icons go back to where they were before Bramble first moved them, and the screen, arrangement, sort and category order go back to default.', () => send('arrange.resetAll'));

let depth = 0;
const carriesFiles = e => [...e.dataTransfer.types].includes('Files');
const DROP_HINTS = { wallpaper: 'Videos, GIFs, images or HTML pages', icons: 'ICO files or images', mouse: 'Cursor files, .cur or .ani', station: 'MP3, AAC, OGG, FLAC or WAV sounds' };
addEventListener('dragenter', e => {
  const view = document.body.dataset.view;
  if (!carriesFiles(e) || !DROP_HINTS[view]) return;
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
  if (!files.length) return;
  const view = document.body.dataset.view;
  const action = { icons: 'icons.drop', mouse: 'mouse.drop', wallpaper: 'drop' }[view];
  if (view === 'station' && Bramble.station) Bramble.station.ingest([...files]);
  else if (action) {
    try { webview.postMessageWithAdditionalObjects({ action }, files); }
    catch (x) { toast(tr('Only files saved on this PC can be added: save it first, then drop the file'), false, 5000); }
  }
});

$('startup').addEventListener('change', () => send('startup'));
$('weather').addEventListener('change', () => { send('weather'); send('home.weather'); });
$('allow-test').addEventListener('change', () => send('speedTest', { value: $('allow-test').checked }));

// A service can leave the bar and the shortcuts of Home; it keeps working, and Settings brings it back.
let hiddenViews = [];
function showViews(list) {
  hiddenViews = list;
  for (const b of document.querySelectorAll('.rail .service[data-view], .h-tile[data-view]')) b.hidden = list.includes(b.dataset.view);
  for (const input of document.querySelectorAll('.tr-row [data-show]')) input.checked = !list.includes(input.dataset.show);
}
for (const row of document.querySelectorAll('.tr-row[data-view]')) {
  const view = row.dataset.view;
  if (view === 'home' || view === 'settings') continue;
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

const PIN = '<svg class="glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-6.5-5.6-6.5-10.5a6.5 6.5 0 0 1 13 0c0 4.9-6.5 10.5-6.5 10.5z"/><circle cx="12" cy="10" r="2.3"/></svg>';
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
  const u = (Bramble.state && Bramble.state.updates) || {};
  send(u.status !== 'available' ? 'updates.check' : u.installable ? 'updates.install' : 'updates.open');
});
$('folder-bramble').addEventListener('click', () => send('folderBramble'));
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
const currentWallpaper = () => Bramble.state && Bramble.state.wallpapers.find(f => f.name === Bramble.state.current);
function wallpaperFor(key) {
  const state = Bramble.state;
  if (!state || !state.wallpapers) return null;
  const d = (state.displays || []).find(x => x.key === key);
  return state.wallpapers.find(f => f.name === (d && d.wallpaper ? d.wallpaper : state.current));
}

const fill = cursor => { const min = Number(cursor.min || 0), max = Number(cursor.max || 100); cursor.style.setProperty('--pct', (cursor.value - min) / (max - min) * 100 + '%'); };

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

// The instruments of Hardware, shared with Home: a needle thermometer, a battery in relief and Wi-Fi arcs in relief.
function thermometer() {
  let ticks = '';
  for (let t = 20; t <= 100; t += 10) {
    const a = Math.PI + (t - 20) / 80 * Math.PI, r1 = 46, r2 = t % 20 === 0 ? 39 : 42;
    ticks += `<path d="M${(60 + r1 * Math.cos(a)).toFixed(1)} ${(62 + r1 * Math.sin(a)).toFixed(1)}L${(60 + r2 * Math.cos(a)).toFixed(1)} ${(62 + r2 * Math.sin(a)).toFixed(1)}"/>`;
  }
  return `<svg class="thermo" viewBox="0 0 120 72" aria-hidden="true"><g class="thermo__ticks">${ticks}</g><path class="thermo__red" d="M98.2 36.4A46 46 0 0 1 106.0 62.0"/><g class="thermo__needle"><path d="M58.8 62 60 22l1.2 40z"/></g><circle class="thermo__pivot" cx="60" cy="62" r="5"/></svg>`;
}
const setThermometer = (svg, t) => { if (t != null) svg.querySelector('.thermo__needle').style.transform = `rotate(${(-90 + Math.max(0, Math.min(1, (t - 20) / 80)) * 180).toFixed(1)}deg)`; };
const batteryRelief = () => '<div class="cell-relief"><span class="cell-relief__segments">' + '<i></i>'.repeat(10) + '</span><span class="cell-relief__tip"></span></div>';
function setBattery(el, b) {
  const lit = Math.ceil(b.charge / 10), low = b.charge <= 15 && !b.mains;
  el.querySelectorAll('.cell-relief__segments i').forEach((s, i) => s.className = i < lit ? (low ? 'low' : 'full') : '');
}
const WIFI_ARCS = ['M38 46a31 31 0 0 1 44 0', 'M28 36a45 45 0 0 1 64 0', 'M18 26a59 59 0 0 1 84 0'];
const wifiRelief = () => `<svg class="wifi-relief" viewBox="0 0 120 72" aria-hidden="true"><g class="wifi-relief__bevel">${WIFI_ARCS.map(d => `<path d="${d}"/>`).join('')}<circle cx="60" cy="59" r="6"/></g>`
  + `<g class="wifi-relief__grooves">${WIFI_ARCS.map(d => `<path d="${d}"/>`).join('')}<circle cx="60" cy="58" r="6"/></g>`
  + `<g class="wifi-relief__lit">${WIFI_ARCS.map(d => `<path d="${d}"/>`).join('')}<circle cx="60" cy="58" r="3.6"/></g></svg>`;
function setWifi(svg, signal, connected) {
  const lit = [...svg.querySelectorAll('.wifi-relief__lit > *')];
  const arcs = connected ? Math.min(3, Math.floor(signal / 25)) : 0;
  lit.forEach((el, i) => el.classList.toggle('on', el.tagName === 'circle' ? connected : i < arcs));
}

// A bubble of details over an instrument, on hover or keyboard focus: a few more facts without opening its page.
const detailTip = Object.assign(document.createElement('div'), { className: 'chart-tip detail-tip', hidden: true });
document.body.append(detailTip);
let detailTimer = 0, detailFor = null;
function showDetails(el) {
  const d = typeof el._details === 'function' ? el._details() : el._details;
  if (!d) return;
  detailFor = el;
  const head = Object.assign(document.createElement('div'), { className: 'chart-tip__head' });
  head.append(Object.assign(document.createElement('b'), { textContent: d.title }));
  if (d.value) head.append(Object.assign(document.createElement('span'), { textContent: d.value }));
  const parts = [head];
  if (d.note) parts.push(Object.assign(document.createElement('p'), { textContent: d.note }));
  for (const [label, value] of d.lines || []) {
    if (value == null || value === '') continue;
    const line = Object.assign(document.createElement('div'), { className: 'chart-tip__line' });
    line.append(Object.assign(document.createElement('span'), { textContent: label }), Object.assign(document.createElement('em'), { textContent: value, translate: false }));
    parts.push(line);
  }
  detailTip.replaceChildren(...parts);
  detailTip.hidden = false;
  const r = el.getBoundingClientRect(), t = detailTip.getBoundingClientRect();
  const left = Math.max(8, Math.min(innerWidth - t.width - 8, r.left + r.width / 2 - t.width / 2));
  const top = r.top - t.height - 8 >= 8 ? r.top - t.height - 8 : r.bottom + 8;
  detailTip.style.left = left.toFixed(1) + 'px';
  detailTip.style.top = top.toFixed(1) + 'px';
}
function hideDetails() { clearTimeout(detailTimer); detailTip.hidden = true; detailFor = null; }
function details(el, d) {
  el._details = d;
  if (el._detailsBound) return;
  el._detailsBound = true;
  const soon = () => { clearTimeout(detailTimer); detailTimer = setTimeout(() => showDetails(el), 250); };
  el.addEventListener('mouseenter', soon);
  el.addEventListener('focus', soon);
  el.addEventListener('mouseleave', hideDetails);
  el.addEventListener('blur', hideDetails);
  el.addEventListener('click', hideDetails);
}
addEventListener('scroll', hideDetails, true);

// A row of ring dials in metal seals, the dashboard of the PC family. Dials are updated in place so their rings turn instead of jumping.
function dials(zone, list) {
  list.forEach((g, i) => {
    let el = zone.children[i];
    if (!el || el.tagName !== (g.action ? 'BUTTON' : 'DIV')) {
      const fresh = document.createElement(g.action ? 'button' : 'div');
      fresh.innerHTML = '<span class="seal"><span class="seal__ring"></span><span class="seal__text"></span></span><span class="dial__label"></span><span class="dial__sub"></span>';
      if (g.action) { fresh.type = 'button'; fresh.addEventListener('click', () => fresh._action()); }
      if (el) el.replaceWith(fresh); else zone.append(fresh);
      el = fresh;
    }
    el._action = g.action;
    el.className = 'dial security--' + (g.level || 'high');
    if (g.key) el.dataset.key = g.key;
    el.querySelector('.seal').style.setProperty('--part', Math.max(0, Math.min(100, g.part || 0)).toFixed(1));
    const [number, unit] = String(g.value).split(/\s+(?=\S+$)/);
    el.querySelector('.seal__text').classList.toggle('seal__text--long', (unit ? number : String(g.value)).length > 4);
    el.querySelector('.seal__text').replaceChildren(unit ? number : String(g.value), ...(unit ? [Object.assign(document.createElement('small'), { textContent: unit })] : []));
    el.querySelector('.dial__label').textContent = g.label;
    el.querySelector('.dial__sub').textContent = el.querySelector('.dial__sub').title = g.sub || '';
    el.removeAttribute('title');
    details(el, g.details || (g.title ? { title: g.title } : null));
    if (detailFor === el && g.details) showDetails(el);
  });
  while (zone.children.length > list.length) zone.lastChild.remove();
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
const heroDisplay = () => { const list = (Bramble.state && Bramble.state.displays) || []; return list.find(d => d.key === heroScreen) || list.find(d => d.primary) || list[0]; };
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
    b.title = d.key ? tr('Screen {0}', d.n) + ' · ' + d.w + ' × ' + d.h + (d.primary ? tr(' · main') : '') : tr('Every screen');
    b.addEventListener('click', () => {
      heroScreen = d.key;
      try { localStorage.setItem('wallpaper.screen', heroScreen); } catch (e) { }
      renderWallpaper(Bramble.state, Bramble.state);
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
new ResizeObserver(() => { fitHero(); if (Bramble.state) heroEffects(Number($('blur').value), Number($('saturation').value), Number($('dim').value)); }).observe($('hero'));

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
  const settings = `light=${light}&speed=${speed}&fit=${Bramble.state.fit}&v=${wallpaper.stamp}`;
  if (wallpaper.type === 'html') return `${wallpaper.url}?${settings}`;
  return `/app/player/player.html?type=${wallpaper.type}&src=${encodeURIComponent(wallpaper.url)}&${settings}`;
}

function buildHero() {
  const wallpaper = shownWallpaper(), state = Bramble.state;
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
    hero.contentWindow.postMessage({ bramble: 'adjust', light, speed }, '*');
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
  if (hero && heroDirect) hero.contentWindow.postMessage({ bramble: 'freeze', value: Bramble.state.paused || Bramble.state.onBattery }, '*');
}

addEventListener('message', e => {
  if (!hero || e.source !== hero.contentWindow || !e.data || e.data.bramble !== 'ready') return;
  heroDirect = true;
  heroSet = '';
  adjustHero(Number($('light').value), Number($('speed').value));
  freezeHero();
});

function buildGrid() {
  const grid = $('grid');
  grid.replaceChildren();
  for (const wallpaper of Bramble.state.wallpapers) {
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
  const zone = $('dock-pick'), state = Bramble.state;
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
Bramble.wallpaper = { visible() { }, renderDock: renderWallpaperDock };

function livePreview(wallpaper, card) {
  if (wallpaper.type !== 'html') return preview(wallpaper, card);
  const e = Bramble.state || {};
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
  '<svg viewBox="0 0 24 24"><rect x="3" y="4.5" width="18" height="15" rx="3" fill="#1b1c24" stroke="#4a4c5c" stroke-width="1"/><path d="m7.5 9.5 3 2.5-3 2.5M12.5 15h4" fill="none" stroke="#c9b8e6" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  '<svg viewBox="0 0 24 24"><image href="/brand/app-icon/app-icon-violet.png" x="2" y="2" width="20" height="20"/></svg>',
].map((svg, i) => `<i${i === 4 ? ' class="on"' : ''}>${svg}</i>`).join('');
const TASKBAR_TRAY = '<svg viewBox="0 0 24 24"><path d="m6 14 6-6 6 6" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><svg viewBox="0 0 24 24"><path d="M3 9a13 13 0 0 1 18 0M6 12.5a8.5 8.5 0 0 1 12 0M9 16a4 4 0 0 1 6 0" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg><svg viewBox="0 0 24 24"><path d="M4 9.5v5h3.5L12 18V6L7.5 9.5z" fill="#fff"/><path d="M15 9a4 4 0 0 1 0 6" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg><svg viewBox="0 0 24 24"><rect x="3" y="8" width="16" height="8" rx="2" fill="none" stroke="#fff" stroke-width="1.8"/><rect x="5" y="10" width="9" height="4" rx=".8" fill="#fff"/><path d="M21 10.5v3" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></svg>';

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
// The pill and the Options button keep their size whatever the zoom. A script hears of a zoom one frame late, so their
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
  if (digit && !e.shiftKey) { e.preventDefault(); showView(VIEWS[Number(digit[1]) - 1]); }
  else if (e.key === 'Tab') { e.preventDefault(); showView(VIEWS[(VIEWS.indexOf(view) + (e.shiftKey ? VIEWS.length - 1 : 1)) % VIEWS.length]); }
  else if (e.key === ',') { e.preventDefault(); showView('settings'); }
  else if (e.key.toLowerCase() === 'f' && view === 'tasks' && $('t-search')) { e.preventDefault(); $('t-search').focus(); $('t-search').select(); }
});
addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
  const keys = { ArrowUp: -1, ArrowDown: 1, Home: 'first', End: 'last' };
  if (!(e.key in keys)) return;
  const buttons = [...document.querySelectorAll('.rail button.service')].filter(b => b.offsetParent);
  const active = document.activeElement, inRail = active && active.closest && active.closest('.rail');
  if (!inRail && active && active !== document.body) return;
  e.preventDefault();
  const step = keys[e.key];
  const current = inRail ? buttons.indexOf(active.closest('button.service')) : buttons.findIndex(b => b.dataset.view === document.body.dataset.view);
  const next = step === 'first' ? 0 : step === 'last' ? buttons.length - 1 : Math.max(0, Math.min(buttons.length - 1, (current < 0 ? 0 : current) + (inRail || current < 0 ? step : 0)));
  const target = buttons[next];
  if (!target) return;
  target.focus();
  if (target.dataset.view !== document.body.dataset.view) target.click();
});
let zoomWheel = 0;
addEventListener('wheel', e => {
  if (!e.ctrlKey) return;
  e.preventDefault();
  if (Date.now() - zoomWheel < 160) return;
  zoomWheel = Date.now();
  zoomBy(e.deltaY < 0 ? 1 : -1);
}, { passive: false });
