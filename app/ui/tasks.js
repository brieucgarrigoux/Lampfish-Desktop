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
  let filter = 'all', order = { key: 'memory', direction: -1 };

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

    const items = data.items.filter(t => filter === 'all' || t.kind === filter);
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
      list.append(r.el);
    }
    for (const [id, r] of rows) if (!seen.has(id)) { r.el.remove(); rows.delete(id); }
    $('t-empty').hidden = items.length > 0;
  }

  function event(m) {
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
    timer = setInterval(() => {
      if (shown && document.visibilityState === 'visible') send('tasks.list');
    }, 2000);
  }

  render();
  Bramble.tasks = { event, visible };
})();
