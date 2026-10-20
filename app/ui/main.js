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
  for (const a of ATTRIBUTES_TRANSLATED) {
    const v = e.getAttribute(a), c = v && v.trim();
    if (c && DICT[c] && DICT[c] !== c) e.setAttribute(a, DICT[c]);
  }
}
function translateNode(n) {
  if (n.nodeType === 3) {
    const v = n.nodeValue, c = v.trim();
    if (c && DICT[c] && DICT[c] !== c) n.nodeValue = v.replace(c, DICT[c]);
    return;
  }
  if (n.nodeType !== 1 || n.tagName === 'SCRIPT' || n.tagName === 'STYLE') return;
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
const VIEWS = ['home', 'wallpaper', 'create', 'icons', 'arrange', 'mouse', 'station', 'files', 'hardware', 'tasks', 'network', 'settings'];

const scrolls = {}, narrowLayout = matchMedia('(max-width: 900px)');
const scrollZones = () => narrowLayout.matches ? [document.scrollingElement] : [document.querySelector('.contents'), document.querySelector('.panel')];
function showView(view) {
  const previous = document.body.dataset.view;
  if (previous && previous !== view) scrolls[previous] = scrollZones().map(z => z.scrollTop);
  document.body.dataset.view = view;
  if (previous !== view) scrollZones().forEach((z, i) => { z.scrollTop = (scrolls[view] || [])[i] || 0; });
  for (const b of document.querySelectorAll('.service')) {
    if (b.dataset.view === view) b.setAttribute('aria-current', 'page');
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
  send('audioPreview', { value: view === 'create' });
  if (Bramble.home) Bramble.home.visible(view === 'home');
}
for (const b of document.querySelectorAll('.service')) b.addEventListener('click', () => showView(b.dataset.view));
const iconRail = matchMedia('(max-width: 620px)');
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
  render(m);
});

const DURATION_REMOVAL = 8000;
let removalShown = null;

function render(state) {
  const before = Bramble.state;
  Bramble.state = state;
  $('startup').checked = state.startup;
  $('weather').checked = state.weather;
  check('language', state.language || 'auto');
  check('zoom', String(state.zoom || 100));
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
  if (Bramble.moods && state.moods) Bramble.moods.state(state.moods);
  if (Bramble.home) Bramble.home.state();

  if (state.view && VIEWS.includes(state.view)) showView(state.view);

  const undoable = state.undoable || (state.removed ? tr('“{0}” removed', state.removed) : null);
  if (undoable && undoable !== removalShown) toast(undoable, true, DURATION_REMOVAL);
  if (!undoable && removalShown) $('toast').classList.remove('visible');
  removalShown = undoable;
  if (state.announcement) toast(state.announcement, false, 4000);
}

const UPDATE_STATES = { never: 'Not checked yet', checking: 'Checking…', latest: 'Bramble is up to date', none: 'No published version found yet', failed: 'GitHub could not be reached, try again later' };
function renderUpdates(u) {
  if (!u) return;
  $('updates-auto').checked = u.auto;
  const ready = u.status === 'available';
  $('update-state').textContent = ready ? tr('Version {0} is available', u.version) : tr(UPDATE_STATES[u.status] || UPDATE_STATES.never);
  $('update-check').textContent = tr(ready ? 'Download it' : 'Check now');
  $('update-check').classList.toggle('update-ready', ready);
  $('update-check').disabled = u.status === 'checking';
  document.querySelector('.service--settings').classList.toggle('has-update', ready);
}

let toastTimer = 0;
function toast(text, undoable, duration) {
  const t = $('toast');
  $('toast-text').textContent = text;
  $('undo').hidden = !undoable;
  t.style.setProperty('--duration', duration + 'ms');
  t.classList.remove('visible');
  void t.offsetWidth;
  t.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('visible'), duration);
}
$('undo').addEventListener('click', () => { $('toast').classList.remove('visible'); send('undo'); });

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
$('updates-auto').addEventListener('change', e => send('updates.auto', { value: e.target.checked }));
$('update-check').addEventListener('click', () => send(Bramble.state && Bramble.state.updates && Bramble.state.updates.status === 'available' ? 'updates.open' : 'updates.check'));
$('folder-bramble').addEventListener('click', () => send('folderBramble'));
$('log-errors').addEventListener('click', () => send('log'));

for (const p of document.querySelectorAll('.caption small')) if (p.textContent) p.title = p.textContent;

for (const b of $('language').children) b.addEventListener('click', () => {
  if (b.getAttribute('aria-checked') === 'true') return;
  check('language', b.dataset.value);
  send('language', { value: b.dataset.value });
});
$('quit').addEventListener('click', () => send('quit'));

const TYPES = { video: 'Video', gif: 'GIF', image: 'Image', html: 'HTML' };
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

