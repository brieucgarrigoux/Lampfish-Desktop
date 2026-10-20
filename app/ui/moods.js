'use strict';

(function () {
  const zone = $('moods');
  let moods = [];

  const STARTERS = [
    ['night', 'Night', 'Dimmer wallpaper, softer sounds'],
    ['focus', 'Focus', 'Calmer wallpaper, sounds silenced'],
    ['cinema', 'Cinema', 'Dark wallpaper, sounds silenced'],
  ];
  const SOUNDS = { on: 'Sounds on', silent: 'Sounds silenced', off: 'Sounds off' };

  const starters = $('mood-starters');
  for (const [kind, name, help] of STARTERS) {
    const b = document.createElement('button');
    b.className = 'starter';
    b.innerHTML = '<span class="starter__name"></span><span class="starter__help"></span>';
    b.querySelector('.starter__name').textContent = tr(name);
    b.querySelector('.starter__help').textContent = tr(help);
    b.addEventListener('click', () => send('moods.starter', { kind }));
    starters.append(b);
  }

  function fact(text) {
    const li = document.createElement('li');
    li.textContent = text;
    return li;
  }

  function facts(m) {
    return [
      fact(tr('Wallpaper: {0}', m.wallpaper ? m.wallpaper.replace(/\.[^.]+$/, '') : tr('none'))),
      fact(m.dim > 0 ? tr('Dimmed {0} %', m.dim) : tr('Not dimmed')),
      fact(m.theme ? tr('Cursors: {0}', m.theme) : tr('Cursors unchanged')),
      fact(tr(SOUNDS[m.sounds]) + (m.sounds === 'on' ? ` · ${m.volume} %` : '')),
    ];
  }

  function option(select, value, text) {
    const o = document.createElement('option');
    o.value = value;
    o.textContent = text;
    select.append(o);
  }

  const expanded = new Set();
  const CHEVRON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';

  function triggers(m) {
    const parts = [];
    if (m.time) parts.push(tr('every day at {0}', m.time));
    if (m.screens) parts.push(m.screens === 1 ? tr('with 1 screen') : tr('with {0} screens', m.screens));
    if (m.power) parts.push(tr(m.power === 'mains' ? 'on mains power' : 'on battery'));
    if (m.app) parts.push(tr('with {0}', m.app));
    if (m.headset) parts.push(tr('with headphones'));
    const starts = parts.length ? tr('Starts {0}', parts.join(', ')) : tr('Starts by hand only');
    return m.opens && m.opens.length ? starts + ' · ' + tr('Opens {0}', m.opens.join(', ')) : starts;
  }

  function card(m) {
    const el = document.createElement('article');
    el.className = 'mood' + (m.current ? ' current' : '');
    el.innerHTML = `
      <div class="mood__head"><h3 class="mood__name" title="Double-click to rename"></h3><span class="mood__badge"></span></div>
      <ul class="mood__facts"></ul>
      <button class="mood__summary" aria-expanded="false"><span></span>${CHEVRON}</button>
      <div class="mood__auto" hidden>
        <label class="mood__time"><span data-what="time"></span><input type="time" aria-label="Start time"></label>
        <label class="mood__time"><span data-what="screens"></span><select data-what="screens" aria-label="Number of screens"></select></label>
        <label class="mood__time"><span data-what="power"></span><select data-what="power" aria-label="Power"></select></label>
        <div class="mood__time" data-row="app"><span data-what="app"></span><span class="mood__pick"></span></div>
        <label class="mood__time" data-row="headset"><span data-what="headset"></span><span class="toggler"><input type="checkbox" data-what="headset"></span></label>
        <div class="mood__time mood__opens" data-row="opens"><span data-what="opens"></span><span class="mood__chips"></span></div>
      </div>
      <div class="mood__actions"><button class="button button--accent" data-do="apply"></button><button class="button" data-do="update"></button><button class="link" data-do="export"></button><button class="link" data-do="remove"></button></div>`;
    const name = el.querySelector('.mood__name');
    name.textContent = m.name;
    el.querySelector('.mood__badge').textContent = m.current ? tr('Active') : '';
    el.querySelector('.mood__facts').append(...facts(m));

    const summary = el.querySelector('.mood__summary'), auto = el.querySelector('.mood__auto');
    summary.firstElementChild.textContent = triggers(m);
    summary.title = triggers(m);
    const open = expanded.has(m.id);
    auto.hidden = !open;
    summary.setAttribute('aria-expanded', String(open));
    summary.addEventListener('click', () => {
      if (expanded.has(m.id)) expanded.delete(m.id); else expanded.add(m.id);
      render();
    });

    el.querySelector('[data-what="time"]').textContent = tr('Starts every day at');
    const time = el.querySelector('input[type="time"]');
    time.value = m.time || '';
    time.addEventListener('change', () => send('moods.time', { id: m.id, value: time.value }));
    el.querySelector('span[data-what="screens"]').textContent = tr('Starts with');
    const screens = el.querySelector('select[data-what="screens"]');
    for (const n of [0, 1, 2, 3, 4]) option(screens, n, n === 0 ? tr('Never') : n === 1 ? tr('1 screen') : tr('{0} screens', n));
    screens.value = m.screens || 0;
    screens.addEventListener('change', () => send('moods.screens', { id: m.id, value: Number(screens.value) }));
    el.querySelector('span[data-what="power"]').textContent = tr('Starts on');
    const power = el.querySelector('select[data-what="power"]');
    option(power, '', tr('Never'));
    option(power, 'mains', tr('Mains power'));
    option(power, 'battery', tr('Battery'));
    power.value = m.power || '';
    power.addEventListener('change', () => send('moods.power', { id: m.id, value: power.value }));

    el.querySelector('[data-what="app"]').textContent = tr('Starts with the app');
    el.querySelector('[data-row="app"]').title = tr('The previous setup comes back when the app closes');
    const pick = el.querySelector('.mood__pick');
    if (m.app) {
      const chip = document.createElement('button');
      chip.className = 'chip mood__chip';
      chip.innerHTML = '<span></span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg>';
      chip.firstChild.textContent = m.app;
      chip.title = tr('Remove');
      chip.addEventListener('click', () => send('moods.appClear', { id: m.id }));
      pick.append(chip);
    } else {
      const choose = document.createElement('button');
      choose.className = 'link';
      choose.textContent = tr('Choose');
      choose.addEventListener('click', () => send('moods.app', { id: m.id }));
      pick.append(choose);
    }

    el.querySelector('span[data-what="headset"]').textContent = tr('Starts with headphones');
    el.querySelector('[data-row="headset"]').title = tr('The previous setup comes back when the headphones are removed');
    const headset = el.querySelector('input[data-what="headset"]');
    headset.checked = !!m.headset;
    headset.addEventListener('change', () => send('moods.headset', { id: m.id, value: headset.checked }));

    el.querySelector('[data-what="opens"]').textContent = tr('Opens');
    const chips = el.querySelector('.mood__chips');
    (m.opens || []).forEach((label, i) => {
      const chip = document.createElement('button');
      chip.className = 'chip mood__chip';
      chip.innerHTML = '<span></span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg>';
      chip.firstChild.textContent = label;
      chip.title = tr('Remove');
      chip.addEventListener('click', () => send('moods.openRemove', { id: m.id, index: i }));
      chips.append(chip);
    });
    if (!m.opens || m.opens.length < 8) {
      const add = document.createElement('button');
      add.className = 'link';
      add.textContent = tr('Add');
      add.addEventListener('click', () => send('moods.openAdd', { id: m.id }));
      chips.append(add);
    }

    const [apply, update, exporter, remove] = el.querySelectorAll('[data-do]');
    apply.textContent = m.current ? tr('Applied') : tr('Apply');
    apply.disabled = m.current;
    update.textContent = tr('Update');
    update.title = tr('Replace it with the current setup');
    exporter.textContent = tr('Export');
    exporter.title = tr('Saves it as a file to share or keep');
    remove.textContent = tr('Remove');
    apply.addEventListener('click', () => send('moods.apply', { id: m.id }));
    update.addEventListener('click', () => send('moods.update', { id: m.id }));
    exporter.addEventListener('click', () => send('moods.export', { id: m.id }));
    remove.addEventListener('click', () => send('moods.remove', { id: m.id }));
    name.addEventListener('dblclick', () => {
      const input = document.createElement('input');
      input.className = 'mood__rename';
      input.maxLength = 40;
      input.value = m.name;
      name.replaceWith(input);
      input.focus();
      input.select();
      const done = save => {
        if (save && input.value.trim() && input.value.trim() !== m.name) send('moods.rename', { id: m.id, name: input.value });
        else render();
      };
      input.addEventListener('keydown', e => { if (e.key === 'Enter') done(true); else if (e.key === 'Escape') done(false); });
      input.addEventListener('blur', () => done(true));
    });
    return el;
  }

  function preview(m) {
    const box = $('mood-preview');
    const warnings = [];
    if (m.missingWallpaper) warnings.push(tr('Its wallpaper is not on this PC: the current one is kept'));
    if (m.missingTheme) warnings.push(tr('Its cursor theme is not on this PC: cursors stay as they are'));
    box.innerHTML = `<div class="mood-preview__head"><span class="mood-preview__title"></span><span class="mood__badge"></span></div>
      <ul class="mood__facts"></ul><ul class="mood-preview__warnings"></ul>
      <div class="mood__actions"><button class="button button--accent" data-do="add"></button><button class="button" data-do="cancel"></button></div>`;
    box.querySelector('.mood-preview__title').textContent = tr('Import “{0}”', m.mood.name);
    box.querySelector('.mood__badge').textContent = tr('Preview');
    box.querySelector('.mood__facts').append(...facts(m.mood));
    box.querySelector('.mood-preview__warnings').append(...warnings.map(fact));
    const [add, cancel] = box.querySelectorAll('[data-do]');
    add.textContent = tr('Add this mode');
    cancel.textContent = tr('Cancel');
    add.addEventListener('click', () => { box.hidden = true; send('moods.add'); });
    cancel.addEventListener('click', () => { box.hidden = true; send('moods.cancel'); });
    box.hidden = false;
  }

  function render() {
    $('mood-count').textContent = moods.length || '';
    $('mood-help').textContent = moods.length ? tr('A mode brings back a wallpaper, cursors and sounds in one click, or by itself at the right moment') : tr('Set everything up, then save it as a mode to bring it back in one click');
    zone.replaceChildren(...moods.map(card));
    zone.hidden = $('moods-title').hidden = moods.length === 0;
  }

  function state(list) {
    moods = list;
    render();
  }

  function event(m) {
    if (m.type === 'moods.preview') preview(m);
  }

  $('mood-form').addEventListener('submit', e => {
    e.preventDefault();
    send('moods.save', { name: $('mood-name').value });
    $('mood-name').value = '';
  });
  $('mood-import').addEventListener('click', () => send('moods.import'));

  Bramble.moods = { state, event };
})();
