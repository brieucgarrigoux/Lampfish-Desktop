'use strict';

(function () {
  let items = [], kind = 'all', shown = false, known = null;
  const UNITS = ['bytes', 'KB', 'MB', 'GB'];
  const size = n => { let i = 0; while (n >= 1024 && i < UNITS.length - 1) { n /= 1024; i++; } return n.toLocaleString(LOCALE, { maximumFractionDigits: n >= 100 || i === 0 ? 0 : 1 }) + ' ' + tr(UNITS[i]); };
  const ACTIONS = [
    ['copy', 'Copy', 'copy'],
    ['annotate', 'Annotate', 'pencil-simple-line'],
    ['convert', 'Convert', 'arrows-left-right'],
    ['reveal', 'Show in File Explorer', 'folder-open'],
    ['remove', 'Remove', 'trash-simple'],
  ];
  const TRAY = 'tray';

  // A card dragged out of the window becomes a file for the app it is dropped on; lampfish hands the file to Windows.
  function dragOut(handle, item) {
    let start = null;
    handle.addEventListener('pointerdown', e => { if (e.button === 0) start = { x: e.clientX, y: e.clientY }; });
    handle.addEventListener('pointermove', e => {
      if (!start || !(e.buttons & 1) || Math.hypot(e.clientX - start.x, e.clientY - start.y) < 8) return;
      start = null;
      handle._dragged = true;
      Lampfish.shelf.out = true;
      send('shelf.dragOut', { name: item.name });
    });
    handle.addEventListener('pointerup', () => { start = null; });
  }

  function card(item) {
    const c = document.createElement('div');
    c.className = 's-card';
    c.dataset.kind = item.kind;
    c.dataset.name = item.name;
    const image = item.url != null;
    c.innerHTML = `<button type="button" class="s-thumb">${image ? '<img alt="" loading="lazy" draggable="false">' : '<span class="s-file"><img alt="" draggable="false"><span class="s-ext"></span></span>'}</button>`
      + '<div class="s-meta"><span class="s-name" translate="no"></span><span class="s-size"></span></div><div class="s-actions"></div>';
    const img = c.querySelector('img');
    if (image) img.src = item.url;
    else {
      if (item.icon) img.src = item.icon; else img.hidden = true;
      c.querySelector('.s-ext').textContent = (item.name.split('.').pop() || '').toUpperCase().slice(0, 5);
    }
    c.querySelector('.s-name').textContent = c.querySelector('.s-name').title = item.name;
    c.querySelector('.s-size').textContent = size(item.size) + ' · ' + new Date(item.when).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' });
    const thumb = c.querySelector('.s-thumb');
    thumb.title = tr('Open, or drag into another app');
    thumb.addEventListener('click', () => { if (thumb._dragged) { thumb._dragged = false; return; } send('shelf.open', { name: item.name }); });
    dragOut(thumb, item);
    for (const [action, label, symbol] of ACTIONS) {
      if (action === 'annotate' && !image) continue;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 's-action s-action--' + action;
      b.title = tr(label);
      b.setAttribute('aria-label', tr(label) + ', ' + item.name);
      b.innerHTML = icon(symbol);
      b.addEventListener('click', () => {
        if (action === 'remove') {
          const done = () => send('shelf.remove', { name: item.name });
          if (calm.matches) done(); else c.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.94)' }], { duration: 160, easing: 'ease-in', fill: 'forwards' }).onfinish = done;
        } else send(action === 'annotate' ? 'capture.annotate' : action === 'convert' ? 'convert.shelf' : 'shelf.' + action, { name: item.name });
      });
      c.querySelector('.s-actions').append(b);
    }
    return c;
  }

  function empty(title, line, buttons) {
    const e = document.createElement('div');
    e.className = 's-empty';
    e.innerHTML = `${icon(TRAY, 's-empty__icon')}<b></b><p></p><div class="s-empty__actions"></div>`;
    e.querySelector('b').textContent = tr(title);
    e.querySelector('p').textContent = tr(line);
    if (buttons) {
      const capture = Object.assign(document.createElement('button'), { type: 'button', className: 'button button--accent', innerHTML: icon('scan') });
      capture.append(tr('Capture'));
      const add = Object.assign(document.createElement('button'), { type: 'button', className: 'button', innerHTML: icon('plus') });
      add.append(tr('Add files'));
      capture.addEventListener('click', () => send('capture.start', { delay: 0 }));
      add.addEventListener('click', () => send('shelf.add'));
      e.querySelector('.s-empty__actions').append(capture, add);
    }
    return e;
  }

  function render() {
    const list = items.filter(i => kind === 'all' || i.kind === kind);
    for (const b of $('s-filters').children) {
      b.setAttribute('aria-checked', String(b.dataset.kind === kind));
      const n = b.dataset.kind === 'all' ? items.length : items.filter(i => i.kind === b.dataset.kind).length;
      let badge = b.querySelector('.s-n');
      if (!badge) { badge = Object.assign(document.createElement('span'), { className: 's-n' }); b.append(badge); }
      badge.textContent = n ? n : '';
    }
    $('s-help').hidden = !items.length;
    if (!items.length) { $('s-grid').replaceChildren(empty('Nothing on the shelf yet', 'Drop files here to keep a copy, or take a capture: it lands here, already copied.', true)); known = new Set(); return; }
    if (!list.length) { $('s-grid').replaceChildren(empty('Nothing of this kind', 'Another filter shows the rest of the shelf.')); return; }
    const before = known;
    $('s-grid').replaceChildren(...list.map(card));
    // Only what just arrived fades in, not the whole shelf at each refresh.
    if (before && !calm.matches) for (const c of $('s-grid').children) if (!before.has(c.dataset.name)) c.animate([{ opacity: 0, transform: 'scale(.94)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'cubic-bezier(.2, .7, .3, 1)' });
    known = new Set(items.map(i => i.name));
  }

  function event(m) {
    if (m.type === 'shelf.list') {
      items = m.items;
      // A filter that hides what was just added would look like nothing happened.
      if (m.added && m.added.length && kind !== 'all' && !m.added.some(n => items.some(i => i.name === n && i.kind === kind))) kind = 'all';
      render();
      const first = m.added && m.added.length ? $('s-grid').querySelector(`.s-card[data-name="${CSS.escape(m.added[0])}"]`) : null;
      if (first) { first.scrollIntoView({ block: 'nearest', behavior: calm.matches ? 'auto' : 'smooth' }); if (!calm.matches) first.animate([{ boxShadow: '0 0 0 2px var(--accent)' }, { boxShadow: '0 0 0 2px transparent' }], { duration: 1400, easing: 'ease-out' }); }
    }
    else if (m.type === 'shelf.dragged') Lampfish.shelf.out = false;
  }

  function menu(open) {
    $('s-menu').hidden = !open;
    $('s-capture-more').setAttribute('aria-expanded', String(open));
    if (open) $('s-menu').querySelector('button').focus();
  }

  for (const b of $('s-filters').children) b.addEventListener('click', () => { kind = b.dataset.kind; render(); });
  $('s-add').addEventListener('click', () => send('shelf.add'));
  $('shelf-folder').addEventListener('click', () => send('shelf.reveal', {}));
  $('s-capture').addEventListener('click', () => send('capture.start', { delay: 0 }));
  $('s-capture-more').addEventListener('click', e => { e.stopPropagation(); menu($('s-menu').hidden); });
  for (const b of $('s-menu').querySelectorAll('[data-capture]')) b.addEventListener('click', () => {
    menu(false);
    const v = b.dataset.capture;
    send('capture.start', v === 'whole' ? { delay: 0, whole: true } : { delay: Number(v) });
  });
  $('s-menu').addEventListener('keydown', e => {
    const buttons = [...$('s-menu').querySelectorAll('button')], i = buttons.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); buttons[(i + (e.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length].focus(); }
    if (e.key === 'Escape') { e.stopPropagation(); menu(false); $('s-capture-more').focus(); }
  });
  addEventListener('pointerdown', e => { if (!$('s-menu').hidden && !e.target.closest('.s-capture')) menu(false); });

  function visible(yes) {
    if (yes === shown) return;
    shown = yes;
    if (yes) send('shelf.list'); else menu(false);
  }

  Lampfish.shelf = { event, visible, items: () => items, out: false };
})();
