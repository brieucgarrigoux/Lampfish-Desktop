'use strict';

(function () {
  const zone = $('create-zone');

  const THEMES = [
    { id: 'midnight', name: 'Midnight', bg: { type: 'gradient', color: '#070815', color2: '#271c6b', angle: 165 }, particles: { type: 'fireflies', color: '#b9a2ff', amount: 45, size: 100, speed: 100 }, glow: { on: true, color: '#6c4ccf', strength: 55 } },
    { id: 'ember', name: 'Ember', bg: { type: 'gradient', color: '#0c0403', color2: '#46110a', angle: 180 }, particles: { type: 'embers', color: '#ff7a2e', amount: 55, size: 100, speed: 100 }, glow: { on: true, color: '#ff5a1f', strength: 50 } },
    { id: 'aurora', name: 'Aurora', bg: { type: 'gradient', color: '#02070d', color2: '#0a3d48', angle: 170 }, particles: { type: 'stars', color: '#c6f6ff', amount: 60, size: 100, speed: 100 }, glow: { on: true, color: '#2fd6b0', strength: 45 } },
    { id: 'sunset', name: 'Sunset', bg: { type: 'gradient', color: '#1b0a2f', color2: '#c2410c', angle: 180 }, particles: { type: 'orbs', color: '#ffb36b', amount: 50, size: 100, speed: 100 }, glow: { on: true, color: '#ff8a4c', strength: 55 } },
    { id: 'neon', name: 'Neon', bg: { type: 'gradient', color: '#04010a', color2: '#1d0046', angle: 160 }, particles: { type: 'fireflies', color: '#ff3fd2', amount: 40, size: 90, speed: 120 }, glow: { on: true, color: '#d11fff', strength: 65 } },
    { id: 'graphite', name: 'Graphite', bg: { type: 'gradient', color: '#0d0e11', color2: '#2a2d35', angle: 170 }, particles: { type: 'snow', color: '#d3dae8', amount: 40, size: 100, speed: 90 }, glow: { on: true, color: '#8b93a7', strength: 30 } },
  ];
  const PARTICLES = [['none', 'None'], ['fireflies', 'Fireflies'], ['stars', 'Stars'], ['embers', 'Embers'], ['snow', 'Snow'], ['orbs', 'Bokeh']];

  const st = {
    bg: { type: 'gradient', color: '#070815', color2: '#271c6b', angle: 165, fit: 'cover', dim: 0, vignette: 35 },
    logo: { size: 28, x: 50, y: 44, shadow: true },
    title: { text: '', size: 6, weight: 600, color: '#ece7f4', x: 50, y: 68 },
    particles: { type: 'fireflies', color: '#b9a2ff', amount: 45, size: 100, speed: 100 },
    glow: { on: true, color: '#6c4ccf', strength: 55 },
    sound: { on: true, style: 'ripples' },
    files: { logo: null, background: null },
    aspect: 1,
  };
  const ctl = {};
  let theme = 'midnight', selected = 'logo';
  let frame = null, ready = false, queued = 0;

  function config(forPreview) {
    const b = Object.assign({}, st.bg), l = Object.assign({}, st.logo);
    b.image = st.bg.type === 'image' && st.files.background ? (forPreview ? st.files.background : 'background.jpg') : null;
    l.image = st.files.logo ? (forPreview ? st.files.logo : 'logo.png') : null;
    return { v: 2, background: b, logo: l, title: Object.assign({}, st.title), particles: Object.assign({}, st.particles), glow: Object.assign({}, st.glow), sound: Object.assign({}, st.sound) };
  }

  function push() {
    layout();
    if (queued || !frame) return;
    queued = requestAnimationFrame(() => {
      queued = 0;
      if (ready && frame.contentWindow) frame.contentWindow.postMessage({ bramble: 'config', config: config(true) }, '*');
    });
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function row(label, control, help) {
    const r = el('div', 'cr-row');
    const what = el('span', 'cr-label');
    what.append(el('span', '', tr(label)));
    if (help) what.append(el('small', '', tr(help)));
    r.append(what, control);
    return r;
  }

  function card(title, icon, ...rows) {
    const c = el('section', 'cr-card');
    const h = el('h3');
    h.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg>`;
    h.append(el('span', '', tr(title)));
    c.append(h, ...rows);
    return c;
  }

  function slider(name, min, max, get, set, suffix) {
    const wrap = el('div', 'cr-slider');
    const input = Object.assign(document.createElement('input'), { type: 'range', min, max, step: 1, value: get() });
    const out = el('output');
    const paint = () => { input.style.setProperty('--pct', ((input.value - min) / (max - min) * 100) + '%'); out.textContent = input.value + (suffix || ''); };
    input.addEventListener('input', () => { set(Number(input.value)); paint(); push(); });
    ctl[name] = { sync() { input.value = get(); paint(); } };
    paint();
    wrap.append(input, out);
    return wrap;
  }

  function color(name, get, set) {
    const input = Object.assign(document.createElement('input'), { type: 'color', value: get() });
    input.className = 'cr-color';
    input.addEventListener('input', () => { set(input.value); push(); });
    ctl[name] = { sync() { input.value = get(); } };
    return input;
  }

  function toggle(name, get, set) {
    const input = Object.assign(document.createElement('input'), { type: 'checkbox', checked: get() });
    input.className = 'cr-switch';
    input.addEventListener('change', () => { set(input.checked); push(); });
    ctl[name] = { sync() { input.checked = get(); } };
    return input;
  }

  function segments(name, options, get, set) {
    const s = el('div', 'segments');
    const buttons = options.map(([key, label]) => {
      const b = el('button', '', tr(label));
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.addEventListener('click', () => { set(key); paint(); push(); });
      s.append(b);
      return [key, b];
    });
    const paint = () => { for (const [key, b] of buttons) b.setAttribute('aria-checked', String(key === get())); };
    ctl[name] = { sync: paint };
    paint();
    return s;
  }

  function readImage(file, max, mime, quality) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.naturalWidth * k));
        c.height = Math.max(1, Math.round(img.naturalHeight * k));
        const g = c.getContext('2d');
        if (mime === 'image/jpeg') { g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height); }
        g.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve({ data: c.toDataURL(mime, quality), aspect: c.height / c.width });
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image')); };
      img.src = url;
    });
  }

  const input = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif' });
  input.hidden = true;
  let pickKind = null, pickNote = {};
  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file || !pickKind) return;
    const kind = pickKind, big = kind === 'logo';
    try {
      const r = await readImage(file, big ? 1024 : 2560, big ? 'image/png' : 'image/jpeg', big ? 1 : .88);
      st.files[kind] = r.data;
      if (big) st.aspect = r.aspect;
      else st.bg.type = 'image';
      pickNote[kind].textContent = file.name;
      pickNote[kind].parentElement.querySelector('.link').hidden = false;
      for (const k of ['bgType']) ctl[k] && ctl[k].sync();
      syncBackground();
      push();
    } catch (e) { pickNote[kind].textContent = tr('This picture could not be read'); }
  });

  function picker(kind, label) {
    const wrap = el('div', 'cr-pick');
    const name = el('span', 'cr-file', tr('No picture'));
    pickNote[kind] = name;
    const choose = el('button', 'button', tr(label));
    choose.type = 'button';
    choose.addEventListener('click', () => { pickKind = kind; input.click(); });
    const clear = el('button', 'link', tr('Remove'));
    clear.type = 'button';
    clear.hidden = true;
    clear.addEventListener('click', () => {
      st.files[kind] = null;
      if (kind === 'logo') st.aspect = 1;
      name.textContent = tr('No picture');
      clear.hidden = true;
      push();
    });
    wrap.append(choose, name, clear);
    return wrap;
  }

  const rows = { gradient: [], image: [], particles: [] };
  function syncBackground() {
    for (const r of rows.gradient) r.hidden = st.bg.type !== 'gradient';
    for (const r of rows.image) r.hidden = st.bg.type !== 'image';
    for (const r of rows.particles) r.hidden = st.particles.type === 'none';
  }

  function applyTheme(t) {
    theme = t.id;
    Object.assign(st.bg, t.bg);
    Object.assign(st.particles, t.particles);
    Object.assign(st.glow, t.glow);
    for (const k of Object.keys(ctl)) ctl[k].sync();
    syncBackground();
    paintThemes();
    push();
  }

  // ---- themes
  const themes = el('div', 'cr-themes');
  const themeButtons = THEMES.map(t => {
    const b = el('button', 'cr-theme');
    b.type = 'button';
    b.style.setProperty('--a', t.bg.color);
    b.style.setProperty('--b', t.bg.color2);
    b.style.setProperty('--g', t.glow.color);
    b.style.setProperty('--p', t.particles.color);
    b.innerHTML = '<span class="cr-theme__art"><i></i><i></i><i></i></span><span class="cr-theme__name"></span>';
    b.querySelector('.cr-theme__name').textContent = tr(t.name);
    b.addEventListener('click', () => applyTheme(t));
    themes.append(b);
    return [t.id, b];
  });
  const paintThemes = () => { for (const [id, b] of themeButtons) b.setAttribute('aria-pressed', String(id === theme)); };

  // ---- cards
  const backgroundCard = card('Background', '<rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="m3.5 16 5-5 4 4 2.5-2.5 5.5 5.5"/>',
    row('Type', segments('bgType', [['color', 'Color'], ['gradient', 'Gradient'], ['image', 'Picture']], () => st.bg.type, v => { st.bg.type = v; syncBackground(); })),
    row('Color', color('bgColor', () => st.bg.color, v => { st.bg.color = v; })),
    (() => { const r = row('Second color', color('bgColor2', () => st.bg.color2, v => { st.bg.color2 = v; })); rows.gradient.push(r); return r; })(),
    (() => { const r = row('Angle', slider('bgAngle', 0, 360, () => st.bg.angle, v => { st.bg.angle = v; }, '°')); rows.gradient.push(r); return r; })(),
    (() => { const r = row('Picture', picker('background', 'Choose a picture')); rows.image.push(r); return r; })(),
    (() => { const r = row('Framing', segments('bgFit', [['cover', 'Fill'], ['contain', 'Fit']], () => st.bg.fit, v => { st.bg.fit = v; })); rows.image.push(r); return r; })(),
    row('Darken', slider('bgDim', 0, 80, () => st.bg.dim, v => { st.bg.dim = v; }, ' %')),
    row('Edge shade', slider('bgVignette', 0, 100, () => st.bg.vignette, v => { st.bg.vignette = v; }, ' %'), 'Darkens the corners'));

  const logoCard = card('Logo', '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="m12 7.8 1.2 2.6 2.8.3-2.1 1.9.6 2.8-2.5-1.4-2.5 1.4.6-2.8-2.1-1.9 2.8-.3z"/>',
    row('Logo', picker('logo', 'Choose a logo'), 'A PNG with a transparent background works best'),
    row('Size', slider('logoSize', 5, 70, () => st.logo.size, v => { st.logo.size = v; }, ' %')),
    row('Horizontal position', slider('logoX', 0, 100, () => st.logo.x, v => { st.logo.x = v; }, ' %')),
    row('Vertical position', slider('logoY', 0, 100, () => st.logo.y, v => { st.logo.y = v; }, ' %')),
    row('Soft shadow', toggle('logoShadow', () => st.logo.shadow, v => { st.logo.shadow = v; })));

  const titleInput = Object.assign(document.createElement('input'), { type: 'text', maxLength: 40, placeholder: tr('Optional text') });
  titleInput.className = 'cr-text';
  titleInput.addEventListener('input', () => { st.title.text = titleInput.value; push(); });
  const textCard = card('Text', '<path d="M5 6.5h14M12 6.5v11M9 17.5h6"/>',
    row('Text', titleInput),
    row('Size', slider('titleSize', 2, 14, () => st.title.size, v => { st.title.size = v; })),
    row('Weight', segments('titleWeight', [['400', 'Regular'], ['600', 'Medium'], ['800', 'Bold']], () => String(st.title.weight), v => { st.title.weight = Number(v); })),
    row('Color', color('titleColor', () => st.title.color, v => { st.title.color = v; })));

  const particlesCard = card('Particles', '<circle cx="7" cy="8" r="1.6"/><circle cx="16.5" cy="6.5" r="1.1"/><circle cx="13" cy="13.5" r="2"/><circle cx="6.5" cy="17" r="1.1"/><circle cx="18" cy="17.5" r="1.5"/>',
    (() => {
      const grid = el('div', 'cr-types');
      const buttons = PARTICLES.map(([key, label]) => {
        const b = el('button', 'cr-type', tr(label));
        b.type = 'button';
        b.addEventListener('click', () => { st.particles.type = key; paint(); syncBackground(); push(); });
        grid.append(b);
        return [key, b];
      });
      const paint = () => { for (const [key, b] of buttons) b.setAttribute('aria-pressed', String(key === st.particles.type)); };
      ctl.particleType = { sync: paint };
      paint();
      return grid;
    })(),
    (() => { const r = row('Color', color('pColor', () => st.particles.color, v => { st.particles.color = v; })); rows.particles.push(r); return r; })(),
    (() => { const r = row('Amount', slider('pAmount', 5, 100, () => st.particles.amount, v => { st.particles.amount = v; }, ' %')); rows.particles.push(r); return r; })(),
    (() => { const r = row('Size', slider('pSize', 40, 220, () => st.particles.size, v => { st.particles.size = v; }, ' %')); rows.particles.push(r); return r; })(),
    (() => { const r = row('Speed', slider('pSpeed', 20, 250, () => st.particles.speed, v => { st.particles.speed = v; }, ' %')); rows.particles.push(r); return r; })());

  const glowCard = card('Glow and sound', '<circle cx="12" cy="12" r="4"/><path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6 18 18M18 6l-1.4 1.4M7.4 16.6 6 18"/>',
    row('Glow', toggle('glowOn', () => st.glow.on, v => { st.glow.on = v; }), 'A soft halo around the logo'),
    row('Glow color', color('glowColor', () => st.glow.color, v => { st.glow.color = v; })),
    row('Glow strength', slider('glowStrength', 10, 100, () => st.glow.strength, v => { st.glow.strength = v; }, ' %')),
    row('React to sound', toggle('soundOn', () => st.sound.on, v => { st.sound.on = v; }), 'Pulses with the sound playing'),
    row('Sound effect', segments('soundStyle', [['ripples', 'Ripples'], ['ring', 'Wave ring'], ['none', 'Pulse only']], () => st.sound.style, v => { st.sound.style = v; })));

  // ---- stage with draggable handles
  const stage = el('div', 'cr-stage');
  frame = document.createElement('iframe');
  frame.src = '/app/templates/custom.html?preview=1&light=50&speed=50';
  frame.tabIndex = -1;
  frame.title = tr('Preview');
  const layer = el('div', 'cr-layer');
  const boxes = {
    logo: el('div', 'cr-box'),
    title: el('div', 'cr-box'),
  };
  boxes.logo.dataset.target = 'logo';
  boxes.title.dataset.target = 'title';
  for (const key of Object.keys(boxes)) {
    boxes[key].append(el('span', 'cr-box__tag', tr(key === 'logo' ? 'Logo' : 'Text')), el('i', 'cr-grip'));
    layer.append(boxes[key]);
  }
  stage.append(frame, layer);

  function box(key) {
    const r = stage.getBoundingClientRect();
    const vmin = Math.min(r.width, r.height) / 100;
    if (key === 'logo') {
      const w = st.logo.size * vmin;
      return { cx: st.logo.x / 100 * r.width, cy: st.logo.y / 100 * r.height, w, h: Math.max(w * st.aspect, 14), r, vmin };
    }
    const chars = Math.max(6, (st.title.text || 'Your text').length);
    const h = st.title.size * vmin * 1.15;
    return { cx: st.title.x / 100 * r.width, cy: st.title.y / 100 * r.height, w: chars * st.title.size * vmin * .56, h, r, vmin };
  }

  function layout() {
    for (const key of Object.keys(boxes)) {
      const b = box(key), e = boxes[key];
      e.style.cssText = `left:${(b.cx - b.w / 2).toFixed(1)}px;top:${(b.cy - b.h / 2).toFixed(1)}px;width:${b.w.toFixed(1)}px;height:${b.h.toFixed(1)}px`;
      e.classList.toggle('selected', selected === key);
      e.classList.toggle('empty', key === 'logo' ? !st.files.logo : !st.title.text);
    }
  }
  new ResizeObserver(layout).observe(stage);

  let drag = null;
  layer.addEventListener('pointerdown', e => {
    const target = e.target.closest('.cr-box');
    if (!target) return;
    e.preventDefault();
    const key = target.dataset.target, resize = !!e.target.closest('.cr-grip');
    selected = key;
    const b = box(key);
    drag = { key, resize, startX: e.clientX, startY: e.clientY, moved: false, cx: b.cx, cy: b.cy, w: b.w, vmin: b.vmin, r: b.r, size: key === 'logo' ? st.logo.size : st.title.size };
    layer.setPointerCapture(e.pointerId);
    layout();
  });
  layer.addEventListener('pointermove', e => {
    if (!drag) return;
    if (e.buttons === 0) { drag = null; return; }
    const dx = e.clientX - drag.startX, dy = e.clientY - drag.startY;
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    if (!drag.moved) return;
    if (drag.resize) {
      if (drag.key === 'logo') st.logo.size = Math.max(5, Math.min(70, Math.round((drag.w + dx * 2) / drag.vmin)));
      else st.title.size = Math.max(2, Math.min(14, Math.round((drag.size * drag.vmin * 1.15 + dy * 2) / (drag.vmin * 1.15))));
    } else {
      const x = Math.max(0, Math.min(100, (drag.cx + dx) / drag.r.width * 100)), y = Math.max(0, Math.min(100, (drag.cy + dy) / drag.r.height * 100));
      const t = drag.key === 'logo' ? st.logo : st.title;
      t.x = Math.round(x * 2) / 2; t.y = Math.round(y * 2) / 2;
    }
    for (const k of ['logoSize', 'logoX', 'logoY', 'titleSize']) ctl[k] && ctl[k].sync();
    push();
  });
  const endDrag = () => {
    if (drag && !drag.moved) {
      if (drag.key === 'logo' && !st.files.logo) { pickKind = 'logo'; input.click(); }
      if (drag.key === 'title' && !st.title.text) titleInput.focus();
    }
    drag = null;
  };
  layer.addEventListener('pointerup', endDrag);
  layer.addEventListener('pointercancel', endDrag);
  layer.addEventListener('wheel', e => {
    const target = e.target.closest('.cr-box');
    if (!target) return;
    e.preventDefault();
    const key = target.dataset.target, step = e.deltaY < 0 ? 1 : -1;
    if (key === 'logo') st.logo.size = Math.max(5, Math.min(70, st.logo.size + step * 2));
    else st.title.size = Math.max(2, Math.min(14, st.title.size + step * .5));
    selected = key;
    for (const k of ['logoSize', 'titleSize']) ctl[k] && ctl[k].sync();
    push();
  }, { passive: false });

  // ---- layout of the page
  const hint = el('p', 'cr-hint', tr('Drag the logo or the text to place it. Scroll over it or pull its corner to resize.'));
  const themeTitle = el('div', 'title-section');
  themeTitle.append(el('h2', '', tr('Start from a theme')), el('span', 'config', tr('Pick a look, then make it yours')));
  const cardsTitle = el('div', 'title-section');
  cardsTitle.append(el('h2', '', tr('Make it yours')));

  const grid = el('div', 'cr-grid');
  grid.append(logoCard, textCard, backgroundCard, particlesCard, glowCard);

  const nameInput = Object.assign(document.createElement('input'), { type: 'text', maxLength: 40, placeholder: tr('Name this wallpaper') });
  nameInput.className = 'cr-text';
  const create = el('button', 'button button--accent', tr('Create the wallpaper'));
  create.type = 'button';
  create.addEventListener('click', () => {
    const files = [];
    if (st.files.logo) files.push({ name: 'logo.png', data: st.files.logo });
    if (st.bg.type === 'image' && st.files.background) files.push({ name: 'background.jpg', data: st.files.background });
    send('creator.create', { name: nameInput.value, config: config(false), files });
    nameInput.value = '';
    try { localStorage.setItem('wallpaper.tab', 'library'); } catch (e) { }
    const tab = document.querySelector('#wp-tabs [data-tab="library"]');
    if (tab) tab.click();
    showView('wallpaper');
  });
  const save = el('div', 'cr-save');
  save.append(nameInput, create);

  zone.append(stage, hint, themeTitle, themes, cardsTitle, grid, save, input);
  syncBackground();
  paintThemes();
  layout();

  addEventListener('message', e => {
    if (e.data && e.data.bramble === 'ready' && frame && e.source === frame.contentWindow) { ready = true; push(); }
  });

  Bramble.creator = { visible(yes) { if (yes) layout(); } };
})();
