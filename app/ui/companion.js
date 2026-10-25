'use strict';

(function () {
  let data = null, tab = 'dashboard', audio = null;
  const UNITS = ['bytes', 'KB', 'MB', 'GB', 'TB'];
  const size = n => { let i = 0; while (n >= 1024 && i < UNITS.length - 1) { n /= 1024; i++; } return n.toLocaleString(LOCALE, { maximumFractionDigits: n >= 100 || i === 0 ? 0 : 1 }) + ' ' + tr(UNITS[i]); };
  const GO = {
    dashboard: ['Open Home in lampfish', 'home'], note: ['Open Notes in lampfish', 'notes'], capture: ['Open Shelf in lampfish', 'shelf'],
    shelf: ['Open Shelf in lampfish', 'shelf'], audio: ['Open Audio in lampfish', 'audio'], notes: ['Open Notes in lampfish', 'notes'],
  };

  function show(name, tell) {
    tab = name;
    for (const b of document.querySelectorAll('[data-tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === name));
    for (const p of document.querySelectorAll('[data-pane]')) p.hidden = p.dataset.pane !== name;
    $('c-go').textContent = tr(GO[name][0]);
    if (tell) send('companion.tab', { tab: name });
    if (name === 'note') setTimeout(() => $('c-text').focus(), 30);
    if (name === 'notes') setTimeout(() => $('c-find').focus(), 30);
    render();
  }

  function clock() {
    const now = new Date();
    $('c-clock').textContent = now.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
    $('c-date').textContent = now.toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });
  }

  const GLYPHS = {
    theme: '<path d="M19.5 14.6A7.6 7.6 0 0 1 9.4 4.5a7.6 7.6 0 1 0 10.1 10.1z"/>',
    output: '<path d="M4 10v4h3.5l4.5 3.5v-11L7.5 10z"/><path d="M15.5 9.2a4 4 0 0 1 0 5.6"/>',
    busiest: '<rect x="4" y="5" width="16" height="14" rx="2.5"/><path d="M7 13h2.5l1.5-4 3 7 1.5-3H17"/>',
    disk: '<path d="M3.5 7.5V17a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2V9.5a2 2 0 0 0-2-2h-6.2l-2-2.5H5.5a2 2 0 0 0-2 2z"/>',
    note: '<path d="M16.5 8V5a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 5v14A1.5 1.5 0 0 0 6 20.5h4.5"/><path d="M8 8h5M8 11.5h3.5"/><path d="m13.5 20.5.5-2.5 5.5-5.5a1.5 1.5 0 0 1 2 2L16 20z"/>',
    file: '<path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10A.5.5 0 0 1 7 20z"/><path d="M14 3.5V8h4"/>',
    speakers: '<rect x="6" y="3.5" width="12" height="17" rx="2.5"/><circle cx="12" cy="14.5" r="2.7"/><circle cx="12" cy="8" r="1"/>',
    screen: '<rect x="3.5" y="4.5" width="17" height="12" rx="1.5"/><path d="M9 20h6M12 16.5V20"/>',
    headset: '<path d="M4.5 14v-2a7.5 7.5 0 0 1 15 0v2"/><rect x="3.5" y="13.5" width="4" height="6" rx="1.5"/><rect x="16.5" y="13.5" width="4" height="6" rx="1.5"/>',
    copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>',
    reveal: '<path d="M3.5 7.5V17a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2V9.5a2 2 0 0 0-2-2h-6.2l-2-2.5H5.5a2 2 0 0 0-2 2z"/>',
    chevron: '<path d="m9 6 6 6-6 6"/>',
  };
  const glyph = name => `<svg class="glyph" viewBox="0 0 24 24" aria-hidden="true">${GLYPHS[name]}</svg>`;
  const el = (tag, className, text) => Object.assign(document.createElement(tag), { className: className || '', textContent: text || '' });

  function line(icon, label, value) {
    const row = el('div', 'row');
    row.innerHTML = `<span class="caption">${glyph(icon)}<span></span></span><span class="value" translate="no"></span>`;
    row.querySelector('.caption > span').textContent = tr(label);
    row.querySelector('.value').textContent = value;
    return row;
  }

  const level = (v, warn, bad) => v >= bad ? 'low' : v >= warn ? 'medium' : 'high';

  function dashboard() {
    const d = data;
    const free = d.disk ? size(d.disk.free) : '';
    const worst = Math.max(d.processor >= 95 ? 2 : d.processor >= 80 ? 1 : 0, d.memory >= 85 ? 2 : d.memory >= 75 ? 1 : 0, d.disk && d.disk.free / d.disk.total < .08 ? 2 : d.disk && d.disk.free / d.disk.total < .15 ? 1 : 0);
    const verdict = $('c-verdict');
    verdict.className = 'state' + (worst === 2 ? ' state--bad' : worst === 1 ? ' state--warn' : '');
    verdict.textContent = tr('{0} % processor, {1} % memory', Math.round(d.processor), Math.round(d.memory)) + (free ? ' · ' + tr('{0} free', free) : '');
    dials($('c-dials'), [
      { part: d.processor, value: Math.round(d.processor) + ' %', label: tr('Processor'), level: level(d.processor, 80, 95) },
      { part: d.memory, value: Math.round(d.memory) + ' %', label: tr('Memory'), level: level(d.memory, 75, 85) },
    ]);
    const lines = [];
    if (d.disk) lines.push(diskLine(d.disk));
    if (d.busiest) lines.push(line('busiest', 'Busiest program', d.busiest));
    lines.push(themeLine(d.theme));
    const out = el('button', 'row action');
    out.type = 'button';
    out.innerHTML = `<span class="caption">${glyph('output')}<span></span></span><span class="value" translate="no"></span>`;
    out.querySelector('.caption > span').textContent = tr('Audio output');
    out.querySelector('.value').textContent = d.output || tr('None');
    out.addEventListener('click', () => show('audio', true));
    lines.push(out);
    $('c-lines').replaceChildren(...lines.filter(Boolean));
    claude();
  }

  function diskLine(disk) {
    const row = line('disk', 'Disk', size(disk.free) + ' ' + tr('free of') + ' ' + size(disk.total));
    row.querySelector('.caption > span').textContent = tr('Disk') + ' ' + disk.name;
    return row;
  }

  // The theme can be changed without opening the app: the arrows go to the previous and the next one.
  function themeLine(name) {
    const row = line('theme', 'Theme', name || tr('None'));
    const value = row.querySelector('.value');
    value.className = 'c-theme';
    const prev = Object.assign(el('button', 'c-step'), { type: 'button', title: tr('Previous theme'), innerHTML: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 6-6 6 6 6"/></svg>' });
    const next = Object.assign(el('button', 'c-step'), { type: 'button', title: tr('Next theme'), innerHTML: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>' });
    prev.addEventListener('click', () => send('companion.theme', { step: -1 }));
    next.addEventListener('click', () => send('companion.theme', { step: 1 }));
    const label = el('span', 'c-theme__name', name || tr('None'));
    label.translate = false;
    value.replaceChildren(prev, label, next);
    return row;
  }

  function claude() {
    const c = data.claude, u = c && c.usage;
    $('c-claude').hidden = !(c && c.on);
    if (c && c.on) {
      const ok = c.status === 'ok' && u && u.session, p = ok ? u.session.percent : 0;
      $('c-claude-bar').style.width = p + '%';
      $('c-claude').classList.toggle('is-warn', ok && p >= 75 && p < 90);
      $('c-claude').classList.toggle('is-high', ok && p >= 90);
      $('c-claude-text').textContent = ok ? tr('Session {0} %, resets in {1}', p, resetIn(u.session.resets)) + (u.week ? ' · ' + tr('Week {0} %', u.week.percent) : '') : tr(c.status === 'expired' ? 'Open Claude Code to renew its sign-in' : c.status === 'missing' ? 'Claude Code is not signed in on this PC' : 'Unknown');
    }
  }

  // A file kept in the shelf: a click opens it, the buttons copy it or show it, and it can be dragged into another app.
  function fileRow(item) {
    const row = el('div', 'row c-file');
    row.innerHTML = '<button type="button" class="c-file__open"><span class="c-file__thumb"></span><span class="c-file__what"><span class="c-file__name" translate="no"></span><small></small></span></button><button type="button" class="c-tool c-copy"></button><button type="button" class="c-tool c-reveal"></button>';
    const thumb = row.querySelector('.c-file__thumb');
    const src = item.url || item.icon;
    if (src) { const img = document.createElement('img'); img.alt = ''; img.draggable = false; img.src = src; thumb.append(img); } else thumb.innerHTML = glyph('file');
    row.querySelector('.c-file__name').textContent = item.name;
    row.querySelector('small').textContent = size(item.size) + ' · ' + new Date(item.when).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' });
    const copy = row.querySelector('.c-copy'), reveal = row.querySelector('.c-reveal');
    copy.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${GLYPHS.copy}</svg>`;
    reveal.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${GLYPHS.reveal}</svg>`;
    copy.title = tr('Copy'); reveal.title = tr('Show in File Explorer');
    copy.addEventListener('click', () => send('companion.shelf', { op: 'copy', name: item.name }));
    reveal.addEventListener('click', () => send('companion.shelf', { op: 'reveal', name: item.name }));
    const open = row.querySelector('.c-file__open');
    open.title = tr('Open, or drag into another app');
    let start = null, dragged = false;
    open.addEventListener('pointerdown', e => { if (e.button === 0) start = { x: e.clientX, y: e.clientY }; });
    open.addEventListener('pointermove', e => {
      if (!start || !(e.buttons & 1) || Math.hypot(e.clientX - start.x, e.clientY - start.y) < 8) return;
      start = null; dragged = true;
      send('companion.shelf', { op: 'dragOut', name: item.name });
    });
    open.addEventListener('pointerup', () => { start = null; });
    open.addEventListener('click', () => { if (dragged) { dragged = false; return; } send('companion.shelf', { op: 'open', name: item.name }); });
    return row;
  }

  function shelf() {
    const files = data.shelf || [];
    $('c-files').replaceChildren(...(files.length ? files.map(fileRow) : [el('div', 'row empty', tr('Nothing on the shelf yet'))]));
    document.querySelector('.c-help-drag').hidden = !files.length;
  }

  function captures() {
    const shots = (data.shelf || []).filter(c => c.kind === 'capture' && c.url).slice(0, 3);
    $('c-shots').replaceChildren(...(shots.length ? shots.map(c => {
      const b = el('button', 'c-shot');
      b.type = 'button';
      b.title = tr('Annotate') + ': ' + c.name;
      b.innerHTML = '<img alt=""><span></span>';
      b.querySelector('img').src = c.url;
      b.querySelector('span').textContent = tr('Annotate');
      b.addEventListener('click', () => send('companion.annotate', { name: c.name }));
      return b;
    }) : [el('p', 'c-empty', tr('No capture yet'))]));
  }

  function notes() {
    const query = $('c-find').value.trim().toLowerCase();
    const list = (data.notes || []).filter(n => !query || n.name.toLowerCase().includes(query) || (n.preview || '').toLowerCase().includes(query));
    $('c-recent').replaceChildren(...(list.length ? list.map(n => {
      const b = el('button', 'row action');
      b.type = 'button';
      b.innerHTML = `<span class="caption">${glyph('note')}<span><span class="c-name" translate="no"></span><small translate="no"></small></span></span><svg class="chevron" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>`;
      b.querySelector('.c-name').textContent = n.name;
      b.querySelector('small').textContent = n.preview || tr('Empty');
      b.addEventListener('click', () => send('companion.openNote', { name: n.name }));
      return b;
    }) : [el('div', 'row empty', tr(query ? 'No note matches' : 'No note yet'))]));
  }

  const KIND = { speakers: 'speakers', headphones: 'headset', headset: 'headset', monitor: 'screen', screen: 'screen' };
  function outputRow(d, now) {
    const row = el('div', 'c-out' + (now ? ' is-now' : ''));
    row.innerHTML = `<button type="button" class="c-out__pick">${glyph(KIND[d.kind] || 'output')}<span class="c-out__what"><b translate="no"></b><small translate="no"></small></span></button>`;
    row.querySelector('b').textContent = d.name;
    row.querySelector('small').textContent = d.adapter || '';
    const pick = row.querySelector('.c-out__pick');
    if (now) {
      pick.disabled = true;
      const state = el('span', 'state', tr('Default'));
      pick.append(state);
      const vol = el('div', 'c-vol');
      const mute = Object.assign(el('button', 'c-tool'), { type: 'button', title: tr(d.muted ? 'Unmute' : 'Mute') });
      mute.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${GLYPHS.output}${d.muted ? '<path d="m17 9 4 6M21 9l-4 6"/>' : ''}</svg>`;
      mute.setAttribute('aria-pressed', String(!!d.muted));
      mute.addEventListener('click', () => send('companion.audio', { op: 'deviceMute', id: d.id, on: !d.muted }));
      const range = Object.assign(document.createElement('input'), { type: 'range', min: 0, max: 100, step: 1, value: d.volume == null ? 0 : d.volume });
      range.setAttribute('aria-label', tr('Volume'));
      range.disabled = d.volume == null;
      range.classList.toggle('is-muted', !!d.muted);
      const out = el('output', '', d.volume == null ? '' : String(d.volume));
      fill(range);
      range.addEventListener('input', () => { out.textContent = range.value; fill(range); send('companion.audio', { op: 'deviceVolume', id: d.id, value: Number(range.value), live: true }); });
      range.addEventListener('change', () => send('companion.audio', { op: 'deviceVolume', id: d.id, value: Number(range.value) }));
      vol.append(mute, range, out);
      row.append(vol);
    } else pick.addEventListener('click', () => send('companion.audio', { op: 'use', id: d.id }));
    return row;
  }

  function outputs() {
    const list = (audio ? audio.devices : []).filter(d => d.output && d.active);
    const now = list.find(d => d.isDefault), others = list.filter(d => !d.isDefault);
    // A slider being dragged is not rebuilt under the pointer.
    if (document.activeElement && document.activeElement.type === 'range' && document.activeElement.closest('#c-out-now')) return;
    $('c-out-now').replaceChildren(...(now ? [outputRow(now, true)] : [el('div', 'row empty', tr('No output plugged in'))]));
    $('c-out-other-head').hidden = $('c-out-other').hidden = !others.length;
    $('c-out-other').replaceChildren(...others.map(d => outputRow(d, false)));
  }

  function render() {
    if (!data) return;
    if (tab === 'dashboard') dashboard();
    else if (tab === 'shelf') shelf();
    else if (tab === 'capture') captures();
    else if (tab === 'notes') notes();
    else if (tab === 'audio') outputs();
  }

  const HINT = 'A new note in Notes · Ctrl + Enter adds it';
  function save() {
    const text = $('c-text').value, title = $('c-title').value.trim();
    if (!text.trim() && !title) { $('c-text').focus(); return; }
    send('companion.note', { title, text });
  }

  let hintTimer = 0;
  webview.addEventListener('message', e => {
    const m = e.data;
    if (m.type === 'companion.data') {
      data = m;
      if (m.tab && m.tab !== tab && GO[m.tab]) show(m.tab, false);
      if (m.open) {
        // The window grows out of the button: from the corner of the window that is the nearest to it.
        document.body.style.transformOrigin = (m.origin ? m.origin.x : 50) + '% ' + (m.origin ? m.origin.y : 50) + '%';
        document.body.classList.remove('is-opening');
        void document.body.offsetWidth;
        document.body.classList.add('is-ready', 'is-opening');
        if (tab === 'note') $('c-text').focus();
        if (tab === 'notes') $('c-find').focus();
      }
      render();
    } else if (m.type === 'companion.hidden') {
      document.body.classList.remove('is-ready', 'is-opening');
    } else if (m.type === 'audio.devices') {
      audio = m;
      if (tab === 'audio') outputs();
    } else if (m.type === 'companion.saved') {
      $('c-title').value = '';
      $('c-text').value = '';
      const open = Object.assign(document.createElement('button'), { type: 'button', className: 'link', textContent: tr('Open') });
      open.addEventListener('click', () => send('companion.openNote', { name: m.name }));
      const name = Object.assign(document.createElement('span'), { textContent: m.name, translate: false });
      $('c-saved').replaceChildren(tr('Added to Notes:') + ' ', name, ' · ', open);
      clearTimeout(hintTimer);
      hintTimer = setTimeout(() => { $('c-saved').textContent = tr(HINT); }, 6000);
    }
  });

  for (const b of document.querySelectorAll('[data-tab]')) b.addEventListener('click', () => show(b.dataset.tab, true));
  for (const b of document.querySelectorAll('[data-capture]')) b.addEventListener('click', () => {
    const v = b.dataset.capture;
    send('companion.capture', v === 'whole' ? { delay: 0, whole: true } : { delay: Number(v) });
  });
  $('c-save').addEventListener('click', save);
  $('c-text').addEventListener('keydown', e => { if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); save(); } });
  $('c-title').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('c-text').focus(); } });
  $('c-find').addEventListener('input', notes);
  $('c-add').addEventListener('click', () => send('companion.shelf', { op: 'add' }));
  $('c-go').addEventListener('click', () => { const [, view] = GO[tab]; send(view === 'notes' ? 'companion.openNote' : 'companion.open', view === 'notes' ? { name: '' } : { view }); });
  $('c-open').addEventListener('click', () => send('companion.open', { view: 'home' }));
  $('c-close').addEventListener('click', () => send('companion.close'));
  $('c-claude').addEventListener('click', () => send('companion.open', { view: 'settings' }));
  addEventListener('keydown', e => { if (e.key === 'Escape') send('companion.close'); });
  $('c-go').textContent = tr(GO[tab][0]);
  clock();
  setInterval(clock, 15000);
  send('companion.ready');
})();
