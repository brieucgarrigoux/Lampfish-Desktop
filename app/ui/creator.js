'use strict';

(function () {
  const zone = $('create-zone'), panel = $('create-panel');

  const SOUND = () => ({ on: true, pulse: true, ripples: false, ring: true, vibe: false, vibeAmount: 50, particles: true, color: '' });
  const THEMES = [
    { id: 'midnight', name: 'Midnight', bg: { type: 'gradient', color: '#070815', color2: '#271c6b', angle: 165 }, particles: { type: 'fireflies', color: '#b9a2ff', amount: 45, size: 100, speed: 100 }, glow: { on: true, color: '#6c4ccf', strength: 55 } },
    { id: 'ember', name: 'Ember', bg: { type: 'gradient', color: '#0c0403', color2: '#46110a', angle: 180 }, particles: { type: 'embers', color: '#ff7a2e', amount: 55, size: 100, speed: 100 }, glow: { on: true, color: '#ff5a1f', strength: 50 } },
    { id: 'aurora', name: 'Aurora', bg: { type: 'gradient', color: '#02070d', color2: '#0a3d48', angle: 170 }, particles: { type: 'stars', color: '#c6f6ff', amount: 60, size: 100, speed: 100 }, glow: { on: true, color: '#2fd6b0', strength: 45 } },
    { id: 'sunset', name: 'Sunset', bg: { type: 'gradient', color: '#1b0a2f', color2: '#c2410c', angle: 180 }, particles: { type: 'orbs', color: '#ffb36b', amount: 50, size: 100, speed: 100 }, glow: { on: true, color: '#ff8a4c', strength: 55 } },
    { id: 'neon', name: 'Neon', bg: { type: 'gradient', color: '#04010a', color2: '#1d0046', angle: 160 }, particles: { type: 'fireflies', color: '#ff3fd2', amount: 40, size: 90, speed: 120 }, glow: { on: true, color: '#d11fff', strength: 65 } },
    { id: 'graphite', name: 'Graphite', bg: { type: 'gradient', color: '#0d0e11', color2: '#2a2d35', angle: 170 }, particles: { type: 'snow', color: '#d3dae8', amount: 40, size: 100, speed: 90 }, glow: { on: true, color: '#8b93a7', strength: 30 } },
  ];
  const PARTICLES = [['none', 'None'], ['fireflies', 'Fireflies'], ['stars', 'Stars'], ['embers', 'Embers'], ['snow', 'Snow'], ['orbs', 'Soft lights']];
  const GRADIENTS = [
    ['Dusk', '#0f0c29', '#4b3fa8', 160], ['Sunrise', '#2a0845', '#ff8a4c', 200], ['Ocean', '#021b2b', '#0b6e8a', 135], ['Forest', '#04130c', '#1f6b45', 170], ['Rose', '#2b0a1e', '#c2417a', 145],
    ['Steel', '#0c0d10', '#3a3f4b', 125], ['Lava', '#120302', '#a3280f', 180], ['Mint', '#04141a', '#1fbf9a', 60], ['Violet', '#0b0420', '#6a2cff', 100], ['Slate', '#0a0a0c', '#2f3036', 20],
  ];
  const D = () => fresh();

  const fresh = () => ({
    bg: { type: 'gradient', color: '#070815', color2: '#271c6b', angle: 165, fit: 'cover', dim: 0, vignette: 35, drift: 0 },
    logo: { size: 28, x: 50, y: 44, shadow: 60, float: true },
    title: { text: '', size: 6, weight: 600, color: '#ece7f4', x: 50, y: 68, font: 'sans' },
    particles: { type: 'fireflies', color: '#b9a2ff', amount: 45, size: 100, speed: 100 },
    glow: { on: true, color: '#6c4ccf', strength: 55 },
    sound: SOUND(),
    files: { logo: null, background: null },
    aspect: 1,
  });
  const st = fresh();
  const ctl = {};
  let theme = 'midnight', hovered = null, guides = true;
  let editing = null, frame = null, ready = false, queued = 0;

  function config(forPreview) {
    const b = Object.assign({}, st.bg), l = Object.assign({}, st.logo);
    b.image = st.bg.type === 'image' && st.files.background ? (forPreview ? st.files.background : 'background.jpg') : null;
    l.image = st.files.logo ? (forPreview ? st.files.logo : 'logo.png') : null;
    const sound = Object.assign({}, st.sound);
    delete sound.style;
    return { v: 2, background: b, logo: l, title: Object.assign({}, st.title), particles: Object.assign({}, st.particles), glow: Object.assign({}, st.glow), sound };
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
    if (control.classList.contains('cr-slider')) r.classList.add('cr-row--slider');
    return r;
  }

  function card(title, ...rows) {
    const block = el('div', 'cr-block');
    const group = el('section', 'cr-card group');
    group.append(...rows);
    block.append(el('h2', '', tr(title)), group);
    return block;
  }

  const RESET = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4v4h4"/></svg>';
  function slider(name, min, max, get, set, suffix, fallback) {
    const wrap = el('div', 'cr-slider');
    const input = Object.assign(document.createElement('input'), { type: 'range', min, max, step: 1, value: get() });
    const out = el('output');
    const reset = el('button', 'cr-reset');
    reset.type = 'button';
    reset.title = tr('Reset');
    reset.innerHTML = RESET;
    const paint = () => {
      input.style.setProperty('--pct', ((input.value - min) / (max - min) * 100) + '%');
      out.textContent = input.value + (suffix || '');
      reset.classList.toggle('shown', fallback !== undefined && Number(input.value) !== fallback);
    };
    const others = () => { for (const k in ctl) if (ctl[k] !== self) ctl[k].sync(); };
    const back = () => { if (fallback === undefined) return; set(fallback); input.value = fallback; paint(); others(); push(); };
    input.addEventListener('input', () => { set(Number(input.value)); paint(); if (name === 'bgAngle') others(); push(); });
    input.addEventListener('dblclick', back);
    reset.addEventListener('click', back);
    const self = ctl[name] = { sync() { input.value = get(); paint(); } };
    paint();
    const value = el('span', 'cr-val');
    value.append(out, reset);
    wrap.append(value, input);
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
  let pickKind = null;
  const notes = {};
  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file || !pickKind) return;
    const kind = pickKind, big = kind === 'logo';
    try {
      const r = await readImage(file, big ? 1024 : 2560, big ? 'image/png' : 'image/jpeg', big ? 1 : .88);
      st.files[kind] = r.data;
      if (big) st.aspect = r.aspect; else st.bg.type = 'image';
      showFile(kind, file.name);
      for (const k of ['bgType']) ctl[k] && ctl[k].sync();
      syncRows();
      push();
    } catch (e) { notes[kind].name.textContent = tr('This picture could not be read'); }
  });

  function showFile(kind, label) {
    notes[kind].name.textContent = label || tr('No picture');
    notes[kind].clear.hidden = !st.files[kind];
  }

  function picker(kind, label) {
    const wrap = el('div', 'cr-pick');
    const name = el('span', 'cr-file', tr('No picture'));
    const choose = el('button', 'button', tr(label));
    choose.type = 'button';
    choose.addEventListener('click', () => { pickKind = kind; input.click(); });
    const clear = el('button', 'link', tr('Remove'));
    clear.type = 'button';
    clear.hidden = true;
    clear.addEventListener('click', () => { st.files[kind] = null; if (kind === 'logo') st.aspect = 1; showFile(kind); push(); });
    notes[kind] = { name, clear };
    wrap.append(choose, name, clear);
    return wrap;
  }

  const rows = { gradient: [], image: [], particles: [], glow: [], sound: [], vibe: [] };
  const tagged = (kind, r) => { rows[kind].push(r); return r; };
  function syncRows() {
    for (const r of rows.gradient) r.hidden = st.bg.type !== 'gradient';
    for (const r of rows.image) r.hidden = st.bg.type !== 'image';
    for (const r of rows.particles) r.hidden = st.particles.type === 'none';
    for (const r of rows.glow) r.hidden = !st.glow.on;
    for (const r of rows.sound) r.hidden = !st.sound.on;
    for (const r of rows.vibe) r.hidden = !st.sound.on || !st.sound.vibe;
  }

  function syncAll() {
    for (const k of Object.keys(ctl)) ctl[k].sync();
    titleInput.value = st.title.text;
    showFile('logo', st.files.logo ? tr('Current logo') : '');
    showFile('background', st.files.background ? tr('Current picture') : '');
    syncRows();
    paintThemes();
    push();
  }

  // ---- themes, drawn as small renders of the real thing
  function seeded(seed) { let s = seed; return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296; }
  function hexA(c, a) {
    const n = parseInt(c.slice(1), 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
  }
  function drawTheme(canvas, t) {
    const W = canvas.width = 288, H = canvas.height = 180, g = canvas.getContext('2d'), rnd = seeded(t.id.length * 977 + 13);
    const rad = t.bg.angle * Math.PI / 180, dx = Math.sin(rad), dy = -Math.cos(rad);
    const grad = g.createLinearGradient(W / 2 - dx * W / 2, H / 2 - dy * H / 2, W / 2 + dx * W / 2, H / 2 + dy * H / 2);
    grad.addColorStop(0, t.bg.color); grad.addColorStop(1, t.bg.color2);
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'lighter';
    const halo = g.createRadialGradient(W / 2, H * .46, 0, W / 2, H * .46, H * .62);
    halo.addColorStop(0, hexA(t.glow.color, .55)); halo.addColorStop(.55, hexA(t.glow.color, .16)); halo.addColorStop(1, hexA(t.glow.color, 0));
    g.fillStyle = halo; g.fillRect(0, 0, W, H);
    const dot = (x, y, r, a) => { const d = g.createRadialGradient(x, y, 0, x, y, r); d.addColorStop(0, hexA(t.particles.color, a)); d.addColorStop(1, hexA(t.particles.color, 0)); g.fillStyle = d; g.fillRect(x - r, y - r, r * 2, r * 2); };
    const type = t.particles.type, count = type === 'orbs' ? 7 : type === 'snow' ? 34 : 26;
    for (let i = 0; i < count; i++) {
      const x = rnd() * W, y = rnd() * H;
      if (type === 'orbs') dot(x, y, 16 + rnd() * 30, .16);
      else if (type === 'snow') dot(x, y, 2.4 + rnd() * 3, .5 + rnd() * .3);
      else if (type === 'stars') dot(x, y, 2 + rnd() * 3, .9);
      else if (type === 'embers') dot(x, H - rnd() * rnd() * H * 1.1, 3 + rnd() * 4, .85);
      else dot(x, y, 4 + rnd() * 6, .85);
    }
    g.globalCompositeOperation = 'source-over';
    const cx = W / 2, cy = H * .46;
    g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, 20, 0, 6.283); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.9)'; g.beginPath(); g.arc(cx, cy, 8, 0, 6.283); g.fill();
    g.fillStyle = 'rgba(255,255,255,.5)'; g.fillRect(cx - 24, cy + 33, 48, 4);
    const v = g.createRadialGradient(W / 2, H * .48, H * .35, W / 2, H * .48, H * .95);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.55)');
    g.fillStyle = v; g.fillRect(0, 0, W, H);
  }

  const themes = el('div', 'cr-themes');
  const themeButtons = THEMES.map(t => {
    const b = el('button', 'cr-theme');
    b.type = 'button';
    const c = document.createElement('canvas');
    c.className = 'cr-theme__art';
    drawTheme(c, t);
    b.append(c, el('span', 'cr-theme__name', tr(t.name)));
    b.addEventListener('click', () => {
      theme = t.id;
      Object.assign(st.bg, t.bg);
      Object.assign(st.particles, t.particles);
      Object.assign(st.glow, t.glow);
      syncAll();
    });
    themes.append(b);
    return [t.id, b];
  });
  function paintThemes() { for (const [id, b] of themeButtons) b.setAttribute('aria-pressed', String(id === theme)); }

  // ---- cards (right panel)
  const titleInput = Object.assign(document.createElement('input'), { type: 'text', maxLength: 40, placeholder: tr('Optional text') });
  titleInput.className = 'cr-text';
  titleInput.addEventListener('input', () => { st.title.text = titleInput.value; push(); });

  const logoCard = card('Logo',
    row('Logo', picker('logo', 'Choose a logo'), 'A PNG with a transparent background works best'),
    row('Size', slider('logoSize', 5, 70, () => st.logo.size, v => { st.logo.size = v; }, ' %', 28)),
    row('Horizontal position', slider('logoX', 0, 100, () => st.logo.x, v => { st.logo.x = v; }, ' %', 50)),
    row('Vertical position', slider('logoY', 0, 100, () => st.logo.y, v => { st.logo.y = v; }, ' %', 44)),
    row('Soft shadow', slider('logoShadow', 0, 100, () => st.logo.shadow, v => { st.logo.shadow = v; }, ' %', 60)),
    row('Gentle float', toggle('logoFloat', () => st.logo.float, v => { st.logo.float = v; })),
    row('Position and size', (() => { const b = el('button', 'button', tr('Reset')); b.type = 'button'; b.addEventListener('click', () => { st.logo.x = 50; st.logo.y = 44; st.logo.size = 28; sync(); }); return b; })()));

  const textCard = card('Text',
    row('Text', titleInput),
    row('Style', segments('titleFont', [['sans', 'Modern'], ['serif', 'Serif'], ['spaced', 'Spaced']], () => st.title.font, v => { st.title.font = v; })),
    row('Size', slider('titleSize', 2, 14, () => st.title.size, v => { st.title.size = v; }, '', 6)),
    row('Weight', segments('titleWeight', [['400', 'Regular'], ['600', 'Medium'], ['800', 'Bold']], () => String(st.title.weight), v => { st.title.weight = Number(v); })),
    row('Color', color('titleColor', () => st.title.color, v => { st.title.color = v; })));

  function directions() {
    const grid = el('div', 'cr-dirs');
    const buttons = [0, 45, 90, 135, 180, 225, 270, 315].map(a => {
      const b = el('button', 'cr-dir');
      b.type = 'button';
      b.title = a + '°';
      b.innerHTML = `<svg viewBox="0 0 24 24" style="transform:rotate(${a}deg)" aria-hidden="true"><path d="M12 19V5M6.5 10.5 12 5l5.5 5.5"/></svg>`;
      b.addEventListener('click', () => { st.bg.angle = a; ctl.bgAngle.sync(); paint(); push(); });
      grid.append(b);
      return [a, b];
    });
    const paint = () => { for (const [a, b] of buttons) b.setAttribute('aria-pressed', String(Math.abs(((st.bg.angle - a + 540) % 360) - 180) < 5)); };
    ctl.bgDirections = { sync: paint };
    paint();
    return grid;
  }

  function presets() {
    const grid = el('div', 'cr-presets');
    for (const [name, a, b, angle] of GRADIENTS) {
      const t = el('button', 'cr-preset');
      t.type = 'button';
      t.title = tr(name);
      t.style.background = `linear-gradient(${angle}deg, ${a}, ${b})`;
      t.addEventListener('click', () => { st.bg.type = 'gradient'; st.bg.color = a; st.bg.color2 = b; st.bg.angle = angle; for (const k of ['bgColor', 'bgColor2', 'bgAngle', 'bgType', 'bgDirections']) ctl[k] && ctl[k].sync(); syncRows(); push(); });
      grid.append(t);
    }
    return grid;
  }

  const backgroundCard = card('Background',
    row('Type', segments('bgType', [['color', 'Color'], ['gradient', 'Gradient'], ['image', 'Picture']], () => st.bg.type, v => { st.bg.type = v; syncRows(); })),
    tagged('gradient', presets()),
    row('Color', color('bgColor', () => st.bg.color, v => { st.bg.color = v; })),
    tagged('gradient', row('Second color', color('bgColor2', () => st.bg.color2, v => { st.bg.color2 = v; }))),
    tagged('gradient', row('Angle', slider('bgAngle', 0, 360, () => st.bg.angle, v => { st.bg.angle = v; }, '°', 165))),
    tagged('gradient', row('Direction', directions())),
    tagged('gradient', row('Drift speed', slider('bgDrift', 0, 100, () => st.bg.drift, v => { st.bg.drift = v; }, ' %', 0), 'The gradient slowly turns')),
    tagged('image', row('Picture', picker('background', 'Choose a picture'))),
    tagged('image', row('Framing', segments('bgFit', [['cover', 'Fill'], ['contain', 'Fit']], () => st.bg.fit, v => { st.bg.fit = v; }))),
    row('Darken', slider('bgDim', 0, 80, () => st.bg.dim, v => { st.bg.dim = v; }, ' %', 0)),
    row('Edge shade', slider('bgVignette', 0, 100, () => st.bg.vignette, v => { st.bg.vignette = v; }, ' %', 35), 'Darkens the corners'));

  const typeGrid = (() => {
    const grid = el('div', 'cr-types');
    const buttons = PARTICLES.map(([key, label]) => {
      const b = el('button', 'cr-type', tr(label));
      b.type = 'button';
      b.addEventListener('click', () => { st.particles.type = key; paint(); syncRows(); push(); });
      grid.append(b);
      return [key, b];
    });
    const paint = () => { for (const [key, b] of buttons) b.setAttribute('aria-pressed', String(key === st.particles.type)); };
    ctl.particleType = { sync: paint };
    paint();
    return grid;
  })();
  const particlesCard = card('Particles',
    typeGrid,
    tagged('particles', row('Color', color('pColor', () => st.particles.color, v => { st.particles.color = v; }))),
    tagged('particles', row('Amount', slider('pAmount', 5, 100, () => st.particles.amount, v => { st.particles.amount = v; }, ' %', 45))),
    tagged('particles', row('Size', slider('pSize', 40, 220, () => st.particles.size, v => { st.particles.size = v; }, ' %', 100))),
    tagged('particles', row('Speed', slider('pSpeed', 20, 250, () => st.particles.speed, v => { st.particles.speed = v; }, ' %', 100))));

  const glowCard = card('Glow',
    row('Glow', toggle('glowOn', () => st.glow.on, v => { st.glow.on = v; syncRows(); }), 'A soft halo around the logo'),
    tagged('glow', row('Glow color', color('glowColor', () => st.glow.color, v => { st.glow.color = v; }))),
    tagged('glow', row('Glow strength', slider('glowStrength', 10, 100, () => st.glow.strength, v => { st.glow.strength = v; }, ' %', 55))));

  const effectColor = (() => {
    const wrap = el('div', 'cr-pick');
    const input = Object.assign(document.createElement('input'), { type: 'color', value: st.glow.color });
    input.className = 'cr-color';
    const auto = el('button', 'link', tr('Auto'));
    auto.type = 'button';
    const paint = () => { input.value = st.sound.color || st.glow.color; auto.hidden = !st.sound.color; };
    input.addEventListener('input', () => { st.sound.color = input.value; paint(); push(); });
    auto.addEventListener('click', () => { st.sound.color = ''; paint(); push(); });
    ctl.soundColor = { sync: paint };
    paint();
    wrap.append(auto, input);
    return wrap;
  })();

  const soundCard = card('React to sound',
    row('React to sound', toggle('soundOn', () => st.sound.on, v => { st.sound.on = v; syncRows(); }), 'Choose one effect or several'),
    tagged('sound', row('Pulse', toggle('soundPulse', () => st.sound.pulse, v => { st.sound.pulse = v; }), 'The logo and the glow breathe')),
    tagged('sound', row('Particles', toggle('soundParticles', () => st.sound.particles, v => { st.sound.particles = v; }), 'The particles speed up and shine')),
    tagged('sound', row('Wave ring', toggle('soundRing', () => st.sound.ring, v => { st.sound.ring = v; }), 'A smooth ring that follows the sound')),
    tagged('sound', row('Ripples', toggle('soundRipples', () => st.sound.ripples, v => { st.sound.ripples = v; }), 'Rings spread out on each beat')),
    tagged('sound', row('Vibration', toggle('soundVibe', () => st.sound.vibe, v => { st.sound.vibe = v; syncRows(); }), 'The logo trembles with the bass')),
    tagged('vibe', row('Vibration strength', slider('soundVibeAmount', 5, 100, () => st.sound.vibeAmount, v => { st.sound.vibeAmount = v; }, ' %', 50))),
    tagged('sound', row('Effects color', effectColor, 'For the rings and ripples')));

  // ---- stage with draggable handles and guides
  const stage = el('div', 'cr-stage');
  frame = document.createElement('iframe');
  frame.src = '/app/templates/custom.html?preview=1&light=50&speed=50';
  frame.tabIndex = -1;
  frame.title = tr('Preview');
  const layer = el('div', 'cr-layer');
  const guideV = el('i', 'cr-guide cr-guide--v'), guideH = el('i', 'cr-guide cr-guide--h'), thirds = el('div', 'cr-thirds');
  thirds.innerHTML = '<i></i><i></i><b></b><b></b>';
  const tag = el('span', 'cr-tag');
  const boxes = { logo: el('div', 'cr-box'), title: el('div', 'cr-box') };
  boxes.logo.dataset.target = 'logo';
  boxes.title.dataset.target = 'title';
  boxes.logo.append(el('span', 'cr-box__tag', tr('Logo')), el('span', 'cr-box__plus', tr('Add your logo')), el('i', 'cr-grip'));
  boxes.title.append(el('span', 'cr-box__tag', tr('Text')), el('span', 'cr-box__plus', tr('Click to type')), el('i', 'cr-grip'));
  const inline = Object.assign(document.createElement('input'), { type: 'text', maxLength: 40 });
  inline.className = 'cr-inline';
  inline.hidden = true;
  layer.append(thirds, guideV, guideH, boxes.logo, boxes.title, inline, tag);
  stage.append(frame, layer);

  const tools = el('div', 'cr-tools');
  const tool = (icon, label, run) => {
    const b = el('button', 'cr-tool');
    b.type = 'button';
    b.title = tr(label);
    b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg><span></span>`;
    b.querySelector('span').textContent = tr(label);
    b.addEventListener('click', () => run(b));
    tools.append(b);
    return b;
  };
  function sync() { for (const k of ['logoSize', 'logoX', 'logoY', 'titleSize']) ctl[k] && ctl[k].sync(); push(); }
  tool('<path d="M12 3.5v17M8.5 7.5h7M8.5 16.5h7"/>', 'Center horizontally', () => { st.logo.x = 50; if (st.title.text) st.title.x = 50; sync(); });
  tool('<path d="M3.5 12h17M7.5 8.5v7M16.5 8.5v7"/>', 'Center vertically', () => { st.logo.y = st.title.text ? 40 : 50; if (st.title.text) st.title.y = 68; sync(); });
  const gridButton = tool('<path d="M9 4v16M15 4v16M4 9h16M4 15h16"/>', 'Grid', b => { guides = !guides; b.setAttribute('aria-pressed', String(guides)); layout(); });
  gridButton.setAttribute('aria-pressed', 'true');
  tool('<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4v4h4"/>', 'Reset position', () => { st.logo.x = 50; st.logo.y = 44; st.logo.size = 28; st.title.x = 50; st.title.y = 68; sync(); });

  function box(key) {
    const r = stage.getBoundingClientRect();
    const vmin = Math.min(r.width, r.height) / 100;
    if (key === 'logo') {
      const w = st.logo.size * vmin;
      return { cx: st.logo.x / 100 * r.width, cy: st.logo.y / 100 * r.height, w, h: Math.max(w * st.aspect, 30), r, vmin };
    }
    const chars = Math.max(8, (st.title.text || 'Your text').length);
    return { cx: st.title.x / 100 * r.width, cy: st.title.y / 100 * r.height, w: chars * st.title.size * vmin * (st.title.font === 'spaced' ? 1.05 : .56), h: st.title.size * vmin * 1.2, r, vmin };
  }

  let drag = null, editingText = false;
  function layout() {
    for (const key of Object.keys(boxes)) {
      const b = box(key), e = boxes[key];
      e.style.cssText = `left:${(b.cx - b.w / 2).toFixed(1)}px;top:${(b.cy - b.h / 2).toFixed(1)}px;width:${b.w.toFixed(1)}px;height:${b.h.toFixed(1)}px`;
      e.classList.toggle('empty', key === 'logo' ? !st.files.logo : !st.title.text);
      e.classList.toggle('hover', hovered === key);
      e.hidden = key === 'title' && editingText;
    }
    thirds.hidden = !guides;
  }
  new ResizeObserver(layout).observe(stage);

  const SNAP = 8, RELEASE = 12;
  function snap(key, x, y, r, free) {
    const other = key === 'logo' ? st.title : st.logo, otherActive = key === 'logo' ? !!st.title.text : true;
    const xs = [50], ys = [50];
    if (otherActive) { xs.push(other.x); ys.push(other.y); }
    const out = { x, y, gx: null, gy: null };
    if (free) return out;
    const near = (v, list, size, held) => {
      for (const c of list) if (Math.abs(v - c) / 100 * size <= (held === c ? RELEASE : SNAP)) return c;
      return null;
    };
    const cx = near(x, xs, r.width, drag && drag.gx), cy = near(y, ys, r.height, drag && drag.gy);
    if (cx !== null) { out.x = cx; out.gx = cx; }
    if (cy !== null) { out.y = cy; out.gy = cy; }
    return out;
  }

  function showGuides(gx, gy) {
    guideV.hidden = gx === null; guideH.hidden = gy === null;
    if (gx !== null) guideV.style.left = gx + '%';
    if (gy !== null) guideH.style.top = gy + '%';
  }
  guideV.hidden = guideH.hidden = tag.hidden = true;

  layer.addEventListener('pointerdown', e => {
    if (e.target === inline) return;
    const target = e.target.closest('.cr-box');
    if (editingText) endEdit();
    if (!target) return;
    e.preventDefault();
    const key = target.dataset.target, resize = !!e.target.closest('.cr-grip');
    const b = box(key);
    drag = { key, resize, startX: e.clientX, startY: e.clientY, moved: false, cx: b.cx, cy: b.cy, w: b.w, vmin: b.vmin, r: b.r, size: key === 'logo' ? st.logo.size : st.title.size, gx: null, gy: null };
    layer.setPointerCapture(e.pointerId);
    target.classList.add('active');
  });
  layer.addEventListener('pointermove', e => {
    if (!drag) {
      const t = e.target.closest('.cr-box'), key = t ? t.dataset.target : null;
      if (key !== hovered) { hovered = key; layout(); }
      return;
    }
    if (e.buttons === 0) { finish(false); return; }
    const dx = e.clientX - drag.startX, dy = e.clientY - drag.startY;
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    if (!drag.moved) return;
    const item = drag.key === 'logo' ? st.logo : st.title;
    if (drag.resize) {
      if (drag.key === 'logo') st.logo.size = Math.max(5, Math.min(70, Math.round((drag.w + dx * 2) / drag.vmin)));
      else st.title.size = Math.max(2, Math.min(14, Math.round((drag.size * drag.vmin * 1.2 + dy * 2) / (drag.vmin * 1.2) * 2) / 2));
    } else {
      const raw = { x: Math.max(0, Math.min(100, (drag.cx + dx) / drag.r.width * 100)), y: Math.max(0, Math.min(100, (drag.cy + dy) / drag.r.height * 100)) };
      const s = snap(drag.key, raw.x, raw.y, drag.r, e.altKey);
      drag.gx = s.gx; drag.gy = s.gy;
      item.x = Math.round(s.x * 10) / 10; item.y = Math.round(s.y * 10) / 10;
      showGuides(s.gx, s.gy);
    }
    tag.hidden = false;
    tag.textContent = drag.resize ? `${item.size}` : `X ${Math.round(item.x)} %   Y ${Math.round(item.y)} %`;
    const b = box(drag.key);
    tag.style.left = (b.cx - b.w / 2) + 'px';
    tag.style.top = (b.cy + b.h / 2 + 8) + 'px';
    sync();
  });
  layer.addEventListener('pointerleave', () => { if (!drag && hovered) { hovered = null; layout(); } });
  function finish(click) {
    if (!drag) return;
    const was = drag;
    drag = null;
    boxes.logo.classList.remove('active'); boxes.title.classList.remove('active');
    guideV.hidden = guideH.hidden = tag.hidden = true;
    if (click && !was.moved) {
      if (was.key === 'logo' && !st.files.logo) { pickKind = 'logo'; input.click(); }
      if (was.key === 'title') beginEdit();
    }
  }
  layer.addEventListener('pointerup', () => finish(true));
  layer.addEventListener('pointercancel', () => finish(false));
  layer.addEventListener('wheel', e => {
    const target = e.target.closest('.cr-box');
    if (!target) return;
    e.preventDefault();
    const key = target.dataset.target, step = e.deltaY < 0 ? 1 : -1;
    if (key === 'logo') st.logo.size = Math.max(5, Math.min(70, st.logo.size + step * 2));
    else st.title.size = Math.max(2, Math.min(14, st.title.size + step * .5));
    sync();
  }, { passive: false });
  addEventListener('keydown', e => {
    if (!hovered || e.target.matches('input, textarea') || !/^Arrow/.test(e.key)) return;
    const t = hovered === 'logo' ? st.logo : st.title, d = e.shiftKey ? 2 : .5;
    if (e.key === 'ArrowLeft') t.x = Math.max(0, t.x - d);
    if (e.key === 'ArrowRight') t.x = Math.min(100, t.x + d);
    if (e.key === 'ArrowUp') t.y = Math.max(0, t.y - d);
    if (e.key === 'ArrowDown') t.y = Math.min(100, t.y + d);
    e.preventDefault();
    sync();
  });

  function beginEdit() {
    const b = box('title');
    editingText = true;
    inline.hidden = false;
    inline.value = st.title.text;
    const width = Math.max(240, b.w + 60);
    inline.style.cssText = `left:${(b.cx - width / 2).toFixed(1)}px;top:${(b.cy - b.h / 2 - 4).toFixed(1)}px;width:${width}px;height:${(b.h + 8).toFixed(1)}px;font-size:${Math.max(14, st.title.size * b.vmin).toFixed(1)}px;color:${st.title.color};font-weight:${st.title.weight}`;
    layout();
    inline.focus();
    inline.select();
  }
  function endEdit() {
    if (!editingText) return;
    editingText = false;
    inline.hidden = true;
    titleInput.value = st.title.text;
    layout();
  }
  inline.addEventListener('input', () => { st.title.text = inline.value; titleInput.value = inline.value; push(); });
  inline.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); endEdit(); } });
  inline.addEventListener('blur', endEdit);

  // ---- page
  const hint = el('p', 'cr-hint', tr('Drag the logo or the text to place it. Click the text to type. Scroll over it or pull its corner to resize. Hold Alt to move without snapping.'));
  const themeTitle = el('div', 'title-section');
  themeTitle.append(el('h2', '', tr('Start from a theme')), el('span', 'config', tr('Pick a look, then make it yours on the right')));

  const nameInput = Object.assign(document.createElement('input'), { type: 'text', maxLength: 40, placeholder: tr('Name this wallpaper') });
  nameInput.className = 'cr-text';
  const create = el('button', 'button button--accent', tr('Create the wallpaper'));
  create.type = 'button';
  const copy = el('button', 'link', tr('Save as a new wallpaper'));
  copy.type = 'button';
  copy.hidden = true;
  const startNew = el('button', 'link', tr('Start a new one'));
  startNew.type = 'button';
  const banner = el('div', 'cr-editing');
  banner.hidden = true;

  function leaveEdit() {
    editing = null;
    banner.hidden = true; copy.hidden = true;
    create.textContent = tr('Create the wallpaper');
    nameInput.value = '';
    nameInput.disabled = false;
  }

  function save(replace) {
    const files = [];
    if (st.files.logo) files.push({ name: 'logo.png', data: st.files.logo });
    if (st.bg.type === 'image' && st.files.background) files.push({ name: 'background.jpg', data: st.files.background });
    send('creator.create', { name: nameInput.value, config: config(false), files, replace: replace ? editing : '' });
    try { localStorage.setItem('wallpaper.tab', 'library'); } catch (e) { }
    const tab = document.querySelector('#wp-tabs [data-tab="library"]');
    if (tab) tab.click();
    showView('wallpaper');
    leaveEdit();
  }
  create.addEventListener('click', () => save(!!editing));
  copy.addEventListener('click', () => { editing = null; nameInput.disabled = false; save(false); });
  startNew.addEventListener('click', () => { leaveEdit(); Object.assign(st, fresh()); theme = 'midnight'; syncAll(); });

  const save$ = el('div', 'cr-save');
  save$.append(nameInput, copy, create);

  zone.append(banner, stage, tools, hint, themeTitle, themes, save$, input);
  panel.append(logoCard, textCard, backgroundCard, particlesCard, glowCard, soundCard);
  syncAll();

  function fromConfig(c, files) {
    const f = fresh();
    const merge = (a, b) => Object.assign(a, b || {});
    merge(f.bg, c.background); merge(f.logo, c.logo); merge(f.title, c.title);
    if (c.v === 2) {
      merge(f.particles, c.particles); merge(f.glow, c.glow); merge(f.sound, c.sound);
      if (c.sound && c.sound.style && !('ripples' in c.sound)) { f.sound.ripples = c.sound.style === 'ripples'; f.sound.ring = c.sound.style === 'ring'; }
    } else {
      const e = c.effects || {};
      f.glow.on = !!e.halo; f.glow.color = e.haloColor || f.glow.color;
      f.particles.type = e.grains ? 'snow' : 'none'; f.particles.color = e.grainColor || '#ffffff';
      f.sound.on = e.reactive !== false;
    }
    delete f.bg.image; delete f.logo.image;
    if (typeof f.logo.shadow === 'boolean') f.logo.shadow = f.logo.shadow ? 60 : 0;
    if (typeof f.bg.drift === 'boolean') f.bg.drift = f.bg.drift ? 40 : 0;
    delete f.sound.style;
    f.files.logo = files.logo || null;
    f.files.background = files.background || null;
    return f;
  }

  addEventListener('message', e => {
    if (e.data && e.data.bramble === 'ready' && frame && e.source === frame.contentWindow) { ready = true; push(); }
  });

  Bramble.creator = {
    visible(yes) { send('audioPreview', { value: !!yes }); if (yes) layout(); },
    event(m) {
      if (m.type !== 'creator.opened') return;
      Object.assign(st, fromConfig(m.config || {}, { logo: m.logo, background: m.background }));
      editing = m.name;
      theme = '';
      nameInput.value = m.name;
      nameInput.disabled = true;
      banner.hidden = false;
      banner.replaceChildren(el('span', '', tr('Editing {0}', m.name)), startNew);
      create.textContent = tr('Save changes');
      copy.hidden = false;
      st.aspect = 1;
      if (st.files.logo) { const probe = new Image(); probe.onload = () => { st.aspect = probe.naturalHeight / probe.naturalWidth; layout(); }; probe.src = st.files.logo; }
      syncAll();
      showView('create');
    },
  };
})();
