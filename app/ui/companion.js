'use strict';

(function () {
  let data = null, tab = 'dashboard', audio = null;
  const UNITS = ['bytes', 'KB', 'MB', 'GB', 'TB'];
  const size = n => { let i = 0; while (n >= 1024 && i < UNITS.length - 1) { n /= 1024; i++; } return n.toLocaleString(LOCALE, { maximumFractionDigits: n >= 100 || i === 0 ? 0 : 1 }) + ' ' + tr(UNITS[i]); };
  const GO = {
    dashboard: ['Open Home in lampfish', 'home'], note: ['Open Notes in lampfish', 'notes'], capture: ['Open Shelf in lampfish', 'shelf'],
    shelf: ['Open Shelf in lampfish', 'shelf'], audio: ['Open Audio in lampfish', 'audio'], notes: ['Open Notes in lampfish', 'notes'], convert: ['Open Convert in lampfish', 'convert'], desktop: ['Open Arrange in lampfish', 'arrange'],
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
      ...claudeDials(),
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

  // The two limits of a plan as two dials: the 5-hour session, which is the one that runs out during a day, and the week.
  function claudeDials() {
    const c = data.claude, u = c && c.usage;
    if (!(c && c.on)) { $('c-claude-note').hidden = true; return []; }
    const ok = c.status === 'ok' && u && (u.session || u.week);
    const dial = (w, label, key) => ({
      key, part: w ? w.percent : 0, value: w ? Math.round(w.percent) + ' %' : '-', label: tr(label), sub: w ? tr('resets in {0}', resetIn(w.resets)) : '', color: 'var(--plugin-claude)',
      level: !w ? 'high' : w.percent >= 90 ? 'low' : w.percent >= 75 ? 'medium' : 'high', action: () => send('companion.open', { view: 'settings' }),
      details: w ? { title: tr(label), value: Math.round(w.percent) + ' %', lines: [[tr('Resets in'), resetIn(w.resets)], ...(key === 'week' ? (u.rows || []).map(r => [r.name, Math.round(r.percent) + ' %']) : [])] } : null,
    });
    $('c-claude-note').hidden = !!ok;
    $('c-claude-note').textContent = ok ? '' : tr(c.status === 'expired' ? 'Open Claude Code to renew its sign-in' : c.status === 'missing' ? 'Claude Code is not signed in on this PC' : c.status === 'offline' ? 'No connection to read the usage' : 'Reading the usage');
    return ok ? [dial(u.session, 'Claude 5 h', 'session'), dial(u.week, 'Claude week', 'week')] : [];
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

  // The same jobs as the Convert page: each one asks for its files and finishes in the app.
  const TOOLS = [
    ['image', 'Change an image', 'PNG, JPG, BMP, GIF, TIFF or an icon', '<rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="m4.5 17 4.5-4.5 3.5 3.5 2.5-2.5 4.5 4.5"/>'],
    ['images-pdf', 'Images to PDF', 'A page for each picture', '<path d="M7 3.5h7l4 4V20.5H7z"/><path d="M14 3.5V8h4"/><path d="m9.5 17 2-2.5 1.5 1.5 1.5-2 1.5 3z"/>'],
    ['pdf-images', 'PDF to images', 'One picture for each page', '<path d="M8 3.5h6.5l3.5 3.5v10H8z"/><path d="M5.5 7v13.5h10"/>'],
    ['merge', 'Merge PDFs', 'Several files into one', '<path d="M5 5v3a4 4 0 0 0 4 4h6M19 5v3a4 4 0 0 1-4 4"/><path d="M12 12v8M9.5 17.5 12 20l2.5-2.5"/>'],
    ['pages', 'Keep some pages', 'Cut a PDF down to the pages you name', '<path d="M7 3.5h7l4 4V20.5H7z"/><path d="M14 3.5V8h4M9.5 12h5M9.5 15.5h3"/>'],
    ['text', 'Text to PDF', 'TXT, Markdown or CSV on A4 pages', '<path d="M5 6.5h14M12 6.5V19M9 19h6"/>'],
    ['office', 'Office to PDF', 'Word, Excel and PowerPoint', '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 10h16M10 10v10"/>'],
  ];
  function tools() {
    if ($('c-tools').children.length) return;
    $('c-tools').replaceChildren(...TOOLS.map(([id, name, help, path]) => {
      const b = el('button', 'row action');
      b.type = 'button';
      b.innerHTML = `<span class="caption"><svg class="glyph" viewBox="0 0 24 24" aria-hidden="true">${path}</svg><span><span class="c-name"></span><small></small></span></span><svg class="chevron" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>`;
      b.querySelector('.c-name').textContent = tr(name);
      b.querySelector('small').textContent = tr(help);
      b.addEventListener('click', () => send('companion.convert', { tool: id }));
      return b;
    }));
  }

  function desktop() {
    const d = data.desktop || {};
    $('c-grid').checked = !!d.grid;
    $('c-hide').checked = !!d.hidden;
    $('c-wp-pause').querySelector('span').textContent = tr(d.paused ? 'Resume' : 'Pause');
    $('c-wp-pause').querySelector('svg').innerHTML = d.paused ? '<path d="M8 5.5v13l10.5-6.5z"/>' : '<path d="M9 6v12M15 6v12"/>';
  }

  function render() {
    if (!data) return;
    if (tab === 'convert') tools();
    if (tab === 'desktop') desktop();
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
      const off = m.hiddenTabs || [];
      for (const b of document.querySelectorAll('[data-tab]')) b.hidden = off.includes(b.dataset.tab);
      if (off.includes(tab)) { const first = [...document.querySelectorAll('[data-tab]')].find(b => !b.hidden); if (first) show(first.dataset.tab, false); }
      if (m.tab && m.tab !== tab && GO[m.tab]) show(m.tab, false);
      if (m.open) {
        // The window itself slides and fades in: the page only has to say when its data is drawn.
        document.body.classList.add('is-ready');
        if (tab === 'note') $('c-text').focus();
        if (tab === 'notes') $('c-find').focus();
        render();
        requestAnimationFrame(() => requestAnimationFrame(() => send('companion.painted')));
        return;
      }
      render();
    } else if (m.type === 'companion.hidden') {
      document.body.classList.remove('is-ready');
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
  $('c-grid').addEventListener('change', e => send('companion.grid', { on: e.target.checked }));
  $('c-hide').addEventListener('change', e => send('companion.icons', { hidden: e.target.checked }));
  $('c-straighten').addEventListener('click', () => send('companion.straighten'));
  $('c-refresh').addEventListener('click', () => send('companion.refresh'));
  $('c-wp-prev').addEventListener('click', () => send('companion.wallpaper', { op: 'previous' }));
  $('c-wp-next').addEventListener('click', () => send('companion.wallpaper', { op: 'next' }));
  $('c-wp-pause').addEventListener('click', () => send('companion.wallpaper', { op: 'pause' }));
  $('c-go').addEventListener('click', () => { const [, view] = GO[tab]; send(view === 'notes' ? 'companion.openNote' : 'companion.open', view === 'notes' ? { name: '' } : { view }); });
  $('c-open').addEventListener('click', () => send('companion.open', { view: 'home' }));
  $('c-close').addEventListener('click', () => send('companion.close'));
  addEventListener('keydown', e => { if (e.key === 'Escape') send('companion.close'); });
  $('c-go').textContent = tr(GO[tab][0]);
  clock();
  setInterval(clock, 15000);
  send('companion.ready');
})();
