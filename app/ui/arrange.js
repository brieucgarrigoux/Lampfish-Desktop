'use strict';

(function () {
  const CATEGORIES = { folders: 'Folders', apps: 'Apps', files: 'Files', system: 'System' };
  const HEIGHT_MAX = 360;

  const ARRANGEMENTS = [
    ['left', 'Left'], ['right', 'Right'], ['top', 'Top'], ['bottom', 'Bottom'],
    ['frame', 'Frame'], ['center', 'Center'], ['corners', 'Corners'], ['blocks', 'Blocks'],
  ];
  const col = (x, ys, t = 0) => ys.map(y => [x, y, t]);
  const row = (y, xs, t = 0) => xs.map(x => [x, y, t]);
  const THUMBNAILS = {
    left: [...col(0, [0, 1, 2, 3, 4]), ...col(1, [0, 1, 2, 3])],
    right: [...col(7, [0, 1, 2, 3, 4]), ...col(6, [0, 1, 2, 3])],
    top: [...row(0, [0, 1, 2, 3, 4, 5, 6, 7]), ...row(1, [0, 1])],
    bottom: [...row(4, [0, 1, 2, 3, 4, 5, 6, 7]), ...row(3, [0, 1])],
    frame: [...row(0, [0, 1, 2, 3, 4, 5, 6, 7]), ...col(7, [1, 2, 3, 4]), ...row(4, [6, 5, 4, 3, 2, 1, 0]), ...col(0, [3, 2, 1])],
    center: [...row(1, [2, 3, 4, 5]), ...row(2, [2, 3, 4, 5]), ...row(3, [3, 4])],
    corners: [...col(0, [0, 1], 0), ...col(1, [0], 0), ...col(7, [0, 1], 1), ...col(6, [0], 1), ...col(0, [4, 3], 2), ...col(1, [4], 2), ...col(7, [4], 3), ...col(6, [4], 3)],
    blocks: [...row(0, [0, 1], 0), ...row(1, [0, 1], 0), ...row(2, [0], 0), ...row(0, [3, 4], 1), ...row(1, [3], 1), ...row(0, [6, 7], 2), ...row(1, [6, 7], 2)],
  };
  function thumbnail(key) {
    const points = THUMBNAILS[key].map(([x, y, t]) => `<rect x="${4 + x * 9}" y="${4 + y * 9}" width="6" height="6" rx="1.5" class="t${t}"/>`).join('');
    return `<svg viewBox="0 0 78 52" aria-hidden="true"><rect class="screen-v" x=".5" y=".5" width="77" height="51" rx="5"/>${points}</svg>`;
  }
  let naming = false;
  const REMOVE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg>';

  function arrangementTile(key, name) {
    const b = document.createElement('button');
    b.className = 'arrangement';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(r.arrangement === key && r.active < 0));
    b.innerHTML = thumbnail(key) + '<span class="name-ag"></span>';
    b.querySelector('.name-ag').textContent = tr(name);
    b.addEventListener('click', () => send('arrange.arrangement', { value: key }));
    return b;
  }

  function renderArrangements() {
    $('arrangements').replaceChildren(...ARRANGEMENTS.map(([key, name]) => arrangementTile(key, name)));
  }

  function layoutThumbnail(d) {
    const boxes = (d.signature || '').split('|').map(x => /^(\d+)x(\d+)@(-?\d+),(-?\d+)$/.exec(x)).filter(Boolean).map(m => ({ w: +m[1], h: +m[2], x: +m[3], y: +m[4] }));
    if (!boxes.length) boxes.push({ w: 1920, h: 1080, x: 0, y: 0 });
    const x0 = Math.min(...boxes.map(b => b.x)), y0 = Math.min(...boxes.map(b => b.y));
    const x1 = Math.max(...boxes.map(b => b.x + b.w)), y1 = Math.max(...boxes.map(b => b.y + b.h));
    const k = Math.min(72 / (x1 - x0), 46 / (y1 - y0)), ox = (78 - (x1 - x0) * k) / 2, oy = (52 - (y1 - y0) * k) / 2;
    const screens = boxes.map(b => `<rect class="screen-v" x="${(ox + (b.x - x0) * k).toFixed(1)}" y="${(oy + (b.y - y0) * k).toFixed(1)}" width="${(b.w * k).toFixed(1)}" height="${(b.h * k).toFixed(1)}" rx="3"/>`).join('');
    const icons = (d.points || []).map(([x, y]) => `<rect class="t0" x="${(ox + (x - x0) * k).toFixed(1)}" y="${(oy + (y - y0) * k).toFixed(1)}" width="4" height="4" rx="1"/>`).join('');
    return `<svg viewBox="0 0 78 52" aria-hidden="true">${screens}${icons}</svg>`;
  }

  function addTile() {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'arrangement arrangement--add';
    tile.innerHTML = '<span class="arrangement__plus" aria-hidden="true">+</span><span class="name-ag"></span>';
    tile.lastChild.textContent = tr('Save current');
    tile.title = tr('Keeps the icons where they are now, to come back to them later');
    tile.addEventListener('click', () => {
      naming = true;
      const form = document.createElement('form');
      form.className = 'arrangement arrangement--form';
      form.innerHTML = '<input maxlength="40" autocomplete="off"><button class="button button--accent" type="submit"></button>';
      const input = form.querySelector('input');
      input.placeholder = tr('Name this arrangement');
      input.setAttribute('aria-label', tr('Arrangement name'));
      form.querySelector('button').textContent = tr('Save');
      form.addEventListener('submit', e => { e.preventDefault(); naming = false; send('arrange.save', { name: input.value }); });
      input.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); naming = false; form.replaceWith(tile); tile.focus(); } });
      tile.replaceWith(form);
      input.focus();
    });
    return tile;
  }

  function mineTile(d, i) {
    const t = document.createElement('div');
    t.className = 'arrangement arrangement--mine';
    t.tabIndex = 0;
    t.setAttribute('role', 'radio');
    t.setAttribute('aria-checked', String(i === r.active));
    t.setAttribute('aria-disabled', String(!d.current));
    t.innerHTML = layoutThumbnail(d) + '<span class="name-ag"></span><button type="button" class="arrangement__remove"></button>';
    const name = t.querySelector('.name-ag');
    name.textContent = d.name;
    name.translate = false;
    t.title = d.name + ' · ' + d.screens + ' · ' + formatDate(d.date) + (d.current ? '' : ' · ' + tr('Saved with other screens'));
    const remove = t.querySelector('.arrangement__remove');
    remove.innerHTML = REMOVE;
    remove.title = tr('Remove');
    remove.setAttribute('aria-label', tr('Remove'));
    remove.addEventListener('click', e => { e.stopPropagation(); send('arrange.erase', { index: i }); });
    const restore = () => { if (d.current) send('arrange.restore', { index: i }); };
    t.addEventListener('click', restore);
    t.addEventListener('keydown', e => { if (e.target === t && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); restore(); } });
    return t;
  }

  const formatDate = iso => new Date(iso).toLocaleString(LOCALE, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  function renderMine() {
    if (naming) return;
    $('layout-count').textContent = r.layouts.length || '';
    $('config').textContent = r.configuration;
    $('mine').replaceChildren(...r.layouts.map(mineTile), addTile());
  }

  function renderDock() {
    const zone = $('dock-pick');
    if (document.body.dataset.dock !== 'arrange' || !r || naming) return;
    const heading = text => Object.assign(document.createElement('h2'), { textContent: tr(text) });
    const grid = nodes => { const g = document.createElement('div'); g.className = 'arrangements'; g.append(...nodes); return g; };
    const actions = document.createElement('div');
    actions.className = 'dock-actions';
    actions.innerHTML = '<button class="button-sort" id="dock-undo"><svg class="glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14 4.5 9.5 9 5M5 9.5h9a5.5 5.5 0 0 1 0 11h-3"/></svg><span></span></button><button class="button-sort" id="dock-original"><svg class="glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4v4h4"/></svg><span></span></button>';
    const [undo, original] = actions.children;
    undo.lastChild.textContent = tr('Undo');
    original.lastChild.textContent = tr('Back to original');
    undo.disabled = !r.canUndo;
    original.disabled = !r.hasOriginal;
    undo.addEventListener('click', () => send('arrange.undo'));
    original.addEventListener('click', () => send('arrange.original'));
    zone.replaceChildren(heading('Arrangement'), grid(ARRANGEMENTS.map(([key, name]) => arrangementTile(key, name))), heading('My arrangements'), grid([...r.layouts.map(mineTile), addTile()]), actions);
    foldSections(zone, 'dock-arrange');
  }

  function wallpaperBehind(screen, e) {
    const state = Bramble.state;
    const wallpaper = wallpaperFor(`${e.w}x${e.h}@${e.x},${e.y}`);
    if (!wallpaper) return;
    const box = document.createElement('div');
    box.className = 'preview wallpaper-map';
    const media = livePreview(wallpaper, box);
    if (media.tagName === 'VIDEO') { media.autoplay = true; media.play().catch(() => { }); }
    box.append(media);
    const dim = document.createElement('div');
    dim.className = 'dim-map';
    dim.style.background = `rgba(0, 0, 0, ${(state.dim || 0) / 100 * 0.75})`;
    box.append(dim);
    screen.prepend(box);
  }
  let r = null;
  let map = null;
  let shown = false, timer = 0, drag = null, keyScreens = '', switching = 0;
  const images = new Map();
  const points = new Map(), names = new Map();
  let scale = 1, origin = { x: 0, y: 0 };

  const GAP = 2;
  const zone = $('map');
  const label = document.createElement('div');
  label.className = 'label';

  function renderMap() {
    if (!map || !map.screens.length) return;
    const left = Math.min(...map.screens.map(e => e.x)), up = Math.min(...map.screens.map(e => e.y));
    const right = Math.max(...map.screens.map(e => e.x + e.w)), down = Math.max(...map.screens.map(e => e.y + e.h));
    const style = getComputedStyle(zone);
    const width = (zone.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)) || 800;
    scale = Math.min(width / (right - left), HEIGHT_MAX / (down - up));
    origin = { x: left, y: up };
    const k = scale, frame = { w: (right - left) * k, h: (down - up) * k };

    const key = map.screens.map(e => [e.x, e.y, e.w, e.h, e.tx, e.ty, e.tw, e.th].join(',')).join('|') + '@' + width
      + '@' + (Bramble.state ? Bramble.state.current + '/' + Bramble.state.dim + '/' + Bramble.state.fit + '/' + JSON.stringify(Bramble.state.displays || []) : '');
    if (key !== keyScreens) {
      keyScreens = key;
      zone.replaceChildren(label);
      points.clear();
      names.clear();
      const scene = document.createElement('div');
      scene.className = 'scene';
      scene.style.width = frame.w + 'px';
      scene.style.height = frame.h + 'px';
      for (const e of map.screens) {
        const screen = document.createElement('div');
        screen.className = 'screen-map' + (e.primary ? ' primary' : '');
        Object.assign(screen.style, { left: (e.x - left) * k + GAP + 'px', top: (e.y - up) * k + GAP + 'px', width: e.w * k - 2 * GAP + 'px', height: e.h * k - 2 * GAP + 'px' });
        const s = e.scale || 1;
        screen.style.setProperty('--vw', (e.w / s).toFixed(1));
        screen.style.setProperty('--vh', (e.h / s).toFixed(1));
        screen.style.setProperty('--k', (k * s).toFixed(5));
        screen.classList.toggle('fit', !!Bramble.state && Bramble.state.fit === 'fit');

        const name = document.createElement('span');
        name.className = 'screen-label' + (e.primary ? ' primary' : '');
        name.textContent = e.n + (e.primary ? tr(' · main') : '');
        if (!e.primary && map.screens.length > 1) {
          screen.classList.add('can-main');
          screen.title = tr('Click to make it the main screen, the icons follow');
          screen.addEventListener('click', () => {
            // Windows moves the screens, then lampfish moves the icons: the map waits for both instead of showing each step.
            zone.classList.add('switching');
            clearTimeout(switching);
            switching = setTimeout(() => zone.classList.remove('switching'), 3200);
            send('display.primary', { key: `${e.w}x${e.h}@${e.x},${e.y}` });
          });
        }
        Object.assign(name.style, { left: (e.x - left) * k + GAP + 'px', top: (e.y - up + e.h) * k + 'px' });
        screen.append(...taskbars(e));
        wallpaperBehind(screen, e);
        scene.append(screen, name);
      }
      zone.append(scene);
      requestAnimationFrame(() => requestAnimationFrame(() => scene.classList.add('settled')));
    }
    const scene = zone.querySelector('.scene');
    scene.classList.toggle('unnamed', map.caseW * k < 44);
    const seen = new Set();
    for (const el of map.elements) {
      if (el.icon) images.set(el.id, el.icon);
      seen.add(el.id);
      let p = points.get(el.id);
      if (!p) {
        p = document.createElement('img');
        p.className = 'point';
        p.alt = el.name;
        p.draggable = false;
        p.addEventListener('pointerdown', grab);
        p.addEventListener('pointerenter', () => showLabel(p));
        p.addEventListener('pointerleave', () => { if (!drag) label.classList.remove('visible'); });
        points.set(el.id, p);
        const name = document.createElement('span');
        name.className = 'point-name';
        names.set(el.id, name);
        scene.append(name, p);
      }
      const screen = map.screens.find(e => el.x >= e.x && el.x < e.x + e.w && el.y >= e.y && el.y < e.y + e.h) || map.screens[0];
      const dpi = screen.scale || 1, lead = 5;
      p.dataset.id = el.id;
      p.dataset.name = el.name;
      p.dataset.lead = lead;
      if (images.has(el.id) && p.src !== images.get(el.id)) p.src = images.get(el.id);
      p.style.width = p.style.height = Math.max(8, Math.round(map.iconSize * dpi * k)) + 'px';
      const name = names.get(el.id);
      name.textContent = el.name;
      name.style.width = (screen.frame || map.caseW) * k + 'px';
      name.style.fontSize = Math.max(7, 12 * dpi * k).toFixed(1) + 'px';
      p.dataset.gap = (3 * dpi * k).toFixed(1);
      if (drag && drag.point === p) continue;
      p.style.left = (el.x - left) * k + 'px';
      p.style.top = (el.y + lead - up) * k + 'px';
      placeName(p);
    }
    for (const [id, p] of points) if (!seen.has(id)) { p.remove(); names.get(id).remove(); points.delete(id); names.delete(id); }
    zone.classList.toggle('hidden', map.hidden);

    if (!sizing) showSize(map.iconSize);
    for (const b of $('r-size').children) b.disabled = false;
    for (const [id, key] of [['r-auto', 'auto'], ['r-hide', 'hidden']]) {
      $(id).checked = map[key];
      $(id).disabled = false;
    }
  }

  function placeName(p) {
    const name = names.get(p.dataset.id);
    if (!name) return;
    const size = parseFloat(p.style.width);
    name.style.left = parseFloat(p.style.left) + size / 2 + 'px';
    name.style.top = parseFloat(p.style.top) + size + Number(p.dataset.gap || 0) + 'px';
  }

  function showLabel(p) {
    label.textContent = p.dataset.name;
    const z = zone.getBoundingClientRect(), b = p.getBoundingClientRect();
    label.style.left = (b.left - z.left + b.width / 2) + 'px';
    label.style.top = (b.bottom - z.top + 6) + 'px';
    label.classList.add('visible');
  }

  function grab(e) {
    const p = e.currentTarget;
    e.preventDefault();
    p.setPointerCapture(e.pointerId);
    drag = { point: p, dx: e.clientX - p.offsetLeft, dy: e.clientY - p.offsetTop, moves: false };
    p.classList.add('grabbed');
    p.addEventListener('pointermove', move);
    p.addEventListener('pointerup', release, { once: true });
  }

  function move(e) {
    const p = drag.point, scene = p.parentElement;
    const x = Math.max(0, Math.min(scene.clientWidth - p.offsetWidth, e.clientX - drag.dx));
    const y = Math.max(0, Math.min(scene.clientHeight - p.offsetHeight, e.clientY - drag.dy));
    p.style.left = x + 'px';
    p.style.top = y + 'px';
    placeName(p);
    drag.moves = true;
    showLabel(p);
  }

  function release() {
    const p = drag.point;
    p.removeEventListener('pointermove', move);
    p.classList.remove('grabbed');
    if (drag.moves)
      send('arrange.move', {
        id: p.dataset.id,
        x: Math.round(p.offsetLeft / scale + origin.x),
        y: Math.round(p.offsetTop / scale + origin.y - Number(p.dataset.lead || 0)),
      });
    drag = null;
    label.classList.remove('visible');
  }

  new ResizeObserver(() => renderMap()).observe(zone);

  function renderPanel() {
    $('choice-screen').hidden = r.nbScreens < 2;
    const values = ['all', ...Array.from({ length: r.nbScreens }, (_, i) => String(i + 1))];
    $('screen-target').replaceChildren(...values.map(v => {
      const b = document.createElement('button');
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(v === r.screen));
      b.textContent = v === 'all' ? 'All' : v;
      b.addEventListener('click', () => send('arrange.screen', { value: v }));
      return b;
    }));

    glideRebuilt($('categories'), 'cat', () => $('categories').replaceChildren(...r.categories.map((c, i) => {
      const l = document.createElement('div');
      l.className = 'row category';
      l.dataset.cat = c;
      l.innerHTML = `<span class="handle-cat" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="9" cy="6" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="18" r="1.4"/></svg></span><span class="name-cat"></span><span class="arrows">
        <button aria-label="Move up"><svg viewBox="0 0 24 24"><path d="m6 15 6-6 6 6"/></svg></button>
        <button aria-label="Move down"><svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg></button></span>`;
      l.querySelector('.name-cat').textContent = CATEGORIES[c] || c;
      dragOrder(l, { peers: () => [...$('categories').children], active: () => true, done: saveCategories, skip: 'button' });
      const [up, down] = l.querySelectorAll('button');
      up.disabled = i === 0;
      down.disabled = i === r.categories.length - 1;
      up.addEventListener('click', () => send('arrange.category', { cat: c, direction: -1 }));
      down.addEventListener('click', () => send('arrange.category', { cat: c, direction: 1 }));
      return l;
    })));
    $('r-restore').checked = r.restoreAuto;
    for (const b of document.querySelectorAll('[data-sort]')) b.setAttribute('aria-pressed', String(b.dataset.sort === r.lastSort));
    $('arrange-undo').disabled = !r.canUndo;
    $('arrange-original').disabled = !r.hasOriginal;
  }

  function saveCategories() {
    const order = [...$('categories').children].map(x => x.dataset.cat);
    if (order.join() !== r.categories.join()) send('arrange.order', { categories: order });
  }

  function state(s) {
    r = s;
    renderArrangements();
    renderMap();
    renderPanel();
    renderMine();
    renderDock();
  }

  function event(m) {
    if (m.type !== 'arrange.map') return;
    map = m;
    renderMap();
  }

  function visible(yes) {
    shown = yes;
    clearInterval(timer);
    if (!yes) return;
    send('arrange.map', { full: images.size === 0 });
    timer = setInterval(() => {
      if (shown && !drag && document.visibilityState === 'visible') send('arrange.map');
    }, 2500);
  }

  for (const b of document.querySelectorAll('[data-sort]'))
    b.addEventListener('click', () => send('arrange.sort', { mode: b.dataset.sort }));
  $('r-align').addEventListener('click', () => send('arrange.align'));
  for (const [id, action] of [['r-auto', 'auto'], ['r-hide', 'hide']]) {
    $(id).disabled = true;
    $(id).addEventListener('change', e => send('arrange.' + action, { value: e.target.checked }));
  }
  $('r-grid').addEventListener('change', e => send('grid.set', { on: e.target.checked }));
  let sizing = false;
  function showSize(value) {
    const exact = [...$('r-size').children].find(b => Number(b.dataset.value) === Number(value));
    for (const b of $('r-size').children) b.setAttribute('aria-checked', String(b === exact));
    $('r-size-value').textContent = exact ? exact.title : value + ' px';
    $('r-size-value').title = value + ' px';
  }
  for (const b of $('r-size').children) b.addEventListener('click', () => {
    if (b.getAttribute('aria-checked') === 'true') return;
    sizing = true;
    showSize(Number(b.dataset.value));
    send('arrange.iconSize', { value: Number(b.dataset.value) });
    for (const delay of [500, 1200]) setTimeout(() => { sizing = false; if (shown) send('arrange.map'); }, delay);
  });
  $('arrange-undo').addEventListener('click', () => send('arrange.undo'));
  $('arrange-original').addEventListener('click', () => send('arrange.original'));
  $('r-restore').addEventListener('change', e => send('arrange.restoreAuto', { value: e.target.checked }));
  $('arrange-save').addEventListener('click', () => {
    const tile = $('mine').querySelector('.arrangement--add');
    if (!tile) return;
    tile.scrollIntoView({ block: 'center', behavior: 'smooth' });
    tile.click();
  });

  const grid = g => { $('r-grid').checked = !!g.on; };
  Bramble.arrange = { state, event, visible, thumbnail, renderDock, grid };
})();
