'use strict';

(function () {
  const TABS = [['themes', 'Themes'], ['windows', 'Windows'], ['custom', 'My cursors']];
  let s = null, library = null;
  let role = 'Arrow', tab = 'themes', keyLibrary = '';
  try { const o = localStorage.getItem('mouse.tab'); if (TABS.some(x => x[0] === o)) tab = o; } catch (e) { }

  const url = (a, size) => `/app/cursor-cache/${encodeURIComponent(a.key)}-${size}.png`;

  function image(a, large) {
    const img = document.createElement('img');
    img.alt = '';
    img.loading = 'lazy';
    if (!a) return img;
    if (large) { img.src = url(a, a.retro ? 32 : 64); img.classList.toggle('retro', a.retro); }
    else img.src = url(a, a.retro ? 32 : 64);
    return img;
  }
  const chosenRole = () => s && s.roles.find(r => r.id === role);
  const samePath = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

  function renderRoles() {
    $('s-theme').textContent = s.themeTitle;
    $('s-roles').replaceChildren(...s.roles.map(r => {
      const b = document.createElement('button');
      b.className = 'role' + (r.id === role ? ' chosen' : '');
      b.dataset.path = r.path || '';
      b.title = tr(r.name) + ' · ' + (r.path ? r.path.split('\\').pop() : tr('Windows cursor'));
      const frame = document.createElement('span');
      frame.className = 'role__case';
      frame.innerHTML = '';
      frame.append(image(r.preview, true));
      const name = document.createElement('span');
      name.className = 'role__name';
      name.textContent = r.name;
      b.append(frame, name);
      b.addEventListener('click', () => { role = r.id; renderRoles(); mark(); play(r); });
      b.addEventListener('pointerenter', () => play(r));
      return b;
    }));
  }

  const motion = new Map();
  let timer = 0;
  function play(r) {
    clearTimeout(timer);
    if (!r.path || !/\.ani$/i.test(r.path)) return;
    const info = motion.get(r.path);
    if (!info) { send('mouse.frames', { path: r.path }); return; }
    const img = [...$('s-roles').children].find(b => b.dataset.path === r.path)?.querySelector('img');
    if (!img) return;
    const home = img.src;
    let i = 0, spent = 0;
    const next = () => {
      const delay = Math.max(40, info.delays[i % info.delays.length]);
      img.src = `/app/cursor-cache/${info.key}-s${i % info.delays.length}.png`;
      img.classList.remove('retro');
      spent += delay; i++;
      if (spent < 3000 || i % info.delays.length) timer = setTimeout(next, delay);
      else img.src = home;
    };
    next();
  }

  function renderTabs() {
    const n = { themes: library ? library.themes.length : null, windows: library ? library.windows.length : null, custom: library ? library.custom.length : null };
    $('s-tabs').replaceChildren(...TABS.map(([key, label]) => {
      const b = document.createElement('button');
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-checked', String(key === tab));
      b.innerHTML = `${label}<span class="count"></span>`;
      if (n[key] != null) b.querySelector('.count').textContent = n[key];
      b.addEventListener('click', () => {
        tab = key;
        try { localStorage.setItem('mouse.tab', key); } catch (e) { }
        renderLibrary();
      });
      return b;
    }));
    $('s-folder').hidden = tab !== 'custom';
  }

  function cursorTile(c) {
    const t = document.createElement('div');
    t.className = 'tile tile--name tile-cursor';
    t.tabIndex = 0;
    t.dataset.path = c.path;
    t.title = c.name + (c.animated ? tr(' (animated)') : '');
    const frame = document.createElement('div');
    frame.className = 'tile__case';
    frame.innerHTML = '';
    frame.append(image(c.preview, true));
    const footer = document.createElement('div');
    footer.className = 'tile__footer';
    footer.innerHTML = '<span class="name"></span>';
    footer.firstChild.textContent = c.name;
    if (c.custom) {
      const remove = document.createElement('button');
      remove.className = 'remove';
      remove.tabIndex = -1;
      remove.textContent = 'Remove';
      remove.addEventListener('click', e => { e.stopPropagation(); send('mouse.remove', { path: c.path }); });
      footer.append(remove);
    }
    t.append(frame, footer);
    const assign = () => send('mouse.assign', { role, path: c.path });
    t.addEventListener('click', assign);
    t.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); assign(); } });
    return t;
  }

  function themeCard(th) {
    const c = document.createElement('button');
    c.className = 'theme' + (th.name === s.theme ? ' current' : '') + (th.bramble ? ' theme--bramble' : '');
    c.dataset.name = th.name;
    c.innerHTML = '<span class="theme__showcase"></span><span class="theme__name"></span>';
    for (const a of th.showcase) c.querySelector('.theme__showcase').append(image(a, false));
    c.querySelector('.theme__name').textContent = th.title;
    c.addEventListener('click', () => send('mouse.theme', { name: th.name }));
    return c;
  }

  function renderLibrary() {
    if (!s) return;
    renderTabs();
    const zone = $('s-library');
    if (!library) return;
    const key = tab + '#' + library.themes.length + '#' + library.custom.map(p => p.path).join('|') + '#' + s.theme;
    if (key === keyLibrary) { mark(); return; }
    keyLibrary = key;
    zone.replaceChildren();
    if (tab === 'themes') {
      const g = document.createElement('div');
      g.className = 'themes';
      g.append(...library.themes.map(themeCard));
      zone.append(g);
    } else {
      const g = document.createElement('div');
      g.className = 'tiles tiles--cursors';
      g.append(...(tab === 'windows' ? library.windows : library.custom).map(cursorTile));
      if (tab === 'custom') {
        const add = document.createElement('button');
        add.className = 'tile-add';
        add.innerHTML = '<strong>+</strong>Add';
        add.addEventListener('click', () => send('mouse.add'));
        g.append(add);
      }
      zone.append(g);
    }
    mark();
  }

  function mark() {
    const r = chosenRole();
    for (const t of document.querySelectorAll('.tile-cursor')) t.classList.toggle('current', !!r && samePath(t.dataset.path, r.path));
    for (const t of document.querySelectorAll('.theme')) t.classList.toggle('current', t.dataset.name === s.theme);
  }

  const TEXTS = {
    size: v => PX(Number(v)) + ' px',
    speed: v => String(v),
    doubleClick: v => v + ' ms',
    knob: v => v == 1 ? tr('1 line') : tr('{0} lines', v),
  };

  const PX = n => n === 0 ? 16 : 32 + (n - 1) * 16;
  function renderSize() {
    const n = s.settings.size;
    $('s-size-label').textContent = PX(n) + ' px';
    $('s-minus').disabled = n <= 0;
    $('s-plus').disabled = n >= 15;
  }
  for (const [id, step] of [['s-minus', -1], ['s-plus', 1]])
    $(id).addEventListener('click', () => {
      const n = Math.max(0, Math.min(15, s.settings.size + step));
      s.settings.size = n;
      renderSize();
      renderSettings();
      send('mouse.adjust', { what: 'size', value: n });
    });

  function renderSettings() {
    const r = s.settings;
    renderSize();
    for (const field of document.querySelectorAll('.only-mouse [data-setting]')) {
      const q = field.dataset.setting;
      if (field.type === 'checkbox') { field.checked = !!r[q]; continue; }
      if (field.matches(':active')) continue;
      field.value = q === 'knob' && !r[q] ? 20 : r[q];
      updateCursor(field);
    }
  }
  function updateCursor(field) {
    const q = field.dataset.setting;
    $(field.id + '-value').textContent = TEXTS[q](field.value);
    field.style.setProperty('--pct', (field.value - field.min) / (field.max - field.min) * 100 + '%');
  }
  for (const field of document.querySelectorAll('.only-mouse [data-setting]')) {
    const q = field.dataset.setting;
    if (field.type === 'checkbox') {
      field.addEventListener('change', () => send('mouse.adjust', { what: q, value: field.checked }));
      continue;
    }

    const live = throttle(v => send('mouse.adjust', { what: q, value: v, live: true }), 120);
    field.addEventListener('input', () => { updateCursor(field); if (q !== 'size') live(Number(field.value)); });
    field.addEventListener('change', () => send('mouse.adjust', { what: q, value: Number(field.value) }));
  }

  function state(n) {
    s = n;
    $('s-initial').disabled = !!s.standard;
    $('s-original').hidden = !s.original;
    if (!chosenRole()) role = s.roles[0].id;
    renderRoles();
    renderSettings();
    renderLibrary();
  }

  function event(m) {
    if (m.type === 'mouse.frames') {
      motion.set(m.path, m);
      const r = chosenRole();
      if (r && r.path === m.path) play(r);
      return;
    }
    if (m.type !== 'mouse.library') return;
    library = m;
    keyLibrary = '';
    renderLibrary();
  }

  function visible(yes) {
    if (yes && !library) send('mouse.library');
  }

  $('s-initial').addEventListener('click', () => send('mouse.initial'));
  $('s-original').addEventListener('click', () => send('mouse.original'));
  $('s-folder').addEventListener('click', () => send('mouse.folder'));

  Bramble.mouse = { state, event, visible };
})();
