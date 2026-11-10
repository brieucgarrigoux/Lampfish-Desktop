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
    spark: 'sparkle',
    moon: 'moon',
    sun: 'sun',
    target: 'radio-button',
    film: 'film-slate',
    game: 'game-controller',
    music: 'music-notes',
    book: 'book-open',
    coffee: 'coffee',
    leaf: 'leaf',
    bolt: 'lightning',
    heart: 'heart',
    code: 'code',
  };
  const modeIcon = key => icon(MODE_ICONS[key] || MODE_ICONS.spark, 'mode-icon');
  const ICONS = {
    wallpaper: 'image',
    cursor: 'cursor',
    on: 'speaker-high',
    off: 'speaker-x',
    warm: 'sun-horizon',
    dim: 'sun-dim',
    react: 'waveform',
    output: 'speaker-high',
    time: 'clock',
    screens: 'monitor',
    mains: 'plug',
    battery: 'battery-high',
    app: 'app-window',
    headset: 'headphones',
    hand: 'hand-pointing',
    opens: 'arrow-square-out',
    export: 'export',
    remove: 'trash-simple',
    rename: 'pencil-simple',
    close: 'x',
    play: 'play',
  };

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function cover(m, host) {
    const box = el('div', 'preview mood__cover');
    const state = Lampfish.state, w = state && state.wallpapers ? state.wallpapers.find(f => f.name === m.wallpaper) : null;
    if (w) {
      box.append(preview(w, host, m.light, m.speed));
      const look = [];
      if (m.blur > 0) look.push(`blur(${(m.blur * .04).toFixed(2)}px)`);
      if (m.saturation != null && m.saturation !== 50) look.push(`saturate(${m.saturation / 50})`);
      if (look.length) box.style.setProperty('--look', look.join(' '));
    } else {
      box.classList.add('mood__cover--none');
      box.insertAdjacentHTML('beforeend', icon(ICONS.wallpaper));
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

  function trait(symbol, text, title) {
    const t = el('span', 'trait');
    t.title = title;
    if (typeof symbol === 'string') t.insertAdjacentHTML('beforeend', icon(symbol));
    else t.append(symbol);
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
    const pill = (symbol, text, title) => { const p = trait(symbol, text, title); p.className = 'start'; row.append(p); };
    if (m.time) pill(ICONS.time, m.time, tr('Every day at {0}', m.time));
    if (m.screens) pill(ICONS.screens, String(m.screens), m.screens === 1 ? tr('With 1 screen') : tr('With {0} screens', m.screens));
    if (m.power) pill(ICONS[m.power] || ICONS.mains, tr(m.power === 'mains' ? 'Plugged in' : 'Battery'), tr(m.power === 'mains' ? 'When plugged in' : 'On battery'));
    if (m.app) pill(m.appIcon ? appImage(m.appIcon) : ICONS.app, m.app, tr('When {0} opens', m.app));
    if (m.headset) pill(ICONS.headset, '', tr('With headphones'));
    if (!row.children.length) pill(ICONS.hand, tr('By hand'), tr('Starts only when applied'));
    if (m.opens && m.opens.length) {
      const opens = el('span', 'start start--opens');
      opens.title = tr('Opens {0}', m.opens.map(o => o.name).join(', '));
      opens.insertAdjacentHTML('beforeend', icon(ICONS.opens));
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
    art.insertAdjacentHTML('beforeend', `<span class="mood__badge-icon">${modeIcon(m.icon)}</span>`);
    if (!m.current) {
      const play = el('button', 'mood__play');
      play.type = 'button';
      play.title = tr('Apply');
      play.setAttribute('aria-label', tr('Apply {0}', m.name));
      play.innerHTML = icon(ICONS.play);
      play.addEventListener('click', e => { e.stopPropagation(); send('moods.apply', { id: m.id }); });
      art.append(play);
    }
    const remove = el('button', 'mood__remove');
    remove.type = 'button';
    remove.title = tr('Remove, with Undo');
    remove.setAttribute('aria-label', tr('Remove {0}', m.name));
    remove.innerHTML = icon('x');
    remove.addEventListener('click', e => { e.stopPropagation(); send('moods.remove', { id: m.id }); });
    art.append(remove);
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
    const state = Lampfish.state || {};
    const art = cover({ wallpaper: state.current, light: state.light, speed: state.speed, blur: state.blur, saturation: state.saturation, dim: state.dim }, tile);
    art.insertAdjacentHTML('beforeend', `<span class="mood__plus" aria-hidden="true">${icon('plus')}</span>`);
    const head = el('div', 'mood__head');
    head.append(el('h3', 'mood__name', tr('New theme')));
    const help = el('p', 'mood__help', tr('Saves the wallpaper, cursors and sounds'));
    tile.append(art, head, help);
    const ask = () => {
      naming = true;
      const form = el('form', 'mood__form');
      form.innerHTML = '<input maxlength="40" autocomplete="off"><button class="button button--accent" type="submit"></button>';
      const input = form.querySelector('input');
      input.placeholder = tr('Name this theme');
      input.setAttribute('aria-label', tr('Theme name'));
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
      tile.title = tr('Saves the current wallpaper, cursors and sounds as a theme');
      tile.addEventListener('click', () => { if (!naming) ask(); });
      tile.addEventListener('keydown', e => { if (!naming && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); ask(); } });
    }
    return tile;
  }

  function renderModels() {
    const list = $('mood-starters');
    const key = JSON.stringify(models) + '|' + (Lampfish.state ? Lampfish.state.wallpapers.map(w => w.name + '@' + w.stamp).join() : '');
    if (list.dataset.key === key) return;
    list.dataset.key = key;
    list.replaceChildren(...models.filter(m => MODELS[m.kind]).map(m => {
      const [name, help, symbol] = MODELS[m.kind];
      const b = el('button', 'starter');
      b.type = 'button';
      b.title = tr('Adds a theme built from the current setup');
      const art = cover(m, b);
      art.insertAdjacentHTML('beforeend', `<span class="mood__badge-icon">${modeIcon(symbol)}</span>`);
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

  function row(symbol, title, help, control) {
    const r = el('div', 'row');
    const caption = el('span', 'caption');
    caption.innerHTML = icon(symbol, 'glyph glyph--small');
    const text = el('span', '', title);
    if (help) text.append(Object.assign(el('small', '', help), { title: help }));
    caption.append(text);
    r.append(caption);
    if (control) r.append(control);
    return r;
  }

  function stacked(symbol, title, help, control) {
    const r = row(symbol, title, help);
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

  function chip(label, image, title, remove) {
    const c = el('button', 'chip mood__chip');
    c.type = 'button';
    c.title = title;
    if (image) c.append(appImage(image));
    c.append(el('span', '', label));
    c.insertAdjacentHTML('beforeend', icon(ICONS.close));
    c.addEventListener('click', remove);
    return c;
  }

  function rename(head, m) {
    const title = head.querySelector('.title');
    if (!title) return;
    const input = Object.assign(el('input', 'm-sheet__rename'), { maxLength: 40, value: m.name });
    input.setAttribute('aria-label', tr('Theme name'));
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
    const key = JSON.stringify(m) + '|' + (Lampfish.state ? Lampfish.state.wallpapers.map(w => w.name + '@' + w.stamp).join() : '');
    if (sheet.dataset.key === key) return;
    sheet.dataset.key = key;

    const head = el('div', 'm-sheet__head');
    head.innerHTML = `<button class="m-sheet__icon" type="button" aria-expanded="false">${modeIcon(m.icon)}</button><div><span class="title"></span><span class="path"></span></div>`;
    const picker = el('div', 'm-icons');
    picker.hidden = true;
    picker.setAttribute('role', 'radiogroup');
    picker.setAttribute('aria-label', tr('Icon'));
    for (const key of Object.keys(MODE_ICONS)) {
      const b = el('button', 'm-icons__one');
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(key === (m.icon || 'spark')));
      b.innerHTML = modeIcon(key);
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
      b.innerHTML = icon(ICONS[what]);
      b.addEventListener('click', () => what === 'close' ? close() : rename(head, m));
      head.append(b);
    }

    const art = cover(m, sheet);
    art.classList.add('mood__cover--sheet');
    const actions = el('div', 'm-sheet__actions');
    const apply = el('button', 'button button--accent', tr(m.current ? 'Applied' : 'Apply'));
    apply.disabled = m.current;
    apply.addEventListener('click', () => send('moods.apply', { id: m.id }));
    const update = el('button', 'button');
    update.innerHTML = icon('arrows-clockwise');
    update.append(tr('Update'));
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
    if (m.output != null) { const v = value(m.output || tr('Unchanged')); v.translate = false; brings.append(row(ICONS.output, tr('Audio output'), tr('When it is plugged in'), v)); }

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
      clear.innerHTML = icon(ICONS.close);
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
      app = el('button', 'button');
      app.innerHTML = icon('check');
      app.append(tr('Choose'));
      app.addEventListener('click', () => send('moods.app', { id: m.id }));
    }
    auto.append(stacked(ICONS.app, tr('When an app opens'), tr('Undone when the app closes'), app));
    const headset = el('label', 'toggle');
    headset.innerHTML = `<input type="checkbox"><span class="caption">${icon(ICONS.headset, 'glyph glyph--small')}<span></span></span>`;
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
      add.innerHTML = icon('plus');
      add.append(tr('Add'));
      add.addEventListener('click', () => send('moods.openAdd', { id: m.id }));
      list.append(add);
    }
    opens.append(stacked(ICONS.opens, tr('Apps or files'), tr('Opened each time the theme is applied'), list));

    const more = el('div', 'group');
    const action = (symbol, title, help, run, cls) => {
      const b = el('button', 'row action' + (cls ? ' ' + cls : ''));
      b.innerHTML = `<span class="caption">${icon(symbol, 'glyph glyph--small')}<span></span></span>`;
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
    const add = el('button', 'button button--accent');
    const cancel = el('button', 'button');
    add.innerHTML = icon('plus');
    add.append(tr('Add this theme'));
    cancel.innerHTML = icon('x');
    cancel.append(tr('Cancel'));
    add.addEventListener('click', () => { box.hidden = true; send('moods.add'); });
    cancel.addEventListener('click', () => { box.hidden = true; send('moods.cancel'); });
    actions.append(add, cancel);
    body.append(head, traits(m.mood), starts(m.mood), notes, actions);
    box.replaceChildren(art, body);
    box.hidden = false;
  }

  const RECIPE = {
    mouse: 'cursor',
    wave: 'waveform',
    play: 'play',
    clock: 'clock',
    headset: 'headphones',
    arrow: 'arrow-right',
  };
  const STEPS = [
    ['Set up', 'A wallpaper, cursors, sounds and effects'],
    ['Save', 'All of it, as one theme'],
    ['Bring back', 'In one click, or by itself at the right moment'],
  ];
  // The steps are drawn with what is set up right now: this wallpaper, this cursor, as one theme brought back by a trigger.
  function renderSteps() {
    const zone = $('mood-help'), s = Lampfish.state || {};
    const key = [s.current, s.light, s.speed, s.blur, s.saturation, s.dim, LANGUAGE].join('|');
    if (zone.dataset.key === key && zone.children.length) return;
    zone.dataset.key = key;
    const now = { wallpaper: s.current, light: s.light, speed: s.speed, blur: s.blur, saturation: s.saturation, dim: s.dim };
    const piece = (symbol, cls) => { const p = el('span', 'recipe__piece' + (cls ? ' ' + cls : '')); p.insertAdjacentHTML('beforeend', icon(symbol)); return p; };
    const setup = el('div', 'recipe__visual');
    setup.append(cover(now, el('div')), el('span', 'recipe__plus', '+'), piece(RECIPE.mouse), el('span', 'recipe__plus', '+'), piece(RECIPE.wave));
    const card = el('div', 'recipe__card');
    const name = el('span', 'recipe__name');
    name.insertAdjacentHTML('beforeend', modeIcon('moon'));
    name.append(el('span', '', tr('Night')));
    card.append(cover(now, el('div')), name);
    const saved = el('div', 'recipe__visual');
    saved.append(card);
    const back = el('div', 'recipe__visual');
    back.append(piece(RECIPE.play, 'recipe__piece--lit'), piece(RECIPE.clock), piece(RECIPE.headset));
    const visuals = [setup, saved, back];
    const parts = [];
    STEPS.forEach(([title, text], i) => {
      if (i) { const a = el('span', 'recipe__arrow'); a.insertAdjacentHTML('beforeend', icon(RECIPE.arrow)); parts.push(a); }
      const step = el('div', 'mode-step');
      step.innerHTML = `<span class="mode-step__what"><span class="mode-step__title"><b>${i + 1}</b><span></span></span><span class="mode-step__text"></span></span>`;
      step.querySelector('.mode-step__title span').textContent = tr(title);
      step.querySelector('.mode-step__text').textContent = tr(text);
      step.prepend(visuals[i]);
      parts.push(step);
    });
    zone.replaceChildren(...parts);
  }

  function render() {
    $('mood-count').textContent = moods.length || '';
    renderSteps();
    if (chosen && !moods.some(m => m.id === chosen)) chosen = null;
    const state = Lampfish.state || {};
    const key = JSON.stringify(moods) + '|' + [state.current, state.light, state.speed, state.blur, state.saturation, state.dim].join() + '|' + (state.wallpapers ? state.wallpapers.map(w => w.name + '@' + w.stamp).join() : '');
    if (key !== keyGrid && !naming) {
      keyGrid = key;
      zone.replaceChildren(...moods.map(card), newMode());
    }
    for (const c of zone.querySelectorAll('.mood[data-id]')) c.classList.toggle('open', c.dataset.id === chosen);
    renderModels();
    renderSheet();
    renderDock();
  }

  function renderDock() {
    const pick = $('dock-pick');
    if (document.body.dataset.dock !== 'modes') return;
    const key = JSON.stringify(moods.map(m => [m.id, m.name, m.icon, !!m.current])) + LANGUAGE;
    if (pick.dataset.key === key && pick.firstChild) return;
    pick.dataset.key = key;
    const group = el('div', 'group dock-modes');
    group.append(...moods.map(m => {
      const b = el('button', 'row action');
      b.type = 'button';
      b.setAttribute('aria-pressed', String(!!m.current));
      b.innerHTML = '<span class="caption">' + modeIcon(m.icon) + '<span translate="no"></span></span>';
      b.querySelector('[translate]').textContent = m.name;
      if (m.current) b.append(el('span', 'value', tr('Active')));
      else b.insertAdjacentHTML('beforeend', icon(ICONS.play, 'dock-modes__play'));
      b.title = m.current ? tr('Turn off') : tr('Apply');
      b.addEventListener('click', () => send(m.current ? 'moods.release' : 'moods.apply', { id: m.id }));
      return b;
    }));
    if (!moods.length) group.append(el('div', 'row empty', tr('No theme yet')));
    const actions = el('div', 'dock-actions');
    const add = el('button', 'button');
    add.innerHTML = icon('plus');
    add.append(tr('New theme'));
    add.addEventListener('click', () => startNew());
    actions.append(add);
    pick.replaceChildren(el('h2', null, tr('My themes')), group, actions);
    foldSections(pick, 'dock-modes');
  }

  function state(list) {
    moods = list;
    models = (Lampfish.state && Lampfish.state.moodModels) || [];
    render();
  }

  function event(m) {
    if (m.type === 'moods.preview') showImport(m);
  }

  // Save as a theme, from Home or the top of Themes: first what will be kept, then a name. The same save as the New theme tile.
  let saveBox = null;
  function closeSave() { if (saveBox) { saveBox.remove(); saveBox = null; } }
  function saveDialog(anchor) {
    if (saveBox && saveBox.isConnected) { closeSave(); return; }
    const s = Lampfish.state || {}, st = s.station, events = st ? st.events.filter(x => x.active).length : 0;
    const rows = [
      ['Wallpaper', s.current ? s.current.replace(/\.[a-z0-9]+$/i, '') : tr('None')],
      ['Cursors', s.mouse ? tr(s.mouse.themeTitle) : tr('Unchanged')],
      ['Sounds', !st || !st.active || st.silence ? tr('Sounds off') : events === 1 ? tr('1 event on') : tr('{0} events on', events)],
      ['React to sound', tr(s.reactive ? 'On' : 'Off')],
    ];
    saveBox = el('form', 'theme-save');
    saveBox.setAttribute('role', 'dialog');
    saveBox.append(el('b', '', tr('Save what you have now as a theme')));
    const input = el('input');
    input.placeholder = tr('Name of the theme');
    input.maxLength = 40;
    input.translate = false;
    saveBox.append(input);
    const list = el('ul');
    for (const [label, value] of rows) { const li = el('li', '', tr(label)); const v = el('span', '', value); v.translate = false; li.append(v); list.append(li); }
    saveBox.append(list);
    const actions = el('div', 'theme-save__actions');
    const cancel = el('button', 'button', tr('Cancel'));
    cancel.type = 'button';
    cancel.addEventListener('click', closeSave);
    const save = el('button', 'button button--accent');
    save.type = 'submit';
    save.innerHTML = icon('floppy-disk');
    save.append(tr('Save'));
    actions.append(cancel, save);
    saveBox.append(actions);
    saveBox.addEventListener('submit', e => { e.preventDefault(); const name = input.value.trim(); if (!name) { input.focus(); return; } send('moods.save', { name }); closeSave(); });
    document.body.append(saveBox);
    const r = anchor.getBoundingClientRect(), w = saveBox.offsetWidth, h = saveBox.offsetHeight;
    saveBox.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left)) + 'px';
    saveBox.style.top = (r.bottom + 8 + h <= innerHeight - 8 ? r.bottom + 8 : Math.max(8, r.top - h - 8)) + 'px';
    setTimeout(() => input.focus(), 30);
  }
  addEventListener('pointerdown', e => { if (saveBox && !saveBox.contains(e.target) && !e.target.closest('.theme-save-open')) closeSave(); }, true);
  addEventListener('keydown', e => { if (e.key === 'Escape' && saveBox) { e.stopPropagation(); closeSave(); } }, true);
  const saveButton = () => {
    const b = el('button', 'button theme-save-open');
    b.type = 'button';
    b.innerHTML = icon('floppy-disk');
    b.append(tr('Save as a theme'));
    b.addEventListener('click', () => saveDialog(b));
    return b;
  };
  document.querySelector('.view--modes h1').append(saveButton());

  function startNew() {
    showView('modes');
    naming = true;
    keyGrid = '';
    zone.replaceChildren(...moods.map(card), newMode());
  }

  $('mood-import').addEventListener('click', () => send('moods.import'));
  addEventListener('keydown', e => { if (e.key === 'Escape' && chosen && document.body.dataset.view === 'modes' && !(e.target.matches && e.target.matches('input:not([type="checkbox"]), select'))) close(); });

  Lampfish.moods = { state, event, startNew, saveButton, icon: modeIcon, renderDock, visible() { } };
})();
