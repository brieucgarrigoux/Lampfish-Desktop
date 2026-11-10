'use strict';

// Convert: hand over files, pick what they become, and the results land in the Shelf. Everything is done by lampfish on this PC.
(function () {
  const UNITS = ['bytes', 'KB', 'MB', 'GB'];
  const size = n => { let i = 0; while (n >= 1024 && i < UNITS.length - 1) { n /= 1024; i++; } return n.toLocaleString(LOCALE, { maximumFractionDigits: n >= 100 || i === 0 ? 0 : 1 }) + ' ' + tr(UNITS[i]); };
  const FILE = 'file';

  // What each kind of file can become. `opts` names the choices that matter for it.
  const TARGETS = {
    image: [
      { id: 'png', target: 'image', format: 'png', name: 'PNG', help: 'Sharp, keeps transparency', opts: ['maxSide'] },
      { id: 'jpg', target: 'image', format: 'jpg', name: 'JPG', help: 'Light, made for photographs', opts: ['maxSide', 'quality'] },
      { id: 'bmp', target: 'image', format: 'bmp', name: 'BMP', help: 'Plain and large', opts: ['maxSide'] },
      { id: 'gif', target: 'image', format: 'gif', name: 'GIF', help: '256 colors', opts: ['maxSide'] },
      { id: 'tiff', target: 'image', format: 'tiff', name: 'TIFF', help: 'For printing and scans', opts: ['maxSide'] },
      { id: 'ico', target: 'image', format: 'ico', name: 'Icon', help: 'An .ico file, 256 px', opts: [] },
      { id: 'pdf', target: 'pdf-from-images', name: 'PDF', help: 'One PDF, a page per image', opts: ['maxSide'] },
    ],
    pdf: [
      { id: 'png', target: 'pdf-to-images', format: 'png', name: 'Images (PNG)', help: 'One image per page', opts: ['pages', 'scale'] },
      { id: 'jpg', target: 'pdf-to-images', format: 'jpg', name: 'Images (JPG)', help: 'One lighter image per page', opts: ['pages', 'scale', 'quality'] },
      { id: 'merge', target: 'merge', name: 'Merge', help: 'One PDF from these, in this order', needs: 2 },
      { id: 'pages', target: 'pages', name: 'Keep some pages', help: 'A new PDF with the pages you name', opts: ['pages'], pagesRequired: true },
      { id: 'rotate', target: 'rotate', name: 'Rotate', help: 'Every page turned the same way', opts: ['angle'] },
    ],
    text: [{ id: 'pdf', target: 'text-to-pdf', name: 'PDF', help: 'The text on A4 pages', opts: [] }],
    word: [{ id: 'pdf', target: 'office-to-pdf', name: 'PDF', help: 'Made by Word', opts: [], office: 'word' }],
    sheet: [{ id: 'pdf', target: 'office-to-pdf', name: 'PDF', help: 'Made by Excel', opts: [], office: 'sheet' }],
    slides: [{ id: 'pdf', target: 'office-to-pdf', name: 'PDF', help: 'Made by PowerPoint', opts: [], office: 'slides' }],
  };
  // What a person comes to do: each tile opens the file dialog for that job and leaves the matching choice picked.
  const TOOLS = [
    { id: 'image', name: 'Change an image', help: 'PNG, JPG, BMP, GIF, TIFF or an icon', wanted: 'png', icon: 'image' },
    { id: 'images-pdf', name: 'Images to PDF', help: 'A page for each picture', wanted: 'pdf', icon: 'file-pdf' },
    { id: 'pdf-images', name: 'PDF to images', help: 'One picture for each page', wanted: 'png', icon: 'images' },
    { id: 'merge', name: 'Merge PDFs', help: 'Several files into one', wanted: 'merge', icon: 'arrows-merge' },
    { id: 'pages', name: 'Keep some pages', help: 'Cut a PDF down to the pages you name', wanted: 'pages', icon: 'lf-pages-keep' },
    { id: 'rotate', name: 'Turn the pages', help: 'Every page of a PDF, the same way', wanted: 'rotate', icon: 'arrow-clockwise' },
    { id: 'text', name: 'Text to PDF', help: 'TXT, Markdown or CSV on A4 pages', wanted: 'pdf', icon: 'text-t' },
    { id: 'office', name: 'Office to PDF', help: 'Word, Excel and PowerPoint', wanted: 'pdf', icon: 'file-doc', office: true },
  ];
  let files = [], kind = null, office = {}, target = null, running = false, wanted = null, recent = [];
  const opt = { maxSide: 0, quality: 85, scale: 2, angle: 90, pages: '' };
  const el = (tag, className, text) => Object.assign(document.createElement(tag), { className: className || '', textContent: text || '' });

  function tiles() {
    const any = office.word || office.sheet || office.slides;
    $('cv-tiles').replaceChildren(...TOOLS.map(t => {
      const b = el('button', 'cv-tile');
      b.type = 'button';
      const missing = t.office && !any;
      b.disabled = missing;
      b.innerHTML = `<span class="cv-tile__icon">${icon(t.icon)}</span><span class="cv-tile__what"><b></b><small></small></span>`;
      b.querySelector('b').textContent = tr(t.name);
      b.querySelector('small').textContent = missing ? tr('Needs Microsoft Office on this PC') : tr(t.help);
      b.addEventListener('click', () => send('convert.pick', { tool: t.id }));
      return b;
    }));
    $('cv-recent-zone').hidden = !recent.length;
    $('cv-recent').replaceChildren(...recent.map(o => result(o, true)));
  }

  function ingest(m) {
    office = { word: m.word, sheet: m.sheet, slides: m.slides };
    const tool = TOOLS.find(t => t.id === m.tool);
    if (tool) wanted = tool.wanted;
    const fresh = m.files.filter(f => f.kind !== 'other' && !files.some(x => x.path === f.path));
    files = files.concat(fresh);
    $('cv-results').hidden = true;
    if (!files.length) { $('cv-job').hidden = true; $('cv-start').hidden = false; return; }
    if (!kind || !files.some(f => f.kind === kind)) kind = files[0].kind;
    target = null;
    paint();
  }

  function paint() {
    $('cv-start').hidden = !!files.length;
    $('cv-job').hidden = !files.length;
    if (!files.length) return;
    const mine = files.filter(f => f.kind === kind);
    const left = files.length - mine.length;
    $('cv-left').hidden = !left;
    if (left) $('cv-left').textContent = tr(left === 1 ? '1 file of another kind is left out: convert it separately.' : '{0} files of other kinds are left out: convert them separately.', left);
    $('cv-files').replaceChildren(...files.map((f, i) => row(f, i, f.kind === kind, mine.length)));
    const list = (TARGETS[kind] || []).filter(t => (!t.needs || mine.length >= t.needs));
    if (!target || !list.some(t => t.id === target.id)) target = list.find(t => t.id === wanted && (!t.office || office[t.office])) || list.find(t => !t.office || office[t.office]) || null;
    $('cv-targets').replaceChildren(...list.map(t => {
      const b = el('button', 'cv-target');
      b.type = 'button';
      b.setAttribute('role', 'radio');
      const missing = t.office && !office[t.office];
      b.disabled = !!missing;
      b.setAttribute('aria-checked', String(!!target && target.id === t.id));
      b.innerHTML = '<b></b><small></small>';
      b.querySelector('b').textContent = tr(t.name);
      b.querySelector('small').textContent = missing ? tr('Needs Microsoft Office on this PC') : tr(t.help);
      b.addEventListener('click', () => { target = t; paint(); });
      return b;
    }));
    options();
    $('cv-run').disabled = running || !target || (target.pagesRequired && !opt.pages.trim());
  }

  function row(f, i, active, count) {
    const r = el('div', 'row cv-file' + (active ? '' : ' is-left'));
    r.innerHTML = `<span class="caption">${icon(FILE, 'glyph')}<span><span class="cv-name" translate="no"></span><small></small></span></span><span class="cv-tools"></span>`;
    r.querySelector('.cv-name').textContent = f.name;
    r.querySelector('small').textContent = size(f.size);
    const tools = r.querySelector('.cv-tools');
    const tool = (label, symbol, run, off) => {
      const b = el('button', 'cv-tool');
      b.type = 'button'; b.title = tr(label); b.disabled = !!off;
      b.setAttribute('aria-label', tr(label) + ', ' + f.name);
      b.innerHTML = icon(symbol);
      b.addEventListener('click', run);
      tools.append(b);
    };
    if (active && count > 1) {
      tool('Move up', 'caret-up', () => move(i, -1), i === 0);
      tool('Move down', 'caret-down', () => move(i, 1), i === files.length - 1);
    }
    tool('Take off the list', 'x', () => { files.splice(i, 1); if (!files.length) kind = null; paint(); });
    return r;
  }

  function move(i, step) {
    const j = i + step;
    if (j < 0 || j >= files.length) return;
    [files[i], files[j]] = [files[j], files[i]];
    paint();
  }

  const CHOICES = {
    maxSide: { label: 'Largest side', help: 'Smaller pictures weigh less', values: [[0, 'Original'], [3840, '3840 px'], [1920, '1920 px'], [1280, '1280 px'], [800, '800 px']] },
    scale: { label: 'Sharpness', help: 'A page drawn larger is sharper and heavier', values: [[1, 'Normal'], [2, 'Sharp'], [3, 'Very sharp']] },
    angle: { label: 'Turn', help: 'Clockwise', values: [[90, '90°'], [180, '180°'], [270, '270°']] },
  };

  function options() {
    const zone = $('cv-options');
    const names = target ? target.opts || [] : [];
    zone.hidden = !names.length;
    zone.replaceChildren(...names.map(n => {
      const r = el('div', 'row row--setting');
      if (n === 'quality') {
        r.innerHTML = '<span class="caption">' + icon('lf-quality', 'glyph') + '<span></span></span><div class="cv-range"><input type="range" min="40" max="100" step="5" aria-label=""><output></output></div>';
        r.querySelector('.caption > span').innerHTML = '<span></span><small></small>';
        r.querySelectorAll('.caption > span > span')[0].textContent = tr('Quality');
        r.querySelector('small').textContent = tr('Higher is sharper and heavier');
        const input = r.querySelector('input'), out = r.querySelector('output');
        input.value = opt.quality; out.textContent = opt.quality; fill(input);
        input.setAttribute('aria-label', tr('Quality'));
        input.addEventListener('input', () => { opt.quality = Number(input.value); out.textContent = input.value; fill(input); });
      } else if (n === 'pages') {
        r.innerHTML = '<span class="caption">' + icon('files', 'glyph') + '<span><span></span><small></small></span></span><input type="text" class="cv-pages" autocomplete="off" spellcheck="false">';
        r.querySelectorAll('.caption > span > span')[0].textContent = tr('Pages');
        r.querySelector('small').textContent = tr('Such as 1-3, 5. Empty means every page.');
        const input = r.querySelector('input');
        input.value = opt.pages;
        input.placeholder = target.pagesRequired ? tr('1-3, 5') : tr('All pages');
        input.setAttribute('aria-label', tr('Pages'));
        input.addEventListener('input', () => { opt.pages = input.value; $('cv-run').disabled = running || (target.pagesRequired && !opt.pages.trim()); });
      } else {
        const c = CHOICES[n];
        r.innerHTML = '<span class="caption">' + icon('list', 'glyph') + '<span><span></span><small></small></span></span><div class="segments" role="radiogroup"></div>';
        r.querySelectorAll('.caption > span > span')[0].textContent = tr(c.label);
        r.querySelector('small').textContent = tr(c.help);
        const group = r.querySelector('.segments');
        group.setAttribute('aria-label', tr(c.label));
        for (const [v, name] of c.values) {
          const b = el('button', '', tr(name));
          b.type = 'button'; b.setAttribute('role', 'radio');
          b.setAttribute('aria-checked', String(opt[n] === v));
          b.addEventListener('click', () => { opt[n] = v; for (const x of group.children) x.setAttribute('aria-checked', String(x === b)); });
          group.append(b);
        }
      }
      return r;
    }));
  }

  function run() {
    const mine = files.filter(f => f.kind === kind);
    if (!target || !mine.length) return;
    running = true;
    $('cv-run').disabled = true;
    $('cv-cancel').hidden = false;
    $('cv-progress').textContent = tr('Starting…');
    send('convert.run', { target: target.target, format: target.format || '', files: mine.map(f => f.path), maxSide: opt.maxSide, quality: opt.quality, scale: opt.scale, angle: opt.angle, pages: opt.pages });
  }

  function done(m) {
    running = false;
    $('cv-cancel').hidden = true;
    $('cv-progress').textContent = '';
    $('cv-job').hidden = true;
    $('cv-results').hidden = false;
    $('cv-done').replaceChildren(...(m.outputs.length ? m.outputs.map(o => result(o)) : [el('div', 'row empty', tr(m.cancelled ? 'Stopped before anything was done' : 'Nothing was made'))]));
    $('cv-kept').hidden = !m.outputs.length;
    $('cv-errors').hidden = !m.errors.length;
    $('cv-errors').replaceChildren(...m.errors.map(e => Object.assign(el('span', 'cv-error'), { textContent: e })));
    files = []; kind = null; target = null; wanted = null;
  }

  function result(o, old) {
    const r = el('div', 'row cv-file');
    r.innerHTML = `<span class="caption">${icon(FILE, 'glyph')}<span><span class="cv-name" translate="no"></span><small></small></span></span><span class="cv-tools"></span>`;
    r.querySelector('.cv-name').textContent = o.name;
    r.querySelector('small').textContent = old ? size(o.size) + (o.from ? ' · ' + o.from : '') : size(o.size);
    const tools = r.querySelector('.cv-tools');
    for (const [label, action, symbol] of [['Open', 'shelf.open', 'arrow-square-out'], ['Show in File Explorer', 'shelf.reveal', 'folder-open'], ['Save as…', 'convert.save', 'floppy-disk']]) {
      const b = el('button', 'link');
      b.innerHTML = icon(symbol);
      b.append(tr(label));
      b.type = 'button';
      b.addEventListener('click', () => send(action, { name: o.name }));
      tools.append(b);
    }
    return r;
  }

  function again() {
    files = []; kind = null; target = null; wanted = null;
    $('cv-results').hidden = true;
    paint();
  }

  $('cv-pick').addEventListener('click', () => send('convert.pick'));
  $('cv-add').addEventListener('click', () => send('convert.pick'));
  $('cv-run').addEventListener('click', run);
  $('cv-cancel').addEventListener('click', () => send('convert.cancel'));
  $('cv-again').addEventListener('click', again);

  Lampfish.convert = {
    visible(v) { if (v) send('convert.caps'); },
    event(m) {
      if (m.type === 'convert.caps') { office = { word: m.word, sheet: m.sheet, slides: m.slides }; recent = m.recent; tiles(); }
      else if (m.type === 'convert.files') ingest(m);
      else if (m.type === 'convert.progress') $('cv-progress').textContent = tr('{0} of {1}: {2}', m.index, m.count, m.name);
      else if (m.type === 'convert.done') done(m);
    },
  };
})();
