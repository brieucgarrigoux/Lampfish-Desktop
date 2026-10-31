'use strict';

(function () {
  let devices = null, info = {}, shown = false;
  const meters = new Map(), tiles = new Map(), opened = {};
  const GLYPHS = {
    speakers: '<rect x="6" y="3.5" width="12" height="17" rx="2.5"/><circle cx="12" cy="14" r="3"/><circle cx="12" cy="7.5" r=".8"/>',
    headphones: '<path d="M4.5 15.5V12a7.5 7.5 0 0 1 15 0v3.5"/><rect x="3.5" y="14" width="4" height="6" rx="1.5"/><rect x="16.5" y="14" width="4" height="6" rx="1.5"/>',
    headset: '<path d="M4.5 15.5V12a7.5 7.5 0 0 1 15 0v3.5"/><rect x="3.5" y="14" width="4" height="6" rx="1.5"/><rect x="16.5" y="14" width="4" height="6" rx="1.5"/><path d="M5.5 20c1.6 1 4 1.2 6.5 1.2"/>',
    microphone: '<rect x="9" y="3.5" width="6" height="10.5" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5v3"/>',
    screen: '<rect x="3.5" y="4.5" width="17" height="11.5" rx="1.8"/><path d="M9 20h6M12 16v4"/>',
    digital: '<path d="M9 3.5v4M15 3.5v4M7 7.5h10v3a5 5 0 0 1-10 0zM12 15.5v5"/>',
    line: '<path d="M9 3.5v4M15 3.5v4M7 7.5h10v3a5 5 0 0 1-10 0zM12 15.5v5"/>',
  };
  const SOUND = '<path d="M4 10v4h3.5l4.5 3.5v-11L7.5 10z"/><path d="M15.5 9.2a4 4 0 0 1 0 5.6"/>';
  const SILENT = '<path d="M4 10v4h3.5l4.5 3.5v-11L7.5 10z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/>';
  const MIC = '<rect x="9" y="3.5" width="6" height="10.5" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5v3"/>';
  const MIC_OFF = MIC + '<path d="m4 4 16 16"/>';

  const format = d => d.rate ? tr('{0} kHz, {1} bits', (d.rate / 1000).toLocaleString(LOCALE, { maximumFractionDigits: 1 }), d.bits) : '';

  function tile(d) {
    const el = document.createElement('div');
    el.className = 'a-tile';
    el.dataset.id = d.id;
    el.innerHTML = `<button type="button" class="a-pick"><span class="a-top"><svg class="a-icon" viewBox="0 0 24 24" aria-hidden="true">${GLYPHS[d.kind] || GLYPHS.speakers}</svg><span class="a-state state" hidden></span></span>`
      + '<span class="a-what"><span class="a-name" translate="no"></span><span class="a-adapter" translate="no"></span><span class="a-format"></span></span><span class="a-meter"><i></i></span></button>';
    el.querySelector('.a-name').textContent = el.querySelector('.a-name').title = d.name;
    el.querySelector('.a-adapter').textContent = el.querySelector('.a-adapter').title = d.adapter;
    el.querySelector('.a-format').textContent = d.active ? format(d) : tr(d.disabled ? 'Disabled' : 'Unplugged');
    const pick = el.querySelector('.a-pick'), state = el.querySelector('.a-state');
    el.classList.toggle('is-default', d.isDefault);
    el.classList.toggle('is-off', !d.active);
    pick.disabled = !d.active;
    pick.setAttribute('aria-pressed', String(d.isDefault));
    if (d.isDefault) { state.hidden = false; state.textContent = tr('Default'); }
    if (d.active && !d.isDefault) pick.title = tr('Click to make it the default for every app');
    pick.addEventListener('click', () => { if (d.active && !d.isDefault) send('audio.use', { id: d.id }); });
    if (d.active) meters.set(d.id, el.querySelector('.a-meter i'));
    else el.querySelector('.a-meter').hidden = true;
    if (d.volume != null) {
      const row = document.createElement('div');
      row.className = 'a-volume';
      row.innerHTML = '<button type="button" class="a-mute"><svg viewBox="0 0 24 24" aria-hidden="true"></svg></button><input type="range" min="0" max="100" step="1"><output></output>';
      const range = row.querySelector('input'), output = row.querySelector('output'), mute = row.querySelector('.a-mute');
      range.setAttribute('aria-label', tr('Volume of {0}', d.name));
      const live = throttle(() => send('audio.deviceVolume', { id: d.id, value: Number(range.value), live: true }), 80);
      range.addEventListener('input', () => { output.textContent = range.value; fill(range); live(); });
      range.addEventListener('change', () => send('audio.deviceVolume', { id: d.id, value: Number(range.value) }));
      mute.addEventListener('click', () => send('audio.deviceMute', { id: d.id, on: mute.getAttribute('aria-pressed') !== 'true' }));
      el.append(row);
    }
    update(el, d);
    tiles.set(d.id, el);
    return el;
  }

  function grid(list) {
    const g = document.createElement('div');
    g.className = 'a-grid';
    g.append(...list.map(tile));
    return g;
  }

  function update(el, d) {
    const row = el.querySelector('.a-volume');
    if (!row || d.volume == null) return;
    const range = row.querySelector('input'), mute = row.querySelector('.a-mute');
    if (document.activeElement !== range) range.value = d.volume;
    row.querySelector('output').textContent = range.value;
    range.classList.toggle('is-muted', d.muted);
    fill(range);
    mute.setAttribute('aria-pressed', String(d.muted));
    const label = tr(d.muted ? (d.output ? 'Sound on' : 'Microphone on') : (d.output ? 'Mute' : 'Mute the microphone'));
    mute.title = label;
    mute.setAttribute('aria-label', label);
    mute.firstChild.innerHTML = d.output ? (d.muted ? SILENT : SOUND) : (d.muted ? MIC_OFF : MIC);
  }

  function render() {
    if (!devices) return;
    for (const [zone, output] of [[$('a-outputs'), true], [$('a-inputs'), false]]) {
      const list = devices.filter(d => d.output === output);
      const key = JSON.stringify([list.map(d => [d.id, d.name, d.adapter, d.kind, d.active, d.disabled, d.isDefault, d.rate, d.bits, d.volume == null]), LANGUAGE]);
      if (zone.dataset.key !== key) {
        zone.dataset.key = key;
        const focused = zone.contains(document.activeElement) ? document.activeElement.closest('.a-tile') : null;
        list.forEach(d => { meters.delete(d.id); tiles.delete(d.id); });
        const on = list.filter(d => d.active), off = list.filter(d => !d.active), nodes = [];
        if (on.length) nodes.push(grid(on));
        else nodes.push(Object.assign(document.createElement('div'), { className: 'waiting', textContent: tr(output ? 'No output plugged in' : 'No microphone plugged in') }));
        if (off.length) {
          const more = document.createElement('details');
          more.className = 'a-more';
          more.open = !!opened[output];
          more.innerHTML = '<summary><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg><span></span></summary>';
          more.querySelector('span').textContent = tr('Not connected ({0})', off.length);
          more.addEventListener('toggle', () => { opened[output] = more.open; });
          more.append(grid(off));
          nodes.push(more);
        }
        zone.replaceChildren(...nodes);
        const again = focused && tiles.get(focused.dataset.id);
        if (again) again.querySelector('.a-pick').focus();
      } else list.forEach(d => { const el = tiles.get(d.id); if (el) update(el, d); });
    }
    $('a-shortcut').checked = !!info.shortcut;
    keys.show(info.label || 'Ctrl + Alt + F11', info.error);
  }

  function event(m) {
    if (m.type === 'audio.levels') {
      m.ids.forEach((id, i) => {
        const bar = meters.get(id);
        if (bar) bar.style.transform = `scaleX(${Math.min(1, Math.sqrt(m.levels[i])).toFixed(3)})`;
      });
      return;
    }
    devices = m.devices;
    info = m;
    render();
  }

  function visible(yes) {
    if (yes === shown) return;
    shown = yes;
    send('audio.watch', { on: yes });
    if (!yes) keys.stop();
  }

  const keys = shortcutKeys($('a-keys'), $('a-keys-help'), k => send('audio.shortcutKeys', k));
  $('a-shortcut').addEventListener('change', e => send('audio.shortcut', { on: e.target.checked }));
  $('a-settings').addEventListener('click', () => send('audio.settings'));

  Lampfish.audio = { event, visible };
})();
