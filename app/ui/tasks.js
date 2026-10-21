'use strict';

(function () {
  const list = $('t-list');
  const rows = new Map();
  const details = new Map();
  const KINDS = [
    ['all', 'All', 'Everything running now'],
    ['app', 'Apps', 'Programs with a window open'],
    ['console', 'Command line', 'Programs run from a terminal'],
    ['background', 'Background', 'Programs running without a window'],
    ['system', 'System', 'Windows itself, best left alone'],
  ];
  const KIND_NAMES = { app: 'App', console: 'Command line', background: 'Background', system: 'System' };
  let shown = false, timer = 0, confirming = '', confirmTimer = 0, data = null;
  let filter = 'all', order = { key: 'memory', direction: -1 }, search = '', chosen = null, sheet = null, turn = 0;
  let freeing = false, free = null, picked = new Set(), armed = 0, closing = false, leaving = new Set();

  const UNITS = ['bytes', 'KB', 'MB', 'GB', 'TB'].map(u => tr(u));
  function size(o) {
    let i = 0;
    while (o >= 1024 && i < UNITS.length - 1) { o /= 1024; i++; }
    return o.toLocaleString(LOCALE, { maximumFractionDigits: i > 2 ? 1 : 0 }) + ' ' + UNITS[i];
  }
  const pct = v => Math.round(v).toLocaleString(LOCALE) + ' %';

  const head = document.createElement('div');
  head.className = 'row task task--head';
  head.innerHTML = '<span></span><button class="task__sort" data-key="name"></button><button class="task__sort number" data-key="cpu"></button><button class="task__sort number" data-key="memory"></button><span></span>';
  list.replaceChildren(head);
  for (const b of head.querySelectorAll('.task__sort')) b.addEventListener('click', () => {
    const key = b.dataset.key;
    order = order.key === key ? { key, direction: -order.direction } : { key, direction: key === 'name' ? 1 : -1 };
    render();
  });

  const tabs = $('t-tabs');
  const buttons = KINDS.map(([key]) => {
    const b = document.createElement('button');
    b.setAttribute('role', 'tab');
    b.innerHTML = '<span></span><span class="count"></span>';
    b.addEventListener('click', () => { filter = key; render(); });
    tabs.append(b);
    return b;
  });

  function row(id) {
    const el = document.createElement('div');
    el.className = 'row task';
    el.innerHTML = '<span class="task__icon"><img alt="" hidden></span><span class="task__what"><span class="task__name"></span><span class="task__detail"></span></span><span class="number task__cpu"></span><span class="number task__memory"></span><button class="task__end"></button>';
    const r = {
      el, img: el.querySelector('img'), name: el.querySelector('.task__name'), detail: el.querySelector('.task__detail'),
      cpu: el.querySelector('.task__cpu'), memory: el.querySelector('.task__memory'), end: el.querySelector('.task__end'),
    };
    el.addEventListener('click', e => { if (!e.target.closest('.task__end')) { if (chosen === id) close(); else choose(id); } });
    r.end.addEventListener('click', () => {
      clearTimeout(confirmTimer);
      if (confirming === id) { confirming = ''; send('tasks.end', { id }); }
      else {
        confirming = id;
        confirmTimer = setTimeout(() => { confirming = ''; render(); }, 4000);
      }
      render();
    });
    return r;
  }

  function warning(t) {
    if (t.kind === 'console') return tr('A command-line program: ending it by force can leave its terminal stuck. Close that terminal window instead.');
    if (t.window) return tr('Asks the program to close, so it can offer to save your work');
    return tr('Unsaved work in this program will be lost');
  }

  function render() {
    const cells = head.querySelectorAll('.task__sort');
    const labels = { name: tr('Name'), cpu: 'CPU', memory: tr('Memory') };
    for (const c of cells) c.textContent = labels[c.dataset.key] + (order.key === c.dataset.key ? (order.direction > 0 ? ' ↑' : ' ↓') : '');
    const counts = {};
    if (data) for (const t of data.items) counts[t.kind] = (counts[t.kind] || 0) + 1;
    KINDS.forEach(([key, name], i) => {
      const b = buttons[i];
      b.setAttribute('aria-selected', String(filter === key));
      b.setAttribute('aria-checked', String(filter === key));
      b.firstElementChild.textContent = tr(name);
      b.lastElementChild.textContent = data ? (key === 'all' ? data.items.length : counts[key] || 0) : '';
    });
    $('t-help').textContent = tr(KINDS.find(k => k[0] === filter)[2]);
    if (!data) return;

    const words = search.trim().toLowerCase();
    const matches = t => { const d = details.get(t.id) || {}; return [t.name, d.description, d.company].some(x => x && x.toLowerCase().includes(words)); };
    const items = data.items.filter(t => (filter === 'all' || t.kind === filter) && (!words || matches(t)));
    const value = t => order.key === 'name' ? t.name.toLowerCase() : t[order.key];
    items.sort((a, b) => (value(a) < value(b) ? -1 : value(a) > value(b) ? 1 : 0) * order.direction);

    const seen = new Set();
    for (const t of items) {
      seen.add(t.id);
      const d = details.get(t.id) || {};
      let r = rows.get(t.id);
      if (!r) { r = row(t.id); rows.set(t.id, r); }
      if (d.icon && r.img.getAttribute('src') !== d.icon) r.img.src = d.icon;
      r.img.hidden = !d.icon;
      r.name.textContent = t.count > 1 ? `${t.name} (${t.count})` : t.name;
      const parts = [filter === 'all' ? tr(KIND_NAMES[t.kind]) : '', d.description && d.description.toLowerCase() !== t.name.toLowerCase() ? d.description : '', d.company]
        .filter(Boolean);
      r.detail.textContent = parts.join(' · ');
      r.el.title = d.path || '';
      r.cpu.textContent = pct(t.cpu);
      r.memory.textContent = size(t.memory);
      r.end.hidden = t.locked;
      r.end.textContent = confirming === t.id ? tr('Confirm') : tr('End');
      r.end.classList.toggle('confirm', confirming === t.id);
      r.end.title = warning(t);
      r.el.classList.toggle('chosen', t.id === chosen);
      list.append(r.el);
    }
    for (const [id, r] of rows) if (!seen.has(id)) { r.el.remove(); rows.delete(id); }
    $('t-empty').hidden = items.length > 0;
    $('t-empty').textContent = words ? tr('No program matches “{0}”', search.trim()) : tr('Nothing here');
    renderSheet();
  }

  function choose(id) {
    chosen = id;
    freeing = false;
    sheet = null;
    document.body.classList.add('sheet-open');
    send('tasks.details', { id });
    render();
  }

  function close() {
    chosen = null;
    freeing = false;
    sheet = null;
    document.body.classList.remove('sheet-open');
    render();
  }

  const ago = iso => {
    const s = Math.max(0, (Date.now() - new Date(iso)) / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), d = Math.floor(h / 24);
    return d ? tr('{0} d {1} h', d, h % 24) : h ? tr('{0} h {1}', h, String(m).padStart(2, '0')) : tr('{0} min', Math.max(1, m));
  };
  const ICONS = {
    publisher: '<path d="M3.5 20V10l5 3V10l5 3V6l7 4v10z"/>',
    version: '<path d="M4 12V4.5h7.5l8.5 8.5-7.5 7.5z"/><circle cx="8.5" cy="8.5" r="1.3"/>',
    size: '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 14h16"/>',
    startup: '<path d="M12 3.5v8"/><path d="M7 6.3a7 7 0 1 0 10 0"/>',
    processes: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    started: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    memory: '<rect x="3.5" y="7" width="17" height="9" rx="1.2"/><path d="M7 10v3M10.5 10v3M14 10v3M17.5 10v3"/>',
    cpu: '<rect x="6.5" y="6.5" width="11" height="11" rx="1.5"/><rect x="9.5" y="9.5" width="5" height="5" rx=".8"/>',
    network: '<path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.5 16a5 5 0 0 1 7 0"/><circle cx="12" cy="19.2" r="1.1"/>',
    listen: '<circle cx="12" cy="12" r="2"/><path d="M7.5 7.5a6.4 6.4 0 0 0 0 9M16.5 7.5a6.4 6.4 0 0 1 0 9"/>',
    remote: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/>',
    folder: '<path d="M3.5 7.5V17a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2V9.5a2 2 0 0 0-2-2h-6.2l-2-2.5H5.5a2 2 0 0 0-2 2z"/>',
  };
  const STARTUP = { registry: 'Yes, from the registry', folder: 'Yes, from the Startup folder', off: 'Turned off in Windows', no: 'No' };

  function group(title, rows) {
    const h = document.createElement('h2');
    h.textContent = title;
    const g = document.createElement('div');
    g.className = 'group';
    for (const [icon, label, value] of rows.filter(r => r[2] != null && r[2] !== '')) {
      const l = document.createElement('div');
      l.className = 'row';
      l.innerHTML = `<span class="caption"><svg class="glyph glyph--small" viewBox="0 0 24 24" aria-hidden="true">${ICONS[icon]}</svg><span></span></span><span class="value"></span>`;
      l.querySelector('.caption > span').textContent = label;
      l.querySelector('.value').textContent = value;
      l.querySelector('.value').title = value;
      g.append(l);
    }
    return g.children.length ? [h, g] : [];
  }

  function startFree() {
    chosen = null;
    sheet = null;
    freeing = true;
    free = null;
    picked = new Set();
    document.body.classList.add('sheet-open');
    send('tasks.freeList');
    render();
  }
  $('t-free').addEventListener('click', () => freeing ? close() : startFree());

  function renderMemory() {
    const card = $('t-memory');
    $('t-free').dataset.state = closing ? 'progress' : '';
    $('t-free').lastElementChild.textContent = tr(closing ? 'Closing…' : 'Free up memory');
    if (!free) { $('t-memory-hint').textContent = tr(closing ? 'Closing the programs' : 'Looking for what can be closed'); return; }
    const used = free.total - free.available, part = free.total ? used / free.total * 100 : 0;
    const n = free.items.length, total = free.items.reduce((a, i) => a + i.memory, 0);
    const level = part >= 85 ? 'low' : part >= 70 ? 'medium' : 'high';
    card.className = 'security t-memory security--' + level;
    $('t-memory-value').textContent = tr('{0} used · {1} of {2}', pct(part), size(used), size(free.total));
    const lit = Math.round(part / 10);
    [...$('t-memory-meter').children].forEach((b, i) => b.classList.toggle('on', i < lit));
    const checks = [
      { title: 'In use', detail: 'Held by programs and Windows', value: size(used), state: part >= 85 ? 'bad' : part >= 70 ? 'warn' : 'ok' },
      { title: 'Available', detail: 'Ready for new programs', value: size(free.available), state: part >= 85 ? 'bad' : part >= 70 ? 'warn' : 'ok' },
      { title: 'Can be freed', detail: n ? (n === 1 ? '1 program not in use' : tr('{0} programs not in use', n)) : 'Everything big is in use or needed',
        value: n ? tr('About {0}', size(total)) : tr('Nothing'), state: !n ? 'neutral' : part >= 70 ? 'warn' : 'ok' },
    ];
    const key = JSON.stringify([checks, LANGUAGE]);
    const zone = $('t-memory-checks');
    if (zone.dataset.key !== key) {
      zone.dataset.key = key;
      zone.replaceChildren(...checks.map(c => {
        const el = document.createElement('div');
        el.className = 'check check--' + c.state;
        el.innerHTML = '<span class="jewel" role="img"></span><div class="check__what"><span class="check__title"></span><span class="check__detail"></span></div><span class="check__value"></span>';
        el.querySelector('.jewel').setAttribute('aria-label', tr({ ok: 'Fine', warn: 'Be careful', bad: 'Risky', neutral: 'Not reported' }[c.state]));
        el.querySelector('.check__title').textContent = tr(c.title);
        el.querySelector('.check__detail').textContent = el.querySelector('.check__detail').title = tr(c.detail);
        el.querySelector('.check__value').textContent = c.value;
        return el;
      }));
    }
    $('t-memory-hint').textContent = n ? tr('Closing the unused programs frees about {0}', size(total)) : tr('Nothing to free right now: the programs using a lot of memory are in use or needed');
    $('t-free').disabled = (!n && !freeing) || closing;
  }

  function renderFree() {
    const zone = $('t-details');
    const key = 'free:' + JSON.stringify([free && free.items.map(i => i.id), free && Math.round((free.total - free.available) / free.total * 100), [...picked], !!armed, [...leaving], closing, LANGUAGE]);
    if (zone.dataset.key === key) return;
    const head = document.createElement('div');
    head.className = 't-sheet__head';
    head.innerHTML = '<span class="task__icon t-free__icon"></span><div><span class="title"></span><span class="path"></span></div><button class="t-close" title="Close" aria-label="Close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg></button>';
    head.querySelector('.task__icon').innerHTML = $('t-free').querySelector('svg').outerHTML;
    head.querySelector('.title').textContent = tr('Free up memory');
    head.querySelector('.t-close').addEventListener('click', close);
    const fresh = [head];
    if (!free) {
      head.querySelector('.path').textContent = tr(closing ? 'Closing the programs' : 'Looking for what can be closed');
      zone.dataset.key = key;
      zone.replaceChildren(...fresh);
      return;
    }
    const used = free.total - free.available, part = free.total ? used / free.total * 100 : 0;
    head.querySelector('.path').textContent = tr('Memory {0} used, {1} of {2}', pct(part), size(used), size(free.total));
    const meter = document.createElement('span');
    meter.className = 't-free__meter';
    meter.innerHTML = `<i style="width:${part.toFixed(1)}%"></i>`;
    meter.classList.toggle('full', part >= 85);
    fresh.push(meter);
    const help = document.createElement('p');
    help.className = 'help-section t-hint';
    help.textContent = free.items.length ? tr('These can be closed without risk. Windows, security, drivers, file sync, programs playing sound and the app you were using are never listed.') : tr('Nothing to free: every program using a lot of memory is needed or in use.');
    fresh.push(help);
    if (free.items.length) {
      const every = free.items.every(i => picked.has(i.id));
      const all = document.createElement('div');
      all.className = 't-free__all';
      all.innerHTML = '<span></span><button class="link" type="button"></button>';
      all.firstChild.textContent = free.items.length === 1 ? tr('1 program') : tr('{0} programs', free.items.length);
      all.lastChild.textContent = every ? tr('Untick all') : tr('Tick all');
      all.lastChild.addEventListener('click', () => { picked = every ? new Set() : new Set(free.items.map(i => i.id)); armed = 0; renderFree(); });
      fresh.push(all);
      const g = document.createElement('div');
      g.className = 'group';
      for (const item of free.items) {
        const d = details.get(item.id) || {};
        const l = document.createElement('label');
        l.className = 'row t-free__row' + (leaving.has(item.id) ? ' closing' : '');
        l.innerHTML = '<input type="checkbox"><span class="task__icon"><img alt="" hidden></span><span class="task__what"><span class="task__name"></span><span class="task__detail"></span></span><span class="number"></span>';
        const box = l.querySelector('input');
        box.checked = picked.has(item.id);
        box.disabled = closing;
        box.addEventListener('change', () => { if (box.checked) picked.add(item.id); else picked.delete(item.id); armed = 0; renderFree(); });
        if (d.icon) { l.querySelector('img').src = d.icon; l.querySelector('img').hidden = false; }
        l.querySelector('.task__name').textContent = d.description || item.name;
        l.querySelector('.task__name').title = item.name;
        l.querySelector('.task__detail').textContent = leaving.has(item.id) ? tr('Closing…') : item.kind === 'app' ? tr('Can ask to save first') : tr('Background, stops at once');
        l.querySelector('.number').textContent = size(item.memory);
        g.append(l);
      }
      fresh.push(g);
      const chosenItems = free.items.filter(i => picked.has(i.id));
      const total = chosenItems.reduce((a, i) => a + i.memory, 0);
      const warn = document.createElement('p');
      warn.className = 't-free__warning';
      warn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4 21 19.5H3z"/><path d="M12 10v4.5M12 17h.01"/></svg><span></span>';
      warn.querySelector('span').textContent = tr('Unsaved work in a program without a window is lost. Apps with a window close like with their X.');
      fresh.push(warn);
      const go = document.createElement('button');
      go.className = 'button t-free__go' + (armed ? ' armed' : '');
      go.disabled = chosenItems.length === 0 || closing;
      go.textContent = closing ? tr('Closing…') : !chosenItems.length ? tr('Tick what to close') : armed ? tr('Confirm: close {0}', chosenItems.length === 1 ? tr('1 program') : tr('{0} programs', chosenItems.length))
        : tr('Close {0} · {1}', chosenItems.length === 1 ? tr('1 program') : tr('{0} programs', chosenItems.length), size(total));
      go.addEventListener('click', () => {
        clearTimeout(armed);
        if (!armed) { armed = setTimeout(() => { armed = 0; renderFree(); }, 4000); renderFree(); return; }
        armed = 0;
        send('tasks.free', { ids: chosenItems.map(i => i.id) });
        leaving = new Set(chosenItems.map(i => i.id));
        picked = new Set();
        closing = true;
        renderMemory();
        renderFree();
      });
      fresh.push(go);
    }
    zone.dataset.key = key;
    zone.replaceChildren(...fresh);
  }

  function renderSheet() {
    const zone = $('t-details');
    if (freeing) { renderFree(); return; }
    const t = data && chosen && data.items.find(x => x.id === chosen);
    if (!t) {
      if (zone.dataset.key !== 'empty') { zone.dataset.key = 'empty'; zone.innerHTML = '<p class="help-section t-hint"></p>'; zone.firstChild.textContent = tr('Pick a program to see where it comes from, what it uses and whether it starts with Windows'); }
      return;
    }
    const d = details.get(t.id) || {}, s = sheet && sheet.id === t.id ? sheet : null;
    const fresh = [];
    const head = document.createElement('div');
    head.className = 't-sheet__head';
    head.innerHTML = '<span class="task__icon"><img alt="" hidden></span><div><span class="title"></span><span class="path"></span></div><button class="t-close" title="Close" aria-label="Close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg></button>';
    head.querySelector('.t-close').addEventListener('click', close);
    if (d.icon) { head.querySelector('img').src = d.icon; head.querySelector('img').hidden = false; }
    head.querySelector('.title').textContent = t.name;
    head.querySelector('.path').textContent = d.description || tr(KIND_NAMES[t.kind]);
    fresh.push(head);
    if (s) {
      fresh.push(...group(tr('Program'), [
        ['publisher', tr('Publisher'), s.company], ['version', tr('Version'), s.version], ['size', tr('Size'), s.size ? size(s.size) : null],
        ['startup', tr('Starts with Windows'), s.path ? tr(STARTUP[s.startup] || 'No') : null],
      ]));
      if (s.path) {
        const show = document.createElement('button');
        show.className = 'row action';
        show.innerHTML = `<span class="caption"><svg class="glyph glyph--small" viewBox="0 0 24 24" aria-hidden="true">${ICONS.folder}</svg><span></span></span><svg class="chevron" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>`;
        show.querySelector('.caption > span').innerHTML = '';
        show.querySelector('.caption > span').append(tr('Show in File Explorer'), Object.assign(document.createElement('small'), { textContent: s.path }));
        show.title = s.path;
        show.addEventListener('click', () => send('tasks.show', { path: s.path }));
        const g = document.createElement('div');
        g.className = 'group';
        g.append(show);
        fresh.push(g);
      }
    }
    fresh.push(...group(tr('Right now'), [
      ['processes', tr('Processes'), String(t.count)], ['started', tr('Running for'), s && s.started ? ago(s.started) : null],
      ['memory', tr('Memory'), size(t.memory)], ['cpu', tr('Processor'), pct(t.cpu)],
    ]));
    if (s) fresh.push(...group(tr('Network'), [
      ['network', tr('Open connections'), String(s.established)], ['listen', tr('Waiting for connections'), s.listening ? String(s.listening) : null],
      ...s.remotes.map(r => ['remote', tr('Connected to'), r]),
    ]));
    zone.dataset.key = t.id;
    zone.replaceChildren(...fresh);
  }

  function event(m) {
    if (m.type === 'tasks.details') { if (m.id === chosen) { sheet = m; renderSheet(); } return; }
    if (m.type === 'tasks.free') { if (closing && !m.done) return; free = m; if (closing) { closing = false; leaving = new Set(); }  const ids = new Set(m.items.map(i => i.id)); picked = new Set([...picked].filter(id => ids.has(id))); renderMemory(); if (freeing) renderFree(); return; }
    if (m.type !== 'tasks.list') return;
    data = m;
    for (const t of m.items) if (t.info) details.set(t.id, t.info);
    render();
  }

  function visible(yes) {
    shown = yes;
    clearInterval(timer);
    if (!yes) return;
    send('tasks.list', { fresh: true });
    send('tasks.freeList');
    timer = setInterval(() => {
      if (!shown || document.visibilityState !== 'visible') return;
      turn++;
      send('tasks.list');
      if (chosen && turn % 3 === 0) send('tasks.details', { id: chosen });
      if (turn % 5 === 0 && !armed && !closing) send('tasks.freeList');
    }, 2000);
  }

  const field = $('t-search');
  field.addEventListener('input', () => { search = field.value; render(); });
  field.addEventListener('keydown', e => { if (e.key === 'Escape' && field.value) { e.stopPropagation(); field.value = ''; search = ''; render(); } });
  addEventListener('keydown', e => { if (e.key === 'Escape' && shown && (chosen || freeing) && e.target !== field) close(); });

  render();
  renderMemory();
  Bramble.tasks = { event, visible, free: () => { showView('tasks'); startFree(); }, dock: yes => { if (yes) startFree(); else close(); } };
})();