const fill = cursor => cursor.style.setProperty('--pct', cursor.value + '%');

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
  check('slideshow', String(state.slideshow));
  check('frameRate', String(state.frameRate || 60));
  $('shuffle').checked = !!state.shuffle;
  $('pauseAuto').checked = state.pauseAuto;
  $('pauseOnBattery').checked = state.pauseOnBattery;
  $('reactive').checked = state.reactive;
  $('level-row').hidden = !state.reactive;

  const wallpaper = shownWallpaper();
  $('speed').disabled = !!wallpaper && wallpaper.type === 'gif';

  const key = state.wallpapers.map(f => f.name).join('|');
  if (key !== keyGrid) { keyGrid = key; buildGrid(); }
  const list = state.displays || [], split = list.length > 1 && list.some(d => d.wallpaper);
  for (const card of document.querySelectorAll('.card')) {
    card.classList.toggle('current', !!wallpaper && card.dataset.name === wallpaper.name);
    const using = split ? list.filter(d => (d.wallpaper || state.current) === card.dataset.name) : [];
    card.querySelector('.badge-screens').replaceChildren(...using.map(d => Object.assign(document.createElement('i'), { textContent: d.n, title: tr('Screen {0}', d.n) })));
  }
  $('count').textContent = state.wallpapers.length;
  const keyV = (wallpaper ? wallpaper.name : '') + '|' + state.fit + '|' + heroScreen;
  if (keyV !== keyHero) { keyHero = keyV; buildHero(); }
  else adjustHero(state.light, state.speed);
  if (!before || before.paused !== state.paused || before.onBattery !== state.onBattery) freezeHero();
}

function urlHero(wallpaper, light, speed) {
  const settings = `light=${light}&speed=${speed}&fit=${Bramble.state.fit}`;
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
      <div class="card-actions">${wallpaper.custom ? '<button class="edit" tabindex="-1">Edit</button>' : ''}<button class="remove" tabindex="-1">Remove</button></div>`;
    card.querySelector('.name').textContent = withoutExtension(wallpaper.name);
    card.querySelector('.name').title = wallpaper.name;
    card.querySelector('.preview').append(preview(wallpaper, card));

    const choose = () => send('choose', { name: wallpaper.name, screen: heroScreen });
    const button = card.querySelector('.remove');
    let armed = 0;
    const disarm = () => { clearTimeout(armed); armed = 0; button.textContent = tr('Remove'); button.classList.remove('armed'); };
    const remove = () => {
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

    card.querySelector('.remove').addEventListener('click', e => { e.stopPropagation(); remove(); });
    grid.append(card);
  }

  const add = document.createElement('button');
  add.className = 'add';
  add.innerHTML = '<strong>+</strong>Add';
  add.addEventListener('click', () => send('add'));
  grid.append(add);
}

function livePreview(wallpaper, card) {
  if (wallpaper.type !== 'html') return preview(wallpaper, card);
  const e = Bramble.state || {};
  const frame = document.createElement('iframe');
  frame.src = wallpaper.url + '?light=' + (e.light != null ? e.light : 50) + '&speed=' + (e.speed != null ? e.speed : 50) + '&fit=' + (e.fit || 'fill');
  frame.tabIndex = -1;
  return frame;
}

function preview(wallpaper, card) {
  if (wallpaper.type === 'html') {
    const frame = document.createElement('iframe');
    frame.src = wallpaper.url + '?light=50&speed=50&thumbnail=1';
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
      live.src = wallpaper.url + '?light=50&speed=50';
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
  '<svg viewBox="0 0 24 24"><image href="/brand/logo/logo-bramble-192.png" x="2" y="2" width="20" height="20"/></svg>',
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
function zoomBy(step) {
  const now = (Bramble.state && Bramble.state.zoom) || 100;
  let i = ZOOMS.reduce((best, z, k) => Math.abs(z - now) < Math.abs(ZOOMS[best] - now) ? k : best, 0);
  i = Math.max(0, Math.min(ZOOMS.length - 1, i + step));
  send('zoom', { value: ZOOMS[i] });
}
for (const b of $('zoom').children) b.addEventListener('click', () => send('zoom', { value: Number(b.dataset.value) }));
addEventListener('keydown', e => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
  if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomBy(1); }
  else if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomBy(-1); }
  else if (e.key === '0' || e.code === 'Digit0' || e.code === 'Numpad0') { e.preventDefault(); send('zoom', { value: 100 }); }
});
addEventListener('keydown', e => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
  const view = document.body.dataset.view, digit = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
  if (digit && !e.shiftKey) { e.preventDefault(); showView(VIEWS[Number(digit[1]) - 1]); }
  else if (e.key === 'Tab') { e.preventDefault(); showView(VIEWS[(VIEWS.indexOf(view) + (e.shiftKey ? VIEWS.length - 1 : 1)) % VIEWS.length]); }
  else if (e.key === ',') { e.preventDefault(); showView('settings'); }
  else if (e.key.toLowerCase() === 'f' && view === 'tasks' && $('t-search')) { e.preventDefault(); $('t-search').focus(); $('t-search').select(); }
});
let zoomWheel = 0;
addEventListener('wheel', e => {
  if (!e.ctrlKey) return;
  e.preventDefault();
  if (Date.now() - zoomWheel < 160) return;
  zoomWheel = Date.now();
  zoomBy(e.deltaY < 0 ? 1 : -1);
}, { passive: false });
