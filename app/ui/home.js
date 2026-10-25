'use strict';

(function () {
  let network = null, stats = null, shown = false, timer = 0, keyWallpaper = '', map = null, weather = null, tasks = null;
  const images = new Map(), appIcons = new Map();

  // Every service can have a card on Home; these five are there until the cards are chosen. The others take the icon of the bar.
  const SHORTCUTS = {
    icons: ['Icons', '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="m12 7.8 1.2 2.6 2.8.3-2.1 1.9.6 2.8-2.5-1.4-2.5 1.4.6-2.8-2.1-1.9 2.8-.3z"/>'],
    arrange: ['Arrange', '<rect x="4" y="4" width="6" height="6" rx="1.2"/><rect x="14" y="4" width="6" height="6" rx="1.2"/><rect x="4" y="14" width="6" height="6" rx="1.2"/><rect x="14" y="14" width="6" height="6" rx="1.2"/>'],
    mouse: ['Mouse', '<path d="M6 3.5 18 12.3l-5.6.8-3.2 4.9z"/><path d="m12.4 13.1 3.6 6.4"/>'],
    station: ['Sounds', '<path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2"/>'],
    tasks: ['Tasks', '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M6.5 13h2.5l1.5-4 3 7 1.5-3h2.5"/>'],
    modes: ['Themes'], wallpaper: ['Wallpaper'], create: ['Create'], display: ['Display'], audio: ['Audio'], taskbar: ['Taskbar'], convert: ['Convert'],
    notes: ['Notes'], shelf: ['Shelf'], claude: ['Claude usage', '<path d="M4 17a8 8 0 1 1 16 0"/><path d="m12 17 4.5-5"/><path d="M8 20h8"/>'], health: ['Health'], files: ['Storage'], duplicates: ['Duplicates'], hardware: ['Hardware'], network: ['Network'],
  };
  const TILES = ['icons', 'arrange', 'mouse', 'station', 'tasks'];
  const BLOCKS = { stage: 'Wallpaper and themes', pc: 'This PC', quick: 'Quick settings' };
  const ARRANGEMENTS = { left: 'Left', right: 'Right', top: 'Top', bottom: 'Bottom', frame: 'Frame', center: 'Center', corners: 'Corners', blocks: 'Blocks' };
  const UNITS = ['bytes', 'KB', 'MB', 'GB', 'TB'].map(u => tr(u));
  function size(o) {
    let i = 0;
    while (o >= 1024 && i < UNITS.length - 1) { o /= 1024; i++; }
    return o.toLocaleString(LOCALE, { maximumFractionDigits: o >= 100 || i === 0 ? 0 : 1 }) + ' ' + UNITS[i];
  }

  const tiles = {};
  const glyph = icon => `<svg class="glyph" viewBox="0 0 24 24" aria-hidden="true">${icon}</svg>`;
  const iconOf = view => SHORTCUTS[view][1] || (document.querySelector(`.rail .service[data-view="${view}"] svg`) || {}).innerHTML || '';
  // A service with a side panel opens there, so Home stays in view; the others open their page.
  const open = view => view === 'claude' ? showView('settings') : DOCKS[view] ? dockTo(view) : showView(view);
  function tile(view) {
    if (tiles[view]) return tiles[view];
    const b = document.createElement('button');
    b.className = 'h-tile';
    b.innerHTML = `<header>${glyph(iconOf(view))}<span class="h-name"></span><span class="h-unpin" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m7 7 10 10M17 7 7 17"/></svg></span></header><span class="h-value"></span><span class="h-visual"></span><span class="h-size" role="button" tabindex="-1" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M14 20h6v-6M10 4H4v6"/></svg></span>`;
    b.querySelector('.h-name').textContent = tr(SHORTCUTS[view][0]);
    b.dataset.view = view;
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => {
      if (b._dragged) return;
      if (editing) { b.remove(); arrangeTiles(); saveHome(); placeTiles(); return; }
      open(view);
    });
    b.querySelector('.h-size').addEventListener('click', e => { e.stopPropagation(); if (editing) resizeTile(b); });
    dragTile(b);
    return tiles[view] = { el: b, value: b.querySelector('.h-value'), detail: null, visual: b.querySelector('.h-visual') };
  }

  // The cards sit on a grid of cells: any cell can hold one, a card takes one to three cells across and one or two down, and an empty cell stays empty.
  // What a card is dropped on is pushed down. The columns follow the width of the page.
  const CELL_MIN = 150, GAP = 12, SIZES = [[1, 1], [2, 1], [1, 2], [2, 2]];
  let cols = 4, spots = {};
  const tileEls = () => [...$('h-tiles').children].filter(el => el.classList.contains('h-tile'));

  // Where every card goes: `first` is placed where it is wanted, the others keep theirs when they can, and a card that does not have a place yet takes the first free one.
  function solveGrid(views, wanted, first) {
    const used = new Set(), out = {};
    const free = (c, r, w, h) => { if (c < 0 || c + w > cols) return false; for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) if (used.has((c + i) + ',' + (r + j))) return false; return true; };
    const take = (v, c, r, w, h) => { for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) used.add((c + i) + ',' + (r + j)); out[v] = { col: c, row: r, w, h }; };
    const order = views.slice().sort((a, b) => {
      if (a === first) return -1;
      if (b === first) return 1;
      const A = wanted[a], B = wanted[b];
      if (A && B) return A.row - B.row || A.col - B.col;
      return A ? -1 : B ? 1 : views.indexOf(a) - views.indexOf(b);
    });
    for (const v of order) {
      const want = wanted[v], w = Math.min(cols, (want && want.w) || 1), h = (want && want.h) || 1;
      if (want) {
        const c = Math.max(0, Math.min(cols - w, want.col));
        let r = Math.max(0, want.row);
        while (!free(c, r, w, h)) r++;
        take(v, c, r, w, h);
      } else {
        let r = 0, found = false;
        for (; !found; r++) for (let c = 0; c <= cols - w && !found; c++) if (free(c, r, w, h)) { take(v, c, r, w, h); found = true; }
      }
    }
    return out;
  }

  // Puts every card where the grid says. `want` overrides the wish of some cards (a card being moved or resized).
  function arrangeTiles(want = {}, first = null) {
    const zone = $('h-tiles'), els = tileEls();
    const saved = {};
    for (const p of (layoutNow.TilePlaces || [])) saved[p.Id] = { col: p.Col, row: p.Row, w: p.W, h: p.H };
    const wanted = {};
    for (const el of els) { const v = el.dataset.view; wanted[v] = want[v] || spots[v] || saved[v] || null; }
    spots = solveGrid(els.map(el => el.dataset.view), wanted, first);
    let rows = 1;
    for (const el of els) {
      const s = spots[el.dataset.view];
      el.style.gridColumn = (s.col + 1) + ' / span ' + s.w;
      el.style.gridRow = (s.row + 1) + ' / span ' + s.h;
      el.dataset.size = s.w + 'x' + s.h;
      rows = Math.max(rows, s.row + s.h);
    }
    // While arranging, every empty cell shows, and one more row to drop a card into.
    for (const cell of [...zone.querySelectorAll('.h-cell')]) cell.remove();
    if (editing) {
      const taken = new Set();
      for (const el of els) { const s = spots[el.dataset.view]; for (let i = 0; i < s.w; i++) for (let j = 0; j < s.h; j++) taken.add((s.col + i) + ',' + (s.row + j)); }
      for (let r = 0; r <= rows; r++) for (let c = 0; c < cols; c++) if (!taken.has(c + ',' + r)) {
        const cell = document.createElement('i');
        cell.className = 'h-cell';
        cell.style.gridColumn = String(c + 1);
        cell.style.gridRow = String(r + 1);
        zone.append(cell);
      }
    }
  }

  // The columns that fit, at least two.
  function fitColumns() {
    const zone = $('h-tiles'), width = zone.clientWidth;
    if (!width) return;
    const next = Math.max(2, Math.min(8, Math.floor((width + GAP) / (CELL_MIN + GAP))));
    if (next === cols && zone.style.getPropertyValue('--cols')) return;
    cols = next;
    zone.style.setProperty('--cols', String(cols));
    spots = {};
    arrangeTiles();
  }

  // A card follows the pointer in the edit mode; the cards in its way glide down, it settles in the cell it was left over.
  function dragTile(b) {
    let start = null, dragging = false, home = null, origin = null, last = '';
    const view = () => b.dataset.view;
    const spot = () => { const t = b.style.transform; b.style.transform = ''; const r = b.getBoundingClientRect(); b.style.transform = t; return r; };
    const follow = e => {
      if (!start || e.pointerId !== start.id) return;
      if (!dragging) {
        if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < 6) return;
        dragging = true;
        if (b._slide) b._slide.cancel();
        origin = home = spot();
        start.dx = start.x - origin.left; start.dy = start.y - origin.top;
        b.classList.add('grabbed');
      }
      const zone = $('h-tiles').getBoundingClientRect(), cw = (zone.width - GAP * (cols - 1)) / cols, rh = parseFloat(getComputedStyle($('h-tiles')).gridAutoRows) || 118;
      const col = Math.round((e.clientX - start.dx - zone.left) / (cw + GAP)), row = Math.round((e.clientY - start.dy - zone.top) / (rh + GAP));
      const key = col + ',' + row;
      if (key !== last) {
        last = key;
        const s = spots[view()];
        glide(tileEls().filter(x => x !== b), () => arrangeTiles({ [view()]: { col, row, w: s.w, h: s.h } }, view()));
        home = spot();
      }
      b.style.transform = `translate(${e.clientX - start.x - (home.left - origin.left)}px, ${e.clientY - start.y - (home.top - origin.top)}px) scale(1.02)`;
    };
    const end = e => {
      if (!start || e.pointerId !== start.id) return;
      removeEventListener('pointermove', follow);
      removeEventListener('pointerup', end);
      removeEventListener('pointercancel', end);
      const moved = dragging;
      start = null; dragging = false;
      b.classList.remove('grabbed');
      if (!moved) return;
      const from = b.getBoundingClientRect();
      b.style.transform = '';
      slide(b, from, 180);
      b._dragged = true;
      setTimeout(() => { b._dragged = false; }, 0);
      saveHome();
    };
    b.addEventListener('pointerdown', e => {
      if (e.button !== 0 || !editing || e.target.closest('.h-size')) return;
      start = { x: e.clientX, y: e.clientY, id: e.pointerId };
      dragging = false; last = '';
      addEventListener('pointermove', follow);
      addEventListener('pointerup', end);
      addEventListener('pointercancel', end);
    });
    // The arrows move a card by one cell.
    b.addEventListener('keydown', e => {
      const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (!step || !editing || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
      e.preventDefault();
      e.stopPropagation();
      const s = spots[view()];
      glide(tileEls().filter(x => x !== b), () => arrangeTiles({ [view()]: { col: s.col + step[0], row: Math.max(0, s.row + step[1]), w: s.w, h: s.h } }, view()));
      b.focus();
      saveHome();
    });
  }

  // The size button turns a card through 1 x 1, 2 x 1, 1 x 2 and 2 x 2 cells.
  function resizeTile(b) {
    const s = spots[b.dataset.view];
    let at = SIZES.findIndex(z => z[0] === s.w && z[1] === s.h);
    let next = SIZES[(at + 1) % SIZES.length];
    if (next[0] > cols) next = SIZES.find(z => z[0] <= cols && z[1] !== s.h) || [1, 1];
    glide(tileEls().filter(x => x !== b), () => arrangeTiles({ [b.dataset.view]: { col: s.col, row: s.row, w: next[0], h: next[1] } }, b.dataset.view));
    saveHome();
  }

  // This PC opens its details in the side panel, like the tiles, so Home stays in view.
  const PARTS = { processor: 'processor', memory: 'memory', disk: 'disk', power: 'battery', heat: 'temperature' };
  let rowShown = null, memoryHigh = false;
  function openRow(key) {
    const dock = key === 'memory' && memoryHigh ? 'tasks' : key === 'network' ? 'network' : 'hardware';
    if (document.body.dataset.dock === dock && rowShown === key) { setDock(null); return; }
    rowShown = key;
    setDock(dock);
    if (dock === 'hardware' && Bramble.hardware) Bramble.hardware.focus(PARTS[key]);
    markRows();
  }
  function markRows() {
    const dock = document.body.dataset.dock;
    if (!dock) rowShown = null;
    for (const r of [...$('h-dials').children, ...$('h-instruments').children]) r.setAttribute('aria-pressed', String(!!dock && r.dataset.key === rowShown && ['hardware', 'network', 'tasks'].includes(dock)));
  }
  new MutationObserver(markRows).observe(document.body, { attributes: true, attributeFilter: ['data-dock'] });

  const set = (key, value, detail, alert) => {
    const t = tiles[key];
    if (!t) return;
    t.value.textContent = value || '–';
    if (t.detail) t.detail.textContent = detail || '';
    t.el.title = t.detail ? '' : detail || '';
    t.el.classList.toggle('alert', !!alert);
  };

  const visual = (key, html) => { if (!tiles[key]) return; const v = tiles[key].visual; if (v.dataset.key !== html) { v.dataset.key = html; v.innerHTML = html; } };
  const bar = part => `<span class="h-bar"><i style="width:${Math.max(0, Math.min(100, Math.round(part)))}%"></i></span>`;
  const urlIcon = a => `/app/icon-cache/${encodeURIComponent(a.key)}-${a.retro ? 32 : 64}.png`;
  const urlCursor = a => `/app/cursor-cache/${encodeURIComponent(a.key)}-${a.retro ? 32 : 64}.png`;
  $('h-wallpaper').dataset.dockTo = 'wallpaper';
  $('h-wallpaper').addEventListener('click', () => dockTo('wallpaper'));
  $('h-display').addEventListener('click', () => dockTo('display'));
  $('h-sound').addEventListener('click', () => dockTo('station'));
  const CHEVRON = '<svg class="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';
  $('h-previous').addEventListener('click', () => send('previous'));
  $('h-pause').addEventListener('click', () => send('pause'));
  $('h-next').addEventListener('click', () => send('next'));

  const renderPower = Quick.bind({
    warmOn: 'warm-on', warm: 'warm-strength', night: 'night-light', group: 'h-quick',
    saver: 'saver-on', saverDetail: 'saver-detail', saverRow: 'h-saver',
    screenAc: 'screen-ac', screenDc: 'screen-dc', sleepAc: 'sleep-ac', sleepDc: 'sleep-dc',
  });
  function renderQuick(e) {
    renderPower(e);
    const p = e.power;
    if (!p) return;
    const battery = p.battery && e.onBattery, screen = battery ? p.screenDc : p.screenAc, sleep = battery ? p.sleepDc : p.sleepAc;
    $('power-summary').textContent = screen < 0 ? '' : tr(battery ? 'On battery: screen {0}, sleep {1}' : 'Plugged in: screen {0}, sleep {1}', Quick.timeout(screen).toLowerCase(), Quick.timeout(sleep).toLowerCase());
  }
  $('power-more').addEventListener('click', () => {
    const open = $('power-more').getAttribute('aria-expanded') !== 'true';
    reveal($('power-rows'), open);
    $('power-more').setAttribute('aria-expanded', String(open));
  });

  function duration(s) {
    const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60);
    return h ? tr('{0} h {1}', h, String(m).padStart(2, '0')) : `${m} min`;
  }

  function render() {
    const e = Bramble.state;
    $('h-date').textContent = new Date().toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });
    $('h-time').textContent = new Date().toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
    if (!e) return;

    const primary = (e.displays || []).find(d => d.primary);
    const wallpaper = primary ? wallpaperFor(primary.key) : e.wallpapers && e.wallpapers.find(f => f.name === e.current);
    const key = (wallpaper ? wallpaper.name + '@' + wallpaper.stamp : '') + '|' + e.light + '|' + e.speed + '|' + e.fit;
    if (key !== keyWallpaper) {
      keyWallpaper = key;
      const zone = $('h-wallpaper-preview');
      zone.replaceChildren();
      if (wallpaper) {
        const m = livePreview(wallpaper, $('h-wallpaper'));
        if (m.tagName === 'VIDEO') { m.autoplay = true; m.play().catch(() => { }); }
        zone.append(m);
      }
    }
    const paused = !!(e.paused || e.onBattery);
    $('h-wallpaper').classList.toggle('paused', paused);
    $('h-wallpaper').classList.toggle('fit', e.fit === 'fit');
    $('h-now-name').textContent = wallpaper ? wallpaper.name.replace(/\.[^.]+$/, '') : tr('No wallpaper selected');
    $('h-now-type').textContent = wallpaper ? TYPES[wallpaper.type] : '';
    $('h-pause').textContent = tr(e.paused ? 'Resume' : 'Pause');
    $('h-pause').setAttribute('aria-pressed', String(!!e.paused));
    $('h-next').disabled = $('h-previous').disabled = !e.wallpapers || e.wallpapers.length < 2;
    renderQuick(e);
    if (wallpaper) set('wallpaper', wallpaper.name.replace(/\.[^.]+$/, ''), TYPES[wallpaper.type] + (paused ? ' · ' + tr('Paused') : ''));
    const made = (e.wallpapers || []).filter(w => w.custom && !w.bundled).length;
    set('create', tr('Make a wallpaper'), made === 1 ? tr('1 made') : made ? tr('{0} made', made) : '');
    const screens = e.displays || [];
    set('display', screens.length === 1 ? tr('1 screen') : tr('{0} screens', screens.length), e.display && e.display.warmOn ? tr('Warm screen on') : '');
    visual('display', '<span class="h-screens">' + screens.map(d => `<i class="${d.primary ? 'main' : ''}" style="aspect-ratio:${d.w} / ${d.h}"></i>`).join('') + '</span>');
    if (e.audio) {
      set('audio', e.audioOutput || tr('No output plugged in'), e.audio.volume == null ? '' : e.audio.muted ? tr('Muted') : tr('Volume {0} %', e.audio.volume));
      visual('audio', e.audio.volume == null ? '' : bar(e.audio.muted ? 0 : e.audio.volume));
    }
    set('duplicates', tr('Find extra copies'), tr('Files of 1 MB or more'));
    set('taskbar', tr('Look and buttons'), tr('Alignment, search, hiding'));
    set('convert', tr('Images, PDF, text'), tr('On this PC, nothing is sent'));
    const c = e.claude, u = c && c.usage;
    if (!c || !c.on) { set('claude', tr('Off'), tr('Turn it on in Settings, Connections')); visual('claude', ''); }
    else if (c.status === 'ok' && u && u.session) { set('claude', tr('Session {0} %', u.session.percent), claudeText(c), u.session.percent >= 90); visual('claude', bar(u.session.percent)); }
    else { set('claude', tr('Unknown'), claudeText(c)); visual('claude', ''); }
    if (e.notes) {
      set('notes', e.notes.count === 1 ? tr('1 note') : e.notes.count ? tr('{0} notes', e.notes.count) : tr('No note yet'), e.notes.last || '');
      if (tiles.notes) tiles.notes.el.title = e.notes.last || '';
    }
    if (e.shelf) set('shelf', e.shelf.count === 1 ? tr('1 file') : e.shelf.count ? tr('{0} files', e.shelf.count) : tr('Empty'), e.shelf.captures === 1 ? tr('1 capture') : e.shelf.captures ? tr('{0} captures', e.shelf.captures) : '');

    const s = e.station;
    if (s) {
      const active = s.events.filter(x => x.active).length;
      const on = s.active && !s.silence;
      set('station', tr(!on ? 'Sounds off' : active === 1 ? '1 event on' : '{0} events on', active));
      visual('station', '<span class="h-leds">' + s.events.map(x => `<i class="${x.active && on ? 'on' : ''}"></i>`).join('') + '</span>');
    }

    const pc = [], level = (v, warn, bad) => v >= bad ? 'low' : v >= warn ? 'medium' : 'high';
    if (stats) {
      const cpu = stats.processor.total, ram = stats.memory.used / stats.memory.total * 100;
      memoryHigh = ram >= 80;
      const apps = tasks ? tasks.items : [], top = key => apps.reduce((a, t) => !a || (t[key] || 0) > (a[key] || 0) ? t : a, null);
      const busy = top('cpu'), heavy = top('memory');
      pc.push({ key: 'processor', part: cpu, value: Math.round(cpu) + ' %', label: tr('Processor'), sub: tr('{0} threads', stats.processor.threads.length), level: level(cpu, 80, 95),
        details: { title: tr('Processor'), value: Math.round(cpu) + ' %', lines: [[tr('Clock'), stats.processor.frequency ? (stats.processor.frequency / 1000).toLocaleString(LOCALE, { maximumFractionDigits: 2 }) + ' GHz' : ''],
          [tr('Threads'), String(stats.processor.threads.length)], [tr('Busiest'), busy && busy.cpu >= 1 ? busy.name + ' · ' + Math.round(busy.cpu) + ' %' : '']] } });
      pc.push({ key: 'memory', part: ram, value: Math.round(ram) + ' %', label: tr('Memory'), level: level(ram, 75, 85),
        sub: memoryHigh ? tr('Free up memory') : tr('{0} of {1}', size(stats.memory.used).replace(/ \S+$/, ''), size(stats.memory.total)),
        details: { title: tr('Memory'), value: Math.round(ram) + ' %', lines: [[tr('In use'), size(stats.memory.used)], [tr('Available'), size(stats.memory.total - stats.memory.used)],
          [tr('Installed'), size(stats.memory.total)], [tr('Heaviest'), heavy ? heavy.name + ' · ' + size(heavy.memory) : '']] } });
    }
    if (stats) {
      set('hardware', tr('Processor {0} %', Math.round(stats.processor.total)), stats.temperature != null ? Math.round(stats.temperature) + ' °C' : '');
      visual('hardware', bar(stats.processor.total));
    }
    if (network) {
      const sig = network.wifi && network.signal >= 0 ? network.signal : network.connected ? 100 : 0;
      set('network', !network.connected ? tr('Offline') : network.network || tr('Cable'), network.wifi && network.connected ? tr('Wi-Fi {0} %', sig) : '', !network.connected);
      tiles.network && (tiles.network.value.translate = false);
      visual('network', bar(sig));
    }
    if (lastHealth) {
      set('health', lastHealth.text, lastHealth.protection, lastHealth.level === 'bad');
      visual('health', `<span class="h-leds"><i class="lamp--${LAMPS[lastHealth.level]}"></i><i class="lamp--${LAMPS[lastHealth.protectionLevel]}"></i></span>`);
    }
    const fi = e.files;
    if (fi && fi.disks && fi.disks[0]) {
      const d = fi.disks[0], used = (d.size - d.free) / d.size * 100;
      set('files', tr('{0} free', size(d.free)), tr('Disk {0}', (d.path || '').slice(0, 2)), d.free / d.size < 0.1);
      visual('files', bar(used));
      pc.push({ key: 'disk', part: used, value: Math.round(used) + ' %', label: tr('Disk {0}', (d.path || '').slice(0, 2)), sub: tr('{0} free', size(d.free)), level: d.free / d.size < 0.1 ? 'low' : 'high',
        details: { title: tr('Disk {0}', (d.path || '').slice(0, 2)), value: Math.round(used) + ' %', lines: [[tr('In use'), size(d.size - d.free)], [tr('Free'), size(d.free)], [tr('Size'), size(d.size)]] } });
    }
    renderInstruments();
    dials($('h-dials'), pc.map(x => Object.assign(x, { action: () => openRow(x.key) })));
    markRows();

    const a = e.icons;
    if (a) {
      set('icons', tr(a.customized.length > 1 ? '{0} customized folders' : a.customized.length ? '1 customized folder' : 'No customized folder', a.customized.length));
      visual('icons', '<span class="h-images">' + a.customized.filter(x => x.preview).slice(0, 4).map(x => `<img src="${urlIcon(x.preview)}" class="${x.preview.retro ? 'retro' : ''}" alt="">`).join('') + '</span>');
    }

    const r = e.arrange;
    if (r) {
      set('arrange', tr(ARRANGEMENTS[r.arrangement] || 'Left'), tr(r.layouts.length > 1 ? '{0} saved layouts' : r.layouts.length ? '1 saved layout' : 'No saved layout', r.layouts.length));
      if (Bramble.arrange && Bramble.arrange.thumbnail) visual('arrange', '<span class="h-thumbnail">' + Bramble.arrange.thumbnail(r.arrangement || 'left') + '</span>');
    }

    const so = e.mouse;
    if (so) {
      set('mouse', tr(so.themeTitle), tr('{0} px pointer', so.settings.size === 0 ? 16 : 32 + (so.settings.size - 1) * 16));
      visual('mouse', '<span class="h-images">' + ['Arrow', 'Hand', 'IBeam', 'Wait'].map(id => so.roles.find(x => x.id === id)).filter(x => x && x.preview).map(x => `<img src="${urlCursor(x.preview)}" class="${x.preview.retro ? 'retro' : ''}" alt="">`).join('') + '</span>');
    }

    renderMoods(e.moods || []);

    if (tasks) {
      const apps = tasks.items.filter(t => t.kind === 'app').sort((a, b) => b.memory - a.memory), top = apps[0];
      set('tasks', tr(apps.length > 1 ? '{0} apps open' : apps.length ? '1 app open' : 'No app open', apps.length), top ? tr('Busiest: {0}', top.name) + ' · ' + size(top.memory) : '');
      visual('tasks', '<span class="h-images">' + apps.filter(t => appIcons.get(t.id)).slice(0, 4).map(t => `<img src="${appIcons.get(t.id)}" alt="">`).join('') + '</span>');
    }
  }

  function renderModesTile(moods) {
    const active = moods.find(m => m.current);
    set('modes', active ? active.name : moods.length === 1 ? tr('1 theme') : moods.length ? tr('{0} themes', moods.length) : tr('None yet'), active ? tr('Active') : '');
    if (tiles.modes) tiles.modes.value.translate = !active;
    if (Bramble.moods) visual('modes', '<span class="h-glyphs">' + moods.slice(0, 5).map(m => Bramble.moods.icon(m.icon)).join('') + '</span>');
  }

  function renderMoods(moods) {
    renderModesTile(moods);
    const zone = $('h-moods');
    const key = moods.map(m => m.id + (m.current ? '*' : '') + m.name + m.icon).join('|');
    if (zone.dataset.key === key && zone.children.length) return;
    zone.dataset.key = key;
    const title = document.createElement('button');
    title.className = 'button h-modes__open';
    title.dataset.dockTo = 'modes';
    title.setAttribute('aria-pressed', String(document.body.dataset.dock === 'modes'));
    title.title = tr('See and edit the themes');
    title.innerHTML = '<svg class="glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="M19.5 14.6A7.6 7.6 0 0 1 9.4 4.5a7.6 7.6 0 1 0 10.1 10.1z"/><path d="M17 3.5v4M15 5.5h4"/></svg><span class="h-modes__what"><span class="h-name"></span><span class="h-value"></span></span>' + CHEVRON;
    const active = moods.find(m => m.current);
    title.querySelector('.h-name').textContent = tr('Themes');
    title.querySelector('.h-value').textContent = active ? active.name : moods.length === 1 ? tr('1 theme') : moods.length ? tr('{0} themes', moods.length) : tr('None yet');
    title.addEventListener('click', () => dockTo('modes'));
    const more = document.createElement('button');
    more.className = 'link h-modes__more';
    more.textContent = tr('Save the current setup as a theme');
    more.hidden = moods.length > 0;
    more.addEventListener('click', () => { if (Bramble.moods) Bramble.moods.startNew(); });
    zone.replaceChildren(title, ...moods.slice(0, 4).map(m => {
      const b = document.createElement('button');
      b.className = 'tool-chip';
      b.setAttribute('aria-pressed', String(!!m.current));
      if (Bramble.moods) b.insertAdjacentHTML('beforeend', Bramble.moods.icon(m.icon));
      b.append(Object.assign(document.createElement('span'), { textContent: m.name, translate: false }));
      b.title = m.current ? tr('Turn off') : tr('Apply');
      b.addEventListener('click', () => send(m.current ? 'moods.release' : 'moods.apply', { id: m.id }));
      return b;
    }), more);
  }

  function time(code) {
    if (code === 0) return ['Clear sky', 'sun'];
    if (code <= 2) return ['Partly cloudy', 'partly'];
    if (code === 3) return ['Overcast', 'cloud'];
    if (code === 45 || code === 48) return ['Fog', 'fog'];
    if (code >= 51 && code <= 57) return ['Drizzle', 'rain'];
    if (code >= 61 && code <= 67) return ['Rain', 'rain'];
    if (code >= 71 && code <= 77) return ['Snow', 'snow'];
    if (code >= 80 && code <= 82) return ['Showers', 'rain'];
    if (code === 85 || code === 86) return ['Snow showers', 'snow'];
    if (code >= 95) return ['Thunderstorm', 'storm'];
    return ['Cloudy', 'cloud'];
  }
  const CLOUD = '<path class="m-cloud" d="M15 36h19a8 8 0 0 0 .8-16A11 11 0 0 0 14 22.5 7 7 0 0 0 15 36z"/>';
  function drawing(kind, day) {
    const orb = day
      ? '<g class="m-sun"><circle cx="18" cy="17" r="6"/><path d="M18 5v3M18 26v3M6 17h3M27 17h3M9.5 8.5l2 2M24.5 23.5l2 2M26.5 8.5l-2 2M11.5 23.5l-2 2"/></g>'
      : '<path class="m-moon" d="M24 8a10 10 0 1 0 8 15A9 9 0 0 1 24 8z"/>';
    switch (kind) {
      case 'sun': return day ? '<g class="m-sun"><circle cx="24" cy="24" r="8"/><path d="M24 8v4M24 36v4M8 24h4M36 24h4M12.7 12.7l2.8 2.8M32.5 32.5l2.8 2.8M35.3 12.7l-2.8 2.8M15.5 32.5l-2.8 2.8"/></g>' : '<path class="m-moon" d="M28 10a13 13 0 1 0 10 20A12 12 0 0 1 28 10z"/>';
      case 'partly': return orb + CLOUD;
      case 'fog': return CLOUD + '<path class="m-stroke" d="M10 41h28M14 45h20"/>';
      case 'rain': return CLOUD + '<path class="m-drop" d="M18 40l-2 4M25 40l-2 4M32 40l-2 4"/>';
      case 'snow': return CLOUD + '<g class="m-flake"><circle cx="17" cy="42" r="1.4"/><circle cx="24" cy="44" r="1.4"/><circle cx="31" cy="42" r="1.4"/></g>';
      case 'storm': return CLOUD + '<path class="m-lightning" d="M25 36l-4 6h5l-3 5"/>';
      default: return CLOUD;
    }
  }
  function renderWeather() {
    if (!weather || !weather.ok) { $('h-weather').hidden = true; return; }
    const [what, kind] = time(weather.code);
    $('h-weather').hidden = false;
    $('h-weather-icon').innerHTML = drawing(kind, weather.day);
    $('h-weather-temp').textContent = weather.temperature + ' °C';
    $('h-weather-what').textContent = tr(what);
    $('h-weather-city').textContent = weather.city || '';
    $('h-weather-details').textContent = [tr('{0} / {1} °C', weather.min, weather.max), tr('wind {0} km/h', weather.wind), weather.rain >= 0 ? tr('rain {0} %', weather.rain) : ''].filter(Boolean).join(' · ');
    $('h-weather').title = tr('Feels like {0} °C · humidity {1} %', weather.feels, weather.humidity);
  }

  let screenSize = null;
  function fitPreview() {
    const wallpaper = $('h-wallpaper');
    if (!screenSize || !wallpaper.clientWidth) return;
    wallpaper.style.setProperty('--vw', screenSize.w.toFixed(1));
    wallpaper.style.setProperty('--vh', screenSize.h.toFixed(1));
    wallpaper.style.setProperty('--k', (wallpaper.clientWidth / screenSize.w).toFixed(5));
  }
  new ResizeObserver(fitPreview).observe($('h-wallpaper'));

  function renderDesktop() {
    const zone = $('h-desktop'), wallpaper = $('h-wallpaper');
    if (!map || !map.screens.length) return;
    const e = map.screens.find(x => x.primary) || map.screens[0];

    wallpaper.style.setProperty('--ratio', e.w + ' / ' + e.h);
    wallpaper.style.setProperty('--ratio-n', (e.w / e.h).toFixed(4));
    screenSize = { w: e.w / (e.scale || 1), h: e.h / (e.scale || 1) };
    fitPreview();

    const frame = e.frame || map.caseW;
    const width = (frame / e.w * 100).toFixed(3) + '%', height = (map.caseH / e.h * 100).toFixed(3) + '%';
    const dpi = e.scale || 1, iconPx = (map.iconSize || 48) * dpi, lead = 5, shift = Math.max(0, (frame - iconPx) / 2);
    const image = Math.min(100, iconPx / frame * 100).toFixed(1) + '%';
    const seen = new Set();
    for (const el of map.elements) {
      if (el.icon) images.set(el.id, el.icon);
      if (el.x < e.x || el.x >= e.x + e.w || el.y < e.y || el.y >= e.y + e.h) continue;
      seen.add(el.id);
      let b = zone.querySelector(`[data-id="${CSS.escape(el.id)}"]`);
      if (!b) {
        b = document.createElement('span');
        b.className = 'h-icon';
        b.dataset.id = el.id;
        b.innerHTML = '<img alt=""><i></i>';
        zone.append(b);
      }
      const img = b.querySelector('img');
      if (images.has(el.id) && img.src !== images.get(el.id)) img.src = images.get(el.id);
      b.querySelector('i').textContent = el.name;
      b.style.left = ((el.x - e.x - shift) / e.w * 100).toFixed(3) + '%';
      b.style.top = ((el.y + lead - e.y) / e.h * 100).toFixed(3) + '%';
      b.style.width = width;
      b.style.height = height;
      img.style.width = image;
    }
    const bars = JSON.stringify([e.x, e.y, e.w, e.h, e.tx, e.ty, e.tw, e.th]);
    if (zone.dataset.bars !== bars) {
      zone.dataset.bars = bars;
      zone.querySelectorAll('.taskbar').forEach(b => b.remove());
      zone.prepend(...taskbars(e));
    }
    for (const b of [...zone.children]) if (!b.classList.contains('taskbar') && !seen.has(b.dataset.id)) b.remove();
    zone.classList.toggle('hidden', !!map.hidden);
  }

  const LAMPS = { ok: 'high', warn: 'medium', bad: 'low' };
  // Heat, battery and Wi-Fi keep the instruments of Hardware rather than a ring.
  const instruments = {};
  function instrument(key, label, drawing) {
    const b = document.createElement('button');
    b.className = 'h-instrument';
    b.dataset.key = key;
    b.innerHTML = `<span class="h-instrument__label"></span>${drawing}<span class="h-instrument__value"><b></b><span></span></span>`;
    b.querySelector('.h-instrument__label').textContent = tr(label);
    b.addEventListener('click', () => openRow(key));
    details(b, () => instrumentDetails(key));
    $('h-instruments').append(b);
    return instruments[key] = { el: b, value: b.querySelector('b'), word: b.querySelector('.h-instrument__value span'), drawing: b.children[1] };
  }
  function instrumentDetails(key) {
    const t = stats && stats.temperature, b = stats && stats.battery, n = network;
    if (key === 'heat') return { title: tr('Heat'), value: Math.round(t) + ' °C', note: tr('Read in the processor thermal zone'), lines: [[tr('Hot from'), '85 °C'], [tr('Slows down from'), '90 °C']] };
    if (key === 'power') return { title: tr('Battery'), value: b.charge + ' %', lines: [[tr('Power'), b.mains ? tr('Plugged in') : tr('On battery')], [tr('Time left'), !b.mains && b.remaining > 0 ? duration(b.remaining) : '']] };
    if (key === 'network' && n) return { title: n.wifi ? tr('Wi-Fi') : tr('Network'), value: n.wifi && n.signal >= 0 ? n.signal + ' %' : '', lines: [[tr('Network'), n.network || ''],
      [tr('Standard'), n.standard || ''], [tr('Channel'), n.channel ? String(n.channel) : ''], [tr('Link speed'), n.speed > 0 ? Math.round(n.speed) + ' Mbit/s' : ''], [tr('Last test'), n.history && n.history[0] ? '↓ ' + Math.round(n.history[0].down) + ' Mbit/s' : '']] };
    return null;
  }
  function renderInstruments() {
    const t = stats && stats.temperature, b = stats && stats.battery;
    if (t != null) {
      const k = instruments.heat || instrument('heat', 'Heat', thermometer());
      k.value.textContent = Math.round(t) + ' °C';
      k.word.textContent = tr(t < 60 ? 'Cool' : t < 85 ? 'Warm' : 'Hot');
      k.el.classList.toggle('alert', t >= 85);
      setThermometer(k.drawing, t);
    }
    if (b) {
      const k = instruments.power || instrument('power', 'Battery', batteryRelief());
      k.value.textContent = b.charge + ' %';
      k.word.textContent = b.mains ? tr('Plugged in') : b.remaining > 0 ? tr('{0} left', duration(b.remaining)) : tr('On battery');
      k.el.classList.toggle('alert', b.charge <= 15 && !b.mains);
      setBattery(k.drawing, b);
    }
    if (network) {
      const k = instruments.network || instrument('network', network.wifi ? 'Wi-Fi' : 'Network', wifiRelief());
      const sig = network.wifi && network.signal >= 0 ? network.signal : network.connected ? 100 : 0;
      k.value.textContent = !network.connected ? tr('Offline') : network.wifi ? sig + ' %' : tr('Cable');
      k.word.textContent = network.connected ? network.network || '' : '';
      k.word.translate = false;
      k.el.classList.toggle('alert', !network.connected);
      setWifi(k.drawing, sig, network.connected);
    }
    const order = ['heat', 'power', 'network'];
    for (const key of order) if (instruments[key]) $('h-instruments').append(instruments[key].el);
  }

  let lastHealth = null;
  function health(h) {
    lastHealth = h;
    const b = $('h-health');
    b.hidden = !h;
    if (!h) return;
    const [faceButton, shieldButton] = b.querySelectorAll('.h-health__seal'), face = faceButton.firstChild, shield = shieldButton.firstChild;
    face.className = 'seal seal--small security--' + LAMPS[h.level];
    shield.className = 'seal seal--small security--' + LAMPS[h.protectionLevel];
    if (face.dataset.level !== h.level) { face.dataset.level = h.level; face.innerHTML = faceLight('home-face', LAMPS[h.level]); }
    if (shield.dataset.level !== h.protectionLevel) { shield.dataset.level = h.protectionLevel; shield.innerHTML = shieldLight('home-shield', LAMPS[h.protectionLevel]); }
    details(faceButton, { title: tr('Speed'), lines: [[tr('Status'), h.text]] });
    details(shieldButton, { title: tr('Protection'), lines: [[tr('Status'), h.protection]] });
  }
  for (const b of $('h-health').querySelectorAll('.h-health__seal')) b.addEventListener('click', () => { showView('health'); const card = $(b.dataset.to); if (card) card.scrollIntoView({ block: 'start' }); });

  function event(m) {
    if (m.type === 'home.weather') { weather = m; renderWeather(); return; }
    if (m.type === 'arrange.map') { map = m; if (shown) renderDesktop(); return; }
    if (m.type === 'network.infos' || (m.type === 'network.test' && m.step === 'end')) {
      if (m.type === 'network.infos') network = m;
      else if (network) network.history = m.history;
    } else if (m.type === 'hardware.stats') stats = m;
    else if (m.type === 'tasks.list') { tasks = m; for (const t of m.items) if (t.info && t.info.icon) appIcons.set(t.id, t.info.icon); }
    else return;
    if (shown) render();
  }

  // Customize: the three blocks and the cards move with the pointer or the arrows; a click hides a block or unpins a card.
  let editing = false, layoutKey = '', layoutNow = {};
  const main = document.querySelector('.h-main');
  const blocks = () => [...main.children].sort((a, b) => (Number(a.style.order) || 0) - (Number(b.style.order) || 0));
  const ordered = (saved, all) => [...(saved || []).filter(x => all.includes(x)), ...all.filter(x => !(saved || []).includes(x))];
  function layout(l) {
    layoutNow = l || {};
    const next = JSON.stringify([layoutNow.Blocks, layoutNow.HiddenBlocks, layoutNow.Tiles, layoutNow.TilePlaces, editing]);
    if (next === layoutKey) return;
    layoutKey = next;
    spots = {};
    // The order is a style, not a move in the page: moving the block of the wallpaper would reload its live preview.
    const order = ordered(layoutNow.Blocks, Object.keys(BLOCKS)), off = layoutNow.HiddenBlocks || [];
    for (const el of main.children) {
      const hidden = off.includes(el.dataset.block);
      el.style.order = order.indexOf(el.dataset.block);
      el.classList.toggle('is-off', hidden);
      el.hidden = hidden && !editing;
      const cover = el.querySelector(':scope > .h-cover');
      cover.setAttribute('aria-pressed', String(!hidden));
      cover.querySelector('.h-cover__state').textContent = tr(hidden ? 'Hidden' : 'Shown');
    }
    main.dataset.count = blocks().filter(el => !el.hidden).length;
    const list = (layoutNow.Tiles || TILES).filter(v => SHORTCUTS[v]);
    const zone = $('h-tiles'), els = list.map(v => tile(v).el);
    const now = tileEls();
    if (els.some((el, i) => now[i] !== el) || now.length !== els.length) { spots = {}; zone.replaceChildren(...els); }
    placeTiles();
    fitColumns();
    arrangeTiles();
    if (shown) render();
  }
  function placeTiles() {
    const zone = $('h-tiles'), pinned = tileEls().map(t => t.dataset.view);
    zone.hidden = !pinned.length && !editing;
    zone.classList.toggle('is-empty', !pinned.length);
    $('h-pin').hidden = !editing;
    $('h-pin-list').replaceChildren(...Object.keys(SHORTCUTS).filter(v => !pinned.includes(v)).map(v => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tool-chip';
      b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${iconOf(v)}</svg><span></span><svg class="h-pin__plus" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6v12M6 12h12"/></svg>`;
      b.querySelector('span').textContent = tr(SHORTCUTS[v][0]);
      b.title = tr('Pin to Home');
      b.addEventListener('click', () => { zone.append(tile(v).el); arrangeTiles(); saveHome(); placeTiles(); if (shown) render(); });
      return b;
    }));
  }
  function saveHome() {
    const all = blocks();
    const message = { blocks: all.map(el => el.dataset.block), hiddenBlocks: all.filter(el => el.classList.contains('is-off')).map(el => el.dataset.block), tiles: tileEls().map(t => t.dataset.view) };
    message.places = message.tiles.filter(v => spots[v]).map(v => ({ id: v, col: spots[v].col, row: spots[v].row, w: spots[v].w, h: spots[v].h }));
    layoutNow = { Blocks: message.blocks, HiddenBlocks: message.hiddenBlocks, Tiles: message.tiles, TilePlaces: message.places.map(p => ({ Id: p.id, Col: p.col, Row: p.row, W: p.w, H: p.h })) };
    layoutKey = JSON.stringify([layoutNow.Blocks, layoutNow.HiddenBlocks, layoutNow.Tiles, layoutNow.TilePlaces, editing]);
    send('layout.home', message);
  }
  for (const el of main.children) {
    const cover = document.createElement('button');
    cover.type = 'button';
    cover.className = 'h-cover';
    cover.innerHTML = '<span class="h-cover__label"><svg class="h-cover__eye" viewBox="0 0 24 24" aria-hidden="true"><path class="open" d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle class="open" cx="12" cy="12" r="3"/><path class="shut" d="M3.5 12s3.2 4.5 8.5 4.5 8.5-4.5 8.5-4.5M6.5 15l-1.5 2M12 16.5V19M17.5 15l1.5 2"/></svg><span class="h-cover__name"></span><span class="h-cover__state"></span></span>';
    cover.querySelector('.h-cover__name').textContent = tr(BLOCKS[el.dataset.block]);
    cover.title = tr('Click to show or hide it, drag or use the arrows to move it');
    cover.addEventListener('click', () => {
      if (el._dragged) return;
      el.classList.toggle('is-off');
      saveHome();
      layoutKey = '';
      layout(layoutNow);
    });
    el.append(cover);
    const swap = (a, b, after) => {
      const list = blocks().filter(x => x !== a);
      list.splice(list.indexOf(b) + (after ? 1 : 0), 0, a);
      list.forEach((x, i) => { x.style.order = i; });
    };
    dragOrder(el, { peers: blocks, active: () => editing, done: saveHome, move: swap, focus: cover });
  }
  function edit(on) {
    if (on === editing) return;
    editing = on;
    document.body.classList.toggle('home-editing', on);
    if (on && document.body.dataset.dock) setDock(null);
    $('h-editing').hidden = !on;
    $('h-customize').hidden = on;
    layoutKey = '';
    layout(layoutNow);
    if (on) main.querySelector('.h-cover').focus();
    else if (shown) $('h-customize').focus();
  }
  $('h-customize').addEventListener('click', () => edit(true));
  // The grid follows the width of the page.
  new ResizeObserver(() => { if (shown) fitColumns(); }).observe($('h-tiles'));
  $('h-done').addEventListener('click', () => edit(false));
  $('h-reset').addEventListener('click', () => send('layout.reset', { what: 'home' }));
  addEventListener('keydown', e => { if (e.key === 'Escape' && editing && !document.body.classList.contains('bar-editing')) edit(false); });

  function visible(yes) {
    shown = yes;
    clearInterval(timer);
    if (!yes) { edit(false); return; }
    render();
    send('network.infos');
    send('hardware.stats');
    send('home.weather');
    send('arrange.map', { full: images.size === 0 });
    send('tasks.list', { fresh: appIcons.size === 0 });
    send('health.scan', { again: false });
    let turn = 0;
    timer = setInterval(() => {
      if (!shown || document.visibilityState !== 'visible') return;
      send('hardware.stats');
      render();
      if (++turn % 5 === 0) { send('arrange.map'); send('tasks.list'); }
      if (turn % 450 === 0) send('home.weather');
    }, 2000);
  }

  Bramble.home = { state: () => { if (shown) render(); }, event, visible, health, layout };
})();
