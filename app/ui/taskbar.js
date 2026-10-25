'use strict';

// The taskbar: the settings Windows keeps for it, and its automatic hiding.
(function () {
  const TOGGLES = { seconds: 'Seconds in the clock', taskView: 'Task View', widgets: 'Widgets', corner: 'Show desktop corner', allScreens: 'On every screen' };
  const CHOICES = { align: 'Alignment', search: 'Search', combine: 'Combine windows' };
  let state = null, shown = false;

  function paint() {
    if (!state) return;
    $('tb-old').hidden = state.windows11;
    const by = {};
    for (const i of state.items) by[i.id] = i;
    const value = id => by[id] ? (by[id].value == null ? by[id].fallback : by[id].value) : null;
    for (const id of Object.keys(TOGGLES)) {
      const box = $('tb-' + id);
      box.closest('.toggle').hidden = !by[id];
      box.checked = value(id) === 1;
      box.disabled = !!(by[id] && by[id].locked);
    }
    const locked = state.items.filter(i => i.locked && TOGGLES[i.id]);
    $('tb-lockbox').hidden = !locked.length;
    if (locked.length) $('tb-lock-text').textContent = locked.map(i => tr(TOGGLES[i.id])).join(', ') + ': ' + tr('Windows refuses the change on this version');
    for (const id of Object.keys(CHOICES)) {
      const group = $('tb-' + id);
      group.closest('.row').hidden = !by[id];
      // Windows keeps no value for the search until it is changed once: nothing is shown as chosen then.
      const now = id === 'search' ? (by[id] ? by[id].value : null) : value(id);
      for (const b of group.children) b.setAttribute('aria-checked', String(now !== null && Number(b.dataset.value) === now));
    }
    $('tb-autoHide').checked = !!state.autoHide;
    $('tb-reset').hidden = !state.changed;
  }

  for (const id of Object.keys(TOGGLES)) $('tb-' + id).addEventListener('change', e => send('taskbar.set', { id, value: e.target.checked ? 1 : 0, title: tr(TOGGLES[id]) }));
  $('tb-autoHide').addEventListener('change', e => send('taskbar.set', { id: 'autoHide', value: e.target.checked, title: tr('Hide it automatically') }));
  for (const id of Object.keys(CHOICES)) {
    for (const b of $('tb-' + id).children) b.addEventListener('click', () => send('taskbar.set', { id, value: Number(b.dataset.value), title: tr(CHOICES[id]) }));
  }
  $('tb-reset').addEventListener('click', () => send('taskbar.reset'));
  $('tb-lock-open').addEventListener('click', () => send('taskbar.open'));

  Bramble.taskbar = {
    event(m) { if (m.type === 'taskbar.state') { state = m; paint(); } },
    visible(v) { shown = v; if (v) send('taskbar.state'); },
  };
})();
