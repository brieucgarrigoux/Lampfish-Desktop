'use strict';

(function () {
  let s = null;
  let playback = null;
  let chosen = 'station_on';
  let keyList = '', keyEvents = '', highlight = null;
  try { chosen = localStorage.getItem('sounds.event') || chosen; } catch (e) { }

  const two = n => String(n).padStart(2, '0');
  const eventOf = id => s && s.events.find(e => e.id === id);
  const labelOf = id => { const e = eventOf(id); return e ? e.label : id; };
  const titleOf = id => { const sound = s && s.sounds.find(x => x.id === id); return sound ? sound.title : (id || '').replace(/^.*\//, '').replace(/\.wav$/i, ''); };
  const packOf = id => { const sound = s && s.sounds.find(x => x.id === id); return sound ? sound.pack : ''; };

  const GLYPHS = [
    '<path d="M12 3.5v8"/><path d="M7 6.3a7 7 0 1 0 10 0"/>',
    '<path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z"/>',
    '<rect x="5.5" y="10.5" width="13" height="9.5" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
    '<rect x="3.5" y="9" width="17" height="7" rx="1.5"/><path d="M7.5 12.5h3M13.5 12.5h3"/>',
    '<path d="M9 3.5v4M15 3.5v4M7 7.5h10v3a5 5 0 0 1-10 0zM12 15.5v5"/>',
    '<path d="M12 3.5v13M8.5 7 12 3.5 15.5 7M7 12v3h10v-3M9.5 20.5h5"/>',
    '<path d="M4.5 16.5a7.5 7.5 0 1 1 15 0"/><path d="m12 16.5 3.5-4.5"/><circle cx="12" cy="16.5" r="1.1"/>',
  ];

  const canvas = $('level'), pen = canvas.getContext('2d');
  const BANDS = 28, SEGMENTS = 11;
  const levels = new Array(BANDS).fill(0), holds = new Array(BANDS).fill(0), fall = new Array(BANDS).fill(0);

  function target(now, band) {
    if (playback && playback.spectrum) {
      const t = (now - playback.start) / 1000 * (playback.bandFrames || 30);
      const k = Math.max(0, Math.min(playback.spectrum.length - 1, Math.floor(t)));
      return playback.spectrum[k][band];
    }
    const s = now / 1000;
    return playback ? 0 : .06 + .05 * Math.sin(s * 1.7 + band * .55) * Math.sin(s * .6 + band * .21);
  }

  function drawEq(now) {
    const r = devicePixelRatio || 1, box = canvas.getBoundingClientRect();
    const W = Math.round(box.width * r), H = Math.round(box.height * r);
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    pen.setTransform(r, 0, 0, r, 0, 0);
    pen.clearRect(0, 0, box.width, box.height);
    const gap = 3, w = (box.width - gap * (BANDS - 1)) / BANDS, h = (box.height - 6 - (SEGMENTS - 1) * 2) / SEGMENTS;
    for (let b = 0; b < BANDS; b++) {
      const v = target(now, b);
      levels[b] += (v - levels[b]) * (v > levels[b] ? .55 : .16);
      if (levels[b] >= holds[b]) { holds[b] = levels[b]; fall[b] = 0; } else { fall[b] += .0016; holds[b] = Math.max(0, holds[b] - fall[b]); }
      const lit = Math.round(levels[b] * SEGMENTS), cap = Math.min(SEGMENTS - 1, Math.round(holds[b] * SEGMENTS));
      const x = b * (w + gap);
      for (let k = 0; k < SEGMENTS; k++) {
        const y = box.height - 3 - (k + 1) * h - k * 2;
        const on = k < lit, hold = k === cap && holds[b] > .08;
        if (on || hold) {
          const mix = k / (SEGMENTS - 1);
          pen.fillStyle = on ? (mix > .82 ? '#e6eff1' : mix > .55 ? '#7ec6ba' : mix > .28 ? '#1EBBAA' : '#007669') : '#d8e6ea';
          pen.shadowColor = 'rgba(30, 187, 170, .85)';
          pen.shadowBlur = on ? 7 : 4;
        } else {
          pen.fillStyle = 'rgba(255, 255, 255, .055)';
          pen.shadowBlur = 0;
        }
        pen.beginPath();
        pen.roundRect(x, y, w, h, 1.6);
        pen.fill();
      }
    }
    pen.shadowBlur = 0;
    if (playback && playback.duration) {
      const p = Math.min(1, (now - playback.start) / 1000 / playback.duration);
      pen.fillStyle = 'rgba(30, 187, 170, .9)';
      pen.fillRect(0, box.height - 2, box.width * p, 2);
    }
  }

  function renderBanner() {
    const e = eventOf(chosen);
    if (!e) return;
    $('banner-event').textContent = e.label;
    $('sounds-for').textContent = tr(e.label);
    const state = !s.active || s.silence ? 'Sounds off' : !e.active ? 'Off' : '';
    $('banner-sound-name').textContent = [tr(packOf(e.sound)), tr(titleOf(e.sound))].filter(Boolean).join(' · ');
    $('banner-state').textContent = state ? tr(state) : '';
    $('banner-sound').classList.toggle('muted', !s.active || s.silence);
    $('banner-listen').classList.toggle('playing', !!playback);
    $('banner-listen').querySelector('.listen-label').textContent = tr(playback ? 'Stop' : 'Listen');
  }

  let loop = 0, standby = false;
  function animate() {
    loop = 0;
    const t = playback ? (performance.now() - playback.start) / 1000 : 0;
    if (playback && t > playback.duration + 0.08) { finishPlayback(); return; }
    drawEq(performance.now());
    if (playback || standby) loop = requestAnimationFrame(animate);
  }

  function startPlayback(m) {
    playback = { ...m, start: performance.now() - (m.from || 0) * 1000 };
    document.querySelectorAll('.sound.listening').forEach(l => l.classList.remove('listening'));
    const row = document.querySelector(`.sound[data-id="${CSS.escape(m.id)}"]`);
    if (row) row.classList.add('listening');
    renderBanner();
    if (!loop) loop = requestAnimationFrame(animate);
  }

  function finishPlayback() {
    playback = null;
    document.querySelectorAll('.sound.listening').forEach(l => l.classList.remove('listening'));
    if (s) renderBanner();
    animate();
  }

  $('banner-listen').addEventListener('click', () => {
    if (playback) { send('station.stop'); return; }
    send('station.listenEvent', { event: chosen });
  });

  const LEDS = 21, knob = $('knob');
  const leds = Array.from({ length: LEDS }, (_, i) => {
    const d = document.createElement('i');
    d.style.setProperty('--angle', (-135 + i * 270 / (LEDS - 1)) + 'deg');
    $('knob-ring').append(d);
    return d;
  });
  const sendVolume = throttle(v => send('station.volume', { value: v }), 60);
  let volume = 0, volumeFreeAfter = 0;
  function showVolume(v) {
    volume = v;
    knob.style.setProperty('--v', v / 100);
    knob.setAttribute('aria-valuenow', v);
    $('volume-value').textContent = v + ' %';
    leds.forEach((d, i) => d.classList.toggle('lit', v > 0 && i <= Math.round(v / 100 * (LEDS - 1))));
  }
  function turn(v, end) {
    v = Math.round(Math.max(0, Math.min(100, v)));
    if (v !== volume) { showVolume(v); sendVolume(v); }
    volumeFreeAfter = performance.now() + 800;
    if (end) send('station.volume', { value: v });
  }
  let grip = null;
  knob.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    knob.setPointerCapture(e.pointerId);
    grip = { x: e.clientX, v: volume };
    knob.classList.add('turned');
  });

  knob.addEventListener('pointermove', e => { if (grip) turn(grip.v + (e.clientX - grip.x) * 0.5); });
  const release = () => { if (!grip) return; grip = null; knob.classList.remove('turned'); turn(volume, true); };
  knob.addEventListener('pointerup', release);
  knob.addEventListener('pointercancel', release);
  knob.addEventListener('wheel', e => { e.preventDefault(); turn(volume + (e.deltaY < 0 ? 2 : -2), true); }, { passive: false });
  knob.addEventListener('keydown', e => {
    const step = { ArrowUp: 5, ArrowRight: 5, ArrowDown: -5, ArrowLeft: -5, PageUp: 10, PageDown: -10 }[e.key];
    if (step) { e.preventDefault(); turn(volume + step, true); }
    if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); turn(e.key === 'End' ? 100 : 0, true); }
  });
  knob.addEventListener('dblclick', () => turn(100, true));

  $('power').addEventListener('change', e => send('station.active', { value: e.target.checked }));

  function buildEvents() {
    const zone = $('events');
    zone.replaceChildren();
    const pairs = [];
    for (const e of s.events) (pairs[e.pair] = pairs[e.pair] || []).push(e);
    pairs.forEach((duo, i) => {
      const card = document.createElement('div');
      card.className = 'group event-pair';
      for (const e of duo) {
        const l = document.createElement('div');
        l.className = 'row event';
        l.tabIndex = 0;
        l.dataset.id = e.id;
        l.title = e.help;
        l.innerHTML = `<svg class="glyph" viewBox="0 0 24 24" aria-hidden="true">${GLYPHS[i] || ''}</svg>
          <span class="what"><span class="name-event"></span><span class="sound-event"></span></span>
          <label class="toggler"><input type="checkbox" aria-label="Enable"></label>`;
        l.querySelector('.name-event').textContent = e.label;
        const caseActive = l.querySelector('input');
        caseActive.addEventListener('click', ev => ev.stopPropagation());
        caseActive.addEventListener('change', () => send('station.event', { id: e.id, value: caseActive.checked }));
        l.addEventListener('click', () => choose(e.id));
        l.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); choose(e.id); } });
        card.append(l);
      }
      zone.append(card);
    });
  }

  function updateEvents() {
    for (const l of document.querySelectorAll('.event')) {
      const e = eventOf(l.dataset.id);
      l.classList.toggle('chosen', e.id === chosen);
      l.classList.toggle('inactive', !e.active);
      l.querySelector('input').checked = e.active;
      l.querySelector('.sound-event').textContent = titleOf(e.sound);
    }
  }

  function choose(id) {
    if (!eventOf(id)) return;
    chosen = id;
    try { localStorage.setItem('sounds.event', id); } catch (e) { }
    updateEvents();
    updateList();
    updatePacks();
    renderBanner();
  }

  const ICONS = '<svg class="icon-playback" viewBox="0 0 24 24"><path d="M7 4.5 20 12 7 19.5z"/></svg><svg class="icon-stop" viewBox="0 0 24 24"><path d="M6 6h12v12H6z"/></svg>';
  const duration = d => d.toLocaleString(LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' s';

  function buildList() {
    const zone = $('packs');
    zone.replaceChildren();
    const packs = new Map();
    for (const sound of s.sounds) { if (!packs.has(sound.pack)) packs.set(sound.pack, []); packs.get(sound.pack).push(sound); }
    if (!packs.has('My sounds')) packs.set('My sounds', []);
    for (const [pack, sounds] of packs) {
      const header = document.createElement('div');
      header.className = 'pack-header';
      header.innerHTML = '<button class="pack-open" aria-expanded="false"><svg class="chevron-pack" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg><h3></h3><span class="count"></span></button>';
      header.querySelector('h3').textContent = pack;
      header.querySelector('.count').textContent = sounds.length;
      header.querySelector('.pack-open').addEventListener('click', () => togglePack(pack));
      if (s.pairs.some(p => p.pack === pack)) {
        const load = document.createElement('button');
        load.className = 'link load-pair';
        load.dataset.pack = pack;
        load.textContent = 'Load the pair';
        load.addEventListener('click', () => send('station.pair', { pack, event: chosen }));
        header.append(load);
      }
      const group = document.createElement('div');
      group.className = 'group';
      for (const sound of sounds) {
        const row = document.createElement('div');
        row.className = 'sound';
        row.dataset.id = sound.id;
        row.innerHTML = `<button class="listen" aria-label="Listen">${ICONS}</button><span class="title"></span>
          <span class="duration">${duration(sound.duration)}</span>
          <span class="players"><button class="chip">Choose</button></span>`;
        row.querySelector('.title').textContent = sound.title;
        row.querySelector('.listen').addEventListener('click', () => {
          if (playback && playback.id === sound.id && !playback.deck) send('station.stop');
          else send('station.listen', { id: sound.id, deck: '' });
        });
        row.querySelector('.chip').addEventListener('click', () => send('station.assign', { event: chosen, id: sound.id }));
        if (sound.custom) {
          const remove = document.createElement('button');
          remove.className = 'remove';
          remove.textContent = 'Remove';
          remove.addEventListener('click', () => send('station.remove', { id: sound.id }));
          row.append(remove);
        }
        if (sound.id === highlight) { row.classList.add('fresh'); highlight = null; }
        group.append(row);
      }
      if (pack === 'My sounds') {
        const add = document.createElement('button');
        add.className = 'sound-add';
        add.innerHTML = '<strong>+</strong>Add a sound';
        add.addEventListener('click', () => $('sounds-files').click());
        group.append(add);
      }
      const block = document.createElement('div');
      block.className = 'pack';
      block.dataset.pack = pack;
      block.append(header, group);
      zone.append(block);
    }
    updatePacks();
  }

  let openPacks = new Set(), lastCurrent = null;
  try { openPacks = new Set(JSON.parse(localStorage.getItem('sounds.openPacks') || '[]')); } catch (e) { }
  function togglePack(pack) {
    if (openPacks.has(pack)) openPacks.delete(pack); else openPacks.add(pack);
    try { localStorage.setItem('sounds.openPacks', JSON.stringify([...openPacks])); } catch (e) { }
    updatePacks();
  }
  function updatePacks() {
    const e = eventOf(chosen), current = e && packOf(e.sound);

    if (current && current !== lastCurrent) { lastCurrent = current; openPacks.add(current); }
    for (const block of document.querySelectorAll('.pack')) {
      const open = openPacks.has(block.dataset.pack);
      block.classList.toggle('open', open);
      block.classList.toggle('current', block.dataset.pack === current);
      block.querySelector('.pack-open').setAttribute('aria-expanded', String(open));
    }
    const all = [...document.querySelectorAll('.pack')].map(b => b.dataset.pack);
    const every = all.length && all.every(p => openPacks.has(p));
    $('sounds-toggle').classList.toggle('collapsing', !!every);
    $('sounds-toggle').querySelector('span').textContent = tr(every ? 'Collapse all' : 'Expand all');
  }

  function updateList() {
    const e = eventOf(chosen);
    if (!e) return;
    const duo = s.events.filter(x => x.pair === e.pair);
    for (const chip of document.querySelectorAll('.sound .chip')) {
      chip.setAttribute('aria-pressed', String(chip.closest('.sound').dataset.id === e.sound));
      chip.title = tr('Sound for “{0}”', tr(e.label));
    }
    for (const b of document.querySelectorAll('.load-pair')) {
      const p = s.pairs.find(x => x.pack === b.dataset.pack);
      b.hidden = duo.length === 2 && duo[0].sound === p.a && duo[1].sound === p.b;
    }
  }

  $('sounds-folder').addEventListener('click', () => send('station.folder'));
  $('sounds-toggle').addEventListener('click', () => {
    const all = [...document.querySelectorAll('.pack')].map(b => b.dataset.pack);
    if (all.every(p => openPacks.has(p))) openPacks.clear(); else all.forEach(p => openPacks.add(p));
    try { localStorage.setItem('sounds.openPacks', JSON.stringify([...openPacks])); } catch (e) { }
    updatePacks();
  });
  $('sounds-files').addEventListener('change', e => { const f = [...e.target.files]; e.target.value = ''; ingest(f); });

  const EXTENSIONS = /\.(wav|mp3|m4a|aac|ogg|oga|opus|flac|webm)$/i;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  async function ingest(files) {
    const sounds = files.filter(f => f.type.startsWith('audio/') || EXTENSIONS.test(f.name));
    if (!sounds.length) { toast('Unknown format: a sound file is needed', false, 3000); return; }
    for (const f of sounds) {
      const name = f.name.replace(/\.[^.]+$/, '');
      toast(tr('Importing “{0}”', name), false, 30000);
      try {
        const context = new OfflineAudioContext(2, 1, 44100);
        const buffer = await context.decodeAudioData(await f.arrayBuffer());
        send('station.ingest', { name, data: base64(toWav(buffer)) });
      } catch (err) {
        const reason = err && err.message;
        toast(reason === 'long' ? 'Sound too long: 30 seconds at most' : reason === 'empty' ? 'Silent sound' : tr('Unreadable file: {0}', name), false, 3500);
      }
      if (sounds.length > 1) await wait(1400);
    }
  }

  function toWav(b) {
    const channels = [];
    for (let c = 0; c < Math.min(2, b.numberOfChannels); c++) channels.push(b.getChannelData(c));
    const n = b.length, rate = b.sampleRate, threshold = 0.003;
    const strong = i => channels.some(d => Math.abs(d[i]) > threshold);
    let start = 0, end = n - 1;
    while (start < n && !strong(start)) start++;
    if (start >= n) throw new Error('empty');
    while (end > start && !strong(end)) end--;
    start = Math.max(0, start - Math.round(rate * 0.01));
    end = Math.min(n - 1, end + Math.round(rate * 0.04));
    const images = end - start + 1;
    if (images / rate > 30.5) throw new Error('long');
    let max = 0;
    for (const d of channels) for (let i = start; i <= end; i++) { const a = Math.abs(d[i]); if (a > max) max = a; }
    const gain = max > 0 ? 0.891 / max : 1;
    const nc = channels.length, bytes = images * nc * 2;
    const v = new DataView(new ArrayBuffer(44 + bytes));
    const write = (o, t) => { for (let i = 0; i < 4; i++) v.setUint8(o + i, t.charCodeAt(i)); };
    write(0, 'RIFF'); v.setUint32(4, 36 + bytes, true); write(8, 'WAVE');
    write(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, nc, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * nc * 2, true); v.setUint16(32, nc * 2, true); v.setUint16(34, 16, true);
    write(36, 'data'); v.setUint32(40, bytes, true);
    let o = 44;
    for (let i = start; i <= end; i++)
      for (let c = 0; c < nc; c++, o += 2) v.setInt16(o, Math.round(Math.max(-1, Math.min(1, channels[c][i] * gain)) * 32767), true);
    return new Uint8Array(v.buffer);
  }

  function base64(bytes) {
    let t = '';
    for (let i = 0; i < bytes.length; i += 0x8000) t += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(t);
  }

  function state(n) {
    s = n;
    $('power').checked = s.active && !s.silence;
    if (performance.now() > volumeFreeAfter) showVolume(s.volume);
    if (!eventOf(chosen)) chosen = s.events[0].id;

    const keyE = s.events.map(e => e.id).join('|');
    if (keyE !== keyEvents) { keyEvents = keyE; buildEvents(); }
    updateEvents();
    renderDock();
    const key = s.sounds.map(x => x.id).join('|');
    if (key !== keyList) { keyList = key; buildList(); }
    updateList();
    $('sounds-count').textContent = s.sounds.length;
    renderBanner();

    $('station-name').textContent = s.station || 'No dock chosen';
    $('station-state').textContent = !s.station ? '' : s.present ? 'Connected' : 'Not connected';
    if (!detection) $('station-choose').textContent = s.station ? 'Change dock' : 'Choose my dock';
    $('station-forget').hidden = !s.station || detection;
    $('sounds-mains').textContent = s.mains ? 'Mains' : 'Battery';
    const history = $('history');
    history.replaceChildren();
    for (const e of s.log.slice(0, 8)) {
      const d = new Date(e.when);
      const row = document.createElement('div');
      row.className = 'row';
      const day = d.toDateString() === new Date().toDateString() ? '' : two(d.getDate()) + '/' + two(d.getMonth() + 1) + ' ';
      row.innerHTML = `<span></span><span class="time">${day}${two(d.getHours())}:${two(d.getMinutes())}</span>`;
      row.firstChild.textContent = labelOf(e.type);
      history.append(row);
    }
    if (!s.log.length) history.innerHTML = '<div class="row empty">No events</div>';
  }

  let detection = false, detectionCount = 0;
  $('station-choose').addEventListener('click', () => { if (!detection) send('station.detect'); });
  $('station-forget').addEventListener('click', () => send('station.forget'));
  function followDetection(m) {
    clearInterval(detectionCount);
    if (m.running) {
      detection = true;
      let rest = 30;
      const show = () => { $('station-choose').textContent = tr('Plug in the dock now… {0} s', rest); };
      show();
      $('station-forget').hidden = true;
      detectionCount = setInterval(() => { rest = Math.max(0, rest - 1); show(); }, 1000);
      return;
    }
    detection = false;
    toast(m.found ? tr('Dock recognized: {0}', m.name) : 'Nothing was plugged in, dock unchanged', false, 3500);
  }

  const REFUSAL = { off: 'Sounds are off (Sounds on)', nothing: 'Nothing is playing', output: 'Audio output not found', file: 'Unreadable file' };
  function event(m) {
    switch (m.type) {
      case 'station.playback': startPlayback(m); break;
      case 'station.stop': finishPlayback(); break;
      case 'station.pause': finishPlayback(); break;
      case 'station.detection': followDetection(m); break;
      case 'station.refusal': toast(REFUSAL[m.reason] || 'Playback failed', false, 3000); break;
      case 'station.imported':
        if (m.ok) { highlight = m.id; toast(tr('Sound added: {0}', m.title), false, 2600); }
        else toast(tr('Import failed: {0}', m.title || ''), false, 3000);
        break;
      case 'station.event':

        if (eventOf(m.event)) choose(m.event);
        break;
    }
  }

  function renderDock() {
    const zone = $('dock-pick');
    if (document.body.dataset.dock !== 'station' || !s) return;
    const slider = zone.querySelector('input[type="range"]');
    if (slider) {
      if (document.activeElement !== slider) slider.value = s.volume;
      slider.parentNode.querySelector('output').textContent = slider.value + ' %';
      fill(slider);
    }
    const key = JSON.stringify([s.events.map(e => [e.id, e.active, e.sound]), LANGUAGE]);
    if (zone.dataset.key === key && zone.firstChild) return;
    zone.dataset.key = key;
    const heading = text => Object.assign(document.createElement('h2'), { textContent: tr(text) });
    const volume = document.createElement('div');
    volume.className = 'group';
    volume.innerHTML = '<div class="setting"><label for="dock-volume"><span class="caption"><svg class="glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v4h3.5l4.5 3.5v-11L7.5 10z"/><path d="M15.5 9.2a4 4 0 0 1 0 5.6M18 6.8a7.4 7.4 0 0 1 0 10.4"/></svg><span>Volume<small>Level of the system sounds</small></span></span><output></output></label><input type="range" id="dock-volume" min="0" max="100" step="1"></div>';
    const range = volume.querySelector('input');
    range.value = s.volume;
    volume.querySelector('output').textContent = range.value + ' %';
    fill(range);
    range.addEventListener('input', () => { volume.querySelector('output').textContent = range.value + ' %'; fill(range); turn(Number(range.value), false); });
    range.addEventListener('change', () => turn(Number(range.value), true));
    const events = document.createElement('div');
    events.className = 'group';
    for (const e of s.events) {
      const row = document.createElement('label');
      row.className = 'toggle';
      row.innerHTML = `<input type="checkbox"><span class="caption"><svg class="glyph" viewBox="0 0 24 24" aria-hidden="true">${GLYPHS[e.pair] || ''}</svg><span><span class="dock-event"></span><small></small></span></span>`;
      row.querySelector('.dock-event').textContent = e.label;
      const sound = row.querySelector('small');
      sound.textContent = titleOf(e.sound);
      sound.translate = false;
      const box = row.querySelector('input');
      box.checked = e.active;
      box.addEventListener('change', () => send('station.event', { id: e.id, value: box.checked }));
      events.append(row);
    }
    zone.replaceChildren(heading('Volume'), volume, heading('Events'), events);
    foldSections(zone, 'dock-station');
  }

  Bramble.station = { state, event, ingest, renderDock, visible(yes) { standby = yes; if (yes && !loop) loop = requestAnimationFrame(animate); } };
  animate();
})();
