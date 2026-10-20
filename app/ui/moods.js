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

  function card(m) {
    const el = document.createElement('article');
    el.className = 'mood' + (m.current ? ' current' : '');
    el.innerHTML = `
      <div class="mood__head"><h3 class="mood__name" title="Double-click to rename"></h3><span class="mood__badge"></span></div>
      <ul class="mood__facts"></ul>
      <div class="mood__auto">
        <label class="mood__time"><span data-what="time"></span><input type="time" aria-label="Start time"></label>
        <label class="mood__time"><span data-what="screens"></span><select data-what="screens" aria-label="Number of screens"></select></label>
        <label class="mood__time"><span data-what="power"></span><select data-what="power" aria-label="Power"></select></label>
      </div>
      <div class="mood__actions"><button class="button button--accent" data-do="apply"></button><button class="button" data-do="update"></button><button class="link" data-do="export"></button><button class="link" data-do="remove"></button></div>`;
    const name = el.querySelector('.mood__name');
    name.textContent = m.name;
    el.querySelector('.mood__badge').textContent = m.current ? tr('Active') : '';
    el.querySelector('.mood__facts').append(...facts(m));
    el.querySelector('[data-what="time"]').textContent = tr('Starts every day at');
    const time = el.querySelector('input');
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
    add.textContent = tr('Add this mood');
    cancel.textContent = tr('Cancel');
    add.addEventListener('click', () => { box.hidden = true; send('moods.add'); });
    cancel.addEventListener('click', () => { box.hidden = true; send('moods.cancel'); });
    box.hidden = false;
  }

  function render() {
    $('mood-count').textContent = moods.length || '';
    $('mood-help').textContent = moods.length ? tr('One click applies the wallpaper, cursors and sounds') : tr('Nothing saved yet. Set things up the way you like, then save them here.');
    zone.replaceChildren(...moods.map(card));
    zone.hidden = moods.length === 0;
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

  const grid = $('grid'), panel = $('wp-moods'), folder = $('folder');
  let tab = 'library';
  try { tab = localStorage.getItem('wallpaper.tab') === 'moods' ? 'moods' : 'library'; } catch (e) { }
  function showTab() {
    for (const b of $('wp-tabs').children) {
      b.setAttribute('aria-selected', String(b.dataset.tab === tab));
      b.setAttribute('aria-checked', String(b.dataset.tab === tab));
    }
    grid.hidden = tab !== 'library';
    folder.hidden = tab !== 'library';
    panel.hidden = tab !== 'moods';
  }
  for (const b of $('wp-tabs').children) b.addEventListener('click', () => {
    tab = b.dataset.tab;
    try { localStorage.setItem('wallpaper.tab', tab); } catch (e) { }
    showTab();
  });
  showTab();

  Bramble.moods = { state, event, visible() { }, showTab: t => { tab = t; showTab(); } };
})();
