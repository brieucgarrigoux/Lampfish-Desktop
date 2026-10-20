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
  function renderArrangements() {
    $('arrangements').replaceChildren(...ARRANGEMENTS.map(([key, name]) => {
      const b = document.createElement('button');
      b.className = 'arrangement';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(r.arrangement === key));
      b.innerHTML = thumbnail(key) + '<span class="name-ag"></span>';
      b.querySelector('.name-ag').textContent = name;
      b.addEventListener('click', () => send('arrange.arrangement', { value: key }));
      return b;
    }));
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
  let shown = false, timer = 0, drag = null, keyScreens = '';
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
      name.style.width = map.caseW * k + 'px';
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
    for (const [id, key] of [['r-auto', 'auto'], ['r-grid', 'grid'], ['r-hide', 'hidden']]) {
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

    $('categories').replaceChildren(...r.categories.map((c, i) => {
      const l = document.createElement('div');
      l.className = 'row category';
      l.dataset.cat = c;
      l.innerHTML = `<span class="handle-cat" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="9" cy="6" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="18" r="1.4"/></svg></span><span class="name-cat"></span><span class="arrows">
        <button aria-label="Move up"><svg viewBox="0 0 24 24"><path d="m6 15 6-6 6 6"/></svg></button>
        <button aria-label="Move down"><svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg></button></span>`;
      l.querySelector('.name-cat').textContent = CATEGORIES[c] || c;
      l.addEventListener('pointerdown', e => { if (!e.target.closest('button')) grabCategory(e, l); });
      const [up, down] = l.querySelectorAll('button');
      up.disabled = i === 0;
      down.disabled = i === r.categories.length - 1;
      up.addEventListener('click', () => send('arrange.category', { cat: c, direction: -1 }));
      down.addEventListener('click', () => send('arrange.category', { cat: c, direction: 1 }));
      return l;
    }));
    $('r-restore').checked = r.restoreAuto;
    for (const b of document.querySelectorAll('[data-sort]')) b.setAttribute('aria-pressed', String(b.dataset.sort === r.lastSort));
    $('arrange-undo').disabled = !r.canUndo;
    $('arrange-original').disabled = !r.hasOriginal;
  }

  let dragCat = null;
  function grabCategory(e, row) {
    if (e.button !== 0) return;
    e.preventDefault();
    row.setPointerCapture(e.pointerId);
    dragCat = row;
    row.classList.add('grabbed');
    row.addEventListener('pointermove', moveCategory);
    row.addEventListener('pointerup', releaseCategory, { once: true });
  }
  function moveCategory(e) {
    const zone = $('categories');
    let before = null;
    for (const x of zone.children) {
      if (x === dragCat) continue;
      const r = x.getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) { before = x; break; }
    }
    if (before !== dragCat.nextSibling && before !== dragCat) zone.insertBefore(dragCat, before);
  }
  function releaseCategory() {
    dragCat.removeEventListener('pointermove', moveCategory);
    dragCat.classList.remove('grabbed');
    dragCat = null;
    const order = [...$('categories').children].map(x => x.dataset.cat);
    if (order.join() !== r.categories.join()) send('arrange.order', { categories: order });
  }

  const formatDate = iso => new Date(iso).toLocaleString(LOCALE, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  function renderLayouts() {
    $('layout-count').textContent = r.layouts.length || '';
    $('config').textContent = r.configuration;
    const list = $('layouts');
    list.hidden = r.layouts.length === 0;
    list.replaceChildren(...r.layouts.map((d, i) => {
      const l = document.createElement('div');
      l.className = 'row layout' + (d.current ? '' : ' other');
      l.innerHTML = `<div class="what"><span class="name-layout"></span><span class="details"></span></div>
        <button class="remove">Remove</button><button class="button">Restore</button>`;
      l.querySelector('.name-layout').textContent = d.name;
      l.querySelector('.name-layout').translate = false;
      l.querySelector('.details').textContent = d.screens + ' · ' + formatDate(d.date);
      const restore = l.querySelector('.button');
      restore.disabled = !d.current;
      restore.addEventListener('click', () => send('arrange.restore', { index: i }));
      l.querySelector('.remove').addEventListener('click', () => send('arrange.erase', { index: i }));
      return l;
    }));
  }

  function state(s) {
    r = s;
    renderArrangements();
    renderMap();
    renderPanel();
    renderLayouts();
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
  for (const [id, action] of [['r-auto', 'auto'], ['r-grid', 'grid'], ['r-hide', 'hide']]) {
    $(id).disabled = true;
    $(id).addEventListener('change', e => send('arrange.' + action, { value: e.target.checked }));
  }
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
  $('save').addEventListener('submit', e => {
    e.preventDefault();
    send('arrange.save', { name: $('layout-name').value });
    $('layout-name').value = '';
  });

  Bramble.arrange = { state, event, visible, thumbnail };
})();
