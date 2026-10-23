'use strict';

(function () {
  let items = [], kind = 'all', shown = false;
  const UNITS = ['bytes', 'KB', 'MB', 'GB'];
  const size = n => { let i = 0; while (n >= 1024 && i < UNITS.length - 1) { n /= 1024; i++; } return n.toLocaleString(LOCALE, { maximumFractionDigits: n >= 100 || i === 0 ? 0 : 1 }) + ' ' + tr(UNITS[i]); };
  const ACTIONS = [
    ['open', 'Open', '<path d="M14 4.5h5.5V10M19.5 4.5 11 13M17 13.5v5a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 4 18.5v-10A1.5 1.5 0 0 1 5.5 7h5"/>'],
    ['copy', 'Copy the file', '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>'],
    ['annotate', 'Annotate', '<path d="m14.5 4.5 5 5L10 19H5v-5z"/><path d="m12.5 6.5 5 5"/>'],
    ['copyImage', 'Copy the image', '<rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m4.5 17 5-4.5 3.5 3 2.5-2 4 3.5"/>'],
    ['reveal', 'Show in File Explorer', '<path d="M3.5 7.5V17a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2V9.5a2 2 0 0 0-2-2h-6.2l-2-2.5H5.5a2 2 0 0 0-2 2z"/>'],
    ['remove', 'Remove', '<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/>'],
  ];

  function card(item) {
    const c = document.createElement('div');
    c.className = 's-card';
    c.dataset.kind = item.kind;
    const image = item.url != null;
    c.innerHTML = `<button type="button" class="s-thumb">${image ? '<img alt="" loading="lazy">' : '<span class="s-file"><img alt=""><span class="s-ext"></span></span>'}</button>`
      + '<div class="s-meta"><span class="s-name" translate="no"></span><span class="s-size"></span></div><div class="s-actions"></div>';
    const img = c.querySelector('img');
    if (image) img.src = item.url;
    else {
      if (item.icon) img.src = item.icon; else img.hidden = true;
      c.querySelector('.s-ext').textContent = (item.name.split('.').pop() || '').toUpperCase().slice(0, 5);
    }
    c.querySelector('.s-name').textContent = c.querySelector('.s-name').title = item.name;
    c.querySelector('.s-size').textContent = size(item.size) + ' · ' + new Date(item.when).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' });
    c.querySelector('.s-thumb').title = tr('Open');
    c.querySelector('.s-thumb').addEventListener('click', () => send('shelf.open', { name: item.name }));
    for (const [action, label, icon] of ACTIONS) {
      if ((action === 'copyImage' || action === 'annotate') && !image) continue;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 's-action' + (action === 'remove' ? ' s-action--remove' : '');
      b.title = tr(label);
      b.setAttribute('aria-label', tr(label) + ', ' + item.name);
      b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg>`;
      b.addEventListener('click', () => send(action === 'annotate' ? 'capture.annotate' : 'shelf.' + action, { name: item.name }));
      c.querySelector('.s-actions').append(b);
    }
    return c;
  }

  function render() {
    const list = items.filter(i => kind === 'all' || i.kind === kind);
    for (const b of $('s-filters').children) b.setAttribute('aria-pressed', String(b.dataset.kind === kind));
    if (!items.length) { $('s-grid').replaceChildren(Object.assign(document.createElement('div'), { className: 's-empty', textContent: tr('Nothing on the shelf yet: drop files here or take a capture') })); return; }
    if (!list.length) { $('s-grid').replaceChildren(Object.assign(document.createElement('div'), { className: 's-empty', textContent: tr('Nothing of this kind') })); return; }
    $('s-grid').replaceChildren(...list.map(card));
  }

  function event(m) {
    if (m.type !== 'shelf.list') return;
    items = m.items;
    render();
  }

  for (const b of $('s-filters').children) b.addEventListener('click', () => { kind = b.dataset.kind; render(); });
  $('s-add').addEventListener('click', () => send('shelf.add'));
  $('s-folder').addEventListener('click', () => send('shelf.reveal', {}));
  $('s-capture').addEventListener('click', () => send('capture.start', { delay: 0 }));

  function visible(yes) {
    if (yes === shown) return;
    shown = yes;
    if (yes) send('shelf.list');
  }

  Bramble.shelf = { event, visible, items: () => items };
})();
