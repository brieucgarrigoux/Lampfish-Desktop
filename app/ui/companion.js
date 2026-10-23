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
    $('c-time').textContent = now.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' }) + ' · ' + now.toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });
  }

  const ring = (el, value, alert) => {
    el.querySelector('.c-ring').style.setProperty('--part', Math.max(0, Math.min(100, value)));
    el.querySelector('b').textContent = Math.round(value) + ' %';
    el.classList.toggle('is-high', !!alert);
  };

  function line(icon, label, value) {
    const row = document.createElement('div');
    row.className = 'c-line';
    row.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg><span class="c-line__label"></span><span class="c-line__value" translate="no"></span>`;
    row.querySelector('.c-line__label').textContent = tr(label);
    row.querySelector('.c-line__value').textContent = value;
    return row;
  }

  function render() {
    if (!data) return;
    ring($('c-cpu'), data.processor, data.processor >= 90);
    $('c-cpu').querySelector('.c-mostly').textContent = data.busiest ? tr('Mostly {0}', data.busiest) : '';
    ring($('c-ram'), data.memory, data.memory >= 85);
    $('c-ram').querySelector('small').textContent = data.memory >= 80 ? tr('Free up memory in Tasks') : '';
    $('c-lines').replaceChildren(
      line('<path d="M19.5 14.6A7.6 7.6 0 0 1 9.4 4.5a7.6 7.6 0 1 0 10.1 10.1z"/>', 'Theme', data.theme || tr('None')),
      line('<path d="M4 10v4h3.5l4.5 3.5v-11L7.5 10z"/><path d="M15.5 9.2a4 4 0 0 1 0 5.6"/>', 'Audio output', data.output || tr('None')));
    $('c-recent').replaceChildren(...(data.notes.length ? data.notes.map(n => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'c-note';
      b.innerHTML = '<span class="c-note__name" translate="no"></span><span class="c-note__preview" translate="no"></span>';
      b.querySelector('.c-note__name').textContent = n.name;
      b.querySelector('.c-note__preview').textContent = n.preview;
      b.addEventListener('click', () => send('companion.openNote', { name: n.name }));
      return b;
    }) : [Object.assign(document.createElement('p'), { className: 'c-empty', textContent: tr('No note yet') })]));
    const shots = data.captures.filter(c => c.url);
    $('c-shots').replaceChildren(...(shots.length ? shots.map(c => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'c-shot';
      b.title = tr('Annotate') + ': ' + c.name;
      b.innerHTML = '<img alt="">';
      b.querySelector('img').src = c.url;
      b.addEventListener('click', () => send('companion.annotate', { name: c.name }));
      return b;
    }) : [Object.assign(document.createElement('p'), { className: 'c-empty', textContent: tr('No capture yet') })]));
    const c = data.claude, u = c && c.usage;
    $('c-claude').hidden = !(c && c.on);
    if (c && c.on) {
      const ok = c.status === 'ok' && u && u.session;
      $('c-claude-bar').style.width = (ok ? u.session.percent : 0) + '%';
      $('c-claude').classList.toggle('is-high', !!(ok && u.session.percent >= 90));
      $('c-claude-text').textContent = ok ? tr('Session {0} %, resets in {1}', u.session.percent, resetIn(u.session.resets)) + (u.week ? ' · ' + tr('Week {0} %', u.week.percent) : '') : tr(c.status === 'expired' ? 'Open Claude Code to renew its sign-in' : c.status === 'missing' ? 'Claude Code is not signed in' : 'No answer for now');
    }
  }

  function save() {
    const text = $('c-text').value, title = $('c-title').value.trim();
    if (!text.trim() && !title) return;
    send('companion.note', { title, text });
  }

  webview.addEventListener('message', e => {
    const m = e.data;
    if (m.type === 'companion.data') { data = m; if (m.tab && m.tab !== tab) show(m.tab, false); render(); }
    else if (m.type === 'companion.saved') {
      $('c-title').value = '';
      $('c-text').value = '';
      $('c-saved').textContent = tr('Saved in Notes: {0}', m.name);
      setTimeout(() => { $('c-saved').textContent = tr('Ctrl + Enter saves'); }, 3500);
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
  $('c-shelf').addEventListener('click', () => send('companion.open', { view: 'shelf' }));
  $('c-open').addEventListener('click', () => send('companion.open', { view: 'home' }));
  $('c-close').addEventListener('click', () => send('companion.close'));
  $('c-claude').addEventListener('click', () => show('dashboard', true));
  addEventListener('keydown', e => { if (e.key === 'Escape') send('companion.close'); });
  clock();
  setInterval(clock, 15000);
  send('companion.ready');
})();
