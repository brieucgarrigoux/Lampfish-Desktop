'use strict';

(function () {
  const zone = $('moods'), sheet = $('mood-sheet');
  let moods = [], models = [], chosen = null, naming = false, keyGrid = '';

  const MODELS = {
    night: ['Night', 'Darker wallpaper, warm screen', 'moon'],
    focus: ['Focus', 'Calmer wallpaper, sounds off', 'target'],
    cinema: ['Cinema', 'Dark wallpaper, sounds off', 'film'],
  };
  const MODE_ICONS = {
    spark: '<path d="M12 3.5 13.6 10 20 12l-6.4 2L12 20.5 10.4 14 4 12l6.4-2z"/>',
    moon: '<path d="M19.5 14.6A7.6 7.6 0 0 1 9.4 4.5a7.6 7.6 0 1 0 10.1 10.1z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>',
    target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
    film: '<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="m10.2 9.3 4.6 2.7-4.6 2.7z"/>',
    game: '<path d="M7.5 8h9a4 4 0 0 1 3.9 4.9l-.8 3.5a2.3 2.3 0 0 1-4 1L14 15.5h-4l-1.6 1.9a2.3 2.3 0 0 1-4-1l-.8-3.5A4 4 0 0 1 7.5 8z"/><path d="M8 11v3M6.5 12.5h3M15.5 12h.01M17.5 13.5h.01"/>',
    music: '<path d="M9 17.5V6l10-2v11.5"/><circle cx="6.5" cy="17.5" r="2.5"/><circle cx="16.5" cy="15.5" r="2.5"/>',
    book: '<path d="M4 5.5c2.5-1 5.5-1 8 .8 2.5-1.8 5.5-1.8 8-.8v13c-2.5-1-5.5-1-8 .8-2.5-1.8-5.5-1.8-8-.8z"/><path d="M12 6.3v13"/>',
    coffee: '<path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z"/><path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16M8.5 3.5v2M12 3.5v2"/>',
    leaf: '<path d="M5 19c0-7 5-12 14-13-1 9-6 14-13 14"/><path d="M5 19c3-4 6-6.5 9-8"/>',
    bolt: '<path d="M13 3.5 5.5 13H12l-1 7.5L18.5 11H12z"/>',
    heart: '<path d="M12 19.5s-7.5-4.6-7.5-10a4.2 4.2 0 0 1 7.5-2.6 4.2 4.2 0 0 1 7.5 2.6c0 5.4-7.5 10-7.5 10z"/>',
    code: '<path d="m8.5 7.5-4.5 4.5 4.5 4.5M15.5 7.5l4.5 4.5-4.5 4.5M13.5 5l-3 14"/>',
  };
  const icon = key => `<svg class="mode-icon" viewBox="0 0 24 24" aria-hidden="true">${MODE_ICONS[key] || MODE_ICONS.spark}</svg>`;
  const ICONS = {
    wallpaper: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="m3.5 16 5-5 4 4 2.5-2.5 5.5 5.5"/><circle cx="15.5" cy="9.5" r="1.3"/>',
    cursor: '<path d="M6 3.5 18 12.3l-5.6.8-3.2 4.9z"/><path d="m12.4 13.1 3.6 6.4"/>',
    on: '<path d="M4 9.5v5h3.5L12 18V6L7.5 9.5z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
    off: '<path d="M4 9.5v5h3.5L12 18V6L7.5 9.5z"/><path d="m16 10 4 4M20 10l-4 4"/>',
    warm: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>',
    dim: '<path d="M19.5 14.6A7.6 7.6 0 0 1 9.4 4.5a7.6 7.6 0 1 0 10.1 10.1z"/>',
    react: '<path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2"/>',
    time: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    screens: '<rect x="3.5" y="4.5" width="17" height="12" rx="1.5"/><path d="M9 20h6M12 16.5V20"/>',
    mains: '<path d="M9 3.5v4M15 3.5v4M7 7.5h10v3a5 5 0 0 1-10 0zM12 15.5v5"/>',
    battery: '<rect x="3" y="8" width="16" height="8" rx="2"/><path d="M21 10.5v3M6 11v2"/>',
    app: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M3.5 8.5h17"/>',
    headset: '<path d="M4.5 15v-3a7.5 7.5 0 0 1 15 0v3"/><rect x="3.5" y="14" width="4" height="6" rx="1.5"/><rect x="16.5" y="14" width="4" height="6" rx="1.5"/>',
    hand: '<path d="m9 9 10 3.6-4.2 1.2-1.2 4.2z"/><path d="m5 5 1.6 1.6M9 3v2.2M3 9h2.2"/>',
    opens: '<path d="M14 4.5h5.5V10M19.5 4.5 11 13"/><path d="M17.5 13.5v4a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2h4"/>',
    export: '<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5"/><path d="M5 13.5v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/>',
    remove: '<path d="M5 7h14M9.5 7V5h5v2M7 7l1 12h8l1-12"/>',
    rename: '<path d="M4.5 19.5h4l10-10-4-4-10 10z"/><path d="m13 7 4 4"/>',
    close: '<path d="m7 7 10 10M17 7 7 17"/>',
    play: '<path d="M8.5 5.8v12.4a.8.8 0 0 0 1.2.7l9.6-6.2a.8.8 0 0 0 0-1.4L9.7 5.1a.8.8 0 0 0-1.2.7z"/>',
  };
  const svg = (path, cls) => `<svg${cls ? ` class="${cls}"` : ''} viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function cover(m, host) {
    const box = el('div', 'preview mood__cover');
    const state = Bramble.state, w = state && state.wallpapers ? state.wallpapers.find(f => f.name === m.wallpaper) : null;
    if (w) {
      box.append(preview(w, host, m.light, m.speed));
      const look = [];
      if (m.blur > 0) look.push(`blur(${(m.blur * .04).toFixed(2)}px)`);
      if (m.saturation != null && m.saturation !== 50) look.push(`saturate(${m.saturation / 50})`);
      if (look.length) box.style.setProperty('--look', look.join(' '));
    } else {
      box.classList.add('mood__cover--none');
      box.insertAdjacentHTML('beforeend', svg(ICONS.wallpaper));
    }
    if (m.warm > 0) {
      const warmth = el('i', 'mood__warmth');
      warmth.style.opacity = (m.warm / 100).toFixed(2);
      box.append(warmth);
    }
    const veil = el('i', 'mood__veil');
    veil.style.background = `rgba(0, 0, 0, ${((m.dim || 0) / 100 * .75).toFixed(3)})`;
    box.append(veil);
    return box;
  }

  function trait(icon, text, title) {
    const t = el('span', 'trait');
    t.title = title;
    if (typeof icon === 'string') t.insertAdjacentHTML('beforeend', svg(icon));
    else t.append(icon);
    if (text) t.append(el('span', '', text));
    return t;
  }

  function cursorImage(m) {
    if (!m.look || !m.look.arrow) return null;
    const img = el('img', 'trait__cursor');
    img.alt = '';
    img.src = `/app/cursor-cache/${encodeURIComponent(m.look.arrow.key)}-32.png`;
    img.classList.toggle('retro', m.look.arrow.retro);
    return img;
  }

  const SOUNDS = { on: 'Sounds on · {0} %', off: 'Sounds off' };
  function traits(m) {
    const row = el('div', 'mood__traits');
    const theme = m.look ? m.look.title : m.theme;
    row.append(
      trait(cursorImage(m) || ICONS.cursor, theme || tr('Unchanged'), theme ? tr('Cursors: {0}', theme) : tr('Cursors unchanged')),
      trait(ICONS[m.sounds] || ICONS.on, m.sounds === 'on' ? m.volume + ' %' : tr('Off'), tr(SOUNDS[m.sounds] || SOUNDS.on, m.volume)),
      trait(ICONS.dim, m.dim + ' %', m.dim > 0 ? tr('Dimmed {0} %', m.dim) : tr('Not dimmed')));
    if (m.warm > 0) row.append(trait(ICONS.warm, m.warm + ' %', tr('Warm screen {0} %', m.warm)));
    return row;
  }

  function appImage(src) {
    const img = el('img', 'start__app');
    img.alt = '';
    img.src = src;
    return img;
  }

  function starts(m) {
    const row = el('div', 'mood__starts');
    const pill = (icon, text, title) => { const p = trait(icon, text, title); p.className = 'start'; row.append(p); };
    if (m.time) pill(ICONS.time, m.time, tr('Every day at {0}', m.time));
    if (m.screens) pill(ICONS.screens, String(m.screens), m.screens === 1 ? tr('With 1 screen') : tr('With {0} screens', m.screens));
    if (m.power) pill(ICONS[m.power] || ICONS.mains, tr(m.power === 'mains' ? 'Plugged in' : 'Battery'), tr(m.power === 'mains' ? 'When plugged in' : 'On battery'));
    if (m.app) pill(m.appIcon ? appImage(m.appIcon) : ICONS.app, m.app, tr('When {0} opens', m.app));
    if (m.headset) pill(ICONS.headset, '', tr('With headphones'));
    if (!row.children.length) pill(ICONS.hand, tr('By hand'), tr('Starts only when applied'));
    if (m.opens && m.opens.length) {
      const opens = el('span', 'start start--opens');
      opens.title = tr('Opens {0}', m.opens.map(o => o.name).join(', '));
      opens.insertAdjacentHTML('beforeend', svg(ICONS.opens));
      for (const o of m.opens.slice(0, 3)) if (o.icon) opens.append(appImage(o.icon));
      if (!m.opens.some(o => o.icon) || m.opens.length > 3) opens.append(el('span', '', String(m.opens.length)));
      row.append(opens);
    }
    return row;
  }

  function card(m) {
    const c = el('article', 'mood' + (m.current ? ' current' : ''));
    c.tabIndex = 0;
    c.setAttribute('role', 'button');
    c.setAttribute('aria-label', m.name);
    c.dataset.id = m.id;
    const art = cover(m, c);
    art.insertAdjacentHTML('beforeend', `<span class="mood__badge-icon">${icon(m.icon)}</span>`);
    if (!m.current) {
      const play = el('button', 'mood__play');
      play.type = 'button';
      play.title = tr('Apply');
      play.setAttribute('aria-label', tr('Apply {0}', m.name));
      play.innerHTML = svg(ICONS.play);
      play.addEventListener('click', e => { e.stopPropagation(); send('moods.apply', { id: m.id }); });
      art.append(play);
    }
    const head = el('div', 'mood__head');
    head.append(Object.assign(el('h3', 'mood__name', m.name), { translate: false }));
    if (m.current) head.append(el('span', 'mood__badge', tr('Active')));
    c.append(art, head, traits(m), starts(m));
    const open = () => choose(m.id);
    c.addEventListener('click', open);
    c.addEventListener('keydown', e => { if (e.target === c && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open(); } });
    return c;
  }

  function newMode() {
    const tile = el('div', 'mood mood--add');
    const state = Bramble.state || {};
    const art = cover({ wallpaper: state.current, light: state.light, speed: state.speed, blur: state.blur, saturation: state.saturation, dim: state.dim }, tile);
    art.insertAdjacentHTML('beforeend', `<span class="mood__plus" aria-hidden="true">${svg('<path d="M12 5.5v13M5.5 12h13"/>')}</span>`);
    const head = el('div', 'mood__head');
    head.append(el('h3', 'mood__name', tr('New mode')));
    const help = el('p', 'mood__help', tr('Saves the wallpaper, cursors and sounds'));
    tile.append(art, head, help);
    const ask = () => {
      naming = true;
      const form = el('form', 'mood__form');
      form.innerHTML = '<input maxlength="40" autocomplete="off"><button class="button button--accent" type="submit"></button>';
      const input = form.querySelector('input');
      input.placeholder = tr('Name this mode');
      input.setAttribute('aria-label', tr('Mode name'));
      form.querySelector('button').textContent = tr('Save');
      form.addEventListener('submit', e => { e.preventDefault(); naming = false; send('moods.save', { name: input.value }); });
      const cancel = () => { naming = false; keyGrid = ''; render(); };
      input.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); cancel(); } });
      input.addEventListener('blur', () => setTimeout(() => { if (naming && form.isConnected && !form.contains(document.activeElement) && !input.value.trim()) cancel(); }, 150));
      tile.classList.add('naming');
      tile.removeAttribute('role');
      tile.removeAttribute('tabindex');
      help.replaceWith(form);
      input.focus();
    };
    if (naming) setTimeout(ask);
    else {
      tile.tabIndex = 0;
      tile.setAttribute('role', 'button');
      tile.title = tr('Saves the current wallpaper, cursors and sounds as a mode');
      tile.addEventListener('click', () => { if (!naming) ask(); });
      tile.addEventListener('keydown', e => { if (!naming && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); ask(); } });
    }
    return tile;
  }

  function renderModels() {
    const list = $('mood-starters');
    const key = JSON.stringify(models) + '|' + (Bramble.state ? Bramble.state.wallpapers.map(w => w.name + '@' + w.stamp).join() : '');
    if (list.dataset.key === key) return;
    list.dataset.key = key;
    list.replaceChildren(...models.filter(m => MODELS[m.kind]).map(m => {
      const [name, help, symbol] = MODELS[m.kind];
      const b = el('button', 'starter');
      b.type = 'button';
      b.title = tr('Adds a mode built from the current setup');
      const art = cover(m, b);
      art.insertAdjacentHTML('beforeend', `<span class="mood__badge-icon">${icon(symbol)}</span>`);
      b.append(art, el('span', 'starter__name', tr(name)), el('span', 'starter__help', tr(help)));
      b.addEventListener('click', () => send('moods.starter', { kind: m.kind }));
      return b;
    }));
  }

  function choose(id) {
    chosen = id;
    render();
  }

  function close() { choose(null); }

  function row(icon, title, help, control) {
    const r = el('div', 'row');
    const caption = el('span', 'caption');
    caption.innerHTML = svg(icon, 'glyph glyph--small');
    const text = el('span', '', title);
    if (help) text.append(Object.assign(el('small', '', help), { title: help }));
    caption.append(text);
    r.append(caption);
    if (control) r.append(control);
    return r;
  }

  function stacked(icon, title, help, control) {
    const r = row(icon, title, help);
    r.className = 'choice';
    r.append(control);
    return r;
  }

  function segments(options, value, pick, label) {
    const s = el('div', 'segments');
    s.setAttribute('role', 'radiogroup');
    s.setAttribute('aria-label', label);
    for (const [v, text] of options) {
      const b = el('button', '', text);
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(v === value));
      b.addEventListener('click', () => { if (v !== value) pick(v); });
      s.append(b);
    }
    return s;
  }

  function chip(label, icon, title, remove) {
    const c = el('button', 'chip mood__chip');
    c.type = 'button';
    c.title = title;
    if (icon) c.append(appImage(icon));
    c.append(el('span', '', label));
    c.insertAdjacentHTML('beforeend', svg(ICONS.close));
    c.addEventListener('click', remove);
    return c;
  }

  function rename(head, m) {
    const title = head.querySelector('.title');
    if (!title) return;
    const input = Object.assign(el('input', 'm-sheet__rename'), { maxLength: 40, value: m.name });
    input.setAttribute('aria-label', tr('Mode name'));
    title.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const finish = save => {
      if (done) return;
      done = true;
      const v = input.value.trim();
      if (save && v && v !== m.name) send('moods.rename', { id: m.id, name: v });
      else input.replaceWith(title);
    };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') finish(true); else if (e.key === 'Escape') { e.stopPropagation(); finish(false); } });
    input.addEventListener('blur', () => finish(true));
  }

  function renderSheet() {
    const m = moods.find(x => x.id === chosen);
    document.body.classList.toggle('mode-open', !!m);
    if (!m) { sheet.dataset.key = ''; sheet.replaceChildren(); return; }
    const key = JSON.stringify(m) + '|' + (Bramble.state ? Bramble.state.wallpapers.map(w => w.name + '@' + w.stamp).join() : '');
    if (sheet.dataset.key === key) return;
    sheet.dataset.key = key;

    const head = el('div', 'm-sheet__head');
    head.innerHTML = `<button class="m-sheet__icon" type="button" aria-expanded="false">${icon(m.icon)}</button><div><span class="title"></span><span class="path"></span></div>`;
    const picker = el('div', 'm-icons');
    picker.hidden = true;
    picker.setAttribute('role', 'radiogroup');
    picker.setAttribute('aria-label', tr('Icon'));
    for (const key of Object.keys(MODE_ICONS)) {
      const b = el('button', 'm-icons__one');
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(key === (m.icon || 'spark')));
      b.innerHTML = icon(key);
      b.addEventListener('click', () => { if (key !== (m.icon || 'spark')) send('moods.icon', { id: m.id, value: key }); });
      picker.append(b);
    }
    const iconButton = head.querySelector('.m-sheet__icon');
    iconButton.title = tr('Change the icon');
    iconButton.setAttribute('aria-label', tr('Change the icon'));
    iconButton.addEventListener('click', () => { const open = iconButton.getAttribute('aria-expanded') !== 'true'; reveal(picker, open); iconButton.setAttribute('aria-expanded', String(open)); });
    head.querySelector('.title').textContent = m.name;
    head.querySelector('.title').translate = false;
    head.querySelector('.title').title = tr('Double-click to rename');
    head.querySelector('.title').addEventListener('dblclick', () => rename(head, m));
    head.querySelector('.path').textContent = m.current ? tr('Active right now') : tr('Not applied');
    for (const [what, label] of [['rename', 'Rename'], ['close', 'Close']]) {
      const b = el('button', 'm-sheet__tool');
      b.type = 'button';
      b.title = tr(label);
      b.setAttribute('aria-label', tr(label));
      b.innerHTML = svg(ICONS[what]);
      b.addEventListener('click', () => what === 'close' ? close() : rename(head, m));
      head.append(b);
    }

    const art = cover(m, sheet);
    art.classList.add('mood__cover--sheet');
    const actions = el('div', 'm-sheet__actions');
    const apply = el('button', 'button button--accent', tr(m.current ? 'Applied' : 'Apply'));
    apply.disabled = m.current;
    apply.addEventListener('click', () => send('moods.apply', { id: m.id }));
    const update = el('button', 'button', tr('Update'));
    update.title = tr('Replaces what it brings back with the current setup');
    update.addEventListener('click', () => send('moods.update', { id: m.id }));
    actions.append(apply, update);

    const brings = el('div', 'group');
    const value = text => Object.assign(el('span', 'value', text), { title: text });
    const wallpaper = m.wallpaper ? m.wallpaper.replace(/\.[^.]+$/, '') : tr('No wallpaper');
    const theme = m.look ? m.look.title : m.theme;
    brings.append(
      row(ICONS.wallpaper, tr('Wallpaper'), m.screenWallpapers === 1 ? tr('Plus one screen with its own wallpaper') : m.screenWallpapers > 1 ? tr('Plus {0} screens with their own wallpaper', m.screenWallpapers) : '', value(wallpaper)),
      row(ICONS.dim, tr('Dim'), '', value(m.dim > 0 ? m.dim + ' %' : tr('Not dimmed'))),
      row(ICONS.cursor, tr('Cursors'), '', value(theme || tr('Unchanged'))),
      row(ICONS[m.sounds] || ICONS.on, tr('Sounds'), '', value(m.sounds === 'on' ? tr('On · {0} %', m.volume) : tr('Off'))));
    if (m.warm != null) brings.append(row(ICONS.warm, tr('Warm screen'), '', value(m.warm > 0 ? m.warm + ' %' : tr('Off'))));
    if (m.reactive != null) brings.append(row(ICONS.react, tr('React to sound'), '', value(tr(m.reactive ? 'On' : 'Off'))));

    const auto = el('div', 'group');
    const time = Object.assign(el('input', 'm-time'), { type: 'time', value: m.time || '' });
    time.setAttribute('aria-label', tr('Start time'));
    time.addEventListener('change', () => send('moods.time', { id: m.id, value: time.value }));
    const clock = el('span', 'm-field');
    clock.append(time);
    if (m.time) {
      const clear = el('button', 'm-sheet__tool m-sheet__tool--small');
      clear.type = 'button';
      clear.title = tr('Never');
      clear.setAttribute('aria-label', tr('Clear the time'));
      clear.innerHTML = svg(ICONS.close);
      clear.addEventListener('click', () => send('moods.time', { id: m.id, value: '' }));
      clock.append(clear);
    }
    auto.append(
      stacked(ICONS.time, tr('At a set time'), tr('Every day, when the PC is on'), clock),
      stacked(ICONS.screens, tr('With screens'), tr('When this many screens are connected'),
        segments([[0, tr('Never')], [1, '1'], [2, '2'], [3, '3'], [4, '4']], m.screens || 0, v => send('moods.screens', { id: m.id, value: v }), tr('Number of screens'))),
      stacked(ICONS.mains, tr('Power source'), tr('Plugged in or on battery'),
        segments([['', tr('Never')], ['mains', tr('Plugged in')], ['battery', tr('Battery')]], m.power || '', v => send('moods.power', { id: m.id, value: v }), tr('Power source'))));
    let app;
    if (m.app) app = chip(m.app, m.appIcon, tr('Remove'), () => send('moods.appClear', { id: m.id }));
    else {
      app = el('button', 'button', tr('Choose'));
      app.addEventListener('click', () => send('moods.app', { id: m.id }));
    }
    auto.append(stacked(ICONS.app, tr('When an app opens'), tr('Undone when the app closes'), app));
    const headset = el('label', 'toggle');
    headset.innerHTML = `<input type="checkbox"><span class="caption">${svg(ICONS.headset, 'glyph glyph--small')}<span></span></span>`;
    const label = headset.querySelector('.caption > span');
    label.append(tr('With headphones'), el('small', '', tr('Undone when unplugged')));
    const box = headset.querySelector('input');
    box.checked = !!m.headset;
    box.addEventListener('change', () => send('moods.headset', { id: m.id, value: box.checked }));
    auto.append(headset);

    const opens = el('div', 'group');
    const list = el('div', 'mood__chips');
    (m.opens || []).forEach((o, i) => list.append(chip(o.name, o.icon, tr('Remove'), () => send('moods.openRemove', { id: m.id, index: i }))));
    if (!m.opens || m.opens.length < 8) {
      const add = el('button', 'link');
      add.type = 'button';
      add.innerHTML = svg('<path d="M12 5v14M5 12h14"/>');
      add.append(tr('Add'));
      add.addEventListener('click', () => send('moods.openAdd', { id: m.id }));
      list.append(add);
    }
    opens.append(stacked(ICONS.opens, tr('Apps or files'), tr('Opened each time the mode is applied'), list));

    const more = el('div', 'group');
    const action = (icon, title, help, run, cls) => {
      const b = el('button', 'row action' + (cls ? ' ' + cls : ''));
      b.innerHTML = `<span class="caption">${svg(icon, 'glyph glyph--small')}<span></span></span>`;
      b.querySelector('.caption > span').append(title, el('small', '', help));
      b.addEventListener('click', run);
      return b;
    };
    more.append(
      action(ICONS.export, tr('Export'), tr('Saves it as a file to share or keep'), () => send('moods.export', { id: m.id })),
      action(ICONS.remove, tr('Remove'), tr('Can be undone for a few seconds'), () => send('moods.remove', { id: m.id }), 'stop'));

    sheet.replaceChildren(head, picker, art, actions, el('h2', '', tr('What it brings back')), brings,
      el('h2', '', tr('Starts by itself')), auto, el('h2', '', tr('Opens with it')), opens, more);
  }

  function showImport(m) {
    const box = $('mood-preview');
    const warnings = [];
    if (m.missingWallpaper) warnings.push(tr('Its wallpaper is not on this PC: the current one is kept'));
    if (m.missingTheme) warnings.push(tr('Its cursor theme is not on this PC: cursors stay as they are'));
    const art = cover(m.mood, box);
    const body = el('div', 'mood-preview__body');
    const head = el('div', 'mood__head');
    head.append(el('h3', 'mood__name', tr('Import “{0}”', m.mood.name)), el('span', 'mood__badge', tr('Preview')));
    const notes = el('ul', 'mood-preview__warnings');
    for (const w of warnings) notes.append(el('li', '', w));
    const actions = el('div', 'm-sheet__actions');
    const add = el('button', 'button button--accent', tr('Add this mode'));
    const cancel = el('button', 'button', tr('Cancel'));
    add.addEventListener('click', () => { box.hidden = true; send('moods.add'); });
    cancel.addEventListener('click', () => { box.hidden = true; send('moods.cancel'); });
    actions.append(add, cancel);
    body.append(head, traits(m.mood), starts(m.mood), notes, actions);
    box.replaceChildren(art, body);
    box.hidden = false;
  }

  const STEPS = [
    ['<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>', 'Set up a wallpaper, cursors and sounds'],
    ['<path d="M5.5 4.5h10l3 3v12h-13z"/><path d="M8.5 4.5v5h6v-5M8.5 19.5v-5h7v5"/>', 'Save them as a mode'],
    ['<path d="M8.5 5.8v12.4a.8.8 0 0 0 1.2.7l9.6-6.2a.8.8 0 0 0 0-1.4L9.7 5.1a.8.8 0 0 0-1.2.7z"/>', 'Bring them back in one click, or at the right moment'],
  ];
  function renderSteps() {
    const zone = $('mood-help');
    if (zone.children.length) return;
    STEPS.forEach(([path, text], i) => {
      const step = el('span', 'mode-step');
      step.innerHTML = `<b>${i + 1}</b>${svg(path)}`;
      step.append(el('span', '', tr(text)));
      zone.append(step);
    });
  }

  function render() {
    $('mood-count').textContent = moods.length || '';
    renderSteps();
    if (chosen && !moods.some(m => m.id === chosen)) chosen = null;
    const state = Bramble.state || {};
    const key = JSON.stringify(moods) + '|' + [state.current, state.light, state.speed, state.blur, state.saturation, state.dim].join() + '|' + (state.wallpapers ? state.wallpapers.map(w => w.name + '@' + w.stamp).join() : '');
    if (key !== keyGrid && !naming) {
      keyGrid = key;
      zone.replaceChildren(...moods.map(card), newMode());
    }
    for (const c of zone.querySelectorAll('.mood[data-id]')) c.classList.toggle('open', c.dataset.id === chosen);
    renderModels();
    renderSheet();
  }

  function state(list) {
    moods = list;
    models = (Bramble.state && Bramble.state.moodModels) || [];
    render();
  }

  function event(m) {
    if (m.type === 'moods.preview') showImport(m);
  }

  function startNew() {
    showView('modes');
    naming = true;
    keyGrid = '';
    zone.replaceChildren(...moods.map(card), newMode());
  }

  $('mood-import').addEventListener('click', () => send('moods.import'));
  addEventListener('keydown', e => { if (e.key === 'Escape' && chosen && document.body.dataset.view === 'modes' && !(e.target.matches && e.target.matches('input:not([type="checkbox"]), select'))) close(); });

  Bramble.moods = { state, event, startNew, icon };
})();
