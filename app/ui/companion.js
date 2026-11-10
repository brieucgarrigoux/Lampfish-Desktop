'use strict';

(function () {
  let data = null, tab = 'dashboard', audio = null;
  const UNITS = ['bytes', 'KB', 'MB', 'GB', 'TB'];
  const size = n => { let i = 0; while (n >= 1024 && i < UNITS.length - 1) { n /= 1024; i++; } return n.toLocaleString(LOCALE, { maximumFractionDigits: n >= 100 || i === 0 ? 0 : 1 }) + ' ' + tr(UNITS[i]); };
  const GO = {
    dashboard: ['Open Home in lampfish', 'home'], note: ['Open Notes in lampfish', 'notes'], capture: ['Open Shelf in lampfish', 'shelf'],
    shelf: ['Open Shelf in lampfish', 'shelf'], audio: ['Open Audio in lampfish', 'audio'], notes: ['Open Notes in lampfish', 'notes'], convert: ['Open Convert in lampfish', 'convert'], desktop: ['Open Arrange in lampfish', 'arrange'],
    quick: ['Open Settings in lampfish', 'settings'], claude: ['Open Plugins in lampfish', 'plugins'], customize: ['Open Assistant in lampfish', 'assistant'],
    help: ['Open Help in lampfish', 'help'],
  };
  const ARRANGEMENTS = [['left', 'Left'], ['right', 'Right'], ['top', 'Top'], ['bottom', 'Bottom'], ['frame', 'Frame'], ['center', 'Center'], ['corners', 'Corners'], ['blocks', 'Blocks']];
  const SIZES = [[32, 'S'], [40, 'M'], [48, 'L'], [64, 'XL'], [96, 'XXL']];
  const act = (name, values = {}) => send('companion.do', Object.assign({ name }, values));

  function show(name, tell) {
    tab = name;
    $('c-custom').setAttribute('aria-pressed', String(name === 'customize'));
    for (const b of document.querySelectorAll('[data-tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === name));
    for (const p of document.querySelectorAll('[data-pane]')) p.hidden = p.dataset.pane !== name;
    $('c-open').title = tr(GO[name][0]);
    if (tell) send('companion.tab', { tab: name });
    if (name === 'note') setTimeout(() => $('c-text').focus(), 30);
    if (name === 'notes') setTimeout(() => $('c-find').focus(), 30);
    render();
  }

  // The picture of the wallpaper shows at the top of Desktop and, blurred, behind the whole window, cut where the window rests.
  function still(m) {
    $('c-still-img').src = m.url || '';
    $('c-still-name').textContent = m.name || '';
    const root = document.documentElement;
    root.classList.toggle('still', !!(m.url && m.w));
    root.classList.toggle('mica', !!(m.url && m.w));
    if (!m.url || !m.w) return;
    // The pseudo-element overflows the window by 60 px on each side, so that the blur has no light edge.
    const W = innerWidth / m.w, H = innerHeight / m.h;
    root.style.setProperty('--still-image', `url("${m.back || m.url}")`);
    root.style.setProperty('--still-w', W + 'px');
    root.style.setProperty('--still-h', H + 'px');
    root.style.setProperty('--still-x', (60 - m.x * W) + 'px');
    root.style.setProperty('--still-y', (60 - m.y * H) + 'px');
    veil(m);
  }

  // The veil gets as thick as the picture asks: on a bright wallpaper the palest text keeps 4.5:1, as in the main window.
  function veil(m) {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = 24; c.height = 24;
      const g = c.getContext('2d');
      g.drawImage(img, m.x * img.width, m.y * img.height, m.w * img.width, m.h * img.height, 0, 0, 24, 24);
      const px = g.getImageData(0, 0, 24, 24).data;
      let r = 0, gr = 0, b = 0;
      for (let i = 0; i < px.length; i += 4) { r += px[i]; gr += px[i + 1]; b += px[i + 2]; }
      const n = px.length / 4, mean = [r / n, gr / n, b / n];
      const light = document.documentElement.dataset.theme === 'light';
      const tint = light ? [214, 220, 221] : [16, 20, 21];
      const lin = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; };
      const lum = c => .2126 * lin(c[0]) + .7152 * lin(c[1]) + .0722 * lin(c[2]);
      let a = light ? .55 : .6;
      for (; a < .95; a += .05) {
        const mix = mean.map((v, i) => v * (1 - a) + tint[i] * a);
        if (light ? lum(mix) >= .55 : lum(mix) <= .02) break;
      }
      document.documentElement.style.setProperty('--still-veil', `rgba(${tint.join(', ')}, ${a.toFixed(2)})`);
    };
    img.src = m.back || m.url;
  }

  function clock() {
    const now = new Date();
    $('c-clock').textContent = now.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
    $('c-date').textContent = now.toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' });
  }

  const GLYPHS = {
    theme: 'swatches',
    output: 'speaker-high',
    busiest: 'lf-pulse-window',
    disk: 'hard-drive',
    note: 'note',
    file: 'file',
    speakers: 'speaker-hifi',
    screen: 'monitor',
    headset: 'headphones',
    copy: 'copy',
    reveal: 'folder-open',
    chevron: 'caret-right',
    battery: 'battery-medium',
    full: 'corners-out',
    pulse: 'waveform',
    shuffle: 'shuffle',
    sun: 'sun-horizon',
    leaf: 'leaf',
    power: 'rocket-launch',
    mic: 'microphone',
  };
  const glyph = name => icon(GLYPHS[name], 'glyph');
  const el = (tag, className, text) => Object.assign(document.createElement(tag), { className: className || '', textContent: text || '' });

  function line(icon, label, value) {
    const row = el('div', 'row');
    row.innerHTML = `<span class="caption">${glyph(icon)}<span></span></span><span class="value" translate="no"></span>`;
    row.querySelector('.caption > span').textContent = tr(label);
    row.querySelector('.value').textContent = value;
    return row;
  }

  const level = (v, warn, bad) => v >= bad ? 'low' : v >= warn ? 'medium' : 'high';

  // Battery and Wi-Fi keep the instruments of Hardware. They stay in the page between two readings, so a bar never flickers.
  const meters = {};
  function meter(key, drawing) {
    if (meters[key]) return meters[key];
    const box = el('div', 'c-meter');
    box.innerHTML = `<span class="c-meter__drawing">${drawing}</span><b></b><span class="c-meter__label"></span>`;
    $('c-meters').append(box);
    return meters[key] = { box, drawing: box.firstChild.firstChild, value: box.children[1], label: box.children[2] };
  }
  function renderMeters(d) {
    const b = d.battery, n = d.link;
    if (b) {
      const k = meter('battery', batteryRelief());
      k.value.textContent = b.charge + ' %';
      k.label.textContent = tr(b.mains ? 'Plugged in' : 'Battery');
      k.box.classList.toggle('alert', b.charge <= 15 && !b.mains);
      setBattery(k.drawing, b);
    }
    if (n) {
      const k = meter('network', wifiRelief()), signal = n.wifi && n.signal >= 0 ? n.signal : n.connected ? 100 : 0;
      k.value.textContent = !n.connected ? tr('Offline') : n.wifi ? signal + ' %' : tr('Cable');
      k.label.textContent = tr(n.wifi ? 'Wi-Fi' : 'Network');
      k.box.classList.toggle('alert', !n.connected);
      setWifi(k.drawing, signal, n.connected);
    }
  }

  function dashboard() {
    const d = data;
    renderMeters(d);
    const free = d.disk ? size(d.disk.free) : '';
    const worst = Math.max(d.processor >= 95 ? 2 : d.processor >= 80 ? 1 : 0, d.memory >= 85 ? 2 : d.memory >= 75 ? 1 : 0, d.disk && d.disk.free / d.disk.total < .08 ? 2 : d.disk && d.disk.free / d.disk.total < .15 ? 1 : 0);
    const verdict = $('c-verdict');
    verdict.className = 'state' + (worst === 2 ? ' state--bad' : worst === 1 ? ' state--warn' : '');
    verdict.textContent = tr('{0} % processor, {1} % memory', Math.round(d.processor), Math.round(d.memory)) + (free ? ' · ' + tr('{0} free', free) : '');
    dials($('c-dials'), [
      { part: d.processor, value: Math.round(d.processor) + ' %', label: tr('Processor'), level: level(d.processor, 80, 95) },
      { part: d.memory, value: Math.round(d.memory) + ' %', label: tr('Memory'), level: level(d.memory, 75, 85) },
    ]);
    const lines = [];
    if (d.disk) lines.push(diskLine(d.disk));
    if (d.busiest) lines.push(line('busiest', 'Busiest program', d.busiest));
    lines.push(themeLine(d.theme));
    const out = el('button', 'row action');
    out.type = 'button';
    out.innerHTML = `<span class="caption">${glyph('output')}<span></span></span><span class="value" translate="no"></span>`;
    out.querySelector('.caption > span').textContent = tr('Audio output');
    out.querySelector('.value').textContent = d.output || tr('None');
    out.addEventListener('click', () => show('audio', true));
    lines.push(out);
    $('c-lines').replaceChildren(...lines.filter(Boolean));
  }

  function diskLine(disk) {
    const row = line('disk', 'Disk', size(disk.free) + ' ' + tr('free of') + ' ' + size(disk.total));
    row.querySelector('.caption > span').textContent = tr('Disk') + ' ' + disk.name;
    return row;
  }

  // The theme can be changed without opening the app: the arrows go to the previous and the next one.
  function themeLine(name) {
    const row = line('theme', 'Theme', name || tr('None'));
    const value = row.querySelector('.value');
    value.className = 'c-theme';
    const prev = Object.assign(el('button', 'c-step'), { type: 'button', title: tr('Previous theme'), innerHTML: icon('caret-left') });
    const next = Object.assign(el('button', 'c-step'), { type: 'button', title: tr('Next theme'), innerHTML: icon('caret-right') });
    prev.addEventListener('click', () => send('companion.theme', { step: -1 }));
    next.addEventListener('click', () => send('companion.theme', { step: 1 }));
    const label = el('span', 'c-theme__name', name || tr('None'));
    label.translate = false;
    value.replaceChildren(prev, label, next);
    return row;
  }

  // The two limits of a plan as two dials: the 5-hour session, which is the one that runs out during a day, and the week.
  function claude() {
    const c = data.claude, u = c && c.usage, ok = c && c.on && c.status === 'ok' && u && (u.session || u.week);
    const dial = (w, label, key) => ({
      key, part: w ? w.percent : 0, value: w ? Math.round(w.percent) + ' %' : '-', label: tr(label), sub: w ? tr('resets in {0}', resetIn(w.resets)) : '', color: 'var(--plugin-claude)',
      level: !w ? 'high' : w.percent >= 90 ? 'low' : w.percent >= 75 ? 'medium' : 'high', action: () => send('companion.open', { view: 'plugins' }),
      details: w ? { title: tr(label), value: Math.round(w.percent) + ' %', lines: [[tr('Resets in'), resetIn(w.resets)], ...(key === 'week' ? (u.rows || []).map(r => [r.name, Math.round(r.percent) + ' %']) : [])] } : null,
    });
    $('c-claude-note').hidden = !!ok;
    $('c-claude-note').textContent = ok ? '' : tr(!(c && c.on) ? 'Turn on Claude usage in Plugins' : c.status === 'expired' ? 'Open Claude Code to renew its sign-in' : c.status === 'missing' ? 'Claude Code is not signed in on this PC' : c.status === 'offline' ? 'No connection to read the usage' : 'Reading the usage');
    dials($('c-claude-dials'), ok ? [dial(u.session, 'Claude 5 h', 'session'), dial(u.week, 'Claude week', 'week')] : []);
    $('c-claude-dials').parentElement.hidden = !ok;
    const rows = ok ? (u.rows || []) : [];
    $('c-claude-head').hidden = $('c-claude-rows').hidden = !rows.length;
    $('c-claude-rows').replaceChildren(...rows.map(r => { const row = line('busiest', r.name, Math.round(r.percent) + ' %'); row.querySelector('.caption > span').textContent = r.name; return row; }));
  }

  // The settings that are worth a click without opening the app.
  function toggle(icon, label, help, on, change) {
    const row = el('label', 'toggle');
    row.innerHTML = `<input type="checkbox"><span class="caption">${glyph(icon)}<span><span class="c-name"></span><small></small></span></span>`;
    row.querySelector('.c-name').textContent = tr(label);
    row.querySelector('small').textContent = tr(help);
    const box = row.querySelector('input');
    box.checked = !!on;
    box.addEventListener('change', () => change(box.checked));
    return row;
  }

  function quick() {
    const q = data.quick;
    if (!q) return;
    if (document.activeElement && document.activeElement.type === 'range') return;
    const d = q.display || {}, p = q.power || {}, a = q.audio || {};
    const look = el('div', 'row c-look');
    look.innerHTML = `<span class="caption">${glyph('theme')}<span></span></span><div class="segments" role="radiogroup"></div>`;
    look.querySelector('.caption > span').append(tr('Appearance'), el('small', '', tr('The windows of lampfish, this one too')));
    look.querySelector('.segments').setAttribute('aria-label', tr('Appearance'));
    for (const [value, label] of [['light', 'Light'], ['dark', 'Dark'], ['auto', 'Use system setting']]) {
      const b = el('button');
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(q.skin === value));
      b.textContent = tr(label);
      b.addEventListener('click', () => act('skin', { value }));
      look.querySelector('.segments').append(b);
    }
    $('c-q-app').replaceChildren(look);
    $('c-q-wall').replaceChildren(
      toggle('battery', 'Pause on battery', 'Freezes when unplugged', q.PauseOnBattery, value => act('pauseOnBattery', { value })),
      toggle('full', 'Pause in full screen', 'When a window fills the screen', q.PauseAuto, value => act('pauseAuto', { value })),
      toggle('pulse', 'React to sound', 'Pulses with what you play', q.Reactive, value => act('reactive', { value })),
      toggle('shuffle', 'Shuffle', 'For the slideshow, not for Next', q.Shuffle, value => act('shuffle', { value })));
    const win = [];
    if (d.dark != null) win.push(toggle('theme', 'Windows dark mode', 'Windows and the apps that follow it', d.dark, on => act('display.dark', { on })));
    win.push(toggle('sun', 'Warm screen', 'Warmer colors at night', d.warmOn, on => act('display.warm', { on, strength: d.warm || 50, live: false })));
    if (p.battery) win.push(toggle('leaf', 'Energy saver', 'Always on while on battery', p.saver, value => act('power.saver', { value })));
    win.push(toggle('power', 'Start with Windows', 'lampfish opens by itself', q.startup, () => act('startup')));
    $('c-q-win').replaceChildren(...win);
    const sound = [toggle('output', 'Sounds on', 'Plays the events that are on', q.sounds, value => act('station.active', { value }))];
    if (a.volume != null) {
      const row = el('div', 'row c-range');
      row.innerHTML = `<span class="caption">${glyph('output')}<span></span></span><input type="range" min="0" max="100" step="2" aria-label="Volume">`;
      row.querySelector('.caption > span').textContent = tr('Volume');
      const range = row.querySelector('input');
      range.value = a.volume;
      fill(range);
      range.addEventListener('input', () => { fill(range); act('audio.volume', { value: Number(range.value), live: true }); });
      range.addEventListener('change', () => act('audio.volume', { value: Number(range.value) }));
      sound.push(row);
      sound.push(toggle('output', 'Sound of Windows', 'Off mutes everything', !a.muted, on => act('audio.mute', { on: !on })));
    }
    if (a.mic) sound.push(toggle('mic', 'Microphone', 'On for every app', !a.micMuted, on => act('audio.mic', { on })));
    $('c-q-sound').replaceChildren(...sound);
  }

  // The tabs are arranged from here too, the same choice as the Assistant page of the app.
  const TAB_NAMES = { dashboard: 'Dashboard', quick: 'Settings', claude: 'Modules', note: 'Note', capture: 'Capture', shelf: 'Shelf', audio: 'Audio', notes: 'Notes', convert: 'Convert', desktop: 'Desktop', help: 'Help' };
  function saveTabs(order, hidden) { send('companion.tabs', { order, hidden }); }
  function customize() {
    const nav = document.querySelector('.c-tabs'), order = [...nav.children].map(b => b.dataset.tab), hidden = data.hiddenTabs || [];
    $('c-custom-tabs').replaceChildren(...order.map((id, i) => {
      const row = el('div', 'row c-custom-row');
      row.innerHTML = `<span class="caption"><svg class="ph glyph" aria-hidden="true">${nav.querySelector(`[data-tab="${id}"] svg`).innerHTML}</svg><span></span></span><span class="c-order"><button type="button" class="c-up">${icon('caret-up')}</button><button type="button" class="c-down">${icon('caret-down')}</button></span><span class="toggler"><input type="checkbox"></span>`;
      row.querySelector('.caption > span').textContent = tr(TAB_NAMES[id]);
      const up = row.querySelector('.c-up'), down = row.querySelector('.c-down'), box = row.querySelector('input');
      up.title = tr('Move up'); down.title = tr('Move down'); box.setAttribute('aria-label', tr(TAB_NAMES[id]));
      up.disabled = i === 0; down.disabled = i === order.length - 1;
      box.checked = !hidden.includes(id);
      const move = by => { const next = order.slice(); next.splice(i + by, 0, next.splice(i, 1)[0]); saveTabs(next, hidden); };
      up.addEventListener('click', () => move(-1));
      down.addEventListener('click', () => move(1));
      box.addEventListener('change', () => {
        const next = box.checked ? hidden.filter(x => x !== id) : [...hidden, id];
        if (next.length >= order.length) { box.checked = true; return; }
        saveTabs(order, next);
      });
      return row;
    }));
  }

  // A file kept in the shelf: a click opens it, the buttons copy it or show it, and it can be dragged into another app.
  function fileRow(item) {
    const row = el('div', 'row c-file');
    row.innerHTML = '<button type="button" class="c-file__open"><span class="c-file__thumb"></span><span class="c-file__what"><span class="c-file__name" translate="no"></span><small></small></span></button><button type="button" class="c-tool c-copy"></button><button type="button" class="c-tool c-reveal"></button>';
    const thumb = row.querySelector('.c-file__thumb');
    const src = item.url || item.icon;
    if (src) { const img = document.createElement('img'); img.alt = ''; img.draggable = false; img.src = src; thumb.append(img); } else thumb.innerHTML = glyph('file');
    row.querySelector('.c-file__name').textContent = item.name;
    row.querySelector('small').textContent = size(item.size) + ' · ' + new Date(item.when).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' });
    const copy = row.querySelector('.c-copy'), reveal = row.querySelector('.c-reveal');
    copy.innerHTML = icon(GLYPHS.copy);
    reveal.innerHTML = icon(GLYPHS.reveal);
    copy.title = tr('Copy'); reveal.title = tr('Show in File Explorer');
    copy.addEventListener('click', () => send('companion.shelf', { op: 'copy', name: item.name }));
    reveal.addEventListener('click', () => send('companion.shelf', { op: 'reveal', name: item.name }));
    const open = row.querySelector('.c-file__open');
    open.title = tr('Open, or drag into another app');
    let start = null, dragged = false;
    open.addEventListener('pointerdown', e => { if (e.button === 0) start = { x: e.clientX, y: e.clientY }; });
    open.addEventListener('pointermove', e => {
      if (!start || !(e.buttons & 1) || Math.hypot(e.clientX - start.x, e.clientY - start.y) < 8) return;
      start = null; dragged = true;
      send('companion.shelf', { op: 'dragOut', name: item.name });
    });
    open.addEventListener('pointerup', () => { start = null; });
    open.addEventListener('click', () => { if (dragged) { dragged = false; return; } send('companion.shelf', { op: 'open', name: item.name }); });
    return row;
  }

  function shelf() {
    const files = data.shelf || [];
    $('c-files').replaceChildren(...(files.length ? files.map(fileRow) : [el('div', 'row empty', tr('Nothing on the shelf yet'))]));
    document.querySelector('.c-help-drag').hidden = !files.length;
  }

  function captures() {
    const shots = (data.shelf || []).filter(c => c.kind === 'capture' && c.url).slice(0, 3);
    $('c-shots').replaceChildren(...(shots.length ? shots.map(c => {
      const b = el('button', 'c-shot');
      b.type = 'button';
      b.title = tr('Annotate') + ': ' + c.name;
      b.innerHTML = '<img alt=""><span></span>';
      b.querySelector('img').src = c.url;
      b.querySelector('span').textContent = tr('Annotate');
      b.addEventListener('click', () => send('companion.annotate', { name: c.name }));
      return b;
    }) : [el('p', 'c-empty', tr('No capture yet'))]));
  }

  function notes() {
    const query = $('c-find').value.trim().toLowerCase();
    const list = (data.notes || []).filter(n => !query || n.name.toLowerCase().includes(query) || (n.preview || '').toLowerCase().includes(query));
    $('c-recent').replaceChildren(...(list.length ? list.map(n => {
      const b = el('button', 'row action');
      b.type = 'button';
      b.innerHTML = `<span class="caption">${glyph('note')}<span><span class="c-name" translate="no"></span><small translate="no"></small></span></span>${icon('caret-right', 'chevron')}`;
      b.querySelector('.c-name').textContent = n.name;
      b.querySelector('small').textContent = n.preview || tr('Empty');
      b.addEventListener('click', () => send('companion.openNote', { name: n.name }));
      return b;
    }) : [el('div', 'row empty', tr(query ? 'No note matches' : 'No note yet'))]));
  }

  const KIND = { speakers: 'speakers', headphones: 'headset', headset: 'headset', monitor: 'screen', screen: 'screen' };
  function outputRow(d, now) {
    const row = el('div', 'c-out' + (now ? ' is-now' : ''));
    row.innerHTML = `<button type="button" class="c-out__pick">${glyph(KIND[d.kind] || 'output')}<span class="c-out__what"><b translate="no"></b><small translate="no"></small></span></button>`;
    row.querySelector('b').textContent = d.name;
    row.querySelector('small').textContent = d.adapter || '';
    const pick = row.querySelector('.c-out__pick');
    if (now) {
      pick.disabled = true;
      const state = el('span', 'state', tr('Default'));
      pick.append(state);
      const vol = el('div', 'c-vol');
      const mute = Object.assign(el('button', 'c-tool'), { type: 'button', title: tr(d.muted ? 'Unmute' : 'Mute') });
      mute.innerHTML = icon(d.muted ? 'speaker-x' : GLYPHS.output);
      mute.setAttribute('aria-pressed', String(!!d.muted));
      mute.addEventListener('click', () => send('companion.audio', { op: 'deviceMute', id: d.id, on: !d.muted }));
      const range = Object.assign(document.createElement('input'), { type: 'range', min: 0, max: 100, step: 1, value: d.volume == null ? 0 : d.volume });
      range.setAttribute('aria-label', tr('Volume'));
      range.disabled = d.volume == null;
      range.classList.toggle('is-muted', !!d.muted);
      const out = el('output', '', d.volume == null ? '' : String(d.volume));
      fill(range);
      range.addEventListener('input', () => { out.textContent = range.value; fill(range); send('companion.audio', { op: 'deviceVolume', id: d.id, value: Number(range.value), live: true }); });
      range.addEventListener('change', () => send('companion.audio', { op: 'deviceVolume', id: d.id, value: Number(range.value) }));
      vol.append(mute, range, out);
      row.append(vol);
    } else pick.addEventListener('click', () => send('companion.audio', { op: 'use', id: d.id }));
    return row;
  }

  function outputs() {
    const list = (audio ? audio.devices : []).filter(d => d.output && d.active);
    const now = list.find(d => d.isDefault), others = list.filter(d => !d.isDefault);
    // A slider being dragged is not rebuilt under the pointer.
    if (document.activeElement && document.activeElement.type === 'range' && document.activeElement.closest('#c-out-now')) return;
    $('c-out-now').replaceChildren(...(now ? [outputRow(now, true)] : [el('div', 'row empty', tr('No output plugged in'))]));
    $('c-out-other-head').hidden = $('c-out-other').hidden = !others.length;
    $('c-out-other').replaceChildren(...others.map(d => outputRow(d, false)));
  }

  // The same jobs as the Convert page: each one asks for its files and finishes in the app.
  const TOOLS = [
    ['image', 'Change an image', 'PNG, JPG, BMP, GIF, TIFF or an icon', 'image'],
    ['images-pdf', 'Images to PDF', 'A page for each picture', 'file-pdf'],
    ['pdf-images', 'PDF to images', 'One picture for each page', 'images'],
    ['merge', 'Merge PDFs', 'Several files into one', 'arrows-merge'],
    ['pages', 'Keep some pages', 'Cut a PDF down to the pages you name', 'lf-pages-keep'],
    ['text', 'Text to PDF', 'TXT, Markdown or CSV on A4 pages', 'text-t'],
    ['office', 'Office to PDF', 'Word, Excel and PowerPoint', 'file-doc'],
  ];
  function tools() {
    if ($('c-tools').children.length) return;
    $('c-tools').replaceChildren(...TOOLS.map(([id, name, help, symbol]) => {
      const b = el('button', 'row action');
      b.type = 'button';
      b.innerHTML = `<span class="caption">${icon(symbol, 'glyph')}<span><span class="c-name"></span><small></small></span></span>${icon('caret-right', 'chevron')}`;
      b.querySelector('.c-name').textContent = tr(name);
      b.querySelector('small').textContent = tr(help);
      b.addEventListener('click', () => send('companion.convert', { tool: id }));
      return b;
    }));
  }

  function desktop() {
    const d = data.desktop || {};
    $('c-grid').checked = !!d.grid;
    $('c-hide').checked = !!d.hidden;
    $('c-autohide').checked = !!(d.taskbar && d.taskbar.autoHide);
    $('c-undo').hidden = !d.undo;
    for (const b of $('c-arrange').children) b.setAttribute('aria-pressed', String(b.dataset.value === d.arrangement));
    const near = SIZES.map(z => z[0]).reduce((a, b) => Math.abs(b - d.iconSize) < Math.abs(a - d.iconSize) ? b : a);
    for (const b of $('c-size').children) b.setAttribute('aria-checked', String(Number(b.dataset.value) === near));
    $('c-wp-pause').title = $('c-wp-pause').ariaLabel = tr(d.paused ? 'Resume' : 'Pause');
    $('c-wp-pause').querySelector('use').setAttribute('href', 'icons.svg#' + (d.paused ? 'play' : 'pause'));
  }

  function render() {
    if (!data) return;
    if (tab === 'convert') tools();
    if (tab === 'desktop') desktop();
    if (tab === 'dashboard') dashboard();
    else if (tab === 'quick') quick();
    else if (tab === 'claude') claude();
    else if (tab === 'customize') customize();
    else if (tab === 'shelf') shelf();
    else if (tab === 'capture') captures();
    else if (tab === 'notes') notes();
    else if (tab === 'audio') outputs();
  }

  const HINT = 'A new note in Notes · Ctrl + Enter adds it';
  function save() {
    const text = $('c-text').value, title = $('c-title').value.trim();
    if (!text.trim() && !title) { $('c-text').focus(); return; }
    send('companion.note', { title, text });
  }

  let hintTimer = 0;
  webview.addEventListener('message', e => {
    const m = e.data;
    if (m.type === 'companion.shown') { document.body.classList.add('is-shown'); return; }
    if (m.type === 'companion.still') { still(m); return; }
    if (m.type === 'companion.leaving') { document.body.classList.remove('is-shown'); return; }
    if (m.type === 'companion.data') {
      data = m;
      const off = (m.hiddenTabs || []).slice();
      const nav = document.querySelector('.c-tabs');
      for (const id of m.tabOrder || []) { const b = nav.querySelector(`[data-tab="${id}"]`); if (b) nav.append(b); }
      // A tab added after the order was saved goes at the end, not before the tabs that were arranged.
      if ((m.tabOrder || []).length) for (const b of [...nav.children]) if (!m.tabOrder.includes(b.dataset.tab)) nav.append(b);
      for (const b of document.querySelectorAll('[data-tab]')) b.hidden = off.includes(b.dataset.tab);
      if (off.includes(tab)) { const first = [...document.querySelectorAll('[data-tab]')].find(b => !b.hidden); if (first) show(first.dataset.tab, false); }
      if (m.tab && m.tab !== tab && tab !== 'customize' && GO[m.tab]) show(m.tab, false);
      if (m.open) {
        // The window slides in and the page fades once it is shown: the page only has to say when its data is drawn.
        document.body.classList.add('is-ready');
        if (tab === 'note') $('c-text').focus();
        if (tab === 'notes') $('c-find').focus();
        render();
        requestAnimationFrame(() => requestAnimationFrame(() => send('companion.painted')));
        return;
      }
      render();
    } else if (m.type === 'companion.hidden') {
      document.body.classList.remove('is-ready');
    } else if (m.type === 'audio.devices') {
      audio = m;
      if (tab === 'audio') outputs();
    } else if (m.type === 'companion.saved') {
      $('c-title').value = '';
      $('c-text').value = '';
      const open = Object.assign(document.createElement('button'), { type: 'button', className: 'link', innerHTML: icon('arrow-square-out') });
      open.append(tr('Open'));
      open.addEventListener('click', () => send('companion.openNote', { name: m.name }));
      const name = Object.assign(document.createElement('span'), { textContent: m.name, translate: false });
      $('c-saved').replaceChildren(tr('Added to Notes:') + ' ', name, ' · ', open);
      clearTimeout(hintTimer);
      hintTimer = setTimeout(() => { $('c-saved').textContent = tr(HINT); }, 6000);
    }
  });

  for (const b of document.querySelectorAll('[data-tab]')) b.addEventListener('click', () => show(b.dataset.tab, true));
  for (const b of document.querySelectorAll('[data-capture]')) b.addEventListener('click', () => {
    const v = b.dataset.capture;
    send('companion.capture', v === 'whole' ? { delay: 0, whole: true } : { delay: Number(v) });
  });
  $('c-save').addEventListener('click', save);
  $('c-text').addEventListener('keydown', e => { if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); save(); } });
  $('c-title').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('c-text').focus(); } });
  $('c-find').addEventListener('input', notes);
  $('c-add').addEventListener('click', () => send('companion.shelf', { op: 'add' }));
  $('c-grid').addEventListener('change', e => send('companion.grid', { on: e.target.checked }));
  $('c-hide').addEventListener('change', e => send('companion.icons', { hidden: e.target.checked }));
  $('c-straighten').addEventListener('click', () => send('companion.straighten'));
  $('c-refresh').addEventListener('click', () => send('companion.refresh'));
  $('c-wp-prev').addEventListener('click', () => send('companion.wallpaper', { op: 'previous' }));
  $('c-wp-next').addEventListener('click', () => send('companion.wallpaper', { op: 'next' }));
  $('c-wp-pause').addEventListener('click', () => send('companion.wallpaper', { op: 'pause' }));
  $('c-custom').addEventListener('click', () => show(tab === 'customize' ? 'dashboard' : 'customize', false));
  $('c-tabs-reset').addEventListener('click', () => saveTabs([], []));
  $('c-autohide').addEventListener('change', e => act('taskbar.set', { id: 'autoHide', value: e.target.checked, title: tr('Hide the taskbar') }));
  $('c-undo').addEventListener('click', () => act('arrange.undo'));
  for (const [value, name] of ARRANGEMENTS) {
    const b = el('button', 'tool-chip', tr(name));
    b.type = 'button';
    b.dataset.value = value;
    b.addEventListener('click', () => act('arrange.arrangement', { value }));
    $('c-arrange').append(b);
  }
  for (const [value, name] of SIZES) {
    const b = el('button', '', name);
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.dataset.value = value;
    b.addEventListener('click', () => act('arrange.iconSize', { value }));
    $('c-size').append(b);
  }
  // One way to the window: Open lampfish goes to the page of the open tab.
  $('c-open').addEventListener('click', () => { const [, view] = GO[tab]; send(view === 'notes' ? 'companion.openNote' : 'companion.open', view === 'notes' ? { name: '' } : { view }); });
  $('c-modules').addEventListener('click', () => send('companion.open', { view: 'plugins' }));
  $('c-close').addEventListener('click', () => send('companion.close'));
  addEventListener('keydown', e => { if (e.key === 'Escape') send('companion.close'); });
  // The Help tab: the same answers as the Help page, its actions through the bridge of the assistant.
  helpChat({
    log: $('c-help-log'), avatar: liveAvatar($('c-help-log')),
    facts: () => data ? { memory: data.memory, battery: data.battery, paused: data.desktop && data.desktop.paused, startup: data.quick ? data.quick.startup : null } : {},
    can: a => !!(a.assistant || a.view),
    run: a => {
      const to = a.assistant || { view: a.view };
      if (to.tab) show(to.tab, true);
      else if (to.act) act(to.act, to.args || {});
      else if (to.send) send(to.send, to.args || {});
      else if (to.view) send('companion.open', { view: to.view });
    },
  });
  $('c-open').title = tr(GO[tab][0]);
  clock();
  setInterval(clock, 15000);
  send('companion.ready');
})();
