'use strict';

(function () {
  let report = null, places = null, shown = false, dialog = null;
  const going = new Map(), armed = new Map();
  const UNITS = ['bytes', 'KB', 'MB', 'GB', 'TB'].map(u => tr(u));
  function size(o) {
    let i = 0;
    while (o >= 1024 && i < UNITS.length - 1) { o /= 1024; i++; }
    return o.toLocaleString(LOCALE, { maximumFractionDigits: o >= 100 || i === 0 ? 0 : 1 }) + ' ' + UNITS[i];
  }
  const day = iso => iso ? new Date(iso).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const svg = path => `<svg viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;
  const ICONS = {
    show: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    clean: '<path d="M5 7h14M10 7V5h4v2M7 7l1 12.5h8L17 7"/>',
    restore: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4v4h4"/>',
    file: '<path d="M6.5 20.5v-17h7l4 4v13z"/><path d="M13.5 3.5v4h4"/>',
    drive: '<rect x="3.5" y="6.5" width="17" height="11" rx="2"/><path d="M6.5 12h6"/><circle cx="16.5" cy="12" r="1.2"/>',
    home: '<path d="M4 11 12 4.5l8 6.5"/><path d="M6 9.5V19.5h12V9.5"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  };
  const WHY = { oldest: 'Kept in {0}: the first one saved', downloads: 'Kept in {0}: the one outside Downloads', name: 'Kept in {0}: the name without a copy number' };
  const running = () => report && (report.phase === 'listing' || report.phase === 'comparing');
  const groupsShown = () => report && report.phase === 'done' ? report.groups || [] : [];
  // The first copy of a group is the one lampfish offers to keep. The others are ticked only when the group is safe to clean,
  // and a group always keeps one copy.
  const goes = (g, i) => going.has(g.files[i].path) ? going.get(g.files[i].path) : i > 0 && g.safe;
  const ticked = () => groupsShown().flatMap(g => g.files.filter((f, i) => goes(g, i)));
  const weightOf = list => list.reduce((t, f) => t + f.size, 0);
  const shareOfDrive = bytes => report && report.drive && report.drive.total ? bytes / report.drive.total * 100 : 0;
  const percent = p => p > 0 && p < 1 ? '< 1' : Math.round(p).toLocaleString(LOCALE);

  function renderCard() {
    const card = $('dup-card'), r = report || { phase: 'idle', listed: 0, listedBytes: 0, freed: 0, copies: 0, extra: 0 };
    const done = r.phase === 'done', busy = running(), place = places && places.places.find(p => same(p.path, r.source || places.source)), where = place ? place.name : r.sourceName || (places && places.source) || '';
    const progress = r.phase === 'comparing' && r.bytesTotal ? r.bytesDone / r.bytesTotal * 100 : done ? 100 : 0;
    const share = done && r.listedBytes ? r.extra / r.listedBytes * 100 : 0;
    card.className = 'security dup-card security--' + (done && r.copies ? 'medium' : 'high');
    const zone = card.querySelector('.dials') || Object.assign(document.createElement('div'), { className: 'dials' });
    dials(zone, [
      { part: progress, value: busy ? (r.phase === 'listing' ? '…' : Math.round(progress) + ' %') : done ? new Intl.NumberFormat(LOCALE, { notation: 'compact', maximumFractionDigits: 1 }).format(r.listed) : '–', level: done || busy ? 'high' : 'off',
        label: busy ? (r.phase === 'listing' ? tr('Listing the files') : tr('Comparing the files')) : tr('Searched'),
        sub: busy ? tr('{0} files so far', r.listed.toLocaleString(LOCALE)) : done ? tr('{0} files, {1}', r.listed.toLocaleString(LOCALE), size(r.listedBytes)) : tr('In {0}', where),
        details: { title: tr('Searched'), lines: [[tr('Where'), where], [tr('Files'), r.listed ? r.listed.toLocaleString(LOCALE) : ''], [tr('Size'), r.listedBytes ? size(r.listedBytes) : ''],
          [tr('Compared'), busy && r.toCompare ? tr('{0} of {1}', r.compared, r.toCompare) : ''], [tr('Left out'), done && r.expected ? tr('{0} expected copies', r.expected) : ''], [tr('Finished at'), done ? r.when : '']] } },
      { part: share, value: done ? size(r.extra) : '–', label: tr('Extra copies'), level: done && r.copies ? 'medium' : 'off',
        sub: done ? (r.copies ? tr('{0} % of what was searched', Math.max(1, Math.round(share))) : tr('No duplicate found')) : tr('After a search'),
        details: done && r.copies ? { title: tr('Extra copies'), value: size(r.extra), lines: [[tr('Files with copies'), String((r.groups || []).length)], [tr('Extra copies'), String(r.copies)],
          [tr('Ticked'), tr('{0} copies, {1}', ticked().length, size(weightOf(ticked())))], [r.drive ? tr('Share of drive {0}', r.drive.name) : '', r.drive ? percent(shareOfDrive(r.extra)) + ' %' : '']] } : null },
      { part: r.freed + r.extra ? r.freed / (r.freed + r.extra) * 100 : 0, value: r.freed ? size(r.freed) : '–', label: tr('Space recovered'), level: r.freed ? 'high' : 'off',
        sub: r.freed ? tr('In the Recycle Bin, can be restored') : tr('Nothing yet') },
    ]);
    const parts = [zone];
    const next = document.createElement('div');
    next.className = 'security__next';
    const list = ticked();
    next.innerHTML = '<div class="dup-keys"></div>';
    const keys = next.firstChild;
    if (done && r.copies) {
      const keep = document.createElement('button');
      keep.className = 'button dup-keep';
      keep.disabled = !list.length;
      keep.innerHTML = svg(ICONS.clean) + '<span></span>';
      keep.lastChild.textContent = list.length === 1 ? tr('Clean up 1 copy') : tr('Clean up {0} copies', list.length);
      keep.addEventListener('click', openRecap);
      keys.append(keep);
    }
    const go = document.createElement('button');
    go.className = 'keycap-pill keycap-test';
    go.dataset.state = busy ? 'progress' : 'ready';
    go.innerHTML = '<span class="dome"><svg class="i-ready" viewBox="0 0 24 24" aria-hidden="true"><path d="M10.5 4.5a6 6 0 1 1 0 12 6 6 0 0 1 0-12zM15 15l5 5"/></svg><svg class="i-progress" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5a8.5 8.5 0 1 1-8.5 8.5"/></svg></span><span></span>';
    go.lastChild.textContent = tr(busy ? 'Stop' : done ? 'Search again' : 'Search');
    // The card is redrawn at each step of the search: the turning ring keeps its phase instead of starting over.
    go.querySelector('.i-progress').style.animationDelay = -(performance.now() % 900) + 'ms';
    go.addEventListener('click', () => send(busy ? 'duplicates.stop' : 'duplicates.run'));
    keys.append(go);
    parts.push(next);
    card.replaceChildren(...parts);
  }

  function openRecap() {
    const list = ticked(), weight = weightOf(list), r = report || {};
    if (!list.length) return;
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.className = 'dup-dialog';
      dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
      document.body.append(dialog);
    }
    const files = new Set(groupsShown().filter(g => g.files.some((f, i) => goes(g, i))).map(g => g.files[0].path)).size;
    const fact = () => `<div class="dup-fact"><strong></strong><span></span><small></small></div>`;
    dialog.innerHTML = `<header class="dup-dialog__head"><span class="dup-dialog__icon">${svg(ICONS.clean)}</span><div><h2></h2><p></p></div></header>`
      + `<div class="dup-facts">${fact()}${fact()}${fact()}</div><p class="dup-dialog__list-title"></p><ul class="dup-dialog__list"></ul>`
      + '<div class="dup-dialog__keys"><button class="button" value="cancel"></button><button class="button button--accent dup-keep"></button></div>';
    dialog.querySelector('h2').textContent = list.length === 1 ? tr('Clean up 1 copy') : tr('Clean up {0} copies', list.length);
    dialog.querySelector('header p').textContent = tr('Nothing is deleted for good');
    const facts = [
      [size(weight), tr('Space freed'), r.drive && r.drive.free ? tr('{1} free on {0}, then {2}', r.drive.name, size(r.drive.free), size(r.drive.free + weight)) : ''],
      [String(list.length), tr('To the Recycle Bin'), tr('Restore puts them back, from this page')],
      [String(files), files === 1 ? tr('File kept') : tr('Files kept'), tr('One copy each, where it is now')],
    ];
    dialog.querySelectorAll('.dup-fact').forEach((el, i) => {
      el.querySelector('strong').textContent = facts[i][0];
      el.querySelector('span').textContent = facts[i][1];
      el.querySelector('small').textContent = facts[i][2];
    });
    dialog.querySelector('.dup-dialog__list-title').textContent = tr('Leaving');
    const shownFiles = list.slice(0, 5).map(f => {
      const li = document.createElement('li');
      li.innerHTML = '<span translate="no"></span><small translate="no"></small><b></b>';
      li.querySelector('span').textContent = f.name;
      li.querySelector('small').textContent = f.folder;
      li.querySelector('b').textContent = size(f.size);
      li.title = f.path;
      return li;
    });
    if (list.length > 5) shownFiles.push(Object.assign(document.createElement('li'), { className: 'dup-dialog__more', textContent: tr('and {0} more', list.length - 5) }));
    dialog.querySelector('ul').replaceChildren(...shownFiles);
    const [cancel, go] = dialog.querySelectorAll('.dup-dialog__keys button');
    cancel.textContent = tr('Cancel');
    cancel.addEventListener('click', () => dialog.close());
    go.innerHTML = svg(ICONS.clean) + '<span></span>';
    go.lastChild.textContent = tr('Clean up');
    go.addEventListener('click', () => { dialog.close(); send('duplicates.recycle', { paths: ticked().map(f => f.path) }); });
    dialog.showModal();
    go.focus();
  }

  function fileRow(g, i) {
    const file = g.files[i], go = goes(g, i);
    const r = document.createElement('label');
    r.className = 'row dup-file' + (go ? '' : ' dup-file--kept');
    r.innerHTML = '<input type="checkbox"><span class="dup-file__what"><span class="dup-file__name" translate="no"></span><small><span translate="no"></span></small></span><span class="size"></span>'
      + `<button class="dup-tool" type="button">${svg(ICONS.show)}</button><button class="dup-tool dup-bin" type="button">${svg(ICONS.clean)}</button>`;
    r.querySelector('.dup-file__name').textContent = file.name;
    r.querySelector('small span').textContent = file.folder;
    if (file.modified) r.querySelector('small').append(' · ' + day(file.modified));
    r.querySelector('.size').textContent = size(file.size);
    r.title = file.path;
    const box = r.querySelector('input');
    box.checked = go;
    box.disabled = !go && g.files.every((f, k) => k === i || goes(g, k));
    if (i === 0) r.querySelector('.size').before(Object.assign(document.createElement('span'), { className: 'dup-pill state', textContent: tr('Kept') }));
    if (box.disabled) r.title = tr('The last copy of a file always stays');
    box.addEventListener('change', () => {
      if (box.checked && g.files.every((f, k) => k === i || goes(g, k))) { box.checked = false; return; }
      going.set(file.path, box.checked);
      renderList();
      renderCard();
    });
    const [show, bin] = r.querySelectorAll('button');
    show.title = tr('Show in File Explorer');
    show.addEventListener('click', e => { e.preventDefault(); send('duplicates.show', { path: file.path }); });
    const disarm = () => { clearTimeout(armed.get(file.path)); armed.delete(file.path); bin.classList.remove('armed'); bin.title = tr('Move to the Recycle Bin'); };
    disarm();
    bin.addEventListener('click', e => {
      e.preventDefault();
      if (armed.has(file.path)) { disarm(); send('duplicates.recycle', { path: file.path }); return; }
      bin.classList.add('armed');
      bin.title = tr('Click again to confirm');
      armed.set(file.path, setTimeout(disarm, 3000));
    });
    return r;
  }

  function groupBlock(g) {
    const group = document.createElement('div');
    group.className = 'group dup-group';
    const head = document.createElement('div');
    head.className = 'row dup-group__head';
    head.innerHTML = '<span class="dup-thumb"></span><span class="dup-group__what"><span class="dup-group__title"></span><small></small></span><span class="dup-same"></span>';
    const thumb = head.querySelector('.dup-thumb');
    if (g.thumb) thumb.append(Object.assign(document.createElement('img'), { src: g.thumb, alt: '' }));
    else thumb.innerHTML = `<svg class="glyph" viewBox="0 0 24 24" aria-hidden="true">${ICONS.file}</svg>`;
    head.querySelector('.dup-group__title').textContent = tr('{0} copies of {1}', g.files.length, size(g.size));
    head.querySelector('small').textContent = tr(WHY[g.why] || WHY.oldest, tr(g.files[0].place));
    head.querySelector('.dup-same').textContent = tr('Identical, byte for byte');
    group.append(head, ...g.files.map((f, i) => fileRow(g, i)));
    return group;
  }

  function section(title, note, groups) {
    if (!groups.length) return [];
    const head = document.createElement('div');
    head.className = 'title-section';
    head.innerHTML = '<h2></h2><span class="config"></span>';
    head.firstChild.textContent = tr(title);
    head.lastChild.textContent = tr(note);
    return [head, ...groups.map(groupBlock)];
  }

  function renderList() {
    const zone = $('dup-list');
    const groups = groupsShown(), r = report || {};
    const parts = [
      ...section('Safe to clean', 'In Downloads, named as a copy or beside the one kept', groups.filter(g => g.safe)),
      ...section('Look first', 'In two of your folders, maybe used from both: nothing ticked', groups.filter(g => !g.safe)),
    ];
    if (r.phase === 'done' && r.expected) parts.push(Object.assign(document.createElement('p'), { className: 'help-group dup-expected',
      textContent: tr('{0} copies in projects, games and synced folders are left out, since copies are expected there ({1})', r.expected, size(r.expectedBytes)) }));
    zone.replaceChildren(...parts);
    renderCleaned();
  }

  function renderCleaned() {
    const zone = $('dup-cleaned'), list = (report && report.cleaned) || [];
    if (!list.length) { zone.replaceChildren(); return; }
    const head = document.createElement('div');
    head.className = 'title-section';
    head.innerHTML = `<h2></h2><button class="link">${svg(ICONS.clean)}<span></span></button>`;
    head.firstChild.textContent = tr('Cleaned by lampfish');
    head.querySelector('button span').textContent = tr('Open the Recycle Bin');
    head.querySelector('button').addEventListener('click', () => send('duplicates.bin'));
    const group = document.createElement('div');
    group.className = 'group';
    group.append(...list.map(c => {
      const r = document.createElement('div');
      r.className = 'row dup-file';
      r.innerHTML = '<span class="dup-file__what"><span class="dup-file__name" translate="no"></span><small><span translate="no"></span></small></span><span class="size"></span><button class="button dup-restore"></button>';
      r.querySelector('.dup-file__name').textContent = c.name;
      r.querySelector('small span').textContent = c.folder;
      r.querySelector('small').append(' · ' + tr('cleaned {0}', day(c.when)));
      r.querySelector('.size').textContent = size(c.size);
      r.title = c.path;
      const back = r.querySelector('button');
      back.innerHTML = svg(ICONS.restore) + '<span></span>';
      back.lastChild.textContent = tr('Restore');
      back.addEventListener('click', () => { back.disabled = true; send('duplicates.restore', { path: c.path }); });
      return r;
    }));
    zone.replaceChildren(head, group);
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
      if (m.phase === 'listing') { going.clear(); if (dialog && dialog.open) dialog.close(); }
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
    if (!yes) { if (dialog && dialog.open) dialog.close(); return; }
    const service = document.querySelector('.service[data-view="duplicates"]');
    if (service) service.classList.remove('has-update');
    renderCard();
    renderList();
    renderPanel();
    send('duplicates.report');
  }

  Lampfish.duplicates = { state, event, visible };
})();
