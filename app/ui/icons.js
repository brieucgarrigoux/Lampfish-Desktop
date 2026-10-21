'use strict';

(function () {
  const TABS = [['favorites', 'Favorites'], ['retro', 'Retro pixel'], ['modern', 'Modern'], ['custom', 'My icons']];
  let d = null;
  let icons = null;
  let byId = new Map();
  let tab = 'retro';
  let keyLibrary = '', progress = null;

  try { const o = localStorage.getItem('icons.tab'); if (TABS.some(x => x[0] === o)) tab = o; } catch (e) { }

  const urlPreview = a => `/app/icon-cache/${encodeURIComponent(a.key)}-${a.retro ? 32 : 64}.png`;
  const current = () => d && d.chosen ? d.chosen.id : null;

  function renderTarget() {
    const c = d.chosen;
    $('target').classList.toggle('no-folder', !c);
    $('target-name').textContent = c ? c.name : 'No folder chosen';
    $('target-path').textContent = c ? c.path : '';
    $('target-path').title = c ? c.path : '';
    const img = $('target-icon');
    if (c && c.preview) {
      img.src = urlPreview(c.preview);
      img.classList.toggle('retro', c.preview.retro);
      img.hidden = false;
    } else img.hidden = true;
    $('target-open').hidden = !c;
    $('target-initial').hidden = !c;
    $('target-initial').disabled = !(c && c.custom);
    $('target-original').hidden = !(c && c.original);
  }

  function folderRow(folder) {
    const b = document.createElement('button');
    b.className = 'row folder-row';
    b.classList.toggle('chosen', !!(d.chosen && d.chosen.path.toLowerCase() === folder.path.toLowerCase()));
    b.title = folder.path;
    if (folder.preview) {
      const img = document.createElement('img');
      img.src = urlPreview(folder.preview);
      img.className = folder.preview.retro ? 'retro' : '';
      img.alt = '';
      b.append(img);
    }
    const name = document.createElement('span');
    name.className = 'name-folder';
    name.textContent = folder.name;
    b.append(name);
    b.addEventListener('click', () => { send('icons.choose', { path: folder.path }); if (document.body.dataset.dock === 'icons') showView('icons'); });
    return b;
  }

  function renderLists() {
    $('list-custom').replaceChildren(...d.customized.map(folderRow));
    $('list-custom').hidden = $('title-custom').hidden = d.customized.length === 0;
    $('list-desktop').replaceChildren(...d.desktop.map(folderRow));
    $('menu-click').checked = d.menu;
    $('under-folders').checked = !!d.subfolders;
    check('size-previews', d.size || 'medium');
    document.body.dataset.iconSize = d.size || 'medium';
    const n = d.customized.length;
    $('icons-reset-all').disabled = n === 0;
    const names = d.customized.map(f => f.name);
    const listed = names.length > 2 ? tr('{0}, {1} and {2} more', names[0], names[1], names.length - 2) : names.join(' ' + tr('and') + ' ');
    $('reset-all-help').textContent = $('reset-all-help').title = n ? tr('Their own icon back for {0}', listed) : tr('No customized folder');
  }

  function renderTabs() {
    const numbers = {
      favorites: d.favorites.length,
      retro: icons ? icons.filter(i => i.retro).length : null,
      modern: icons ? icons.filter(i => !i.retro).length : null,
      custom: d.custom.length,
    };
    $('tabs').replaceChildren(...TABS.map(([key, label]) => {
      const b = document.createElement('button');
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-checked', String(key === tab));
      b.setAttribute('aria-selected', String(key === tab));
      b.innerHTML = `${label}<span class="count"></span>`;
      if (numbers[key] != null) b.querySelector('.count').textContent = numbers[key];
      b.addEventListener('click', () => {
        tab = key;
        try { localStorage.setItem('icons.tab', key); } catch (e) { }
        renderLibrary();
      });
      return b;
    }));
    $('icons-folder').hidden = tab !== 'custom';
  }

  function tile(id, preview, title, withName) {
    const t = document.createElement('div');
    t.className = 'tile' + (withName ? ' tile--name' : '');
    t.tabIndex = 0;
    t.dataset.id = id;
    t.title = title;
    t.innerHTML = `<div class="tile__case"><img alt="" loading="lazy" width="64" height="64"></div>
      <button class="star" tabindex="-1" aria-label="Favorite"><svg viewBox="0 0 24 24"><path d="m12 3.6 2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"/></svg></button>`;
    const img = t.querySelector('img');
    img.src = urlPreview(preview);
    if (preview.retro) img.classList.add('retro');
    t.classList.toggle('favorite', d.favorites.includes(id));
    t.classList.toggle('current', id === current());
    if (withName) {
      const footer = document.createElement('div');
      footer.className = 'tile__footer';
      footer.innerHTML = '<span class="name"></span><button class="remove" tabindex="-1">Remove</button>';
      footer.querySelector('.name').textContent = title;
      footer.querySelector('.remove').addEventListener('click', e => { e.stopPropagation(); send('icons.remove', { id }); });
      t.append(footer);
    }
    const apply = () => send('icons.apply', { id });
    t.addEventListener('click', apply);
    t.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); apply(); }
      if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey) { e.preventDefault(); send('icons.favorite', { id }); }
    });
    t.querySelector('.star').addEventListener('click', e => { e.stopPropagation(); send('icons.favorite', { id }); });
    return t;
  }

  const systemTitle = i => `${i.source} · ${i.id.slice(i.id.lastIndexOf(',') + 1)}`;

  function grid(elements) {
    const g = document.createElement('div');
    g.className = 'tiles';
    g.append(...elements);
    return g;
  }

  function renderLibrary() {
    renderTabs();
    const key = [tab, icons ? icons.length : -1, d.favorites.join('|'), d.custom.map(p => p.id + p.preview.key).join('|'),
      progress ? progress.done : ''].join('#');
    if (key === keyLibrary) { markCurrent(); return; }
    keyLibrary = key;
    const zone = $('library');
    zone.replaceChildren();

    if (tab === 'custom') {
      const g = grid(d.custom.map(p => tile(p.id, p.preview, p.name, true)));
      const add = document.createElement('button');
      add.className = 'tile-add';
      add.innerHTML = '<strong>+</strong>Add';
      add.addEventListener('click', () => send('icons.add'));
      g.append(add);
      zone.append(g);
      return;
    }
    if (!icons) {
      const p = progress;
      zone.innerHTML = `<div class="waiting loading">Preparing the library<span class="count"></span></div>`;
      if (p && p.total) zone.querySelector('.count').textContent = `${p.done} / ${p.total}`;
      return;
    }
    if (tab === 'favorites') {
      const tiles = d.favorites.map(id => {
        if (id.startsWith('custom/')) {
          const p = d.custom.find(x => x.id === id);
          return p ? tile(id, p.preview, p.name, false) : null;
        }
        const i = byId.get(id);
        return i ? tile(id, i, systemTitle(i), false) : null;
      }).filter(Boolean);
      if (!tiles.length) { zone.innerHTML = '<div class="waiting">No favorites</div>'; return; }
      zone.append(grid(tiles));
      return;
    }

    const retro = tab === 'retro';
    const bySource = new Map();
    for (const i of icons) {
      if (i.retro !== retro) continue;
      if (!bySource.has(i.source)) bySource.set(i.source, []);
      bySource.get(i.source).push(i);
    }
    for (const [source, list] of bySource) {
      const h = document.createElement('h3');
      h.className = 'source';
      h.innerHTML = '<span></span><span class="count"></span>';
      h.firstChild.textContent = source;
      h.lastChild.textContent = list.length;
      zone.append(h, grid(list.map(i => tile(i.id, i, systemTitle(i), false))));
    }
  }

  function markCurrent() {
    const id = current();
    for (const t of $('library').querySelectorAll('.tile')) {
      t.classList.toggle('current', t.dataset.id === id);
      t.classList.toggle('favorite', d.favorites.includes(t.dataset.id));
    }
  }

  $('library').addEventListener('keydown', e => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: 'up', ArrowDown: 'down' }[e.key];
    const t = document.activeElement;
    if (!step || !t.classList.contains('tile')) return;
    const cases = [...t.parentElement.children];
    const i = cases.indexOf(t);
    const columns = getComputedStyle(t.parentElement).gridTemplateColumns.split(' ').length;
    const j = step === 'up' ? i - columns : step === 'down' ? i + columns : i + step;
    if (cases[j] && cases[j].classList.contains('tile')) { e.preventDefault(); cases[j].focus(); }
  });

  function state(s) {
    d = s;
    renderTarget();
    renderLists();
    renderLibrary();
    renderDock();
  }

  function event(m) {
    if (m.type === 'icons.library') {
      icons = m.icons;
      byId = new Map(icons.map(i => [i.id, i]));
      progress = null;
      if (d) renderLibrary();
    } else if (m.type === 'icons.progress') {
      progress = m;
      if (d && !icons) renderLibrary();
    }
  }

  function visible(yes) {
    if (yes && !icons) send('icons.library');
  }

  $('target-browse').addEventListener('click', () => send('icons.browse'));
  $('target-open').addEventListener('click', () => send('icons.open'));
  $('target-initial').addEventListener('click', () => send('icons.initial'));
  $('target-original').addEventListener('click', () => send('icons.original'));
  $('icons-folder').addEventListener('click', () => send('icons.folderIcons'));
  $('menu-click').addEventListener('change', e => send('icons.menu', { value: e.target.checked }));
  $('under-folders').addEventListener('change', e => send('icons.subfolders', { value: e.target.checked }));
  for (const b of $('size-previews').children) b.addEventListener('click', () => {
    check('size-previews', b.dataset.value);
    document.body.dataset.iconSize = b.dataset.value;
    send('icons.size', { value: b.dataset.value });
  });
  $('icons-refresh').addEventListener('click', () => send('icons.refresh'));

  confirmReset($('icons-reset-all'), 'Every customized folder gets its own icon back.', () => send('icons.resetAll'));

  function renderDock() {
    const zone = $('dock-pick');
    if (document.body.dataset.dock !== 'icons' || zone.firstChild) return;
    const hint = document.createElement('p');
    hint.className = 'help-section';
    hint.textContent = tr('Pick a folder below to change its icon');
    zone.replaceChildren(hint);
  }

  Bramble.icons = { state, event, visible, renderDock };
})();
