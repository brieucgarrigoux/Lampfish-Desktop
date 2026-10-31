'use strict';

// The welcome: three short screens, skippable at any time, shown once on a PC where lampfish never ran.
(function () {
  const box = $('welcome'), steps = [...box.querySelectorAll('.welcome__step')], dots = [...box.querySelectorAll('.welcome__dots i')];
  let step = 0, open = false, wallsKey = '', before = null;

  const LINES = { personalization: 'Wallpaper, themes, icons, cursors and sounds', desktop: 'Screens, audio, taskbar and desktop icons', workspace: 'Notes, files, captures and conversions', pc: 'Health, programs, storage, hardware and network' };
  function families() {
    const zone = $('welcome-families');
    if (zone.children.length) return;
    for (const section of document.querySelectorAll('.rail .rail-family')) {
      const family = document.createElement('div');
      family.className = 'welcome__family';
      family.innerHTML = '<strong></strong><small></small><span class="welcome__icons"></span>';
      family.querySelector('strong').textContent = tr(section.querySelector('.rail-title').textContent.trim());
      family.querySelector('small').textContent = tr(LINES[section.dataset.group] || '');
      zone.append(family);
      for (const el of section.querySelectorAll('.service[data-view]')) {
        const icon = el.querySelector('svg').cloneNode(true);
        const name = el.textContent.trim();
        icon.setAttribute('aria-hidden', 'true');
        const item = document.createElement('span');
        item.title = tr(name);
        item.append(icon);
        family.querySelector('.welcome__icons').append(item);
      }
    }
  }

  function walls(state) {
    const zone = $('welcome-walls'), list = (state.wallpapers || []).filter(w => w.bundled);
    const key = list.map(w => w.name + '@' + w.stamp).join('|');
    if (key !== wallsKey) {
      wallsKey = key;
      zone.replaceChildren(...list.map(w => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'welcome__wall';
        card.dataset.name = w.name;
        card.innerHTML = '<span class="preview"></span><span class="welcome__wall-name" translate="no"></span>';
        card.querySelector('.welcome__wall-name').textContent = withoutExtension(w.name);
        card.querySelector('.preview').append(preview(w, card));
        card.addEventListener('click', () => send('choose', { name: w.name, screen: null }));
        return card;
      }));
    }
    for (const card of zone.children) card.setAttribute('aria-pressed', String(card.dataset.name === state.current));
  }

  function go(n) {
    step = Math.max(0, Math.min(steps.length - 1, n));
    steps.forEach((s, i) => { s.hidden = i !== step; });
    dots.forEach((d, i) => d.classList.toggle('on', i <= step));
    $('welcome-back').hidden = step === 0;
    $('welcome-next').textContent = tr(step === steps.length - 1 ? 'Start' : 'Next');
    $('welcome-next').focus();
  }

  function finish() {
    if (!open) return;
    open = false;
    box.hidden = true;
    send('welcome.done');
    if (before && before.isConnected) before.focus();
  }

  function state(s) {
    const w = s.welcome || {};
    $('welcome-startup').checked = !!s.startup;
    $('welcome-updates').checked = !!(s.updates && s.updates.auto);
    $('welcome-weather').checked = !!s.weather;
    if (s.companion) $('welcome-companion').checked = s.companion.on;
    if (!w.show) { if (open) { open = false; box.hidden = true; } return; }
    walls(s);
    if (open) return;
    open = true;
    before = document.activeElement;
    families();
    box.hidden = false;
    // Proposed on: the switch says so, and Start or Skip keeps the companion as shown.
    if (s.companion && !s.companion.on) send('companion.set', { on: true });
    go(0);
  }

  $('welcome-next').addEventListener('click', () => { if (step === steps.length - 1) finish(); else go(step + 1); });
  $('welcome-back').addEventListener('click', () => go(step - 1));
  $('welcome-skip').addEventListener('click', finish);
  // Each switch sends the action Settings sends, so both always agree.
  $('welcome-startup').addEventListener('change', e => { if (e.target.checked !== !!Lampfish.state.startup) send('startup'); });
  $('welcome-updates').addEventListener('change', e => send('updates.auto', { value: e.target.checked }));
  $('welcome-companion').addEventListener('change', e => send('companion.set', { on: e.target.checked }));
  $('welcome-weather').addEventListener('change', e => { if (e.target.checked !== !!Lampfish.state.weather) { send('weather'); send('home.weather'); } });
  // The focus stays inside the welcome while it is open; Escape skips it.
  box.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(); return; }
    if (e.key !== 'Tab') return;
    const items = [...box.querySelectorAll('button, input, [tabindex]:not([tabindex="-1"])')].filter(x => x.offsetParent && !x.disabled);
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  // First steps on Home: each line ticks itself from what lampfish already knows.
  const STEPS = [
    ['wallpaper', 'Pick a wallpaper', s => (s.welcome.seen || []).includes('wallpaper') || s.current !== 'lampfish-logo.html'],
    ['health', 'Check the health of the PC', s => (s.welcome.seen || []).includes('health')],
    ['modes', 'Save your setup as a theme', s => (s.moods || []).length > 0],
    ['arrange', 'Arrange the desktop icons', s => (s.welcome.seen || []).includes('arrange') || !!(s.arrange && s.arrange.layouts && s.arrange.layouts.length)],
    ['customize', 'Choose the cards of Home', s => !!(s.layout && (s.layout.Tiles || s.layout.Blocks))],
  ];
  let stepsKey = '';
  // Once, for someone who used lampfish before the companion: a line on Home to turn it on.
  function companionNote(s) {
    const show = !!(s.welcome && s.welcome.companionNote && s.companion && !s.companion.on);
    $('h-new').hidden = !show;
  }
  $('h-new-on').addEventListener('click', () => { send('companion.set', { on: true }); send('welcome.note'); });
  $('h-new-close').addEventListener('click', () => send('welcome.note'));

  function firstSteps(s) {
    const zone = $('h-steps');
    if (!s.welcome || !s.welcome.steps || s.welcome.show) { zone.hidden = true; stepsKey = ''; return; }
    const done = STEPS.map(x => !!x[2](s));
    const count = done.filter(Boolean).length;
    if (count === STEPS.length) { zone.hidden = true; send('welcome.hide', { quiet: true }); return; }
    const key = done.join() + LANGUAGE;
    zone.hidden = false;
    if (key === stepsKey) return;
    stepsKey = key;
    zone.innerHTML = '<div class="h-steps__head"><h2></h2><span class="h-steps__count"></span><button type="button" class="link h-steps__hide"></button></div><div class="h-steps__list"></div>';
    zone.querySelector('h2').textContent = tr('First steps');
    zone.querySelector('.h-steps__count').textContent = tr('{0} of {1}', count, STEPS.length);
    const hide = zone.querySelector('.h-steps__hide');
    hide.textContent = tr('Hide');
    hide.addEventListener('click', () => send('welcome.hide'));
    zone.querySelector('.h-steps__list').append(...STEPS.map(([view, text], i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'h-step' + (done[i] ? ' is-done' : '');
      b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle class="h-step__ring" cx="12" cy="12" r="8.5"/><path class="h-step__tick" d="m8 12.5 2.8 2.8L16.5 9.5"/></svg><span></span>';
      b.querySelector('span').textContent = tr(text);
      b.setAttribute('aria-pressed', String(done[i]));
      b.addEventListener('click', () => { if (view === 'customize') $('h-customize').click(); else showView(view); });
      return b;
    }));
  }

  // Opening a service counts for its step only while the steps are shown.
  function viewed(view) {
    const s = Lampfish.state;
    if (s && s.welcome && s.welcome.steps && ['wallpaper', 'health', 'arrange'].includes(view) && !(s.welcome.seen || []).includes(view)) send('welcome.seen', { view });
  }

  Lampfish.welcome = { state: s => { state(s); firstSteps(s); companionNote(s); }, viewed };
})();
