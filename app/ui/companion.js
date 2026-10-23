'use strict';

(function () {
  let data = null, tab = 'note';

  function show(name, tell) {
    tab = name;
    for (const b of document.querySelectorAll('[data-tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === name));
    for (const p of document.querySelectorAll('[data-pane]')) p.hidden = p.dataset.pane !== name;
    if (tell) send('companion.tab', { tab: name });
    if (name === 'note') setTimeout(() => $('c-text').focus(), 30);
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
    note: '<path d="M16.5 8V5a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 5v14A1.5 1.5 0 0 0 6 20.5h4.5"/><path d="M8 8h5M8 11.5h3.5"/><path d="m13.5 20.5.5-2.5 5.5-5.5a1.5 1.5 0 0 1 2 2L16 20z"/>',
  };
  const glyph = name => `<svg class="glyph" viewBox="0 0 24 24" aria-hidden="true">${GLYPHS[name]}</svg>`;

  function line(icon, label, value) {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `<span class="caption">${glyph(icon)}<span></span></span><span class="value" translate="no"></span>`;
    row.querySelector('.caption > span').textContent = tr(label);
    row.querySelector('.value').textContent = value;
    return row;
  }

  const level = (v, warn, bad) => v >= bad ? 'low' : v >= warn ? 'medium' : 'high';

  function render() {
    if (!data) return;
    dials($('c-dials'), [
      { part: data.processor, value: Math.round(data.processor) + ' %', label: tr('Processor'), level: level(data.processor, 80, 95) },
      { part: data.memory, value: Math.round(data.memory) + ' %', label: tr('Memory'), level: level(data.memory, 75, 85), sub: data.memory >= 80 ? tr('Free up memory in Tasks') : '' },
    ]);
    const lines = [];
    if (data.busiest) lines.push(line('busiest', 'Busiest program', data.busiest));
    lines.push(line('theme', 'Theme', data.theme || tr('None')), line('output', 'Audio output', data.output || tr('None')));
    $('c-lines').replaceChildren(...lines);
    $('c-recent').replaceChildren(...(data.notes.length ? data.notes.map(n => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'row action';
      b.innerHTML = `<span class="caption">${glyph('note')}<span><span class="c-name" translate="no"></span><small translate="no"></small></span></span><svg class="chevron" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>`;
      b.querySelector('.c-name').textContent = n.name;
      b.querySelector('small').textContent = n.preview || tr('Empty');
      b.addEventListener('click', () => send('companion.openNote', { name: n.name }));
      return b;
    }) : [Object.assign(document.createElement('div'), { className: 'row empty', textContent: tr('No note yet') })]));
    const shots = data.captures.filter(c => c.url);
    $('c-shots').replaceChildren(...(shots.length ? shots.map(c => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'c-shot';
      b.title = tr('Annotate') + ': ' + c.name;
      b.innerHTML = '<img alt=""><span></span>';
      b.querySelector('img').src = c.url;
      b.querySelector('span').textContent = tr('Annotate');
      b.addEventListener('click', () => send('companion.annotate', { name: c.name }));
      return b;
    }) : [Object.assign(document.createElement('p'), { className: 'c-empty', textContent: tr('No capture yet') })]));
    const c = data.claude, u = c && c.usage;
    $('c-claude').hidden = !(c && c.on);
    if (c && c.on) {
      const ok = c.status === 'ok' && u && u.session, p = ok ? u.session.percent : 0;
      $('c-claude-bar').style.width = p + '%';
      $('c-claude').classList.toggle('is-warn', ok && p >= 75 && p < 90);
      $('c-claude').classList.toggle('is-high', ok && p >= 90);
      $('c-claude-text').textContent = ok ? tr('Session {0} %, resets in {1}', p, resetIn(u.session.resets)) + (u.week ? ' · ' + tr('Week {0} %', u.week.percent) : '') : tr(c.status === 'expired' ? 'Open Claude Code to renew its sign-in' : c.status === 'missing' ? 'Claude Code is not signed in' : 'No answer for now');
    }
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
      if (m.tab && m.tab !== tab) show(m.tab, false);
      if (m.open) { document.body.classList.remove('is-opening'); void document.body.offsetWidth; document.body.classList.add('is-opening'); if (tab === 'note') $('c-text').focus(); }
      render();
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
  $('c-notes').addEventListener('click', () => send('companion.openNote', { name: '' }));
  $('c-all').addEventListener('click', () => send('companion.openNote', { name: '' }));
  $('c-shelf').addEventListener('click', () => send('companion.open', { view: 'shelf' }));
  $('c-open').addEventListener('click', () => send('companion.open', { view: 'home' }));
  $('c-close').addEventListener('click', () => send('companion.close'));
  $('c-claude').addEventListener('click', () => show('dashboard', true));
  addEventListener('keydown', e => { if (e.key === 'Escape') send('companion.close'); });
  clock();
  setInterval(clock, 15000);
  send('companion.ready');
})();
