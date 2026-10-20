'use strict';

(function () {
  const TYPES = { videos: 'Videos', images: 'Images', audio: 'Audio', documents: 'Documents', code: 'Code', archives: 'Archives', apps: 'Apps', system: 'System', others: 'Other' };
  const LEVELS = 7, REFINE = 0.86, DURATION_ZOOM = 420;
  const TURN = Math.PI * 2;

  let f = null;
  let view = null;
  let sectors = [];
  let hover = null, chosen = null, shown = false;
  let zoom = { d0: 0, d1: TURN, k: 0 };
  let anim = null, pendingTree = null;
  let geo = { w: 0, h: 0, cx: 0, cy: 0, r0: 0, base: 0 };

  const zone = $('f-zone'), canvas = $('f-canvas'), ctx = canvas.getContext('2d');
  const center = $('f-center');

  const UNITS = ['bytes', 'KB', 'MB', 'GB', 'TB'].map(u => tr(u));
  function size(o) {
    let i = 0;
    while (o >= 1024 && i < UNITS.length - 1) { o /= 1024; i++; }
    return o.toLocaleString(LOCALE, { maximumFractionDigits: i === 0 || o >= 100 ? 0 : 1 }) + ' ' + UNITS[i];
  }
  const number = n => n.toLocaleString(LOCALE);
  const plural = (n, word) => number(n) + ' ' + tr(word + (n > 1 ? 's' : ''));
  const joinPath = (c, name) => c.endsWith('\\') ? c + name : c + '\\' + name;

  function layOut() {
    sectors = [];
    if (!view || !view.tree) return;
    const root = view.tree;
    (function down(n, a0, a1, k, p, path) {
      if (!n.e || !n.t) return;
      let a = a0;
      n.e.forEach((e, i) => {
        const b = a + (a1 - a0) * e.t / n.t;
        const s = { n: e, a0: a, a1: b, k, i, p, path: e.s ? null : joinPath(path, e.n) };
        sectors.push(s);
        if (k < LEVELS && e.e) down(e, a, b, k + 1, s, s.path);
        a = b;
      });
    })(root, 0, TURN, 1, null, view.path);
  }

  const radius = level => level <= 0 ? geo.r0 : geo.r0 + geo.base * (1 - Math.pow(REFINE, level)) / (1 - REFINE);

  function measure() {
    const w = zone.clientWidth, h = zone.clientHeight, dpr = devicePixelRatio || 1;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const R = Math.max(60, Math.min(w, h) / 2 - 10);
    geo = { w, h, cx: w / 2, cy: h / 2, r0: R * 0.27, base: 0 };
    geo.base = (R - geo.r0) * (1 - REFINE) / (1 - Math.pow(REFINE, LEVELS));
    const d = Math.round(geo.r0 * 2 - 4);
    center.style.width = center.style.height = d + 'px';
    center.style.setProperty('--d', d + 'px');
    zone.style.setProperty('--ring', Math.round(geo.r0 * 2 + 36) + 'px');
  }

  function isAncestor(a, s) {
    for (let x = s; x; x = x.p) if (x === a) return true;
    return false;
  }

  function color(s) {
    const active = hover || chosen;
    if (active) {
      if (s === active) return '#9561f3';
      if (isAncestor(s, active)) return `oklch(0.50 0.085 295)`;
      if (isAncestor(active, s)) return `oklch(0.42 0.06 295)`;
    }
    const n = s.n;
    let l = 0.47 - (s.k - 1) * 0.03 + (s.i % 2 ? 0.04 : 0);
    if (n.s === 'system') return '#1f2029';
    if (n.s) return `oklch(${(l - 0.13).toFixed(3)} 0.01 280)`;
    if (!n.d) return `oklch(${(l - 0.07).toFixed(3)} 0.018 280)`;
    return `oklch(${l.toFixed(3)} 0.032 280)`;
  }

  function draw() {
    ctx.clearRect(0, 0, geo.w, geo.h);
    if (!sectors.length) return;
    const { cx, cy } = geo, extended = zoom.d1 - zoom.d0;
    const angle = a => (a - zoom.d0) / extended * TURN - Math.PI / 2;
    ctx.lineJoin = 'round';
    const labels = [];
    for (const s of sectors) {
      const k = s.k - zoom.k;
      if (k <= 0 || k > LEVELS) continue;
      const a0 = Math.max(s.a0, zoom.d0), a1 = Math.min(s.a1, zoom.d1);
      if (a1 <= a0) continue;
      const r1 = radius(k - 1) + 1, r2 = radius(k);
      const t0 = angle(a0), t1 = angle(a1);
      if ((t1 - t0) * r2 < 1.2) continue;
      ctx.beginPath();
      ctx.arc(cx, cy, r2, t0, t1);
      ctx.arc(cx, cy, r1, t1, t0, true);
      ctx.closePath();
      ctx.fillStyle = color(s);
      ctx.fill();

      ctx.strokeStyle = '#14151b';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      if (!anim && k <= 2 && r2 - r1 >= 18) labels.push({ s, t0, t1, r: (r1 + r2) / 2 });
    }

    ctx.font = '600 12px "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const e of labels) {
      const place = (e.t1 - e.t0) * e.r - 16;
      if (place < 30) continue;
      let text = tr(e.s.n.n);
      if (ctx.measureText(text).width > place) {
        while (text.length > 1 && ctx.measureText(text + '…').width > place) text = text.slice(0, -1);
        text = text.trimEnd() + '…';
        if (text.length < 4) continue;
      }
      const m = (e.t0 + e.t1) / 2;
      let rot = m + Math.PI / 2;
      const down = Math.sin(m) > 0;
      if (down) rot += Math.PI;
      ctx.save();
      ctx.translate(cx + Math.cos(m) * e.r, cy + Math.sin(m) * e.r);
      ctx.rotate(rot);
      ctx.fillStyle = (e.s === hover || e.s === chosen) ? '#fff' : 'rgba(232, 233, 240, .9)';
      ctx.fillText(text, 0, 0);
      ctx.restore();
    }
  }

  function renderCenter() {
    if (f && f.running) return;
    const s = hover || chosen;
    const total = view && view.tree ? view.tree.t : 0;
    let name, value, detail;
    if (s) {
      const n = s.n;
      name = n.n;
      value = size(n.t);
      const part = total ? Math.round(n.t / total * 1000) / 10 : 0;
      detail = n.s === 'system' ? 'unreadable without administrator rights'
        : (n.d || n.s ? plural(n.f, 'file') + ' · ' : '') + part.toLocaleString(LOCALE) + ' %';
    } else if (view && view.tree) {
      name = view.crumbs[view.crumbs.length - 1].name;
      value = size(total);
      detail = plural(view.tree.f, 'file');
    } else {
      name = ''; value = ''; detail = '';
    }
    center.querySelector('.name-center').textContent = name;
    center.querySelector('.value-center').textContent = value;
    center.querySelector('.detail-center').textContent = detail;

    center.classList.toggle('up', !!view && view.crumbs.length > 1 && !s);
  }

  function find(x, y) {
    const dx = x - geo.cx, dy = y - geo.cy, r = Math.hypot(dx, dy);
    if (r < geo.r0) return 'center';
    let k = 0;
    while (k < LEVELS && radius(k + 1) < r) k++;
    if (k >= LEVELS) return null;
    let t = Math.atan2(dy, dx) + Math.PI / 2;
    if (t < 0) t += TURN;
    const a = zoom.d0 + t / TURN * (zoom.d1 - zoom.d0);
    return sectors.find(s => s.k - zoom.k === k + 1 && a >= s.a0 && a < s.a1) || null;
  }

  function setHover(s) {
    if (s === hover) return;
    hover = s;
    draw();
    renderCenter();
    for (const l of $('f-contents').children) l.classList.toggle('hover', !!s && l.sector === s);
  }

  canvas.addEventListener('pointermove', e => {
    if (anim) return;
    const r = canvas.getBoundingClientRect(), s = find(e.clientX - r.left, e.clientY - r.top);
    const clickable = s === 'center' ? !!(chosen || (view && view.crumbs.length > 1)) : !!s && !s.n.s;
    canvas.style.cursor = clickable ? 'pointer' : 'default';
    setHover(s === 'center' ? null : s);
  });
  canvas.addEventListener('pointerleave', () => setHover(null));
  canvas.addEventListener('click', e => {
    if (anim) return;
    const r = canvas.getBoundingClientRect(), s = find(e.clientX - r.left, e.clientY - r.top);
    if (s === 'center') { if (chosen) { chosen = null; draw(); renderCenter(); renderFooter(); } else up(); return; }
    if (s) enable(s);
  });

  function enable(s) {
    if (s.n.s) return;
    if (s.n.d) { enter(s); return; }
    chosen = chosen === s ? null : s;
    draw();
    renderCenter();
    renderFooter();
  }

  function animate(de, to, end) {
    const start = performance.now(), reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    anim = true;
    hover = null;
    (function step(t) {
      let x = reduced ? 1 : Math.min(1, (t - start) / DURATION_ZOOM);
      x = 1 - Math.pow(1 - x, 3);
      zoom = { d0: de.d0 + (to.d0 - de.d0) * x, d1: de.d1 + (to.d1 - de.d1) * x, k: de.k + (to.k - de.k) * x };
      draw();
      if (x < 1) requestAnimationFrame(step);
      else { anim = null; end(); }
    })(start);
  }

  function enter(s) {
    chosen = null;
    send('files.open', { path: s.path });
    animate({ d0: 0, d1: TURN, k: 0 }, { d0: s.a0, d1: s.a1, k: s.k }, () => {
      if (pendingTree) { const m = pendingTree; pendingTree = null; receiveTree(m); }
    });
  }

  function up(path) {
    if (!view || view.crumbs.length < 2) return;
    chosen = null;
    send('files.open', { path: path || view.crumbs[view.crumbs.length - 2].path, from: view.path });
  }

  function receiveTree(m) {
    if (anim) { pendingTree = m; return; }
    view = m;
    chosen = null;
    hover = null;
    layOut();
    zoom = { d0: 0, d1: TURN, k: 0 };

    const from = m.from && sectors.find(s => s.path && s.path.toLowerCase() === m.from.toLowerCase());
    if (from) animate({ d0: from.a0, d1: from.a1, k: from.k }, { d0: 0, d1: TURN, k: 0 }, () => draw());
    else draw();
    renderCenter();
    renderCrumbs();
    renderContents();
    renderFooter();
  }

  const GLYPHS = {
    disk: '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 14h16M8 16.5h.01"/>',
    bramble: '<path d="M4.5 11 12 4.5l7.5 6.5V19a1 1 0 0 1-1 1h-4v-5h-5v5h-4a1 1 0 0 1-1-1z"/>',
    folder: '<path d="M3.5 7.5V17a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2V9.5a2 2 0 0 0-2-2h-6.2l-2-2.5H5.5a2 2 0 0 0-2 2z"/>',
    file: '<path d="M7 3.5h7l4 4v13H7z"/><path d="M14 3.5v4h4"/>',
    group: '<circle cx="7" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="17" cy="12" r="1.3"/>',
    videos: '<rect x="3.5" y="6" width="12" height="12" rx="2"/><path d="m15.5 10 5-3v10l-5-3"/>',
    images: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="m3.5 16 5-5 4 4 2.5-2.5 5.5 5.5"/><circle cx="15.5" cy="9.5" r="1.3"/>',
    audio: '<path d="M9 17.5V6l10-2v11.5"/><circle cx="6.5" cy="17.5" r="2.5"/><circle cx="16.5" cy="15.5" r="2.5"/>',
    documents: '<path d="M7 3.5h7l4 4v13H7z"/><path d="M14 3.5v4h4M10 12h5M10 15.5h5"/>',
    code: '<path d="m9 8-4 4 4 4M15 8l4 4-4 4"/>',
    archives: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M12 4v3M12 9v2M12 13v2"/><rect x="10.5" y="15" width="3" height="3" rx=".6"/>',
    apps: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    system: '<circle cx="12" cy="12" r="3"/><path d="M12 3.5v2.5M12 18v2.5M20.5 12H18M6 12H3.5M18 6l-1.8 1.8M7.8 16.2 6 18M18 18l-1.8-1.8M7.8 7.8 6 6"/>',
    others: '<circle cx="7" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="17" cy="12" r="1.3"/>',
  };
  const glyph = name => '<svg class="glyph glyph--small" viewBox="0 0 24 24" aria-hidden="true">' + (GLYPHS[name] || GLYPHS.file) + '</svg>';
  const ICON_COPY = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"/></svg>';
  function copy(text, message) {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => toast(message || tr('Copied: {0}', text), false, 2200));
  }

  function renderCrumbs() {
    const crumbs = $('f-crumbs');
    crumbs.replaceChildren();
    if (!view) return;
    view.crumbs.forEach((e, i) => {
      if (i) crumbs.append(Object.assign(document.createElement('span'), { className: 'sep', textContent: '›' }));
      const b = document.createElement('button');
      b.textContent = e.name;
      b.title = e.path;
      if (i === view.crumbs.length - 1) b.setAttribute('aria-current', 'location');
      else b.addEventListener('click', () => up(e.path));
      crumbs.append(b);
    });
  }

  function renderFooter() {
    const show = $('f-show');
    show.hidden = !view;
    $('f-copy').hidden = !view;
    if (f && f.running) return;
    $('f-footer').textContent = f && f.analyzed
      ? `${plural(f.files, 'file')} · ${size(f.bytes)} · ${tr('analyzed in {0} s', Math.max(1, Math.round(f.duration)).toLocaleString(LOCALE))}`
      : '';
  }

  function renderContents() {
    const list = $('f-contents');
    const children = view && view.tree && view.tree.e ? view.tree.e : [];
    const first = sectors.filter(s => s.k === 1).slice(0, 10);
    const max = first.length ? first[0].n.t : 1;
    list.replaceChildren(...first.map(s => {
      const b = document.createElement('button');
      b.className = 'row element' + (s.n.s ? ' grouped' : '');
      b.sector = s;
      b.innerHTML = glyph(s.n.s ? 'group' : s.n.d ? 'folder' : 'file') + '<span class="name-element"></span><span class="size"></span><i></i>';
      b.querySelector('.name-element').textContent = s.n.n;
      if (s.path) {
        const c = document.createElement('span');
        c.className = 'copy-row';
        c.title = tr('Copy path');
        c.innerHTML = ICON_COPY;
        c.addEventListener('click', ev => { ev.stopPropagation(); copy(s.path); });
        b.querySelector('.size').before(c);
      }
      b.querySelector('.size').textContent = size(s.n.t);
      b.querySelector('i').style.width = `calc((100% - 64px) * ${(s.n.t / max).toFixed(4)})`;
      b.disabled = !!s.n.s;
      b.addEventListener('pointerenter', () => setHover(s));
      b.addEventListener('pointerleave', () => setHover(null));
      b.addEventListener('focus', () => setHover(s));
      b.addEventListener('blur', () => setHover(null));
      b.addEventListener('click', () => enable(s));
      return b;
    }));
    if (!children.length) list.innerHTML = '<div class="row empty">Empty</div>';
    $('f-contents-title').hidden = list.hidden = !view;
  }

  function renderSources() {
    const sources = $('f-sources');
    const same = (a, b) => a && b && a.replace(/\\$/, '').toLowerCase() === b.replace(/\\$/, '').toLowerCase();
    const rows = f.disks.map(d => ({ icon: 'disk', name: d.name, value: size(d.size), action: () => send('files.source', { value: d.path }), active: same(f.source, d.path) }));
    rows.push({ icon: 'bramble', name: 'Home folder', value: '', action: () => send('files.source', { value: 'custom' }), active: same(f.source, f.custom) });
    const other = !rows.some(l => l.active);
    rows.push({ icon: 'folder', name: other ? f.sourceName : 'Choose a folder', value: '', action: () => send('files.browse'), active: other, choose: true });
    sources.replaceChildren(...rows.map(l => {
      const b = document.createElement('button');
      b.className = 'row action f-source' + (l.active ? ' active' : '');
      b.innerHTML = glyph(l.icon) + '<span class="name-source"></span><span class="value"></span>';
      b.querySelector('.name-source').textContent = l.name;
      b.querySelector('.value').textContent = l.value;
      if (l.active) b.setAttribute('aria-current', 'true');
      b.addEventListener('click', l.action);
      return b;
    }));

    const restart = $('f-restart').querySelector('.caption > span');
    restart.firstChild.textContent = f.running ? 'Stop the analysis' : 'Run the analysis again';
    restart.querySelector('small').textContent = f.running ? 'Stops reading the folders' : 'Reads the contents again';
    $('f-restart').querySelector('.glyph').innerHTML = f.running ? '<rect x="7" y="7" width="10" height="10" rx="1.5"/>' : '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4v4h-4"/>';
  }

  function renderTypes() {
    const list = $('f-types');
    const types = f.types || [];
    $('f-types-title').hidden = list.hidden = !types.length;
    const total = types.reduce((s, t) => s + t.bytes, 0) || 1;
    list.replaceChildren(...types.map(t => {
      const l = document.createElement('div');
      l.className = 'row element type-file';
      l.innerHTML = glyph(t.type) + '<span class="name-element"></span><span class="size"></span><i></i>';
      l.querySelector('.name-element').textContent = TYPES[t.type] || t.type;
      l.querySelector('.size').textContent = size(t.bytes);
      l.querySelector('i').style.width = `calc((100% - 64px) * ${(t.bytes / types[0].bytes).toFixed(4)})`;
      l.title = plural(t.number, 'file') + ' · ' + (Math.round(t.bytes / total * 1000) / 10).toLocaleString(LOCALE) + ' %';
      return l;
    }));
  }

  function renderAnalysis() {
    zone.classList.toggle('analysis', f.running);
    center.classList.toggle('analysis', f.running);
    if (f.running) {
      view = null;
      sectors = [];
      draw();
      renderCrumbs();
      renderContents();
      center.querySelector('.name-center').textContent = 'Analysis';
      center.classList.remove('up');
    }
  }

  function progress(m) {
    if (!f || !f.running) return;
    center.querySelector('.value-center').textContent = size(m.bytes);
    center.querySelector('.detail-center').textContent = plural(m.files, 'file');
    $('f-footer').textContent = m.folder || '';
  }

  function state(s) {
    const before = f;
    f = s;
    renderSources();
    renderTypes();
    if (!before || before.running !== f.running) renderAnalysis();
    renderCenter();
    renderFooter();
  }

  function event(m) {
    if (m.type === 'files.tree') receiveTree(m);
    else if (m.type === 'files.progress') progress(m);
  }

  function visible(yes) {
    if (yes === shown) return;
    shown = yes;
    send('files.visible', { value: yes, path: view ? view.path : null });
    if (yes) requestAnimationFrame(() => { measure(); draw(); });
  }

  new ResizeObserver(() => { if (shown) { measure(); draw(); } }).observe(zone);
  $('f-restart').addEventListener('click', () => send(f && f.running ? 'files.stop' : 'files.restart'));
  $('f-copy').addEventListener('click', () => copy(chosen ? chosen.path : view && view.path));
  $('f-copy-names').addEventListener('click', () => {
    const names = sectors.filter(s => s.k === 1 && !s.n.s).map(s => s.n.n);
    if (names.length) copy(names.join('\r\n'), tr('{0} names copied', names.length));
  });
  $('f-show').addEventListener('click', () => send('files.show', { path: chosen ? chosen.path : view && view.path }));
  addEventListener('keydown', e => {
    if (!shown || e.target.closest('input')) return;
    if (e.key === 'Escape' || e.key === 'Backspace') {
      if (chosen) { chosen = null; draw(); renderCenter(); renderFooter(); }
      else up();
    }
  });

  Bramble.files = { state, event, visible };
})();
