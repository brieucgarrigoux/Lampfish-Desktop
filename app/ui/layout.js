'use strict';

// The bar keeps its three families; a service moves inside its own, the families move between them.
(function () {
  const rail = document.querySelector('.rail'), settings = rail.querySelector('.service--settings');
  const families = [...rail.querySelectorAll('.rail-family')].map(section => ({
    id: section.dataset.group, section, title: section.querySelector('.rail-title'), group: section.querySelector('.rail-group'), services: [...section.querySelectorAll('.service')],
  }));
  const defaults = { groups: families.map(f => f.id), services: families.flatMap(f => f.services.map(s => s.dataset.view)) };
  let editing = false, key = '';

  const sorted = (items, saved, id) => {
    const at = x => { const i = (saved || []).indexOf(id(x)); return i < 0 ? 1000 + items.indexOf(x) : i; };
    return [...items].sort((a, b) => at(a) - at(b));
  };

  function apply(l) {
    const next = JSON.stringify([l.Bar, l.Groups]);
    if (next === key) return;
    key = next;
    for (const f of sorted(families, l.Groups, f => f.id)) {
      settings.before(f.section);
      for (const s of sorted(f.services, l.Bar, s => s.dataset.view)) f.group.append(s);
    }
    rail.dispatchEvent(new Event('arranged'));
  }

  const familyOf = s => families.find(f => f.services.includes(s));
  const servicesOf = f => [...f.group.children].filter(x => f.services.includes(x));
  const titles = () => [...rail.querySelectorAll(':scope > .rail-family > .rail-title')];
  const save = () => {
    const order = [...rail.querySelectorAll('.service[data-view]')].map(s => s.dataset.view).filter(v => defaults.services.includes(v));
    const groups = titles().map(t => t.dataset.group);
    key = JSON.stringify([order, groups]);
    send('layout.bar', { order, groups });
  };

  for (const f of families) {
    for (const s of f.services) {
      dragOrder(s, { peers: () => servicesOf(f), active: () => editing, done: save });
      s.insertAdjacentHTML('beforeend', '<span class="rail-eye" aria-hidden="true"><svg viewBox="0 0 24 24"><path class="open" d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle class="open" cx="12" cy="12" r="3"/><path class="shut" d="M3.5 12s3.2 4.5 8.5 4.5 8.5-4.5 8.5-4.5M6.5 15l-1.5 2M12 16.5V19M17.5 15l1.5 2"/></svg></span>');
    }
    // A family moves as one block: its button and its services are in the same section.
    const moveFamily = (a, b, after) => {
      const fa = families.find(x => x.title === a), fb = families.find(x => x.title === b);
      rail.insertBefore(fa.section, after ? fb.section.nextSibling : fb.section);
    };
    dragOrder(f.title, { peers: titles, active: () => editing, done: save, move: moveFamily, group: () => [...rail.children].filter(x => x !== f.section) });
  }

  // In the edit mode a click shows or hides a service instead of opening it.
  rail.addEventListener('click', e => {
    if (!editing) return;
    if (e.target.closest('.rail-title')) { e.stopPropagation(); return; }
    const s = e.target.closest('.service[data-view]');
    if (!s || !familyOf(s)) return;
    e.stopPropagation();
    if (s._dragged) return;
    send('hideView', { view: s.dataset.view, hidden: !s.hidden });
  }, true);

  function edit(on) {
    editing = on;
    document.body.classList.toggle('bar-editing', on);
    for (const f of families) {
      for (const s of f.services) {
        if (on) { s.setAttribute('aria-pressed', String(!s.hidden)); s.title = tr('Click to show or hide it, drag or use the arrows to move it'); }
        else { s.removeAttribute('aria-pressed'); s.removeAttribute('title'); }
      }
    }
    rail.dispatchEvent(new Event('arranged'));
    if (on) (rail.querySelector('.service') || rail).focus();
    else $('bar-edit').focus();
  }

  $('bar-edit').addEventListener('click', () => edit(true));
  $('bar-done').addEventListener('click', () => edit(false));
  $('bar-reset').addEventListener('click', () => send('layout.reset', { what: 'bar' }));
  addEventListener('keydown', e => { if (e.key === 'Escape' && editing) edit(false); });

  function state(l) {
    apply(l);
    if (editing) for (const f of families) for (const s of f.services) s.setAttribute('aria-pressed', String(!s.hidden));
    if (Lampfish.home && Lampfish.home.layout) Lampfish.home.layout(l);
  }

  Lampfish.layout = { state };
})();
