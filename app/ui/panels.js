'use strict';

(function () {
  const SPACE_CONTENTS = 480;

  for (const panel of document.querySelectorAll('[data-resizable]')) {
    const side = panel.dataset.resizable;
    const variable = panel.dataset.variable;
    const min = Number(panel.dataset.min || 260), max = Number(panel.dataset.max || 640);
    const initial = Number(panel.dataset.initial || 300);
    const key = panel.dataset.key || 'width' + variable;

    const handle = document.createElement('div');
    handle.className = 'handle';
    handle.tabIndex = 0;
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-orientation', 'vertical');
    handle.setAttribute('aria-label', 'Panel width');
    document.body.append(handle);

    let wanted = initial;
    try { wanted = Number(localStorage.getItem(key)) || initial; } catch (e) { }
    let width = wanted;

    function limit() {
      const c = document.querySelector('.contents');
      const layout = panel.getBoundingClientRect().width + (c ? c.getBoundingClientRect().width : 0) - SPACE_CONTENTS;
      return Math.max(min, Math.min(max, layout));
    }

    function apply(v, remember) {
      width = Math.round(Math.max(min, Math.min(v, limit())));
      document.body.style.setProperty(variable, width + 'px');
      handle.setAttribute('aria-valuenow', width);
      handle.setAttribute('aria-valuemin', min);
      handle.setAttribute('aria-valuemax', max);
      if (remember) { wanted = width; try { localStorage.setItem(key, width); } catch (e) { } }
      place();
    }

    function place() {
      const r = panel.getBoundingClientRect();
      handle.style.left = (side === 'left' ? r.left : r.right) - 4 + 'px';

      handle.hidden = r.width === 0 || r.top > 1;
    }

    let start = null;
    handle.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      handle.setPointerCapture(e.pointerId);
      start = { x: e.clientX, width };
      document.body.classList.add('resizing');
    });

    let target = null, image = 0;
    handle.addEventListener('pointermove', e => {
      if (!start) return;
      const d = e.clientX - start.x;
      target = start.width + (side === 'left' ? -d : d);
      if (!image) image = requestAnimationFrame(() => { image = 0; if (target !== null) apply(target, false); });
    });
    const release = () => {
      if (!start) return;
      start = null;
      if (target !== null) { width = target; target = null; }
      document.body.classList.remove('resizing');
      apply(width, true);
    };
    handle.addEventListener('pointerup', release);
    handle.addEventListener('pointercancel', release);
    handle.addEventListener('dblclick', () => apply(initial, true));
    handle.addEventListener('keydown', e => {
      const step = e.shiftKey ? 64 : 16, direction = side === 'left' ? -1 : 1;
      const v = { ArrowLeft: width - step * direction, ArrowRight: width + step * direction, Home: min, End: max }[e.key];
      if (v === undefined) return;
      e.preventDefault();
      apply(v, true);
    });

    new ResizeObserver(place).observe(panel);
    addEventListener('resize', () => apply(wanted, false));
    apply(wanted, false);
  }
})();

// Every titled section of the side panel folds and stays folded until Bramble is closed: it always starts unfolded.
function foldSections(container, key) {
  const read = () => { try { return JSON.parse(sessionStorage.getItem('folds') || '{}'); } catch (e) { return {}; } };
  const saved = read();
  const remember = (id, folded) => {
    const all = read();
    if (folded) all[id] = 1; else delete all[id];
    try { sessionStorage.setItem('folds', JSON.stringify(all)); } catch (e) { }
  };
  const headerOf = el => el.tagName === 'H2' ? el : el.classList.contains('title-panel') ? el.querySelector('h2') : null;
  let fold = null, inner = null, count = 0;
  for (const el of [...container.children]) {
    const title = headerOf(el);
    if (title) {
      const id = key + ':' + count++;
      fold = document.createElement('section');
      fold.className = 'fold';
      const body = document.createElement('div');
      body.className = 'fold__body';
      inner = document.createElement('div');
      inner.className = 'fold__inner';
      body.append(inner);
      container.insertBefore(fold, el);
      fold.append(el, body);
      title.classList.add('fold__title');
      title.tabIndex = 0;
      title.setAttribute('role', 'button');
      const set = open => { fold.classList.toggle('collapsed', !open); title.setAttribute('aria-expanded', String(open)); };
      const mine = fold;
      set(!saved[id]);
      title.addEventListener('click', () => {
        const open = mine.classList.contains('collapsed');
        mine.classList.toggle('collapsed', !open);
        title.setAttribute('aria-expanded', String(open));
        remember(id, !open);
      });
      title.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); title.click(); } });
    } else if (inner) inner.append(el);
  }
}
for (const el of document.querySelectorAll('.panel > div[class^="only-"]'))
  if (el.querySelector(':scope > h2, :scope > .title-panel')) foldSections(el, el.className);

