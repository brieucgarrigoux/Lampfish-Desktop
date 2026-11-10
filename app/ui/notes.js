'use strict';

(function () {
  let items = [], info = {}, current = null, modified = 0, mode = 'write', dirty = false, timer = 0, shown = false, wanted = null, limit = 50;
  const text = $('n-text'), title = $('n-title');
  const PAGE = 50;

  // The bar writes Markdown around the selection, as one would type it. A null entry leaves a gap between groups.
  const TOOLS = [
    ['Title', 'text-h', () => prefix('# ')],
    ['Bold', 'text-b', () => wrap('**')],
    ['Italic', 'text-italic', () => wrap('*')],
    ['Strikethrough', 'text-strikethrough', () => wrap('~~')],
    null,
    ['List', 'list-bullets', () => prefix('- ')],
    ['Numbered list', 'list-numbers', () => prefix('1. ')],
    ['Task', 'check-square', () => prefix('- [ ] ')],
    ['Quote', 'quotes', () => prefix('> ')],
    null,
    ['Link', 'link', () => wrap('[', '](https://)')],
    ['Code', 'code', () => wrap('`')],
    ['Divider', 'minus', () => insertLine('---')],
  ];
  for (const tool of TOOLS) {
    if (!tool) { $('n-bar').append(Object.assign(document.createElement('span'), { className: 'n-gap' })); continue; }
    const [name, symbol, run] = tool;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'n-tool';
    b.title = tr(name);
    b.setAttribute('aria-label', tr(name));
    b.innerHTML = icon(symbol);
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
  function insertLine(line) {
    const { selectionEnd: b, value } = text;
    const before = b === 0 || value[b - 1] === '\n' ? '' : '\n';
    text.setRangeText(before + line + '\n', b, b, 'end');
  }

  const when = iso => {
    const d = new Date(iso), today = new Date();
    return d.toDateString() === today.toDateString() ? d.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' });
  };

  function remove(name) {
    if (name === current) { clearTimeout(timer); dirty = false; current = null; }
    send('notes.remove', { name });
    items = items.filter(n => n.name !== name);
    renderList();
  }

  // A note leaves the list at once, so a first click on a delete control only arms it. A second one within 4 s deletes, and Undo stays after that.
  let armed = null, armedTimer = 0;
  function paintArmed() {
    const on = !!armed;
    $('n-remove').classList.toggle('armed', on && armed === current);
    $('n-remove').querySelector('span').textContent = tr(on && armed === current ? 'Click again to delete' : 'Delete');
    for (const row of $('n-list').children) row.classList.toggle('is-armed', on && row.dataset.name === armed);
  }
  function disarm() { clearTimeout(armedTimer); armed = null; paintArmed(); }
  function ask(name) {
    if (armed === name) { disarm(); remove(name); return; }
    armed = name;
    clearTimeout(armedTimer);
    armedTimer = setTimeout(disarm, 4000);
    paintArmed();
  }
  addEventListener('keydown', e => { if (armed && e.key === 'Escape') disarm(); });
  addEventListener('pointerdown', e => { if (armed && !e.target.closest('.n-delete.armed, .n-item.is-armed .n-item__remove')) disarm(); });

  function renderList() {
    const query = $('n-search').value.trim().toLowerCase();
    const list = items.filter(n => !query || n.name.toLowerCase().includes(query) || n.preview.toLowerCase().includes(query));
    $('n-count').textContent = !items.length ? '' : query ? tr(list.length === 1 ? '1 note found' : '{0} notes found', list.length) : tr(items.length === 1 ? '1 note' : '{0} notes', items.length);
    $('n-list').replaceChildren(...list.slice(0, limit).map(n => {
      const row = document.createElement('div');
      row.className = 'n-item';
      row.setAttribute('role', 'listitem');
      row.setAttribute('aria-current', String(n.name === current));
      row.dataset.name = n.name;
      row.innerHTML = '<button type="button" class="n-item__open"><span class="n-item__top"><span class="n-item__name" translate="no"></span><span class="n-item__when"></span></span><span class="n-item__preview" translate="no"></span><span class="n-item__ask"></span></button>'
        + '<button type="button" class="n-item__remove">' + icon('trash-simple') + '</button>';
      row.querySelector('.n-item__name').textContent = n.name;
      row.querySelector('.n-item__when').textContent = when(n.when);
      row.querySelector('.n-item__preview').textContent = n.preview || tr('Empty');
      row.querySelector('.n-item__ask').textContent = tr('Click the bin again to delete this note');
      const del = row.querySelector('.n-item__remove');
      del.title = tr('Delete');
      del.setAttribute('aria-label', tr('Delete') + ', ' + n.name);
      del.addEventListener('click', () => ask(n.name));
      const open_ = row.querySelector('.n-item__open');
      open_.addEventListener('click', () => open(n.name));
      open_.addEventListener('keydown', e => { if (e.key === 'Delete') { e.preventDefault(); ask(n.name); } });
      return row;
    }));
    if (!list.length && items.length) $('n-list').append(Object.assign(document.createElement('p'), { className: 'n-none', textContent: tr('No note matches') }));
    const rest = list.length - limit;
    $('n-more').hidden = rest <= 0;
    paintArmed();
    if (rest > 0) { $('n-more').innerHTML = icon('caret-down'); $('n-more').append(tr('Show {0} more', Math.min(rest, PAGE))); }
    $('n-empty').hidden = !!current;
    $('n-editor').hidden = !current;
    renderThis();
  }

  // The folder is chosen in a list that stays folded: the place in use is enough most of the time.
  const ICONS = {
    lampfish: 'folder',
    vault: 'lf-crystal',
    folder: 'folder-plus',
  };
  const short = path => { const parts = (path || '').split('\\').filter(Boolean); return parts.length > 3 ? '…\\' + parts.slice(-2).join('\\') : path; };

  function renderPlaces() {
    const vault = info.vault;
    $('n-here-icon').firstChild.setAttribute('href', 'icons.svg#' + (info.isDefault ? ICONS.lampfish : vault ? ICONS.vault : ICONS.folder));
    $('n-here-name').textContent = info.isDefault ? tr('lampfish notes folder') : vault ? tr('Obsidian: {0}', vault.name) : short(info.folder);
    $('n-where').textContent = short(info.folder);
    $('n-where').title = info.folder || '';
    $('n-missing').hidden = !info.missing;
    if (info.missing) $('n-missing-text').textContent = tr('{0} cannot be found, so notes go to the lampfish folder until it is back', short(info.missing));

    const places = [{ label: tr('lampfish notes folder'), detail: tr('In the profile of this user'), path: '', vault: false, icon: 'lampfish', on: info.isDefault && !info.missing }]
      .concat((info.vaults || []).map(v => ({ label: tr('Obsidian: {0}', v.name), detail: short(v.path + '\\Lampfish'), path: v.path, vault: true, icon: 'vault', on: !info.isDefault && (info.folder || '').toLowerCase() === (v.path + '\\Lampfish').toLowerCase() })))
      .concat([{ label: tr('Choose a folder'), detail: tr('Any folder, a vault or a synced one'), path: 'pick', vault: false, icon: 'folder', on: false }]);
    const custom = !info.isDefault && !places.some(p => p.on);
    $('n-places').replaceChildren(...places.map(p => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'row action';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(p.on || (custom && p.path === 'pick')));
      b.innerHTML = `<span class="caption">${icon(ICONS[p.icon], 'glyph')}<span><span class="n-place"></span><small translate="no"></small></span></span>`;
      b.querySelector('.n-place').textContent = p.label;
      b.querySelector('small').textContent = p.path === 'pick' && custom ? short(info.folder) : p.detail;
      b.addEventListener('click', () => { if (!p.on || p.path === 'pick') { send('notes.folder', { path: p.path, vault: p.vault, move: $('n-move').checked }); choices(false); } });
      return b;
    }));
  }

  function choices(open_) {
    $('n-change').setAttribute('aria-expanded', String(open_));
    reveal($('n-choices'), open_);
  }

  function renderThis() {
    const on = !!current;
    $('n-this-title').hidden = $('n-this').hidden = !on;
    if (!on) return;
    const words = (text.value.match(/\S+/g) || []).length;
    $('n-words').textContent = tr(words === 1 ? '1 word' : '{0} words', words);
    const item = items.find(n => n.name === current);
    $('n-when').textContent = item ? when(item.when) : '';
    $('n-obsidian').hidden = !info.vault;
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

  // The pill next to the name says that saving is automatic, and when a change is not written yet.
  const SAVED = { saved: 'Saved automatically', saving: 'Saving', error: 'Not saved', conflict: 'Not saved' };
  function saved(state) {
    $('n-saved').dataset.state = state;
    $('n-saved-text').textContent = tr(SAVED[state]);
  }
  function status(t) { $('n-status').textContent = t ? tr(t) : ''; }

  function edited() {
    dirty = true;
    saved('saving');
    clearTimeout(timer);
    timer = setTimeout(save, 600);
    renderThis();
  }

  function save(force) {
    clearTimeout(timer);
    if (!current || !dirty) return;
    dirty = false;
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
      saved('saved');
      setMode(m.text.trim() ? mode : 'write');
      renderList();
    } else if (m.type === 'notes.saved') {
      if (m.name === current) { modified = m.modified; if (!dirty) { saved('saved'); status(''); } }
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
      saved('conflict');
      $('n-status').replaceChildren(tr('Changed in another app since it was opened') + ' ');
      const keep = Object.assign(document.createElement('button'), { type: 'button', className: 'link', innerHTML: icon('check') });
      const reload = Object.assign(document.createElement('button'), { type: 'button', className: 'link', innerHTML: icon('download-simple') });
      keep.append(tr('Keep mine'));
      reload.append(tr('Load theirs'));
      keep.addEventListener('click', () => { dirty = true; save(true); });
      reload.addEventListener('click', () => { dirty = false; const n = current; current = null; open(n); });
      $('n-status').append(keep, ' · ', reload);
    } else if (m.type === 'notes.error') { saved('error'); status('The file could not be written'); }
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
  $('n-search').addEventListener('input', () => { limit = PAGE; renderList(); });
  $('n-more').addEventListener('click', () => { limit += PAGE; renderList(); });
  const create = () => { save(); send('notes.create', {}); };
  $('n-new').addEventListener('click', create);
  $('n-first').addEventListener('click', create);
  addEventListener('keydown', e => { if (shown && e.ctrlKey && !e.altKey && !e.shiftKey && e.code === 'KeyN') { e.preventDefault(); create(); } });
  $('n-remove').addEventListener('click', () => { if (current) ask(current); });
  $('n-reveal').addEventListener('click', () => send('notes.reveal'));
  $('n-file').addEventListener('click', () => { if (current) send('notes.reveal', { name: current }); });
  $('n-obsidian').addEventListener('click', () => { if (current) { save(); send('notes.obsidian', { name: current }); } });
  $('n-change').addEventListener('click', () => choices($('n-change').getAttribute('aria-expanded') !== 'true'));
  addEventListener('beforeunload', () => save());

  function visible(yes) {
    if (yes === shown) return;
    shown = yes;
    if (yes) send('notes.list'); else { save(); choices(false); }
  }

  // The bot and Home open a note by its name.
  function show(name) { showView('notes'); if (name) { current = null; open(name); } }

  Lampfish.notes = { event, visible, show, choose: () => choices(true) };
})();
