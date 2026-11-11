'use strict';

(function () {
  // The page shows the looks first (C66); one cursor at a time is a mode of its own, where these tabs filter the sources.
  const TABS = [['all', 'All'], ['lampfish', 'lampfish'], ['windows', 'Windows'], ['mine', 'My files']];
  let s = null, library = null;
  let role = 'Arrow', tab = 'all', keyLibrary = '', keyGallery = '', editing = false, trailsAll = false, windowsAll = false;
  try { const t = localStorage.getItem('mouse.filter'); if (TABS.some(x => x[0] === t)) tab = t; } catch (e) { }

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

  // The line at the top: the theme in use, its colours, the size, the trail, and the ways to change or undo it.
  function renderNow() {
    if (!s) return;
    const fam = currentFamily(), v = fam && fam.variants.find(x => x.name === s.theme);
    const title = $('s-theme');
    title.textContent = fam ? tr(fam.name) : s.themeTitle;
    title.translate = !!fam || s.based;
    if (s.unsaved && s.based) {
      const badge = Object.assign(document.createElement('button'), { type: 'button', className: 'badge-modified', innerHTML: icon('pencil-simple'), title: tr('Edit cursors') });
      badge.append(tr('Modified'));
      badge.addEventListener('click', () => edit(true));
      title.append(badge);
    }
    $('s-theme-sub').textContent = fam && fam.variants.length > 1 && v ? tr(v.variant) : '';
    const stage = $('s-now-stage');
    stage.style.setProperty('--tint', fam && v ? tintOf(v.swatch) : 'var(--accent)');
    if (fam && fam.engine && v) {
      const cv = document.createElement('canvas');
      cv.width = cv.height = Math.round(56 * devicePixelRatio);
      cv.style.width = cv.style.height = '56px';
      CursorEngine.draw(cv, cv.width, v.name, 'arrow', .6, false);
      stage.replaceChildren(cv);
    } else stage.replaceChildren(image(s.roles[0].preview));
    const swatches = $('s-now-swatches');
    swatches.replaceChildren(...(fam && fam.variants.length > 1 ? fam.variants : []).map(x => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch';
      b.style.setProperty('--swatch', x.swatch);
      b.title = tr(x.variant);
      b.setAttribute('aria-label', tr(x.variant));
      b.setAttribute('aria-pressed', String(x.name === s.theme));
      b.addEventListener('click', () => applyVariant(fam, x, null));
      return b;
    }));
    $('s-original').disabled = !s.original;
    $('s-initial').disabled = !!s.standard;
    reveal($('s-draft'), editing && s.unsaved);
    $('s-draft-text').textContent = s.based ? tr('Changes not saved in a theme') : tr('These cursors are not saved in a theme');
    $('s-update').hidden = !s.editable;
    $('s-update').innerHTML = icon('arrows-clockwise');
    $('s-update').append(tr('Update “{0}”', s.themeTitle));
    $('s-discard').hidden = !s.based;
  }

  const currentFamily = () => s && library ? [...families(), ...(packReady ? CursorEngine.packFamilies.map(asFamily) : [])].find(f => f.variants.some(v => v.name === s.theme)) : null;

  function edit(on) {
    editing = on;
    $('s-edit').hidden = !on;
    $('s-gallery').hidden = on;
    $('s-now').hidden = on;
    if (on) { keyLibrary = ''; renderPicks(); renderRoles(); }
    renderNow();
    document.querySelector('.view--mouse').scrollIntoView({ block: 'start' });
    (on ? $('s-roles').querySelector('.chosen') : $('s-edit-open'))?.focus({ preventScroll: true });
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
      b.addEventListener('click', () => { role = r.id; renderRoles(); renderPicks(); play(r); });
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
        try { localStorage.setItem('mouse.filter', key); } catch (e) { }
        renderPicks();
      });
      return b;
    }));
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
      remove.innerHTML = icon('trash-simple');
      remove.title = tr('Remove');
      remove.setAttribute('aria-label', tr('Remove'));
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
    const loop = now => { if (!c.isConnected) { raf = 0; return; } if (now - last > 32) { last = now; draw(CursorEngine.phase(now / 1000), true); } raf = requestAnimationFrame(loop); };
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
    CursorEngine.load(PACK).then(() => { packReady = true; keyGallery = ''; renderNow(); renderGallery(); renderDock(); refreshCurrent(); }).catch(e => console.error(e));
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
    const loop = now => { if (!c.isConnected) { raf = 0; return; } if (now - last > 32) { last = now; draw(CursorEngine.phase(now / 1000), true); } raf = requestAnimationFrame(loop); };
    c.addEventListener('pointerenter', () => { if (!still.matches && !raf) raf = requestAnimationFrame(loop); });
    c.addEventListener('pointerleave', () => { cancelAnimationFrame(raf); raf = 0; draw(.6, false); });
    return c;
  }

  // The house sections: lampfish families, the special edition, then the Bramble themes.
  function houseSections(add) {
    add(tr('lampfish'), '', families().map(familyTile));
    if (packReady && CursorEngine.packFamilies.length) {
      if (vipState().unlocked) add(tr('Special edition'), tr('For VIP members'), CursorEngine.packFamilies.map(f => familyTile(asFamily(f))));
      else add(tr('Special edition'), '', [vipTile()]);
    }
    const bramble = library.themes.filter(isBramble);
    if (bramble.length) add(tr('Bramble'), '', bramble.map(themeCard));
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

  // The gallery, in sections (C66): lampfish, the special edition, the trails, Bramble, Windows on one row, the user's own.
  function renderGallery() {
    if (!s || !library) return;
    const zone = $('s-gallery'), t = trailState();
    const key = [packReady, vipState().pack, vipState().unlocked, vipMessage, library.themes.map(x => x.name).join('|'), s.theme, LANGUAGE, t.kind, t.effective, trailsAll, windowsAll].join('#');
    if (key === keyGallery) { mark(); return; }
    keyGallery = key;
    const nodes = [];
    const section = (label, count, items, extra) => {
      const head = document.createElement('h3');
      head.className = 'themes__title';
      head.innerHTML = '<span></span><span class="count"></span>';
      head.firstChild.textContent = label;
      head.lastChild.textContent = count || '';
      if (extra) head.append(extra);
      const grid = document.createElement('div');
      grid.className = 'themes';
      grid.append(...items);
      nodes.push(head, grid);
      return head;
    };
    houseSections((label, note, items) => {
      section(label, note || label === tr('Special edition') ? '' : items.length, items);
      if (label === tr('Special edition')) trailSection(section);
    });
    if (!packReady) trailSection(section);
    const system = library.themes.filter(x => x.kind === 'system');
    if (system.length) {
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'link themes__more';
      more.innerHTML = icon(windowsAll ? 'caret-up' : 'caret-down');
      more.append(windowsAll ? tr('Show less') : tr('Show all {0}', system.length));
      more.addEventListener('click', () => { windowsAll = !windowsAll; renderGallery(); });
      const shown = windowsAll ? system : system.filter(x => x.name === s.theme).concat(system.filter(x => x.name !== s.theme)).slice(0, 3);
      section(tr('Windows'), system.length, shown.map(themeCard), system.length > 3 ? more : null);
    }
    section(tr('My themes'), library.themes.filter(x => x.kind === 'mine').length, [...library.themes.filter(x => x.kind === 'mine').map(themeCard), newTheme()]);
    zone.replaceChildren(...nodes);
    mark();
  }

  // One cursor at a time: the cursors of every source for the role chosen in the strip.
  function renderPicks() {
    if (!s || !library || !editing) return;
    renderTabs();
    const r = chosenRole();
    $('s-for').textContent = tr('Cursors for “{0}”', r ? tr(r.name) : '');
    const zone = $('s-library');
    const key = tab + '#' + role + '#' + library.custom.map(p => p.path).join('|') + '#' + (library.lampfishCursors || []).map(x => x.name).join('|') + '#' + LANGUAGE;
    if (key === keyLibrary) { mark(); return; }
    keyLibrary = key;
    zone.replaceChildren();
    const section = (label, items, extra, link) => {
      const head = document.createElement('h3');
      head.className = 'themes__title';
      head.innerHTML = '<span></span><span class="count"></span>';
      head.firstChild.textContent = label;
      head.lastChild.textContent = items.length || '';
      if (link) head.append(link);
      const g = document.createElement('div');
      g.className = 'tiles tiles--cursors';
      g.append(...items.map(cursorTile));
      if (extra) g.append(extra);
      zone.append(head, g);
    };
    // One cursor per theme of lampfish for the chosen role, named after its theme.
    if (tab === 'all' || tab === 'lampfish') section(tr('lampfish'), (library.lampfishCursors || []).flatMap(t => t.cursors.filter(c => r && c.role === r.name).map(c => ({ ...c, role: null, name: t.title }))));
    if (tab === 'all' || tab === 'windows') section(tr('Windows'), library.windows);
    if (tab === 'all' || tab === 'mine') {
      const add = document.createElement('button');
      add.className = 'tile-add';
      add.innerHTML = icon('plus');
      add.append(tr('Add'));
      add.title = tr('Files .cur and .ani');
      add.addEventListener('click', () => send('mouse.add'));
      const folder = document.createElement('button');
      folder.type = 'button';
      folder.className = 'link themes__more';
      folder.innerHTML = icon('folder-open');
      folder.append(tr('Open folder'));
      folder.addEventListener('click', () => send('mouse.folder'));
      section(tr('My files'), library.custom, add, folder);
    }
    mark();
  }

  // The trails as live display cases. Without a code, one case that can be tried, locked for the rest (C66, Q8).
  function trailSection(section) {
    if (!vipState().pack || !window.TrailPreview) return;
    const t = trailState(), kind = t.kind || '';
    if (!vipState().unlocked) {
      const tile = trailTile('bubbles-gold', 'Trails', true);
      section(tr('Trails'), '', [tile]);
      return;
    }
    const modes = document.createElement('span');
    modes.className = 'themes__modes';
    for (const [k, label, glyph] of [['', 'Off', 'x'], ['auto', 'Match the cursor', 'link']]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tool-chip';
      b.innerHTML = icon(glyph);
      b.append(tr(label));
      b.setAttribute('aria-pressed', String(kind === k));
      b.addEventListener('click', () => send('trail.set', { kind: k }));
      modes.append(b);
    }
    const all = TRAILS.flatMap(([group, items]) => items.map(([id, name]) => [id, name, group]));
    const first = all.filter(x => x[0] === (kind === 'auto' ? t.effective : kind));
    const shown = trailsAll ? all : first.concat(all.filter(x => !first.includes(x))).slice(0, 6);
    const head = section(tr('Trails'), all.length, shown.map(([id, name, group]) => trailTile(id, name, false, group)), modes);
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'link themes__more';
    more.innerHTML = icon(trailsAll ? 'caret-up' : 'caret-down');
    more.append(trailsAll ? tr('Show less') : tr('Show all {0}', all.length));
    more.addEventListener('click', () => { trailsAll = !trailsAll; renderGallery(); });
    head.append(more);
  }

  function trailTile(id, name, locked, group) {
    const t = trailState(), kind = t.kind || '';
    const c = document.createElement('div');
    c.className = 'theme theme--family m-trail' + (locked ? ' is-locked' : '');
    c.dataset.kind = id;
    c.tabIndex = 0;
    c.setAttribute('role', 'button');
    c.innerHTML = '<span class="family__stage"><canvas></canvas><span class="m-trail__hint"></span></span><span class="family__foot"><span class="family__text"><span class="family__title"></span><span class="family__sub"><span></span></span></span><span class="theme__swatches"></span></span>';
    c.querySelector('.m-trail__hint').textContent = tr('Move here');
    c.querySelector('.family__title').textContent = locked ? tr(name) : tr(group);
    c.querySelector('.family__sub').firstChild.textContent = locked ? tr('Special edition') : tr(name);
    const chosen = !locked && kind === id, matched = !locked && kind === 'auto' && t.effective === id;
    c.classList.toggle('current', chosen || matched);
    if (chosen || matched) { const u = document.createElement('span'); u.className = 'family__use'; u.innerHTML = icon('check'); u.append(tr(chosen ? 'In use' : 'Matches the cursor')); c.querySelector('.family__sub').append(u); }
    if (locked) {
      const mark = document.createElement('span');
      mark.className = 'm-trail__lock';
      mark.innerHTML = '<span>' + icon('lock') + '</span>';
      mark.firstChild.append(tr('Special edition'));
      c.querySelector('.family__stage').append(mark);
      const code = document.createElement('button');
      code.type = 'button';
      code.className = 'button';
      code.innerHTML = icon('key');
      code.append(tr('Use a code'));
      code.addEventListener('click', e => { e.stopPropagation(); const input = document.querySelector('.view--mouse .theme--vip input'); if (input) { input.scrollIntoView({ block: 'center' }); input.focus({ preventScroll: true }); } });
      c.querySelector('.theme__swatches').append(code);
    } else {
      const apply = () => send('trail.set', { kind: id });
      c.addEventListener('click', apply);
      c.addEventListener('keydown', e => { if (e.target === c && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); apply(); } });
    }
    requestAnimationFrame(() => TrailPreview.zone(c.querySelector('.family__stage'), id));
    return c;
  }

  function mark() {
    const r = chosenRole();
    for (const t of document.querySelectorAll('.tile-cursor')) t.classList.toggle('current', !!r && samePath(t.dataset.path, r.path));
    for (const t of document.querySelectorAll('.theme:not(.m-trail)')) t.classList.toggle('current', t.dataset.names ? t.dataset.names.split('|').includes(s.theme) : t.dataset.name === s.theme);
  }

  const TEXTS = {
    size: v => PX(Number(v)) + ' px',
    speed: v => String(v),
    doubleClick: v => v + ' ms',
    knob: v => v == 1 ? tr('1 line') : tr('{0} lines', v),
  };

  const PX = n => 32 + (Math.max(1, n) - 1) * 16;
  function renderSize() {
    const n = s.settings.size;
    $('s-size-label').textContent = PX(n) + ' px';
    $('s-minus').disabled = n <= 1;
    $('s-plus').disabled = n >= 15;
  }
  for (const [id, step] of [['s-minus', -1], ['s-plus', 1]])
    $(id).addEventListener('click', () => {
      const n = Math.max(1, Math.min(15, s.settings.size + step));
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
      field.value = q === 'knob' ? (r.knob <= 0 ? 20 : Math.min(20, r.knob)) : r[q];
      updateCursor(field);
      // The slider stops at 20; a wheel set higher in Windows, or to one screen at a time, keeps its real value in the label.
      if (q === 'knob' && (r.knob <= 0 || r.knob > 20)) $(field.id + '-value').textContent = r.knob <= 0 ? tr('One screen') : tr('{0} lines', r.knob);
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
  const trailState = () => (Lampfish.state && Lampfish.state.trail) || {};
  const trailName = id => { for (const [group, items] of TRAILS) for (const [k, name] of items) if (k === id) return tr(group) + ' ' + tr(name); return ''; };

  // The panel keeps only the settings of the trail; the trails themselves are in the gallery.
  function renderTrail() {
    const open = !!vipState().unlocked, t = trailState();
    $('s-trail-title').hidden = $('s-trail').hidden = !open;
    const chip = $('s-trail-chip');
    chip.hidden = !open;
    if (!open) return;
    const id = t.kind === 'auto' ? t.effective : t.kind;
    chip.lastChild.textContent = id ? tr('Trail: {0}', trailName(id)) : tr('Trail: off');
    if (window.TrailPreview) { TrailPreview.settings.D = t.density || 1; TrailPreview.settings.L = t.duration || 1; TrailPreview.settings.clickFx = t.click !== false; }
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
  $('s-trail-chip').addEventListener('click', () => { const head = [...$('s-gallery').querySelectorAll('.themes__title')].find(h => h.firstChild.textContent === tr('Trails')); if (head) head.scrollIntoView({ block: 'start', behavior: 'smooth' }); });
  for (const field of document.querySelectorAll('[data-trail-adjust]')) {
    field.addEventListener('input', () => trailValue(field));
    field.addEventListener('change', () => send('trail.adjust', { what: field.dataset.trailAdjust, value: Number(field.value) }));
  }
  $('s-trail-click').addEventListener('change', e => send('trail.adjust', { what: 'click', value: e.target.checked }));

  function state(n) {
    s = n;
    loadPack();
    if (!chosenRole()) role = s.roles[0].id;
    renderTrail();
    renderNow();
    renderRoles();
    renderSettings();
    renderGallery();
    renderPicks();
    renderDock();
  }

  function event(m) {
    if (m.type === 'mouse.frames') {
      motion.set(m.path, m);
      const r = chosenRole();
      if (r && r.path === m.path) play(r);
      return;
    }
    if (m.type === 'vip.result') { vipMessage = m.ok ? null : tr('This code is not valid. Check the letters and try again.'); keyGallery = ''; renderGallery(); return; }
    if (m.type !== 'mouse.library') return;
    library = m;
    keyLibrary = keyGallery = '';
    renderNow();
    renderGallery();
    renderPicks();
    renderDock();
    refreshCurrent();
  }

  function visible(yes) {
    if (yes) CursorEngine.warm();
    if (yes && !library) send('mouse.library');
  }

  // Restore: one button, a menu whose lines say what you get (C66), as the menu of Capture in Shelf.
  function restoreMenu(open) {
    $('s-restore-menu').hidden = !open;
    $('s-restore').setAttribute('aria-expanded', String(open));
    if (open) $('s-restore-menu').querySelector('button:not(:disabled)')?.focus();
  }
  $('s-restore').addEventListener('click', e => { e.stopPropagation(); restoreMenu($('s-restore-menu').hidden); });
  $('s-restore-menu').addEventListener('keydown', e => {
    const buttons = [...$('s-restore-menu').querySelectorAll('button:not(:disabled)')], i = buttons.indexOf(document.activeElement);
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && buttons.length) { e.preventDefault(); buttons[(i + (e.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length].focus(); }
    if (e.key === 'Escape') { e.stopPropagation(); restoreMenu(false); $('s-restore').focus(); }
  });
  addEventListener('pointerdown', e => { if (!$('s-restore-menu').hidden && !(e.target.closest && e.target.closest('.m-now .s-capture'))) restoreMenu(false); });
  $('s-initial').addEventListener('click', () => { restoreMenu(false); send('mouse.initial'); });
  $('s-original').addEventListener('click', () => { restoreMenu(false); send('mouse.original'); });
  $('s-edit-open').addEventListener('click', () => edit(true));
  $('s-edit-done').addEventListener('click', () => edit(false));
  $('s-edit').addEventListener('keydown', e => { if (e.key === 'Escape' && !e.target.closest('input')) { e.stopPropagation(); edit(false); } });
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
