'use strict';

(function () {
  const TABS = [['all', 'All'], ['lampfish', 'lampfish'], ['windows', 'Windows'], ['mine', 'My cursors']];
  const OLD_TABS = { themes: 'all', custom: 'mine' };
  let s = null, library = null;
  let role = 'Arrow', tab = 'all', keyLibrary = '';
  try { const o = localStorage.getItem('mouse.tab'); const t = OLD_TABS[o] || o; if (TABS.some(x => x[0] === t)) tab = t; } catch (e) { }

  const url = (a, size) => `/app/cursor-cache/${encodeURIComponent(a.key)}-${size}.png`;

  function image(a) {
    const img = document.createElement('img');
    img.alt = '';
    img.loading = 'lazy';
    if (!a) return img;
    img.src = url(a, a.retro ? 32 : 64);
    img.classList.toggle('retro', a.retro);
    return img;
  }
  const chosenRole = () => s && s.roles.find(r => r.id === role);
  const samePath = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

  function renderDraft() {
    const title = $('s-theme');
    title.textContent = s.themeTitle;
    if (s.unsaved && s.based) title.append(Object.assign(document.createElement('span'), { className: 'badge-modified state state--warn', textContent: tr('Modified') }));
    reveal($('s-draft'), s.unsaved);
    $('s-draft-text').textContent = s.based ? tr('Changes not saved in a theme') : tr('These cursors are not saved in a theme');
    $('s-update').hidden = !s.editable;
    $('s-update').innerHTML = icon('arrows-clockwise');
    $('s-update').append(tr('Update “{0}”', s.themeTitle));
    $('s-discard').hidden = !s.based;
  }

  function renderRoles() {
    $('s-roles').replaceChildren(...s.roles.map(r => {
      const b = document.createElement('button');
      b.className = 'role' + (r.id === role ? ' chosen' : '');
      b.dataset.path = r.path || '';
      b.title = tr(r.name) + '\n' +(r.path ? r.path.split('\\').pop() : tr('Windows cursor'));
      const frame = document.createElement('span');
      frame.className = 'role__case';
      frame.innerHTML = '';
      frame.append(image(r.preview));
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
    $('s-tabs').replaceChildren(...TABS.map(([key, label]) => {
      const b = document.createElement('button');
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-checked', String(key === tab));
      b.textContent = tr(label);
      b.addEventListener('click', () => {
        tab = key;
        try { localStorage.setItem('mouse.tab', key); } catch (e) { }
        renderLibrary();
      });
      return b;
    }));
    $('s-folder').hidden = tab !== 'mine';
  }

  function cursorTile(c) {
    const t = document.createElement('div');
    t.className = 'tile tile--name tile-cursor';
    t.tabIndex = 0;
    t.dataset.path = c.path;
    if (c.role) c = { ...c, name: tr(c.role) };
    t.title = c.name + (c.animated ? tr(' (animated)') : '');
    const frame = document.createElement('div');
    frame.className = 'tile__case';
    frame.innerHTML = '';
    frame.append(image(c.preview));
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

  const SECTIONS = [['lampfish', 'lampfish'], ['system', 'Windows'], ['mine', 'My themes']];
  const ACTIONS = {
    rename: ['Rename', 'pencil-simple'],
    duplicate: ['Duplicate', 'copy'],
    remove: ['Remove', 'trash-simple'],
  };

  function rename(card, th) {
    const name = card.querySelector('.theme__name');
    const input = Object.assign(document.createElement('input'), { className: 'theme__rename', maxLength: 40, value: th.title });
    input.setAttribute('aria-label', tr('Theme name'));
    name.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const finish = save => {
      if (done) return;
      done = true;
      const v = input.value.trim();
      if (save && v && v !== th.title) send('mouse.rename', { name: th.name, to: v });
      else input.replaceWith(name);
    };
    input.addEventListener('click', e => e.stopPropagation());
    input.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') finish(true); else if (e.key === 'Escape') finish(false); });
    input.addEventListener('blur', () => finish(true));
  }

  function themeCard(th) {
    const c = document.createElement('div');
    c.className = 'theme' + (th.name === s.theme ? ' current' : '');
    c.tabIndex = 0;
    c.setAttribute('role', 'button');
    c.dataset.name = th.name;
    c.innerHTML = '<span class="theme__showcase"></span><span class="theme__name"></span><span class="theme__actions"></span>';
    for (const a of th.showcase) c.querySelector('.theme__showcase').append(image(a));
    c.querySelector('.theme__name').textContent = th.title;
    c.querySelector('.theme__name').translate = th.kind !== 'mine';
    const apply = () => send('mouse.theme', { name: th.name });
    c.addEventListener('click', apply);
    c.addEventListener('keydown', e => { if (e.target === c && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); apply(); } });
    for (const what of th.kind === 'mine' ? ['rename', 'duplicate', 'remove'] : ['duplicate']) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'theme__action theme__action--' + what;
      b.title = tr(ACTIONS[what][0]);
      b.setAttribute('aria-label', tr(ACTIONS[what][0]));
      b.innerHTML = icon(ACTIONS[what][1]);
      b.addEventListener('click', e => {
        e.stopPropagation();
        if (what === 'rename') rename(c, th);
        else if (what === 'duplicate') send('mouse.duplicate', { name: th.name });
        else send('mouse.removeTheme', { name: th.name });
      });
      c.querySelector('.theme__actions').append(b);
    }
    if (th.kind === 'mine') c.querySelector('.theme__name').addEventListener('dblclick', e => { e.stopPropagation(); rename(c, th); });
    return c;
  }

  // Families of lampfish: one tile per look, its colours as swatches. Engine themes are drawn here and written by
  // Mouse.cs the first time they are applied; Pixel comes as files, like the Bramble themes.
  const PIXEL = 'lampfish Pixel ', PIXEL_SWATCH = { Abyss: '#0b1d20', Foam: '#f6fbfa', Lagoon: '#13a898' };
  const chosen = {}, making = new Set();
  const isBramble = t => t.kind === 'lampfish' && /^Bramble /.test(t.name);
  const libraryTheme = name => library && library.themes.find(t => t.name === name);

  function families() {
    const list = CursorEngine.FAMILIES.map(f => ({ key: f.key, name: f.name, engine: true, variants: f.variants.map(v => ({ name: v.name, variant: v.variant, swatch: v.swatch })) }));
    const ORDER = ['Foam', 'Lagoon', 'Abyss'], rank = t => ORDER.indexOf(t.name.slice(PIXEL.length));
    const pixel = library.themes.filter(t => t.name.startsWith(PIXEL)).sort((a, b) => rank(a) - rank(b)).map(t => ({ name: t.name, variant: t.name.slice(PIXEL.length), swatch: PIXEL_SWATCH[t.name.slice(PIXEL.length)] || '#1EBBAA', theme: t }));
    if (pixel.length) list.push({ key: 'pixel', name: 'Pixel', engine: false, variants: pixel });
    return list;
  }

  // A theme already on disk is applied at once, whatever engine made it; a newer drawing follows in the background and
  // Mouse.cs puts it in place by itself if the theme is still in use. A theme never made gets a still version first.
  async function applyVariant(fam, v, tile, refresh = false) {
    if (!fam.engine) { send('mouse.theme', { name: v.name }); return; }
    const made = libraryTheme(v.name);
    if (made && !refresh) send('mouse.theme', { name: v.name });
    if ((made && made.version === CursorEngine.VERSION) || making.has(v.name)) return;
    making.add(v.name);
    if (tile) { tile.classList.add('loading'); tile.setAttribute('aria-busy', 'true'); tile.style.setProperty('--progress', 0); }
    try {
      if (!made) send('mouse.make', { ...await CursorEngine.build(v.name, null, true), apply: true });
      const built = await CursorEngine.build(v.name, p => { if (tile) tile.style.setProperty('--progress', p); });
      send('mouse.make', { ...built, apply: false });
    } catch (e) {
      console.error(e);
    } finally {
      making.delete(v.name);
      if (tile) { tile.classList.remove('loading'); tile.removeAttribute('aria-busy'); }
    }
  }

  // A theme made by an older engine is drawn again, so an update reaches the cursors in use without a click.
  function refreshCurrent() {
    const t = s && libraryTheme(s.theme);
    if (!t || !t.made || t.version === CursorEngine.VERSION || !CursorEngine.has(t.name) || making.has(t.name)) return;
    const fam = [...families(), ...CursorEngine.packFamilies.map(asFamily)].find(f => f.variants.some(v => v.name === t.name));
    if (fam) applyVariant(fam, fam.variants.find(v => v.name === t.name), null, true);
  }

  // A display case per family: Normal large, Link and Busy beside it, on a ground tinted by the colour shown (C62).
  const tintOf = sw => /^#f[0-9a-f]f[0-9a-f]f[0-9a-f]$|^#ffffff$/i.test(sw) ? '#9ff5ea' : sw;
  function familyTile(fam) {
    const current = fam.variants.find(v => v.name === s.theme);
    let v = current || fam.variants.find(x => x.name === chosen[fam.key]) || fam.variants[0];
    const c = document.createElement('div');
    c.className = 'theme theme--family' + (current ? ' current' : '') + (making.has(v.name) ? ' loading' : '');
    c.tabIndex = 0;
    c.setAttribute('role', 'button');
    c.dataset.names = fam.variants.map(x => x.name).join('|');
    c.innerHTML = '<span class="family__stage"><span class="family__hero"></span><span class="family__side"></span></span>'
      + '<span class="family__foot"><span class="family__text"><span class="family__title"></span><span class="family__sub"><span></span></span></span><span class="theme__swatches"></span></span>';
    const hero = c.querySelector('.family__hero'), side = c.querySelector('.family__side'), roles = ['arrow', 'hand', 'wait'], canvases = [];
    const draw = (w, anim) => canvases.forEach((cv, i) => CursorEngine.draw(cv, cv.width, v.name, roles[i], w, anim || roles[i] === 'wait'));
    const canvas = css => { const cv = document.createElement('canvas'); cv.width = cv.height = Math.round(css * devicePixelRatio); cv.style.width = cv.style.height = css + 'px'; canvases.push(cv); return cv; };
    const fill = () => {
      hero.replaceChildren(); side.replaceChildren(); canvases.length = 0;
      c.style.setProperty('--tint', tintOf(v.swatch));
      if (fam.engine) { hero.append(canvas(64)); side.append(canvas(34), canvas(34)); draw(.6, false); }
      else { hero.append(image(v.theme.showcase[0])); side.append(image(v.theme.showcase[1]), image(v.theme.showcase[3])); }
      c.querySelector('.family__title').textContent = tr(fam.name);
      c.querySelector('.family__sub').firstChild.textContent = v.variant ? tr(v.variant) : '';
      const use = c.querySelector('.family__use');
      if (current && current.name === v.name) { if (!use) { const u = document.createElement('span'); u.className = 'family__use'; u.innerHTML = icon('check'); u.append(tr('In use')); c.querySelector('.family__sub').append(u); } }
      else if (use) use.remove();
      for (const b of c.querySelectorAll('.swatch')) b.setAttribute('aria-pressed', String(b.dataset.name === v.name));
    };
    for (const x of fam.variants.length > 1 ? fam.variants : []) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch';
      b.dataset.name = x.name;
      b.style.setProperty('--swatch', x.swatch);
      b.title = tr(x.variant);
      b.setAttribute('aria-label', tr(x.variant));
      b.addEventListener('click', e => { e.stopPropagation(); v = x; chosen[fam.key] = x.name; fill(); applyVariant(fam, x, c); });
      c.querySelector('.theme__swatches').append(b);
    }
    fill();
    let raf = 0, last = 0;
    const still = matchMedia('(prefers-reduced-motion: reduce)');
    const loop = now => { if (now - last > 32) { last = now; draw(CursorEngine.phase(now / 1000), true); } raf = requestAnimationFrame(loop); };
    if (fam.engine) {
      c.addEventListener('pointerenter', () => { if (!still.matches && !raf) raf = requestAnimationFrame(loop); });
      c.addEventListener('pointerleave', () => { cancelAnimationFrame(raf); raf = 0; draw(.6, false); });
    }
    const apply = () => applyVariant(fam, v, c);
    c.addEventListener('click', apply);
    c.addEventListener('keydown', e => { if (e.target === c && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); apply(); } });
    return c;
  }

  // The special edition: its pack is loaded when it is in this copy, its families open with a VIP code (Vip.cs).
  const PACK = '../vip/vip-cursors.js';
  let packReady = false, packAsked = false, vipMessage = null;
  const vipState = () => (Lampfish.state && Lampfish.state.vip) || {};
  const asFamily = f => ({ key: f.key, name: f.name, engine: true, variants: f.variants.map(v => ({ name: v.name, variant: v.variant, swatch: v.swatch })) });
  function loadPack() {
    if (packAsked || !vipState().pack) return;
    packAsked = true;
    CursorEngine.load(PACK).then(() => { packReady = true; keyLibrary = ''; renderLibrary(); renderDock(); refreshCurrent(); }).catch(e => console.error(e));
  }

  // Locked: a display case of Lure Gold, alive, with the field for the code.
  function vipTile() {
    const fam = asFamily(CursorEngine.packFamilies[0]), v = fam.variants[0];
    const c = document.createElement('div');
    c.className = 'theme theme--family theme--vip';
    c.style.setProperty('--tint', v.swatch);
    c.innerHTML = '<span class="family__stage"><span class="family__hero"></span><span class="family__side"></span></span>'
      + '<form class="vip__form"><span class="family__text"><span class="family__title"></span><span class="family__sub"></span></span>'
      + '<span class="vip__row"><input autocomplete="off" spellcheck="false" maxlength="24"><button class="button button--accent" type="submit"></button></span><span class="vip__message"></span></form>';
    const roles = ['arrow', 'hand', 'wait'], canvases = [];
    const canvas = css => { const cv = document.createElement('canvas'); cv.width = cv.height = Math.round(css * devicePixelRatio); cv.style.width = cv.style.height = css + 'px'; canvases.push(cv); return cv; };
    c.querySelector('.family__hero').append(canvas(64));
    c.querySelector('.family__side').append(canvas(34), canvas(34));
    const draw = (w, anim) => canvases.forEach((cv, i) => CursorEngine.draw(cv, cv.width, v.name, roles[i], w, anim || roles[i] === 'wait'));
    draw(.6, false);
    c.querySelector('.family__title').textContent = tr('Special edition');
    c.querySelector('.family__sub').textContent = tr('Lure, Gold and Black Gold, for VIP members');
    const input = c.querySelector('input'), message = c.querySelector('.vip__message');
    input.placeholder = 'LAMP-XXXX-XXXX-XXXX';
    input.setAttribute('aria-label', tr('VIP code'));
    c.querySelector('button').textContent = tr('Use this code');
    message.textContent = vipMessage || tr('Have a VIP code? Type it here. Nothing is sent anywhere.');
    message.classList.toggle('is-error', !!vipMessage);
    input.addEventListener('input', () => {
      const raw = input.value.toUpperCase().replace(/[^0-9A-Z]/g, ''), body = raw.startsWith('LAMP') ? raw.slice(4) : raw;
      input.value = body ? ['LAMP', ...(body.match(/.{1,4}/g) || [])].slice(0, 4).join('-') : '';
    });
    c.querySelector('form').addEventListener('submit', e => { e.preventDefault(); if (input.value.trim()) send('vip.unlock', { code: input.value }); });
    let raf = 0, last = 0;
    const still = matchMedia('(prefers-reduced-motion: reduce)');
    const loop = now => { if (now - last > 32) { last = now; draw(CursorEngine.phase(now / 1000), true); } raf = requestAnimationFrame(loop); };
    c.addEventListener('pointerenter', () => { if (!still.matches && !raf) raf = requestAnimationFrame(loop); });
    c.addEventListener('pointerleave', () => { cancelAnimationFrame(raf); raf = 0; draw(.6, false); });
    return c;
  }

  // The house sections: lampfish families, then the Bramble themes with a word on where they come from.
  function houseSections(add) {
    add(tr('lampfish'), '', families().map(familyTile));
    if (packReady && CursorEngine.packFamilies.length) {
      if (vipState().unlocked) add(tr('Special edition'), tr('For VIP members'), CursorEngine.packFamilies.map(f => familyTile(asFamily(f))));
      else add(tr('Special edition'), '', [vipTile()]);
    }
    const bramble = library.themes.filter(isBramble);
    if (bramble.length) add(tr('Bramble'), tr('The first cursors, from when the app was called Bramble'), bramble.map(themeCard));
  }

  function newTheme() {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'theme theme--add';
    tile.innerHTML = '<strong>+</strong><span></span>';
    tile.lastChild.textContent = tr('New theme');
    tile.title = tr('Saves the current cursors as a theme');
    tile.addEventListener('click', () => {
      const form = document.createElement('form');
      form.className = 'theme theme--form';
      form.innerHTML = '<input maxlength="40" autocomplete="off"><button class="button button--accent" type="submit"></button>';
      const input = form.querySelector('input');
      input.placeholder = tr('Name the new theme');
      input.setAttribute('aria-label', tr('Theme name'));
      form.querySelector('button').textContent = tr('Save');
      form.addEventListener('submit', e => { e.preventDefault(); send('mouse.save', { name: input.value }); });
      input.addEventListener('keydown', e => { if (e.key === 'Escape') { form.replaceWith(tile); tile.focus(); } });
      tile.replaceWith(form);
      input.focus();
    });
    return tile;
  }

  function renderLibrary() {
    if (!s) return;
    renderTabs();
    const zone = $('s-library');
    if (!library) return;
    const key = tab + '#' + packReady + vipState().unlocked + (vipMessage || '') + '#' + library.themes.map(t => t.name).join('|') + '#' + library.custom.map(p => p.path).join('|') + '#' + s.theme + '#' + LANGUAGE;
    if (key === keyLibrary) { mark(); return; }
    keyLibrary = key;
    zone.replaceChildren();
    const section = (label, count, kind, items, extra) => {
      const head = document.createElement('h3');
      head.className = 'themes__title';
      head.innerHTML = '<span></span><span class="count"></span>';
      head.firstChild.textContent = label;
      head.lastChild.textContent = count || '';
      const g = document.createElement('div');
      g.className = kind === 'themes' ? 'themes' : 'tiles tiles--cursors';
      g.append(...items.map(kind === 'themes' ? themeCard : cursorTile));
      if (extra) g.append(extra);
      zone.append(head, g);
    };
    const themes = kind => library.themes.filter(t => t.kind === kind);
    const house = (label, note, nodes) => {
      section(label, note ? '' : nodes.length, 'themes', []);
      if (note) zone.lastChild.previousSibling.after(Object.assign(document.createElement('p'), { className: 'themes__note', textContent: note }));
      zone.lastChild.append(...nodes);
    };
    if (tab === 'all') {
      for (const [kind, label] of SECTIONS) {
        if (kind === 'lampfish') { houseSections(house); continue; }
        const list = themes(kind);
        if (list.length || kind === 'mine') section(tr(label), list.length, 'themes', list, kind === 'mine' ? newTheme() : null);
      }
    } else if (tab === 'lampfish') {
      houseSections(house);
      for (const t of library.lampfishCursors || []) section(t.title, t.cursors.length, 'cursors', t.cursors);
    } else if (tab === 'windows') {
      section(tr('Themes'), themes('system').length, 'themes', themes('system'));
      section(tr('Cursors'), library.windows.length, 'cursors', library.windows);
    } else {
      section(tr('Themes'), themes('mine').length, 'themes', themes('mine'), newTheme());
      const add = document.createElement('button');
      add.className = 'tile-add';
      add.innerHTML = '<strong>+</strong>Add';
      add.addEventListener('click', () => send('mouse.add'));
      section(tr('Cursors'), library.custom.length, 'cursors', library.custom, add);
    }
    mark();
  }

  function mark() {
    const r = chosenRole();
    for (const t of document.querySelectorAll('.tile-cursor')) t.classList.toggle('current', !!r && samePath(t.dataset.path, r.path));
    for (const t of document.querySelectorAll('.theme')) t.classList.toggle('current', t.dataset.names ? t.dataset.names.split('|').includes(s.theme) : t.dataset.name === s.theme);
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

  // The trails of the special edition (Trail.cs). Each tile shows a still drawn by the trail's own recipe.
  const TRAILS = [
    ['Bubbles', [['bubbles-gold', 'Gold'], ['bubbles-abyss', 'Abyss'], ['bubbles-pearl', 'Pearl'], ['bubbles-prism', 'Prism'], ['bubbles-soap', 'Soap']]],
    ['Plankton', [['plankton-abyss', 'Abyss'], ['plankton-gold', 'Gold'], ['plankton-berry', 'Berry']]],
    ['Sparkles', [['sparkles-gold', 'Gold'], ['sparkles-silver', 'Silver'], ['sparkles-rose', 'Rose']]],
    ['Ribbon', [['ribbon-lagoon', 'Lagoon'], ['ribbon-sunset', 'Sunset'], ['comet', 'Comet']]],
    ['Neon', [['neon-pink', 'Pink'], ['neon-teal', 'Teal']]],
    ['Pearls', [['pearls', 'Pearl'], ['pearls-gold', 'Gold']]],
    ['Sea', [['school', 'School'], ['ripples', 'Ripples'], ['snow', 'Marine snow'], ['constellation', 'Constellation']]],
    ['Paper and ink', [['sequins', 'Sequins'], ['confetti', 'Confetti'], ['halftone', 'Halftone'], ['ink', 'Ink']]],
  ];
  let trailPreviews = null, trailAsked = false, trailKey = '';
  const trailState = () => (Lampfish.state && Lampfish.state.trail) || {};

  function renderTrail() {
    const open = !!vipState().unlocked;
    $('s-trail-title').hidden = $('s-trail').hidden = !open;
    if (!open) return;
    if (!trailPreviews && !trailAsked) { trailAsked = true; send('trail.previews'); }
    const t = trailState(), kind = t.kind || '';
    for (const b of document.querySelectorAll('[data-trail]')) b.setAttribute('aria-pressed', String(b.dataset.trail === kind));
    const grid = $('s-trail-grid'), key = !!trailPreviews + LANGUAGE;
    if (key !== trailKey) {
      trailKey = key;
      grid.replaceChildren();
      for (const [group, items] of TRAILS) {
        const head = document.createElement('p');
        head.className = 'trail__group';
        head.textContent = tr(group);
        grid.append(head);
        for (const [id, name] of items) {
          const tile = document.createElement('button');
          tile.type = 'button';
          tile.className = 'trail';
          tile.dataset.kind = id;
          tile.innerHTML = '<span class="trail__stage"></span><span class="trail__name"></span>';
          if (trailPreviews && trailPreviews[id]) tile.firstChild.append(Object.assign(document.createElement('img'), { src: trailPreviews[id], alt: '' }));
          tile.lastChild.textContent = tr(name);
          tile.addEventListener('click', () => send('trail.set', { kind: id }));
          grid.append(tile);
        }
      }
    }
    // With Match the cursor, the tile of the trail in use gets a lighter ring: it follows, it was not chosen.
    for (const tile of grid.querySelectorAll('.trail')) {
      tile.setAttribute('aria-pressed', String(tile.dataset.kind === kind));
      tile.classList.toggle('is-matched', kind === 'auto' && tile.dataset.kind === t.effective);
    }
    for (const field of document.querySelectorAll('[data-trail-adjust]')) {
      if (!field.matches(':active')) field.value = t[field.dataset.trailAdjust] || 1;
      trailValue(field);
    }
    $('s-trail-click').checked = t.click !== false;
  }
  function trailValue(field) {
    $(field.id + '-value').textContent = Math.round(field.value * 100) + ' %';
    field.style.setProperty('--pct', (field.value - field.min) / (field.max - field.min) * 100 + '%');
  }
  for (const b of document.querySelectorAll('[data-trail]')) b.addEventListener('click', () => send('trail.set', { kind: b.dataset.trail }));
  for (const field of document.querySelectorAll('[data-trail-adjust]')) {
    field.addEventListener('input', () => trailValue(field));
    field.addEventListener('change', () => send('trail.adjust', { what: field.dataset.trailAdjust, value: Number(field.value) }));
  }
  $('s-trail-click').addEventListener('change', e => send('trail.adjust', { what: 'click', value: e.target.checked }));

  function state(n) {
    s = n;
    renderTrail();
    loadPack();
    $('s-initial').disabled = !!s.standard;
    $('s-original').hidden = !s.original;
    if (!chosenRole()) role = s.roles[0].id;
    renderDraft();
    renderRoles();
    renderSettings();
    renderLibrary();
    renderDock();
  }

  function event(m) {
    if (m.type === 'mouse.frames') {
      motion.set(m.path, m);
      const r = chosenRole();
      if (r && r.path === m.path) play(r);
      return;
    }
    if (m.type === 'trail.previews') { trailPreviews = m.previews; renderTrail(); return; }
    if (m.type === 'vip.result') { vipMessage = m.ok ? null : tr('This code is not valid. Check the letters and try again.'); keyLibrary = ''; renderLibrary(); return; }
    if (m.type !== 'mouse.library') return;
    library = m;
    keyLibrary = '';
    renderLibrary();
    renderDock();
    refreshCurrent();
  }

  function visible(yes) {
    if (yes) CursorEngine.warm();
    if (yes && !library) send('mouse.library');
  }

  $('s-initial').addEventListener('click', () => send('mouse.initial'));
  $('s-original').addEventListener('click', () => send('mouse.original'));
  $('s-folder').addEventListener('click', () => send('mouse.folder'));
  $('s-draft').addEventListener('submit', e => {
    e.preventDefault();
    send('mouse.save', { name: $('s-draft-name').value });
    $('s-draft-name').value = '';
  });
  $('s-update').addEventListener('click', () => send('mouse.update'));
  $('s-discard').addEventListener('click', () => send('mouse.discard'));

  function renderDock() {
    const zone = $('dock-pick');
    if (document.body.dataset.dock !== 'mouse' || !s || !library) return;
    const key = packReady + '' + vipState().unlocked + '#' + library.themes.map(t => t.name + '/' + t.title).join('|') + '#' + LANGUAGE;
    if (zone.dataset.key === key && zone.firstChild) { mark(); return; }
    zone.dataset.key = key;
    const nodes = [];
    for (const [kind, label] of SECTIONS) {
      if (kind === 'lampfish') {
        houseSections((title, note, items) => {
          const head = document.createElement('h2');
          head.textContent = title;
          const grid = document.createElement('div');
          grid.className = 'themes';
          grid.append(...items);
          nodes.push(head, grid);
        });
        continue;
      }
      const list = library.themes.filter(t => t.kind === kind);
      if (!list.length && kind !== 'mine') continue;
      const head = document.createElement('h2');
      head.textContent = tr(label);
      const grid = document.createElement('div');
      grid.className = 'themes';
      grid.append(...list.map(themeCard));
      if (kind === 'mine') grid.append(newTheme());
      nodes.push(head, grid);
    }
    zone.replaceChildren(...nodes);
    foldSections(zone, 'dock-mouse');
    mark();
  }

  Lampfish.mouse = { state, event, visible, renderDock };
})();