// The families of the bar on the left fold like the panel sections, but only while their names are shown: an icon-only bar keeps every service in reach.
(function () {
  const rail = document.querySelector('.rail');
  if (!rail) return;
  const read = () => { try { return JSON.parse(sessionStorage.getItem('folds') || '{}'); } catch (e) { return {}; } };
  const remember = (id, folded) => {
    const all = read();
    if (folded) all[id] = 1; else delete all[id];
    try { sessionStorage.setItem('folds', JSON.stringify(all)); } catch (e) { }
  };
  const saved = read();
  let items = null, count = 0;
  for (const el of [...rail.children]) {
    if (el.classList.contains('rail-title')) {
      const id = 'rail:' + count++, group = items = [], title = el;
      const set = folded => {
        for (const b of group) b.classList.toggle('is-folded', folded);
        title.classList.toggle('folded', folded);
        title.setAttribute('aria-expanded', String(!folded));
      };
      title.setAttribute('role', 'button');
      set(!!saved[id]);
      title.addEventListener('click', () => {
        const folded = !title.classList.contains('folded');
        set(folded);
        remember(id, folded);
      });
      title.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); title.click(); } });
    } else if (el.classList.contains('service--settings')) items = null;
    else if (items && el.classList.contains('service')) items.push(el);
  }
  const wide = () => {
    const on = rail.clientWidth >= 140;
    rail.dataset.wide = String(on);
    for (const t of rail.querySelectorAll('.rail-title')) t.tabIndex = on ? 0 : -1;
  };
  new ResizeObserver(wide).observe(rail);
  wide();
})();

// Panels that are redrawn by their service (details, theme sheet, Create) get their sections folded each time.
(function () {
  const where = (box, el) => { const path = []; for (; el !== box; el = el.parentElement) path.unshift([...el.parentElement.children].indexOf(el)); return path.join('.') || 'root'; };
  for (const id of ['m-details', 't-details', 'mood-sheet', 'create-panel']) {
    const box = document.getElementById(id);
    if (!box) continue;
    let queued = false;
    const scan = () => {
      queued = false;
      const owners = new Set();
      for (const h of box.querySelectorAll('h2')) {
        const owner = h.parentElement;
        if (!h.classList.contains('fold__title') && !owner.classList.contains('fold__inner') && !owner.classList.contains('fold') && !owner.classList.contains('title-panel')) owners.add(owner);
      }
      for (const owner of owners) foldSections(owner, id + '/' + where(box, owner));
    };
    new MutationObserver(() => { if (!queued) { queued = true; queueMicrotask(scan); } }).observe(box, { childList: true, subtree: true });
    scan();
  }
})();

// A folded family of the bar on the left still tells where you are.
(function () {
  const rail = document.querySelector('.rail');
  if (!rail) return;
  const titles = [...rail.querySelectorAll('.rail-title')];
  const mark = () => {
    let family = null;
    for (const el of rail.children) {
      if (el.classList.contains('rail-title')) { family = el; family.classList.remove('has-current'); }
      else if (family && el.classList.contains('service') && !el.classList.contains('service--settings') && el.getAttribute('aria-current') === 'page') family.classList.add('has-current');
      else if (el.classList.contains('service--settings')) family = null;
    }
  };
  new MutationObserver(mark).observe(rail, { subtree: true, attributes: true, attributeFilter: ['aria-current'] });
  mark();
})();
