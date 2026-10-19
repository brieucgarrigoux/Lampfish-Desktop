'use strict';

(function () {
  const zone = $('moods');
  let moods = [], confirming = '', confirmTimer = 0;

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

  function card(m) {
    const el = document.createElement('article');
    el.className = 'mood' + (m.current ? ' current' : '');
    el.innerHTML = `<span class="reticle"></span>
      <div class="mood__head"><h3 class="mood__name" title="Double-click to rename"></h3><span class="mood__badge"></span></div>
      <ul class="mood__facts"></ul>
      <label class="mood__time"><span></span><input type="time" aria-label="Start time"></label>
      <div class="mood__actions"><button class="button button--accent" data-do="apply"></button><button class="button" data-do="update"></button><button class="link" data-do="remove"></button></div>`;
    const name = el.querySelector('.mood__name');
    name.textContent = m.name;
    el.querySelector('.mood__badge').textContent = m.current ? tr('Active') : '';
    const facts = el.querySelector('.mood__facts');
    facts.append(
      fact(tr('Wallpaper: {0}', m.wallpaper ? m.wallpaper.replace(/\.[^.]+$/, '') : tr('none'))),
      fact(m.dim > 0 ? tr('Dimmed {0} %', m.dim) : tr('Not dimmed')),
      fact(m.theme ? tr('Cursors: {0}', m.theme) : tr('Cursors unchanged')),
      fact(tr(SOUNDS[m.sounds]) + (m.sounds === 'on' ? ` · ${m.volume} %` : '')),
    );
    el.querySelector('.mood__time span').textContent = tr('Starts every day at');
    const time = el.querySelector('input');
    time.value = m.time || '';
    time.addEventListener('change', () => send('moods.time', { id: m.id, value: time.value }));
    const [apply, update, remove] = el.querySelectorAll('[data-do]');
    apply.textContent = m.current ? tr('Applied') : tr('Apply');
    apply.disabled = m.current;
    update.textContent = tr('Update');
    update.title = tr('Replace it with the current setup');
    remove.textContent = confirming === m.id ? tr('Confirm') : tr('Remove');
    remove.classList.toggle('confirm', confirming === m.id);
    apply.addEventListener('click', () => send('moods.apply', { id: m.id }));
    update.addEventListener('click', () => send('moods.update', { id: m.id }));
    remove.addEventListener('click', () => {
      clearTimeout(confirmTimer);
      if (confirming === m.id) { confirming = ''; send('moods.remove', { id: m.id }); return; }
      confirming = m.id;
      confirmTimer = setTimeout(() => { confirming = ''; render(); }, 3500);
      render();
    });
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

  function render() {
    $('mood-count').textContent = moods.length || '';
    $('mood-help').textContent = moods.length ? tr('One click applies the wallpaper, cursors and sounds') : tr('Nothing saved yet');
    zone.replaceChildren(...moods.map(card));
    zone.hidden = moods.length === 0;
  }

  function state(list) {
    moods = list;
    render();
  }

  $('mood-form').addEventListener('submit', e => {
    e.preventDefault();
    send('moods.save', { name: $('mood-name').value });
    $('mood-name').value = '';
  });

  Bramble.moods = { state, visible() { } };
})();
