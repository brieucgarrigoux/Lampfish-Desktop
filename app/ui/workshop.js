'use strict';

// The Workshop (C67): a cursor family made from a style and two colours per variant. The page draws everything with
// cursor-engine.js; Workshop.cs keeps the families; Mouse shows them under My families and writes them when applied.
(function () {
  const E = window.CursorEngine;
  const STYLES = [['flat', 'Flat', 'Body', 'Outline'], ['glass', 'Glass', 'Glass', 'Rim'], ['neon', 'Neon', 'Tube', 'Core'], ['metal', 'Metal', 'Metal', 'Shadow'],
    ['photophore', 'Photophore', 'Glow', 'Body'], ['depth', 'Deep', 'Surface', 'Depth'], ['nacre', 'Nacre', 'Pearl', 'Edge']];
  const PAIRS = { flat: ['#f6fbfa', '#08171a'], glass: ['#6ff3e1', '#effffd'], neon: ['#2ed9c6', '#ffffff'], metal: ['#cfd8db', '#3a4448'], photophore: ['#ff7a3d', '#25100a'], depth: ['#5b8cff', '#1b2f7a'], nacre: ['#f3c2b4', '#4a2a22'] };
  const SUGGEST = [['#2ed9c6', '#08171a'], ['#ff7a3d', '#1a0b06'], ['#a37bff', '#120a24'], ['#ffd166', '#3a2a06'], ['#ff4f8b', '#2a0612'], ['#f6fbfa', '#0b1d20'], ['#7cc4ff', '#0b1a33'], ['#3ccf8e', '#06210f']];
  // A colour gets the name of the nearest of these, so a variant reads Teal or Amber like the families of lampfish.
  const COLOUR_NAMES = [['Red', '#e5484d'], ['Orange', '#ff7a3d'], ['Amber', '#ffb224'], ['Gold', '#e8b64c'], ['Yellow', '#ffe14d'], ['Lime', '#a3e635'], ['Green', '#3ccf8e'],
    ['Mint', '#7ff0c8'], ['Teal', '#2ed9c6'], ['Cyan', '#22d3ee'], ['Sky', '#7cc4ff'], ['Blue', '#3b82f6'], ['Indigo', '#5b5bd6'], ['Violet', '#8b5cf6'], ['Purple', '#a855f7'],
    ['Magenta', '#e93fd1'], ['Pink', '#ff6fb5'], ['Rose', '#f3a4b4'], ['Brown', '#8b5a3c'], ['White', '#f6fbfa'], ['Silver', '#c9d1d4'], ['Gray', '#7c858a'], ['Black', '#141a1c']];
  const NAME = /^[\p{L}\p{N}][\p{L}\p{N} '-]{0,29}$/u;
  const DRAFT = 'lampfish (workshop)';
  const rgb = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const colourName = hex => { const c = rgb(hex); let best = null, d = Infinity; for (const [n, h] of COLOUR_NAMES) { const x = rgb(h), e = (c[0] - x[0]) ** 2 + (c[1] - x[1]) ** 2 + (c[2] - x[2]) ** 2; if (e < d) { d = e; best = n; } } return best; };

  let families = [], draft = fresh(), index = 0, tab = 'design', keyFamilies = '', note = '';
  function fresh() { return { key: null, name: '', variants: [{ variant: 'Teal', style: 'neon', a: '#2ed9c6', b: '#ffffff' }] }; }
  const cur = () => draft.variants[index];

  // A variant is named after its colour, and kept apart from the others of the family.
  function rename(v) {
    const base = colourName(v.a);
    let n = base, i = 2;
    while (draft.variants.some(x => x !== v && x.variant === n)) n = base + ' ' + i++;
    v.variant = n;
  }

  const canvases = [];
  function canvas(css, role, name = DRAFT) {
    const c = document.createElement('canvas');
    c.width = c.height = Math.round(css * devicePixelRatio);
    c.style.width = c.style.height = css + 'px';
    canvases.push({ c, role, name });
    return c;
  }

  function register() {
    const v = cur();
    E.THEME[DRAFT] = Object.assign(E.customVariant(v.style, v.a, v.b), { name: DRAFT, variant: v.variant });
  }

  // The name must be free: not a family of lampfish, of the special edition, or another family of the Workshop.
  function nameProblem() {
    const n = draft.name.trim();
    if (!n) return tr('Name the family');
    if (!NAME.test(n)) return tr('Letters, digits and spaces only');
    const taken = [...E.FAMILIES, ...E.packFamilies].some(f => f.name.toLowerCase() === n.toLowerCase())
      || families.some(f => f.key !== draft.key && f.name.toLowerCase() === n.toLowerCase());
    return taken ? tr('This name is already taken') : '';
  }

  // A colour dragged in its well sends dozens of changes a second: they are drawn once per frame, and the cursors of the
  // try zone (five pictures turned into page cursors) only once the colour rests.
  let frame = 0, rest = 0;
  function render() {
    if (frame) return;
    frame = requestAnimationFrame(() => { frame = 0; paint(); });
  }
  function paint() {
    register();
    const v = cur(), [, styleName, labelA, labelB] = STYLES.find(x => x[0] === v.style);
    for (const a of canvases) if (a.name === DRAFT && a.c.isConnected) E.draw(a.c, a.c.width, a.name, a.role, .6, false);
    $('w-stage').style.setProperty('--tint', v.a);
    $('w-title').textContent = draft.name.trim() || tr('My family');
    $('w-title').translate = false;
    $('w-sub').textContent = tr(styleName) + ', ' + tr(v.variant);
    $('w-a-label').textContent = tr(labelA);
    $('w-b-label').textContent = tr(labelB);
    $('w-a').value = v.a;
    $('w-b').value = v.b;
    for (const b of $('w-styles').children) b.setAttribute('aria-checked', String(b.dataset.style === v.style));
    clearTimeout(rest);
    rest = setTimeout(tryZone, 160);
    renderFamily();
    const problem = nameProblem();
    $('w-note').textContent = note || (draft.name.trim() ? problem : '');
    $('w-note').classList.toggle('is-error', !!(draft.name.trim() && problem));
    for (const id of ['w-save', 'w-create']) {
      const b = $(id);
      b.innerHTML = icon(draft.key ? 'floppy-disk' : 'plus');
      b.append(tr(draft.key ? 'Save' : 'Create'));
      b.disabled = !!problem;
    }
  }

  // The try zone wears the real cursor of the draft, as a cursor of the page.
  function tryZone() {
    const cursor = (role, x, y) => { const c = document.createElement('canvas'); c.width = c.height = 32; E.draw(c, 32, DRAFT, role, .6, false); return `url(${c.toDataURL()}) ${x} ${y}, auto`; };
    $('w-stage').style.cursor = cursor('arrow', 2, 2);
    $('w-try-link').style.cursor = cursor('hand', 10, 2);
    $('w-try-text').style.cursor = cursor('ibeam', 16, 16);
    for (const s of $('w-try').querySelectorAll('[data-role]')) s.style.cursor = cursor(s.dataset.role, 16, 16);
  }

  // The colours of the family as swatches; a click edits one, the cross takes it out.
  function renderFamily() {
    const host = $('w-family');
    const items = draft.variants.map((v, i) => {
      const wrap = document.createElement('span');
      wrap.className = 'w-swatch';
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch';
      b.style.setProperty('--swatch', v.a);
      b.title = tr(v.variant);
      b.setAttribute('aria-label', tr(v.variant));
      b.setAttribute('aria-pressed', String(i === index));
      b.addEventListener('click', () => { index = i; render(); });
      wrap.append(b);
      if (draft.variants.length > 1) {
        const x = document.createElement('button');
        x.type = 'button';
        x.className = 'w-swatch__remove';
        x.innerHTML = icon('x');
        x.title = tr('Take this colour out');
        x.setAttribute('aria-label', x.title);
        x.addEventListener('click', () => { draft.variants.splice(i, 1); index = Math.min(index, draft.variants.length - 1); render(); });
        wrap.append(x);
      }
      return wrap;
    });
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'link';
    add.innerHTML = icon('plus');
    add.append(tr('Add a colour'));
    add.disabled = draft.variants.length >= 12;
    add.addEventListener('click', () => {
      const v = { ...cur() }, pick = SUGGEST[draft.variants.length % SUGGEST.length];
      v.a = pick[0];
      v.b = pick[1];
      draft.variants.push(v);
      rename(v);
      index = draft.variants.length - 1;
      render();
    });
    host.replaceChildren(...items, add);
  }

  function build() {
    canvases.length = 0;
    $('w-stage').prepend(canvas(128, 'arrow'));
    $('w-roles').replaceChildren(...E.ROLES.map(r => {
      const s = document.createElement('span');
      s.append(canvas(32, r), Object.assign(document.createElement('small'), { textContent: tr(ROLE_LABEL[r]) }));
      return s;
    }));
    $('w-styles').replaceChildren(...STYLES.map(([key, label]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.dataset.style = key;
      const name = 'lampfish (workshop ' + key + ')';
      E.THEME[name] = Object.assign(E.customVariant(key, PAIRS[key][0], PAIRS[key][1]), { name });
      const preview = canvas(32, 'arrow', name);
      E.draw(preview, preview.width, name, 'arrow', .6, false);
      b.append(preview, tr(label));
      b.addEventListener('click', () => { const v = cur(); v.style = key; [v.a, v.b] = PAIRS[key]; rename(v); render(); });
      return b;
    }));
    $('w-suggest').replaceChildren(...SUGGEST.map(([a, b]) => {
      const s = document.createElement('button');
      s.type = 'button';
      s.className = 'swatch w-pair';
      s.style.background = `linear-gradient(135deg, ${a} 50%, ${b} 50%)`;
      s.title = tr(colourName(a));
      s.setAttribute('aria-label', s.title);
      s.addEventListener('click', () => { const v = cur(); v.a = a; v.b = b; rename(v); render(); });
      return s;
    }));
  }
  const ROLE_LABEL = { arrow: 'Normal', help: 'Help', appstarting: 'Background', wait: 'Busy', crosshair: 'Precision', ibeam: 'Text', nwpen: 'Handwriting', no: 'Unavailable', sizens: 'Vertical', sizewe: 'Horizontal', sizenwse: 'Diagonal down', sizenesw: 'Diagonal up', move: 'Move', uparrow: 'Alternate', hand: 'Link', pin: 'Location', person: 'Person' };

  // The families already made, with Edit, Use in Mouse and Remove.
  function renderFamilies() {
    const key = JSON.stringify(families) + LANGUAGE;
    if (key === keyFamilies) return;
    keyFamilies = key;
    $('w-count').textContent = families.length || '';
    const tiles = families.map(f => {
      const custom = E.customFamilies.find(x => x.key === f.key);
      const c = document.createElement('div');
      c.className = 'theme theme--family';
      c.style.setProperty('--tint', f.variants[0].a);
      c.innerHTML = '<span class="family__stage"><span class="family__hero"></span><span class="family__side"></span></span><span class="family__foot"><span class="family__text"><span class="family__title"></span><span class="family__sub"><span></span></span></span><span class="theme__swatches"></span></span>';
      const first = custom ? custom.variants[0].name : null;
      if (first) {
        c.querySelector('.family__hero').append(canvas(64, 'arrow', first));
        c.querySelector('.family__side').append(canvas(34, 'hand', first), canvas(34, 'wait', first));
      }
      c.querySelector('.family__title').textContent = f.name;
      c.querySelector('.family__title').translate = false;
      c.querySelector('.family__sub').firstChild.textContent = f.variants.length === 1 ? tr('1 colour') : tr('{0} colours', f.variants.length);
      const actions = c.querySelector('.theme__swatches');
      for (const [label, glyph, act] of [['Edit', 'pencil-simple', () => { draft = JSON.parse(JSON.stringify(f)); index = 0; render(); $('w-name').value = draft.name; document.querySelector('.view--workshop').scrollIntoView({ block: 'start' }); }],
        ['Use', 'cursor', () => { if (first && Lampfish.mouse) Lampfish.mouse.use(first); }],
        ['Remove', 'trash-simple', () => send('workshop.remove', { key: f.key })]]) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'theme__action';
        b.innerHTML = icon(glyph);
        b.title = tr(label);
        b.setAttribute('aria-label', b.title);
        b.addEventListener('click', e => { e.stopPropagation(); act(); });
        actions.append(b);
      }
      return c;
    });
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'theme theme--add';
    add.innerHTML = '<strong>+</strong><span></span>';
    add.lastChild.textContent = tr('New family');
    add.addEventListener('click', () => { draft = fresh(); index = 0; $('w-name').value = ''; render(); $('w-name').focus(); });
    $('w-families').replaceChildren(...tiles, add);
    for (let i = canvases.length - 1; i >= 0; i--) if (!canvases[i].c.isConnected) canvases.splice(i, 1);
    for (const a of canvases) if (a.name !== DRAFT && a.c.closest('#w-families')) E.draw(a.c, a.c.width, a.name, a.role, .6, false);
  }

  function save(e) {
    if (e) e.preventDefault();
    if (nameProblem()) { render(); return; }
    draft.name = draft.name.trim();
    send('workshop.save', { family: { key: draft.key, name: draft.name, variants: draft.variants.map(v => ({ variant: v.variant, style: v.style, a: v.a, b: v.b })) } });
  }

  function state(n) {
    families = n.families || [];
    E.setCustom(families);
    // After a first save, the draft becomes that family: the next save updates it instead of making a copy.
    if (!draft.key) { const made = families.find(f => f.name === draft.name.trim()); if (made) draft.key = made.key; }
    else if (!families.some(f => f.key === draft.key)) draft.key = null;
    renderFamilies();
    render();
  }

  function visible(yes) { if (yes) { E.warm(); render(); } }

  build();
  $('w-a').addEventListener('input', e => { const v = cur(); v.a = e.target.value; rename(v); render(); });
  $('w-b').addEventListener('input', e => { cur().b = e.target.value; render(); });
  $('w-name').addEventListener('input', e => { draft.name = e.target.value; note = ''; render(); });
  $('w-form').addEventListener('submit', save);
  $('w-create').addEventListener('click', () => save());
  $('w-try-link').addEventListener('click', e => e.preventDefault());
  for (const b of $('w-tabs').children) b.addEventListener('click', () => {
    tab = b.dataset.tab;
    for (const x of $('w-tabs').children) x.setAttribute('aria-checked', String(x === b));
    $('w-design').hidden = tab !== 'design';
    $('w-files').hidden = tab !== 'files';
    if (Lampfish.workshopFiles) Lampfish.workshopFiles.visible(tab === 'files');
  });

  // From files (W2): a pack dropped or chosen is read by Workshop.cs; each role shows what was found, can be replaced or
  // emptied, and Create makes it a theme of Mouse. The install.inf of a pack is read, never run.
  let pack = null;
  const preview = a => { const img = document.createElement('img'); img.alt = ''; if (a) { img.src = `/app/cursor-cache/${encodeURIComponent(a.key)}-${a.retro ? 32 : 64}.png`; img.classList.toggle('retro', a.retro); } return img; };
  function renderFiles() {
    const host = $('w-files');
    const intro = document.createElement('div');
    intro.className = 'w-drop';
    intro.innerHTML = icon('upload-simple');
    const text = document.createElement('span');
    text.innerHTML = '<b></b><small></small>';
    text.firstChild.textContent = tr('Drop a cursor pack here');
    text.lastChild.textContent = tr('A .zip, its install.inf, or one .cur or .ani per role. Read here, never run.');
    const choose = document.createElement('button');
    choose.type = 'button';
    choose.className = 'button';
    choose.innerHTML = icon('folder-open');
    choose.append(tr('Choose files'));
    choose.addEventListener('click', () => send('workshop.pick'));
    intro.append(text, choose);
    if (!pack) { host.replaceChildren(intro); return; }
    const found = pack.roles.filter(r => r.file).length;
    const head = document.createElement('form');
    head.className = 'w-packhead';
    head.innerHTML = '<input maxlength="30" autocomplete="off"><button type="submit" class="button button--accent"></button><button type="button" class="link"></button>';
    const input = head.querySelector('input');
    input.value = pack.name;
    input.translate = false;
    input.setAttribute('aria-label', tr('Name the theme'));
    head.querySelector('.button--accent').innerHTML = icon('plus');
    head.querySelector('.button--accent').append(tr('Create'));
    head.querySelector('.link').innerHTML = icon('x');
    head.querySelector('.link').append(tr('Start over'));
    head.addEventListener('submit', e => { e.preventDefault(); send('workshop.packSave', { name: input.value }); });
    head.querySelector('.link').addEventListener('click', () => send('workshop.packReset'));
    const count = document.createElement('p');
    count.className = 'w-note';
    count.textContent = tr('{0} of 17 roles found. A click on a role picks another file.', found);
    const grid = document.createElement('div');
    grid.className = 'w-slots';
    for (const r of pack.roles) {
      const b = document.createElement('div');
      b.className = 'w-slot' + (r.file ? '' : ' is-empty');
      b.tabIndex = 0;
      b.setAttribute('role', 'button');
      b.title = r.file || tr('Pick a file for this role');
      const box = document.createElement('span');
      box.className = 'w-slot__case';
      box.append(r.file ? preview(r.preview) : Object.assign(document.createElement('span'), { innerHTML: icon('plus') }));
      const name = document.createElement('span');
      name.className = 'w-slot__name';
      name.textContent = tr(SHORT_ROLE[r.name] || r.name);
      b.append(box, name);
      if (r.file) {
        const x = document.createElement('button');
        x.type = 'button';
        x.className = 'w-swatch__remove';
        x.innerHTML = icon('x');
        x.title = tr('Empty this role');
        x.setAttribute('aria-label', x.title);
        x.addEventListener('click', e => { e.stopPropagation(); send('workshop.clear', { role: r.id }); });
        b.append(x);
      }
      const pick = () => send('workshop.slot', { role: r.id });
      b.addEventListener('click', pick);
      b.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
      grid.append(b);
    }
    host.replaceChildren(head, count, grid, intro);
  }
  const SHORT_ROLE = { 'Working in background': 'Background', 'Vertical resize': 'Vertical', 'Horizontal resize': 'Horizontal', 'Diagonal resize 1': 'Diagonal down', 'Diagonal resize 2': 'Diagonal up', 'Alternate select': 'Alternate' };
  function event(m) { if (m.type === 'workshop.pack') { pack = m.pack; renderFiles(); } }
  renderFiles();

  Lampfish.workshop = { state, visible, event };
})();
