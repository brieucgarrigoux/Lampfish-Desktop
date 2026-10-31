'use strict';

// The bar on the left: Home and a search on top, one button per family that opens its services in a flyout, Settings and the arranging buttons at the foot.
(function () {
  const rail = document.querySelector('.rail');
  if (!rail) return;
  const families = [...rail.querySelectorAll('.rail-family')];
  let open = null;

  // The flyout is taken out of the bar while it is open: the bar clips what is inside it.
  for (const f of families) {
    f._group = f.querySelector('.rail-group');
    const name = f.querySelector('.rail-title > span');
    name.dataset.short = tr(name.dataset.short);
  }
  const titleOf = f => f.querySelector('.rail-title');
  const groupOf = f => f._group;
  const shown = f => [...groupOf(f).querySelectorAll('.service')].filter(s => !s.hidden);
  const editing = () => document.body.classList.contains('bar-editing');

  function place(f) {
    const group = groupOf(f), title = titleOf(f).getBoundingClientRect(), side = rail.getBoundingClientRect();
    group.style.left = Math.round(side.right + 6) + 'px';
    group.style.top = '0px';
    const height = group.offsetHeight;
    group.style.top = Math.max(8, Math.min(Math.round(title.top - 4), innerHeight - height - 8)) + 'px';
  }

  function close(focus) {
    if (!open) return;
    const f = open;
    open = null;
    f.classList.remove('is-open');
    groupOf(f).classList.remove('is-shown');
    f.append(groupOf(f));
    titleOf(f).setAttribute('aria-expanded', 'false');
    mark();
    if (focus) titleOf(f).focus();
  }

  function show(f, focusFirst) {
    if (editing()) return;
    if (open && open !== f) close(false);
    open = f;
    f.classList.add('is-open');
    document.body.append(groupOf(f));
    groupOf(f).classList.add('is-shown');
    titleOf(f).setAttribute('aria-expanded', 'true');
    place(f);
    if (focusFirst) {
      const current = shown(f).find(s => s.getAttribute('aria-current') === 'page');
      (current || shown(f)[0] || titleOf(f)).focus();
    }
  }

  for (const f of families) {
    const title = titleOf(f);
    title.addEventListener('click', () => { if (open === f) close(false); else show(f, false); });
    // Crossing another button on the way to the flyout must not swap it: the pointer has to rest there first.
    let rest = 0;
    title.addEventListener('pointerenter', () => { clearTimeout(rest); if (open && open !== f) rest = setTimeout(() => { if (open && open !== f) show(f, false); }, 350); });
    title.addEventListener('pointerleave', () => clearTimeout(rest));
    title.addEventListener('keydown', e => {
      if (e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(f, true); }
      else if (e.key === 'ArrowLeft' || e.key === 'Escape') { e.preventDefault(); close(false); }
    });
    groupOf(f).addEventListener('keydown', e => {
      if (editing()) return;
      if (e.key === 'Escape' || e.key === 'ArrowLeft') { e.preventDefault(); close(true); }
    });
    groupOf(f).addEventListener('click', e => { if (e.target.closest('.service') && !editing()) close(false); });
  }
  document.addEventListener('pointerdown', e => { if (open && !e.target.closest('.rail-group') && e.target !== titleOf(open) && !titleOf(open).contains(e.target)) close(false); }, true);
  addEventListener('blur', () => close(false));
  addEventListener('resize', () => { if (open) place(open); });
  rail.addEventListener('scroll', () => { if (open) place(open); });
  rail.addEventListener('arranged', () => { if (editing()) close(false); else if (open) place(open); });

  // The family of the service on screen carries a lamp, so a folded bar still says where you are.
  const mark = () => { for (const f of families) f.classList.toggle('has-current', !!groupOf(f).querySelector('.service[aria-current="page"]')); };
  new MutationObserver(mark).observe(rail, { subtree: true, attributes: true, attributeFilter: ['aria-current'] });
  mark();

  // The names show beside the icons from 140 px up.
  const wide = () => { rail.dataset.wide = String(rail.clientWidth >= 140); if (open) place(open); };
  new ResizeObserver(wide).observe(rail);
  wide();

  // An icon-only bar still names every button.
  const iconRail = matchMedia('(max-width: 620px), (max-width: 900px) and (max-height: 1000px)');
  function names() {
    for (const b of rail.querySelectorAll('.rail-title, .rail-search')) {
      if (iconRail.matches) b.title = b.textContent.replace('Ctrl K', '').trim(); else if (b.classList.contains('rail-title')) b.removeAttribute('title');
    }
  }
  iconRail.addEventListener('change', names);
  names();

  // The logo is the mark of the app and still leads home.
  rail.querySelector('.logo-home').addEventListener('click', () => showView('home'));

  // Ctrl K: a small search that opens any service by name.
  const palette = document.createElement('div');
  palette.className = 'goto';
  palette.hidden = true;
  palette.innerHTML = '<div class="goto__box" role="dialog" aria-modal="true" aria-label="Go to"><div class="goto__field"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="m20 20-4.2-4.2"/></svg><input type="text" class="goto__input" autocomplete="off" spellcheck="false" aria-label="Go to"></div><div class="goto__list" role="listbox"></div></div>';
  document.body.append(palette);
  const input = palette.querySelector('.goto__input'), list = palette.querySelector('.goto__list');
  let results = [], chosen = 0, from = null;
  const plain = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  function entries() {
    return [...rail.querySelectorAll('.service[data-view]')].map(s => {
      const f = s.closest('.rail-family');
      return { view: s.dataset.view, name: s.textContent.trim(), family: f ? titleOf(f).textContent.trim() : '', icon: s.querySelector('svg').outerHTML, hidden: s.hidden };
    });
  }

  // Every setting can be found by its name, wherever it lives; a service with a hidden button stays out.
  function settings() {
    const out = [], seen = new Set();
    for (const row of document.querySelectorAll('.toggle, .row--setting, .choice, .row.action, .h-q')) {
      const zone = row.closest('[class*="only-"]'), match = zone && zone.className.match(/only-(\w+)/);
      const title = row.querySelector('.caption > span, .h-q__name');
      if (!match || !title || row.closest('.tr-fold, .welcome')) continue;
      const service = rail.querySelector(`.service[data-view="${match[1]}"]`);
      const name = ((title.firstChild && title.firstChild.textContent) || '').trim();
      if (!service || service.hidden || name.length < 3 || seen.has(match[1] + name)) continue;
      seen.add(match[1] + name);
      const icon = row.querySelector('svg');
      out.push({ view: match[1], name, family: service.textContent.trim(), icon: icon ? icon.outerHTML : '', row });
    }
    return out;
  }

  function paint() {
    const q = plain(input.value.trim());
    const all = q ? [...entries(), ...settings()] : entries();
    results = all.filter(e => !q || plain(e.name).includes(q) || (!e.row && plain(e.family).includes(q)))
      .sort((a, b) => (plain(b.name).startsWith(q) ? 1 : 0) - (plain(a.name).startsWith(q) ? 1 : 0) || (a.row ? 1 : 0) - (b.row ? 1 : 0)).slice(0, 30);
    chosen = Math.min(chosen, Math.max(0, results.length - 1));
    list.replaceChildren(...results.map((e, i) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'goto__item';
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(i === chosen));
      row.innerHTML = e.icon + '<span class="goto__name"></span><span class="goto__family"></span>';
      row.querySelector('.goto__name').textContent = e.name;
      row.querySelector('.goto__family').textContent = e.family;
      row.addEventListener('click', () => go(e));
      row.addEventListener('pointermove', () => { if (chosen !== i) { chosen = i; mark2(); } });
      return row;
    }));
    if (!results.length) list.append(Object.assign(document.createElement('p'), { className: 'goto__none', textContent: tr('Nothing matches') }));
  }
  function mark2() {
    [...list.querySelectorAll('.goto__item')].forEach((b, i) => { b.setAttribute('aria-selected', String(i === chosen)); if (i === chosen) b.scrollIntoView({ block: 'nearest' }); });
  }
  function go(e) {
    closePalette(false);
    showView(e.view);
    if (!e.row) return;
    if (e.row.closest('.panel')) document.body.classList.add('panel-open');
    const fold = e.row.closest('.fold');
    if (fold && fold.classList.contains('collapsed')) fold.querySelector('.fold__title').click();
    setTimeout(() => {
      e.row.scrollIntoView({ block: 'center' });
      e.row.classList.remove('is-found');
      void e.row.offsetWidth;
      e.row.classList.add('is-found');
      setTimeout(() => e.row.classList.remove('is-found'), 1900);
    }, 120);
  }
  function openPalette() {
    close(false);
    from = document.activeElement;
    input.value = '';
    chosen = 0;
    palette.hidden = false;
    paint();
    input.focus();
  }
  function closePalette(back) {
    if (palette.hidden) return;
    palette.hidden = true;
    if (back && from && from.focus) from.focus();
  }
  input.addEventListener('input', () => { chosen = 0; paint(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); chosen = Math.min(results.length - 1, chosen + 1); mark2(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); chosen = Math.max(0, chosen - 1); mark2(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (results[chosen]) go(results[chosen]); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePalette(true); }
  });
  palette.addEventListener('pointerdown', e => { if (e.target === palette) closePalette(true); });
  $('rail-search').addEventListener('click', openPalette);
  addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.code === 'KeyK') { e.preventDefault(); if (palette.hidden) openPalette(); else closePalette(true); }
  });

  // The arrow keys: in the bar they walk its buttons (and open the service they land on); anywhere else on the page they go to the previous or next service.
  addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || editing() || !palette.hidden) return;
    const keys = { ArrowUp: -1, ArrowDown: 1, Home: 'first', End: 'last' };
    if (!(e.key in keys)) return;
    const active = document.activeElement, inRail = !!(active && active.closest && active.closest('.rail, .rail-group'));
    if (!inRail && active && active !== document.body) return;
    const step = keys[e.key];
    if (inRail) {
      const group = active.closest('.rail-group'), owner = group && families.find(f => groupOf(f) === group);
      const buttons = owner ? shown(owner) : [...rail.querySelectorAll(':scope > .rail-home, :scope > .rail-search, :scope > .rail-family > .rail-title, :scope > .service--settings')].filter(b => b.offsetParent);
      const at = buttons.indexOf(active.closest('button'));
      const next = step === 'first' ? 0 : step === 'last' ? buttons.length - 1 : Math.max(0, Math.min(buttons.length - 1, (at < 0 ? 0 : at) + step));
      const target = buttons[next];
      if (!target) return;
      e.preventDefault();
      target.focus();
      if (target.classList.contains('service') && target.dataset.view !== document.body.dataset.view) target.click();
      return;
    }
    const bar = [...rail.querySelectorAll('.service[data-view]')].filter(b => !b.hidden).map(b => b.dataset.view);
    const at = Math.max(0, bar.indexOf(document.body.dataset.view));
    const next = step === 'first' ? 0 : step === 'last' ? bar.length - 1 : Math.max(0, Math.min(bar.length - 1, at + step));
    e.preventDefault();
    if (bar[next] && bar[next] !== document.body.dataset.view) showView(bar[next]);
  });
})();
