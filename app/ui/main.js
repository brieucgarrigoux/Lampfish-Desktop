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
const Bramble = { state: null, station: null, icons: null, arrange: null, mouse: null, network: null, files: null, hardware: null };
const VIEWS = ['home', 'wallpaper', 'icons', 'arrange', 'mouse', 'station', 'files', 'hardware', 'network', 'settings'];

function showView(view) {
  document.body.dataset.view = view;
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
  if (Bramble.home) Bramble.home.visible(view === 'home');
}
for (const b of document.querySelectorAll('.service')) b.addEventListener('click', () => showView(b.dataset.view));

webview.addEventListener('message', e => {
  const m = e.data;

  if (Bramble.home && m.type && (m.type.startsWith('network.') || m.type.startsWith('hardware.') || m.type === 'arrange.map')) Bramble.home.event(m);
  if (m.type && m.type.startsWith('home.')) { if (Bramble.home) Bramble.home.event(m); return; }
  if (m.type && m.type.startsWith('station.')) { if (Bramble.station) Bramble.station.event(m); return; }
  if (m.type && m.type.startsWith('icons.')) { if (Bramble.icons) Bramble.icons.event(m); return; }
  if (m.type && m.type.startsWith('mouse.')) { if (Bramble.mouse) Bramble.mouse.event(m); return; }
  if (m.type && m.type.startsWith('network.')) { if (Bramble.network) Bramble.network.event(m); return; }
  if (m.type && m.type.startsWith('arrange.')) { if (Bramble.arrange) Bramble.arrange.event(m); return; }
  if (m.type && m.type.startsWith('files.')) { if (Bramble.files) Bramble.files.event(m); return; }
  if (m.type && m.type.startsWith('hardware.')) { if (Bramble.hardware) Bramble.hardware.event(m); return; }
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
  if (state.about) {
    $('about-version').textContent = tr('Version {0} · built on {1}', state.about.version, new Date(state.about.compile).toLocaleDateString(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' }));
    $('about-folder').textContent = state.about.folder;
    $('about-errors').textContent = tr(state.about.errors ? 'Some errors were logged' : 'No errors logged');
  }
  renderWallpaper(state, before);
  if (Bramble.station && state.station) Bramble.station.state(state.station);
  if (Bramble.icons && state.icons) Bramble.icons.state(state.icons);
  if (Bramble.mouse && state.mouse) Bramble.mouse.state(state.mouse);
  if (Bramble.arrange && state.arrange) Bramble.arrange.state(state.arrange);
  if (Bramble.files && state.files) Bramble.files.state(state.files);
  if (Bramble.home) Bramble.home.state();

  if (state.view && VIEWS.includes(state.view)) showView(state.view);

  if (state.removed && state.removed !== removalShown) toast(tr('“{0}” removed', state.removed), true, DURATION_REMOVAL);
  if (!state.removed && removalShown) $('toast').classList.remove('visible');
  removalShown = state.removed;
  if (state.announcement) toast(state.announcement, false, 4000);
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
addEventListener('dragenter', e => {
  if (!carriesFiles(e) || ['arrange', 'files', 'hardware', 'network'].includes(document.body.dataset.view)) return;
  e.preventDefault();
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
  if (view === 'station' && Bramble.station) Bramble.station.ingest([...files]);
  else if (view === 'icons') webview.postMessageWithAdditionalObjects({ action: 'icons.drop' }, files);
  else if (view === 'mouse') webview.postMessageWithAdditionalObjects({ action: 'mouse.drop' }, files);
  else if (view === 'wallpaper') webview.postMessageWithAdditionalObjects({ action: 'drop' }, files);
});

$('startup').addEventListener('change', () => send('startup'));
$('weather').addEventListener('change', () => { send('weather'); send('home.weather'); });
$('folder-bramble').addEventListener('click', () => send('folderBramble'));
$('log-errors').addEventListener('click', () => send('log'));

for (const p of document.querySelectorAll('.caption small')) if (p.textContent) p.title = p.textContent;

for (const b of $('language').children) b.addEventListener('click', () => { check('language', b.dataset.value); send('language', { value: b.dataset.value }); });
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

const fill = cursor => cursor.style.setProperty('--pct', cursor.value + '%');

function renderWallpaper(state, before) {
  $('pause').textContent = state.paused ? 'Resume' : 'Pause';

  $('hero').classList.toggle('paused', state.paused);
  $('hero').classList.toggle('on-battery', state.onBattery);
  $('hero-type').textContent = state.onBattery ? 'Paused on battery' : (currentWallpaper() ? TYPES[currentWallpaper().type] : '');

  for (const id in CURSORS) {
    $(id).value = state[id];
    $(id + '-value').textContent = CURSORS[id].text(state[id]);
    fill($(id));
  }
  heroEffects(state.blur, state.saturation, state.dim);
  check('fit', state.fit);
  check('slideshow', String(state.slideshow));
  $('pauseAuto').checked = state.pauseAuto;
  $('pauseOnBattery').checked = state.pauseOnBattery;

  const wallpaper = currentWallpaper();
  $('speed').disabled = !!wallpaper && wallpaper.type === 'gif';

  const key = state.wallpapers.map(f => f.name).join('|');
  if (key !== keyGrid) { keyGrid = key; buildGrid(); }
  for (const card of document.querySelectorAll('.card'))
    card.classList.toggle('current', card.dataset.name === state.current);
  $('count').textContent = state.wallpapers.length;
  const keyV = state.current + '|' + state.fit;
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
  const wallpaper = currentWallpaper(), state = Bramble.state;
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
    const wallpaper = currentWallpaper();
    if (wallpaper && hero) hero.src = urlHero(wallpaper, light, speed);
  }, 250);
}

function heroEffects(blur, saturation, dim) {
  const filters = [];
  if (blur > 0) filters.push(`blur(${(blur * 0.3 * $('hero').clientWidth / screen.width).toFixed(2)}px)`);
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
    card.innerHTML = `<div class="preview"></div><span class="reticle"></span>
      <div class="footer"><span class="name"></span><span class="badge">${TYPES[wallpaper.type]}</span></div>
      <button class="remove" tabindex="-1">Remove</button>`;
    card.querySelector('.name').textContent = withoutExtension(wallpaper.name);
    card.querySelector('.name').title = wallpaper.name;
    card.querySelector('.preview').append(preview(wallpaper, card));

    const choose = () => send('choose', { name: wallpaper.name });
    const remove = () => send('remove', { name: wallpaper.name });
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
for (const group of ['fit', 'slideshow'])
  for (const b of $(group).children)
    b.addEventListener('click', () => {
      check(group, b.dataset.value);
      send(group, { value: group === 'slideshow' ? Number(b.dataset.value) : b.dataset.value });
    });
$('pauseAuto').addEventListener('change', e => send('pauseAuto', { value: e.target.checked }));
$('pauseOnBattery').addEventListener('change', e => send('pauseOnBattery', { value: e.target.checked }));
$('pause').addEventListener('click', () => send('pause'));
$('folder').addEventListener('click', () => send('folder'));

addEventListener('DOMContentLoaded', () => {
  let view = 'wallpaper';
  try { const v = localStorage.getItem('view'); if (VIEWS.includes(v)) view = v; } catch (e) { }
  showView(view);
  send('state');
});
