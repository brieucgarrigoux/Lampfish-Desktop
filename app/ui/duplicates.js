'use strict';

(function () {
  let report = null, places = null, shown = false;
  const armed = new Map();
  const UNITS = ['bytes', 'KB', 'MB', 'GB', 'TB'].map(u => tr(u));
  function size(o) {
    let i = 0;
    while (o >= 1024 && i < UNITS.length - 1) { o /= 1024; i++; }
    return o.toLocaleString(LOCALE, { maximumFractionDigits: o >= 100 || i === 0 ? 0 : 1 }) + ' ' + UNITS[i];
  }
  const svg = path => `<svg viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;
  const ICONS = {
    searched: '<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/>',
    copies: '<rect x="4" y="7.5" width="10" height="12.5" rx="2"/><path d="M8 7.5V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-4"/>',
    after: '<path d="M4 15.5a8 8 0 1 1 16 0"/><path d="M12 15.5 15.5 10"/><path d="M4 19.5h16"/>',
    show: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    bin: '<path d="M5 7h14M10 7V5h4v2M7 7l1 12.5h8L17 7"/>',
    drive: '<rect x="3.5" y="6.5" width="17" height="11" rx="2"/><path d="M6.5 12h6"/><circle cx="16.5" cy="12" r="1.2"/>',
    home: '<path d="M4 11 12 4.5l8 6.5"/><path d="M6 9.5V19.5h12V9.5"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  };
  const running = () => report && (report.phase === 'listing' || report.phase === 'comparing');

  function check(level, icon, title, detail, value) {
    const el = document.createElement('div');
    el.className = 'check health-check check--' + level;
    el.innerHTML = `<span class="health-icon">${svg(icon)}</span><div class="check__what"><span class="check__title"></span><span class="check__detail"></span></div><span class="check__value"><span></span></span>`;
    el.querySelector('.check__title').textContent = tr(title);
    el.querySelector('.check__detail').textContent = detail;
    el.querySelector('.check__value span').textContent = value;
    return el;
  }

  function renderCard() {
    const card = $('dup-card'), r = report || { phase: 'idle', listed: 0, listedBytes: 0, freed: 0, copies: 0, extra: 0 };
    const done = r.phase === 'done', busy = running();
    const part = done && r.listedBytes ? r.extra / r.listedBytes * 100 : busy && r.bytesTotal ? r.bytesDone / r.bytesTotal * 100 : 0;
    card.className = 'security dup-card security--' + (done && r.copies ? 'medium' : 'high');
    const head = document.createElement('div');
    head.className = 'security__head';
    head.innerHTML = '<span class="seal dup-seal"><span class="seal__ring"></span><span class="seal__text"></span></span><div class="security__verdict"><span class="security__title"></span><span class="security__why"></span></div><span class="t-memory__screen dup-freed"></span>';
    head.querySelector('.seal').style.setProperty('--part', Math.min(100, part).toFixed(1));
    head.querySelector('.seal__text').textContent = busy || done ? Math.round(part) + ' %' : '–';
    head.querySelector('.security__title').textContent = busy ? (r.phase === 'listing' ? tr('Listing the files') : tr('Comparing the files'))
      : done ? (r.copies ? tr('{0} in extra copies', size(r.extra)) : tr('No duplicate found')) : tr('Find the files stored twice');
    head.querySelector('.security__why').textContent = tr('In {0}, files of 1 MB or more, Windows and apps left out', r.sourceName || (places && places.source) || '');
    head.querySelector('.dup-freed').textContent = tr('Freed with Bramble: {0}', size(r.freed || 0));
    const parts = [head];
    if (busy || done) {
      const list = document.createElement('div');
      list.className = 'security__checks';
      list.append(
        check('ok', ICONS.searched, 'Searched', busy && r.phase === 'listing' ? tr('Still listing') : tr('Files read from the folder'), tr('{0} files, {1}', r.listed.toLocaleString(LOCALE), size(r.listedBytes))),
        check(done && r.copies ? 'warn' : 'ok', ICONS.copies, 'Extra copies', done ? tr('The oldest copy of each file stays') : tr('Same size, then same content'),
          done ? (r.copies === 1 ? tr('1 copy, {0}', size(r.extra)) : tr('{0} copies, {1}', r.copies, size(r.extra))) : tr('{0} of {1} compared', r.compared, r.toCompare)),
        check('ok', ICONS.after, 'After cleaning', done && r.copies ? tr('{0} % less', Math.max(1, Math.round(part))) : tr('What the folder would weigh'),
          done ? tr('{0} instead of {1}', size(r.listedBytes - r.extra), size(r.listedBytes)) : '…'));
      parts.push(list);
    }
    if (busy) {
      const bar = document.createElement('div');
      bar.className = 'dup-progress';
      bar.innerHTML = '<i></i>';
      bar.firstChild.style.width = (r.phase === 'listing' ? 4 : Math.max(4, part)) + '%';
      parts.push(bar);
    }
    const next = document.createElement('div');
    next.className = 'security__next';
    next.innerHTML = '<span class="security__tip"></span><div class="dup-keys"></div>';
    next.firstChild.textContent = busy ? tr('This page can be left: Bramble keeps searching and tells when it is done')
      : done ? (r.copies ? tr('Checked byte for byte. Each copy can also go one by one in the list below') : tr('Searched at {0}', r.when))
      : tr('It can take a few minutes on a whole drive. Nothing is changed while searching');
    const keys = next.lastChild;
    if (done && r.copies) {
      const keep = document.createElement('button');
      keep.className = 'button dup-keep';
      keep.innerHTML = svg(ICONS.bin) + '<span></span>';
      keep.lastChild.textContent = tr('Keep one copy of each');
      confirmReset(keep, () => tr('{0} extra copies, {1}, go to the Recycle Bin. The oldest copy of each file stays.', r.copies, size(r.extra)), () => send('duplicates.keepOne'));
      keys.append(keep);
    }
    const go = document.createElement('button');
    go.className = 'keycap-pill keycap-test';
    go.dataset.state = busy ? 'progress' : 'ready';
    go.innerHTML = '<span class="dome"><svg class="i-ready" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/></svg><svg class="i-progress" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5a8.5 8.5 0 1 1-8.5 8.5"/></svg></span><span></span>';
    go.lastChild.textContent = tr(busy ? 'Stop' : done ? 'Search again' : 'Search');
    go.addEventListener('click', () => send(busy ? 'duplicates.stop' : 'duplicates.run'));
    keys.append(go);
    parts.push(next);
    card.replaceChildren(...parts);
  }

  function fileRow(file, oldest) {
    const r = document.createElement('div');
    r.className = 'row dup-file';
    r.innerHTML = '<span class="dup-file__what"><span class="dup-file__name" translate="no"></span><small translate="no"></small></span><span class="size"></span>'
      + `<button class="dup-tool" type="button">${svg(ICONS.show)}</button><button class="dup-tool dup-bin" type="button">${svg(ICONS.bin)}</button>`;
    r.querySelector('.dup-file__name').textContent = file.name;
    r.querySelector('small').textContent = file.folder;
    r.querySelector('.size').textContent = size(file.size);
    r.title = file.path;
    if (oldest) r.querySelector('.size').before(Object.assign(document.createElement('span'), { className: 'dup-pill', textContent: tr('Oldest, kept') }));
    const [show, bin] = r.querySelectorAll('button');
    show.title = tr('Show in File Explorer');
    show.addEventListener('click', () => send('duplicates.show', { path: file.path }));
    const disarm = () => { clearTimeout(armed.get(file.path)); armed.delete(file.path); bin.classList.remove('armed'); bin.title = tr('Move to the Recycle Bin'); };
    disarm();
    bin.addEventListener('click', () => {
      if (armed.has(file.path)) { disarm(); send('duplicates.recycle', { path: file.path }); return; }
      bin.classList.add('armed');
      bin.title = tr('Click again to confirm');
      armed.set(file.path, setTimeout(disarm, 3000));
    });
    r.addEventListener('mouseleave', disarm);
    return r;
  }

  function renderList() {
    const zone = $('dup-list');
    const groups = report && report.phase === 'done' ? report.groups || [] : [];
    $('dup-list-title').hidden = !groups.length;
    zone.replaceChildren(...groups.map(g => {
      const group = document.createElement('div');
      group.className = 'group dup-group';
      const head = Object.assign(document.createElement('div'), { className: 'row dup-group__head', textContent: tr('{0} copies of {1}', g.files.length, size(g.size)) });
      group.append(head, ...g.files.map((f, i) => fileRow(f, i === 0)));
      return group;
    }));
  }

  function renderPanel() {
    const zone = $('dup-places');
    if (!places) return;
    const busy = running();
    const rows = places.places.map(p => ({ icon: p.path.length <= 3 ? ICONS.drive : ICONS.home, name: p.name, note: p.detail, path: p.path }));
    const known = rows.some(r => same(r.path, places.source));
    rows.push({ icon: ICONS.folder, name: known ? tr('Choose a folder') : places.source.split('\\').pop(), note: known ? tr('Pick any folder') : places.source, choose: true, path: known ? null : places.source });
    zone.replaceChildren(...rows.map(r => {
      const b = document.createElement('button');
      b.className = 'row action f-source' + (r.path && same(r.path, places.source) ? ' active' : '');
      b.disabled = busy;
      b.innerHTML = `<svg class="glyph" viewBox="0 0 24 24" aria-hidden="true">${r.icon}</svg><span class="name-source"><span></span><small></small></span>`;
      b.querySelector('.name-source span').textContent = r.name;
      b.querySelector('small').textContent = r.note;
      b.addEventListener('click', () => r.choose ? send('duplicates.browse') : send('duplicates.source', { value: r.path }));
      return b;
    }));
  }
  const same = (a, b) => (a || '').replace(/\\+$/, '').toLowerCase() === (b || '').replace(/\\+$/, '').toLowerCase();

  function state(s) {
    places = s;
    renderPanel();
    if (!report) renderCard();
  }

  function event(m) {
    if (m.type === 'duplicates.report') {
      report = m;
      if (shown) { renderCard(); renderList(); renderPanel(); }
      return;
    }
    if (m.type === 'duplicates.done') {
      const service = document.querySelector('.service[data-view="duplicates"]');
      if (document.body.dataset.view === 'duplicates') return;
      if (service) service.classList.add('has-update');
      toast(m.copies ? tr('Duplicates: {0} can be freed', size(m.extra)) : tr('Duplicates: none found'), true, 12000, () => showView('duplicates'), tr('Show'));
    }
  }

  function visible(yes) {
    shown = yes;
    if (!yes) return;
    const service = document.querySelector('.service[data-view="duplicates"]');
    if (service) service.classList.remove('has-update');
    renderCard();
    renderList();
    renderPanel();
    send('duplicates.report');
  }

  Bramble.duplicates = { state, event, visible };
})();
