'use strict';

(function () {
  let items = [], info = {}, current = null, modified = 0, mode = 'write', dirty = false, timer = 0, shown = false, wanted = null;
  const text = $('n-text'), title = $('n-title');

  // The bar writes Markdown around the selection, as one would type it.
  const TOOLS = [
    ['Title', '<path d="M6 5v14M18 5v14M6 12h12"/>', () => prefix('# ')],
    ['Bold', '<path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z"/>', () => wrap('**')],
    ['Italic', '<path d="M10 5h8M6 19h8M15 5 9 19"/>', () => wrap('*')],
    ['List', '<path d="M9 7h11M9 12h11M9 17h11"/><circle cx="4.5" cy="7" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="17" r="1"/>', () => prefix('- ')],
    ['Task', '<rect x="3.5" y="5" width="7" height="7" rx="1.5"/><path d="m5 8.5 1.5 1.5 2.5-3M13.5 8.5h7M3.5 16.5h17"/>', () => prefix('- [ ] ')],
    ['Link', '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>', () => wrap('[', '](https://)')],
    ['Code', '<path d="m8.5 8-4 4 4 4M15.5 8l4 4-4 4"/>', () => wrap('`')],
  ];
  for (const [name, icon, run] of TOOLS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'n-tool';
    b.title = tr(name);
    b.setAttribute('aria-label', tr(name));
    b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg>`;
    b.addEventListener('mousedown', e => e.preventDefault());
    b.addEventListener('click', () => { run(); edited(); text.focus(); });
    $('n-bar').append(b);
  }

  function wrap(before, after = before) {
    const { selectionStart: a, selectionEnd: b, value } = text;
    text.setRangeText(before + value.slice(a, b) + after, a, b, 'end');
    if (a === b) text.selectionStart = text.selectionEnd = a + before.length;
  }
  function prefix(mark) {
    const { selectionStart: a, selectionEnd: b, value } = text;
    const start = value.lastIndexOf('\n', a - 1) + 1, end = value.indexOf('\n', b) < 0 ? value.length : value.indexOf('\n', b);
    const block = value.slice(start, end).split('\n').map(l => l.startsWith(mark) ? l.slice(mark.length) : mark + l).join('\n');
    text.setRangeText(block, start, end, 'end');
  }

  const when = iso => {
    const d = new Date(iso), today = new Date();
    return d.toDateString() === today.toDateString() ? d.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' });
  };

  function renderList() {
    const query = $('n-search').value.trim().toLowerCase();
    const list = items.filter(n => !query || n.name.toLowerCase().includes(query) || n.preview.toLowerCase().includes(query));
    $('n-list').replaceChildren(...list.map(n => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'n-item';
      b.setAttribute('role', 'listitem');
      b.setAttribute('aria-current', String(n.name === current));
      b.innerHTML = '<span class="n-item__top"><span class="n-item__name" translate="no"></span><span class="n-item__when"></span></span><span class="n-item__preview" translate="no"></span>';
      b.querySelector('.n-item__name').textContent = n.name;
      b.querySelector('.n-item__when').textContent = when(n.when);
      b.querySelector('.n-item__preview').textContent = n.preview;
      b.addEventListener('click', () => open(n.name));
      return b;
    }));
    if (!list.length && items.length) $('n-list').append(Object.assign(document.createElement('p'), { className: 'n-none', textContent: tr('No note matches') }));
    $('n-empty').hidden = !!current;
    $('n-editor').hidden = !current;
  }

  function renderPlaces() {
    $('n-where').textContent = info.folder || '';
    const places = [{ label: tr('Bramble notes folder'), detail: tr('In the profile of this user'), path: '', vault: false, on: info.isDefault }]
      .concat((info.vaults || []).map(v => ({ label: tr('Obsidian: {0}', v.name), detail: v.path + '\\Bramble', path: v.path, vault: true, on: !info.isDefault && (info.folder || '').toLowerCase() === (v.path + '\\Bramble').toLowerCase() })))
      .concat([{ label: tr('Choose a folder'), detail: tr('Any folder, a vault or a synced one'), path: 'pick', vault: false, on: false }]);
    const custom = !info.isDefault && !places.some(p => p.on);
    $('n-places').replaceChildren(...places.map(p => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'row action';
      b.setAttribute('aria-pressed', String(p.on || (custom && p.path === 'pick')));
      b.innerHTML = '<span class="caption"><span><span class="n-place"></span><small translate="no"></small></span></span>';
      b.querySelector('.n-place').textContent = p.label;
      b.querySelector('small').textContent = p.path === 'pick' && custom ? info.folder : p.detail;
      b.addEventListener('click', () => { if (!p.on) send('notes.folder', { path: p.path, vault: p.vault, move: $('n-move').checked }); });
      return b;
    }));
  }

  function setMode(m) {
    mode = m;
    for (const b of document.querySelectorAll('.n-mode button')) b.setAttribute('aria-checked', String(b.dataset.mode === m));
    text.hidden = $('n-bar').hidden = m !== 'write';
    $('n-read').hidden = m !== 'read';
    if (m === 'read') paintRead();
  }

  const IMAGE = /\.(png|jpe?g|gif|webp|bmp|svg)$/i;
  function paintRead() {
    $('n-read').replaceChildren(Markdown.render(text.value, {
      image: src => /^https?:\/\//i.test(src) || !IMAGE.test(src) || src.includes('..') ? null : 'https://notes.example/' + src.split('/').map(encodeURIComponent).join('/'),
      link: url => send('notes.link', { url }),
      note: name => { const hit = items.find(n => n.name.toLowerCase() === name.toLowerCase()); if (hit) open(hit.name); },
      task: (rank, done) => { text.value = Markdown.tick(text.value, rank, done); edited(); },
    }));
  }

  function status(t) { $('n-status').textContent = t ? tr(t) : ''; }

  function edited() {
    dirty = true;
    status('Editing');
    clearTimeout(timer);
    timer = setTimeout(save, 600);
  }

  function save(force) {
    clearTimeout(timer);
    if (!current || !dirty) return;
    dirty = false;
    status('Saving');
    send('notes.save', { name: current, text: text.value, modified, force: !!force });
  }

  function open(name) {
    if (name === current) return;
    save();
    wanted = name;
    send('notes.read', { name });
  }

  function event(m) {
    if (m.type === 'notes.list') {
      items = m.items; info = m;
      if (current && !items.some(n => n.name === current)) { current = null; text.value = ''; }
      renderList(); renderPlaces();
    } else if (m.type === 'notes.note') {
      if (m.name !== wanted && m.name !== current) return;
      current = m.name; modified = m.modified; dirty = false; wanted = null;
      title.value = m.name;
      text.value = m.text;
      status('');
      setMode(m.text.trim() ? mode : 'write');
      renderList();
    } else if (m.type === 'notes.saved') {
      if (m.name === current) { modified = m.modified; status(dirty ? 'Editing' : 'Saved'); }
    } else if (m.type === 'notes.created') {
      wanted = m.name;
      setMode('write');
      send('notes.read', { name: m.name });
      setTimeout(() => { title.focus(); title.select(); }, 150);
    } else if (m.type === 'notes.renamed') {
      if (m.taken) { title.value = current; status('A note already has this name'); return; }
      current = m.name; title.value = m.name;
    } else if (m.type === 'notes.conflict') {
      if (m.name !== current) return;
      dirty = true;
      $('n-status').replaceChildren(tr('Changed in another app since it was opened') + ' ');
      const keep = Object.assign(document.createElement('button'), { type: 'button', className: 'link', textContent: tr('Keep mine') });
      const reload = Object.assign(document.createElement('button'), { type: 'button', className: 'link', textContent: tr('Load theirs') });
      keep.addEventListener('click', () => { dirty = true; save(true); });
      reload.addEventListener('click', () => { dirty = false; const n = current; current = null; open(n); });
      $('n-status').append(keep, ' · ', reload);
    } else if (m.type === 'notes.error') status('Not saved: the file could not be written');
    else if (m.type === 'notes.open') { current = null; open(m.name); }
  }

  text.addEventListener('input', edited);
  text.addEventListener('keydown', e => {
    if (e.ctrlKey && !e.altKey && ['b', 'i', 'k'].includes(e.key.toLowerCase())) {
      e.preventDefault();
      ({ b: () => wrap('**'), i: () => wrap('*'), k: () => wrap('[', '](https://)') })[e.key.toLowerCase()]();
      edited();
    }
    if (e.key === 'Tab' && !e.ctrlKey) { e.preventDefault(); text.setRangeText('  ', text.selectionStart, text.selectionEnd, 'end'); edited(); }
  });
  title.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); text.focus(); } if (e.key === 'Escape') { title.value = current; text.focus(); } });
  title.addEventListener('change', () => { const to = title.value.trim(); if (current && to && to !== current) { save(); send('notes.rename', { name: current, to }); } else title.value = current || ''; });
  for (const b of document.querySelectorAll('.n-mode button')) b.addEventListener('click', () => setMode(b.dataset.mode));
  $('n-search').addEventListener('input', renderList);
  $('n-new').addEventListener('click', () => { save(); send('notes.create', {}); });
  $('n-first').addEventListener('click', () => send('notes.create', {}));
  $('n-remove').addEventListener('click', () => { if (!current) return; clearTimeout(timer); dirty = false; const n = current; current = null; send('notes.remove', { name: n }); renderList(); });
  $('n-reveal').addEventListener('click', () => send('notes.reveal'));
  addEventListener('beforeunload', () => save());

  function visible(yes) {
    if (yes === shown) return;
    shown = yes;
    if (yes) send('notes.list'); else save();
  }

  // The bot and Home open a note by its name.
  function show(name) { showView('notes'); if (name) { current = null; open(name); } }

  Bramble.notes = { event, visible, show };
})();
