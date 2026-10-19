'use strict';

(function () {
  const zone = $('wp-create');
  const st = {
    bg: { type: 'gradient', color: '#0b0a12', color2: '#2a1450', angle: 160, fit: 'cover', dim: 0 },
    logo: { size: 28, x: 50, y: 45 },
    title: { text: '', size: 6, color: '#ece7f4' },
    effects: { halo: true, haloColor: '#8e42b6', grains: true, grainColor: '#c9a2e6', reactive: true },
    files: { logo: null, background: null },
    names: { logo: '', background: '' },
  };

  const PREVIEW = '/app/templates/custom.html?preview=1&light=50&speed=50';
  let frame = null, ready = false, queued = 0;

  function config(forPreview) {
    const b = Object.assign({}, st.bg), l = Object.assign({}, st.logo);
    b.image = st.bg.type === 'image' && st.files.background ? (forPreview ? st.files.background : 'background.jpg') : null;
    l.image = st.files.logo ? (forPreview ? st.files.logo : 'logo.png') : null;
    return { background: b, logo: l, title: Object.assign({}, st.title), effects: Object.assign({}, st.effects) };
  }

  function push() {
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

  function card(title, ...rows) {
    const c = el('section', 'cr-card');
    c.append(el('h3', '', tr(title)), ...rows);
    return c;
  }

  function slider(min, max, value, onInput, suffix) {
    const wrap = el('div', 'cr-slider');
    const input = Object.assign(document.createElement('input'), { type: 'range', min, max, step: 1, value });
    const out = el('output', '', value + (suffix || ''));
    const paint = () => { input.style.setProperty('--pct', ((input.value - min) / (max - min) * 100) + '%'); out.textContent = input.value + (suffix || ''); };
    input.addEventListener('input', () => { paint(); onInput(Number(input.value)); push(); });
    paint();
    wrap.append(input, out);
    return wrap;
  }

  function color(value, onInput) {
    const input = Object.assign(document.createElement('input'), { type: 'color', value });
    input.className = 'cr-color';
    input.addEventListener('input', () => { onInput(input.value); push(); });
    return input;
  }

  function toggle(value, onChange) {
    const input = Object.assign(document.createElement('input'), { type: 'checkbox', checked: value });
    input.className = 'cr-switch';
    input.addEventListener('change', () => { onChange(input.checked); push(); });
    return input;
  }

  function segments(options, value, onPick) {
    const s = el('div', 'segments');
    for (const [key, label] of options) {
      const b = el('button', '', tr(label));
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(key === value));
      b.addEventListener('click', () => {
        for (const o of s.children) o.setAttribute('aria-checked', String(o === b));
        onPick(key);
        push();
      });
      s.append(b);
    }
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
        resolve(c.toDataURL(mime, quality));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image')); };
      img.src = url;
    });
  }

  function picker(kind, label, max, mime, quality, after) {
    const wrap = el('div', 'cr-pick');
    const name = el('span', 'cr-file', tr('No picture'));
    const choose = el('button', 'button', tr(label));
    choose.type = 'button';
    const clear = el('button', 'link', tr('Remove'));
    clear.type = 'button';
    clear.hidden = true;
    const input = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif' });
    input.hidden = true;
    choose.addEventListener('click', () => input.click());
    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      input.value = '';
      if (!file) return;
      try {
        st.files[kind] = await readImage(file, max, mime, quality);
        st.names[kind] = file.name;
        name.textContent = file.name;
        clear.hidden = false;
        if (after) after();
        push();
      } catch (e) { name.textContent = tr('This picture could not be read'); }
    });
    clear.addEventListener('click', () => { st.files[kind] = null; st.names[kind] = ''; name.textContent = tr('No picture'); clear.hidden = true; push(); });
    wrap.append(name, choose, clear, input);
    return wrap;
  }

  const gradientRows = [], imageRows = [];
  function syncBackground() {
    for (const r of gradientRows) r.hidden = st.bg.type !== 'gradient';
    for (const r of imageRows) r.hidden = st.bg.type !== 'image';
    colorRow2.hidden = st.bg.type !== 'gradient';
  }

  const colorRow2 = row('Second color', color(st.bg.color2, v => { st.bg.color2 = v; }));
  gradientRows.push(row('Angle', slider(0, 360, st.bg.angle, v => { st.bg.angle = v; }, '°')));
  imageRows.push(row('Picture', picker('background', 'Choose a picture', 2560, 'image/jpeg', .88, () => { st.bg.type = 'image'; })));
  imageRows.push(row('Framing', segments([['cover', 'Fill'], ['contain', 'Fit']], st.bg.fit, v => { st.bg.fit = v; })));

  const background = card('Background',
    row('Type', segments([['color', 'Color'], ['gradient', 'Gradient'], ['image', 'Picture']], st.bg.type, v => { st.bg.type = v; syncBackground(); })),
    row('Color', color(st.bg.color, v => { st.bg.color = v; })),
    colorRow2, ...gradientRows, ...imageRows,
    row('Darken', slider(0, 80, st.bg.dim, v => { st.bg.dim = v; }, ' %')));

  const logo = card('Logo',
    row('Logo', picker('logo', 'Choose a logo', 1024, 'image/png', 1), 'A PNG with a transparent background works best'),
    row('Size', slider(5, 70, st.logo.size, v => { st.logo.size = v; }, ' %')),
    row('Horizontal position', slider(0, 100, st.logo.x, v => { st.logo.x = v; }, ' %')),
    row('Vertical position', slider(0, 100, st.logo.y, v => { st.logo.y = v; }, ' %')));

  const titleInput = Object.assign(document.createElement('input'), { type: 'text', maxLength: 40, placeholder: tr('Optional text under the logo') });
  titleInput.className = 'cr-text';
  titleInput.addEventListener('input', () => { st.title.text = titleInput.value; push(); });
  const title = card('Text',
    row('Text', titleInput),
    row('Size', slider(2, 14, st.title.size, v => { st.title.size = v; }, '')),
    row('Color', color(st.title.color, v => { st.title.color = v; })));

  const effects = card('Effects',
    row('Glow', toggle(st.effects.halo, v => { st.effects.halo = v; }), 'A soft halo around the logo'),
    row('Glow color', color(st.effects.haloColor, v => { st.effects.haloColor = v; })),
    row('Floating grains', toggle(st.effects.grains, v => { st.effects.grains = v; }), 'Specks rising slowly'),
    row('Grain color', color(st.effects.grainColor, v => { st.effects.grainColor = v; })),
    row('React to sound', toggle(st.effects.reactive, v => { st.effects.reactive = v; }), 'Pulses and ripples with the sound playing'));

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
  });
  const save = el('div', 'cr-save');
  save.append(nameInput, create);

  const grid = el('div', 'cr-grid');
  grid.append(background, logo, title, effects);

  const stage = el('div', 'cr-stage');
  frame = document.createElement('iframe');
  frame.src = PREVIEW;
  frame.tabIndex = -1;
  frame.title = tr('Preview');
  stage.append(frame);

  zone.append(stage, el('p', 'help-section cr-help', tr('Build your own wallpaper from a logo and a background, then it joins your library.')), grid, save);
  syncBackground();

  addEventListener('message', e => {
    if (e.data && e.data.bramble === 'ready' && frame && e.source === frame.contentWindow) { ready = true; push(); }
  });
})();
