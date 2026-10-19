'use strict';

(function () {
  const HISTORY = 60;
  let inv = null, stats = null, shown = false, timer = 0;
  let choice = 'processor';
  const histories = {};
  let cards = {};
  const zone = $('m-schema');

  const UNITS = ['bytes', 'KB', 'MB', 'GB', 'TB'].map(u => tr(u));
  function size(o, decimals) {
    let i = 0;
    while (o >= 1024 && i < UNITS.length - 1) { o /= 1024; i++; }
    const d = decimals != null ? decimals : (i === 0 || o >= 100 ? 0 : 1);
    return o.toLocaleString(LOCALE, { maximumFractionDigits: d }) + ' ' + UNITS[i];
  }
  const throughput = o => (o < 1024 ? '0 ' + UNITS[1] : size(o)) + '/s';
  const pct = v => Math.round(v).toLocaleString(LOCALE) + ' %';
  const ghz = mhz => (mhz / 1000).toLocaleString(LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + ' GHz';
  const link = bits => bits >= 1e9 ? (bits / 1e9).toLocaleString(LOCALE, { maximumFractionDigits: 1 }) + ' Gbit/s' : Math.round(bits / 1e6) + ' Mbit/s';
  function duration(s) {
    const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), j = Math.floor(h / 24);
    return j ? tr('{0} d {1} h', j, h % 24) : h ? tr('{0} h {1}', h, String(m).padStart(2, '0')) : `${m} min`;
  }

  const shortName = name => (name || '').replace(/\((R|TM|tm)\)/g, '').replace(/^(AMD|Intel|NVIDIA)\s+/i, '')
    .replace(/\s+with\s+.*$/i, '').replace(/\s+CPU\s+@.*$/i, '').replace(/\s+\d+-Core Processor$/i, '').replace(/\s+Processor$/i, '').replace(/\s+/g, ' ').trim();

  const nameScreen = x => !x.name ? tr('Screen') : x.manufacturer && !x.builtin && !x.name.toLowerCase().includes(x.manufacturer.toLowerCase()) ? x.manufacturer + ' ' + x.name : x.name;
  const charge = v => tr(v < 15 ? 'Idle' : v < 50 ? 'Moderate' : v < 85 ? 'Busy' : 'Maxed out');
  const level = v => v < 50 ? '' : v < 85 ? 'medium' : 'up';

  const GLYPHS = {
    processor: '<rect x="6.5" y="6.5" width="11" height="11" rx="1.5"/><rect x="9.5" y="9.5" width="5" height="5" rx=".8"/><path d="M9.5 3.5v3M14.5 3.5v3M9.5 17.5v3M14.5 17.5v3M3.5 9.5h3M3.5 14.5h3M17.5 9.5h3M17.5 14.5h3"/>',
    memory: '<rect x="3.5" y="7" width="17" height="9" rx="1.2"/><path d="M7 10v3M10.5 10v3M14 10v3M17.5 10v3M6 16v2.5M18 16v2.5"/>',
    graphics: '<rect x="3.5" y="6" width="17" height="11" rx="1.5"/><circle cx="12" cy="11.5" r="3"/><path d="M7 17v2.5M17 17v2.5"/>',
    disk: '<rect x="4" y="4.5" width="16" height="15" rx="2"/><circle cx="12" cy="11" r="3.5"/><path d="M8 17h.01M16 17h-3"/>',
    network: '<path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.5 16a5 5 0 0 1 7 0"/><circle cx="12" cy="19.2" r="1.1"/>',
    cable: '<rect x="8" y="3.5" width="8" height="7" rx="1.2"/><path d="M10 3.5V6M14 3.5V6M12 10.5v10"/>',
    battery: '<rect x="3.5" y="8" width="15" height="8" rx="1.5"/><path d="M21 11v2"/>',
    screens: '<rect x="3.5" y="4.5" width="17" height="12" rx="1.5"/><path d="M9 20h6M12 16.5V20"/>',
    temperature: '<path d="M10 14.5V5a2 2 0 0 1 4 0v9.5a4 4 0 1 1-4 0z"/><path d="M12 11v5"/>',
    system: '<rect x="4" y="4.5" width="16" height="11" rx="1.5"/><path d="M2.5 19.5h19"/>',
  };
  const glyph = name => `<svg class="glyph" viewBox="0 0 24 24" aria-hidden="true">${GLYPHS[name]}</svg>`;

  function record(key, v) {
    const h = histories[key] || (histories[key] = []);
    h.push(v);
    if (h.length > HISTORY) h.shift();
    return h;
  }

  function plot(svg, values, max) {
    if (!svg || values.length < 2) return;
    const pts = values.map((v, i) => [100 * (i + HISTORY - values.length) / (HISTORY - 1), 31 - 29 * Math.min(1, v / (max || 1))]);
    const d = 'M' + pts.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L');
    svg.querySelector('.curve').setAttribute('d', d);
    svg.querySelector('.area').setAttribute('d', `${d}L${pts[pts.length - 1][0].toFixed(1)} 32L${pts[0][0].toFixed(1)} 32Z`);
  }
  const CURVE = '<svg class="mini-curve" viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true"><path class="area"/><path class="curve"/></svg>';

  function card(key, icon, title, subtitle, extra) {
    const c = document.createElement('article');
    c.className = 'm-card';
    c.tabIndex = 0;
    c.dataset.key = key;
    c.innerHTML = `<span class="reticle"></span>
      <header>${glyph(icon)}<div><h3></h3><p class="m-model"></p></div></header>
      <div class="m-measure"><span class="m-value">–</span><span class="m-word"></span></div>
      ${extra || ''}${CURVE}<p class="m-facts"></p>`;
    c.querySelector('h3').textContent = title;
    c.querySelector('.m-model').textContent = subtitle || '';
    c.querySelector('.m-model').title = subtitle || '';
    c.addEventListener('click', () => choose(key));
    c.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(key); } });
    cards[key] = {
      el: c, value: c.querySelector('.m-value'), word: c.querySelector('.m-word'), facts: c.querySelector('.m-facts'),
      curve: c.querySelector('.mini-curve'),
    };
    return c;
  }

  function family(title, children) {
    const s = document.createElement('section');
    s.className = 'm-family';
    const h = document.createElement('h2');
    h.textContent = title;
    const g = document.createElement('div');
    g.className = 'm-grid';
    g.append(...children);
    s.append(h, g);
    return s;
  }

  function build() {
    cards = {};
    const s = inv.system, p = inv.processor || { name: '', threads: 1 };

    const header = document.createElement('div');
    header.className = 'm-header';
    header.innerHTML = `${glyph('system')}<div class="m-header__what"><span class="title"></span><span class="path"></span></div><div class="m-health"><i></i><span id="m-health"></span></div>`;
    header.querySelector('.title').textContent = [s.manufacturer, s.model].filter(Boolean).join(' ') || 'Computer';
    header.querySelector('.path').textContent = [(s.windows || '').replace(/^Microsoft\s+/, ''), s.version].filter(Boolean).join(' · ');

    const threads = '<div class="m-threads">' + '<i></i>'.repeat(Math.max(1, p.threads || 1)) + '</div>';
    const cpu = card('processor', 'processor', 'Processor', shortName(p.name), threads);
    cards.processor.threads = [...cpu.querySelectorAll('.m-threads i')];

    const m = inv.memory, installed = m.modules.reduce((t, b) => t + b.capacity, 0);
    const ram = card('memory', 'memory', 'Memory', [size(installed, 0), m.modules[0] && m.modules[0].type].filter(Boolean).join(' · '),
      '<div class="m-bar"><i></i></div>');
    cards.memory.bar = ram.querySelector('.m-bar i');

    const performance = [cpu, ram];
    inv.graphics.forEach((g, i) => performance.push(card('graphics-' + i, 'graphics', 'Graphics', g.name)));

    const storage = [];
    for (const d of inv.disks) {
      const volumes = d.volumes.map(v => `<div class="m-volume" data-letter="${v.letter}"><span class="m-volume__name">${v.letter}</span><div class="m-bar"><i style="width:${(100 * (v.size - v.free) / v.size).toFixed(1)}%"></i></div><span class="m-volume__free"></span></div>`).join('');
      const c = card('disk-' + d.number, 'disk', 'Storage', d.name, volumes);
      d.volumes.forEach((v, i) => {
        const free = v.free / v.size;
        c.querySelectorAll('.m-volume__free')[i].textContent = tr('{0} free', size(v.free, 0));
        c.querySelectorAll('.m-volume')[i].classList.toggle('full', free < 0.1);
      });
      storage.push(c);
    }
    for (const r of inv.networks) storage.push(card('network-' + r.id, r.type === 'Wi-Fi' ? 'network' : 'cable', 'Network', r.name));

    const power = [];
    if (inv.battery) {
      const b = card('battery', 'battery', 'Battery', inv.battery.name, '<div class="cell-relief"><span class="cell-relief__segments">' + '<i></i>'.repeat(10) + '</span><span class="cell-relief__tip"></span></div>');
      cards.battery.segments = [...b.querySelectorAll('.cell-relief__segments i')];
      b.querySelector('.mini-curve').remove();
      power.push(b);
    }

    const tc = card('temperature', 'temperature', 'Temperature', tr('Processor thermal zone'),
      '<svg class="thermo" viewBox="0 0 120 72" aria-hidden="true"><g class="thermo__ticks"></g><path class="thermo__red" d="M101.8 49.6A46 46 0 0 0 98.6 35.4"/><g class="thermo__needle"><path d="M58.8 62 60 22l1.2 40z"/></g><circle class="thermo__pivot" cx="60" cy="62" r="5"/></svg>');
    tc.querySelector('.mini-curve').remove();
    let grad = '';
    for (let t = 20; t <= 100; t += 10) {
      const a = Math.PI + (t - 20) / 80 * Math.PI, r1 = 46, r2 = t % 20 === 0 ? 39 : 42;
      grad += `<path d="M${(60 + r1 * Math.cos(a)).toFixed(1)} ${(62 + r1 * Math.sin(a)).toFixed(1)}L${(60 + r2 * Math.cos(a)).toFixed(1)} ${(62 + r2 * Math.sin(a)).toFixed(1)}"/>`;
    }
    tc.querySelector('.thermo__ticks').innerHTML = grad;
    cards.temperature.needle = tc.querySelector('.thermo__needle');
    power.push(tc);

    const e = inv.screens;
    const scr = card('screens', 'screens', 'Screens', e.length === 1 ? nameScreen(e[0]) : tr('{0} screens', e.length), '<div class="m-screens"></div><ul class="m-list-screens"></ul>');
    scr.querySelector('.mini-curve').remove();
    scr.querySelector('.m-measure').remove();
    scr.classList.add('m-card--large');
    const map = scr.querySelector('.m-screens');
    const total = e.reduce((t, x) => t + x.w, 0), up = Math.max(...e.map(x => x.h));
    const k = Math.min(64 / up, 400 / total);
    for (const x of e) {
      const r = document.createElement('div');
      r.className = 'm-screen' + (x.primary ? ' primary' : '');
      r.style.width = Math.round(x.w * k) + 'px';
      r.style.height = Math.round(x.h * k) + 'px';
      r.textContent = x.n;
      map.append(r);
    }
    scr.querySelector('.m-list-screens').replaceChildren(...e.map(x => {
      const li = document.createElement('li');
      li.innerHTML = '<b></b><span></span>';
      li.querySelector('b').textContent = x.n + ' · ' + nameScreen(x);
      li.querySelector('span').textContent = [`${x.w} × ${x.h}`, x.hz ? x.hz + ' Hz' : '', x.inches ? tr('{0} in', x.inches.toLocaleString(LOCALE)) : '', x.port].filter(Boolean).join(' · ');
      return li;
    }));
    cards.screens.facts.textContent = '';
    power.push(scr);

    zone.replaceChildren(header,
      family('Power', performance),
      family('Storage and network', storage),
      family('Power and screens', power));
    mark();
    if (stats) update();
  }

  function update() {
    if (!cards.processor) return;
    const alerts = [];
    const p = stats.processor, c = cards.processor;
    c.value.textContent = pct(p.total);
    c.word.textContent = charge(p.total);
    c.el.dataset.level = level(p.total);
    c.facts.textContent = [tr('{0} cores', (inv.processor || {}).cores || '?'), p.frequency ? ghz(p.frequency) : '', stats.temperature != null ? Math.round(stats.temperature) + ' °C' : ''].filter(Boolean).join(' · ');
    c.threads.forEach((f, i) => f.style.setProperty('--h', Math.min(100, p.threads[i] || 0) + '%'));
    plot(c.curve, record('processor', p.total), 100);
    if (p.total >= 90) alerts.push(tr('The processor is maxed out'));
    if (stats.temperature >= 90) alerts.push(tr('The processor is hot'));

    const m = stats.memory, r = cards.memory, part = m.used / m.total * 100;
    r.value.textContent = pct(part);
    r.word.textContent = tr(part < 60 ? 'Comfortable' : part < 85 ? 'Fairly full' : 'Almost full');
    r.el.dataset.level = level(part);
    r.bar.style.width = part.toFixed(1) + '%';
    r.facts.textContent = tr('{0} of {1}', size(m.used, 1), size(m.total, 1));
    plot(r.curve, record('memory', part), 100);
    if (part >= 90) alerts.push(tr('Memory is almost full'));

    const g = stats.graphics, gc = cards['graphics-0'];
    if (gc) {
      gc.value.textContent = pct(g.usage);
      gc.word.textContent = charge(g.usage);
      gc.el.dataset.level = level(g.usage);
      gc.facts.textContent = tr('{0} of memory used', size(g.memory, 1));
      plot(gc.curve, record('graphics', g.usage), 100);
    }

    for (const d of inv.disks) {
      const k = cards['disk-' + d.number], v = stats.disks[d.number];
      if (!k || !v) continue;
      k.value.textContent = pct(v.activity);
      k.word.textContent = tr(v.activity < 5 ? 'Idle' : v.activity < 60 ? 'Working' : 'Very busy');
      k.facts.textContent = [d.type, d.bus, size(d.size, 0), '↓ ' + throughput(v.playback), '↑ ' + throughput(v.write)].filter(Boolean).join(' · ');
      plot(k.curve, record('disk-' + d.number, v.activity), 100);
      for (const vol of d.volumes) if (vol.free / vol.size < 0.1) alerts.push(tr('Drive {0} is almost full', vol.letter));
    }
    for (const n of inv.networks) {
      const k = cards['network-' + n.id], v = stats.networks[n.id];
      if (!k || !v) continue;
      const h = record('network-' + n.id, v.received + v.sent);
      k.value.textContent = throughput(v.received + v.sent);
      k.word.textContent = tr(v.received + v.sent < 10 * 1024 ? 'Quiet' : 'Active');
      k.facts.textContent = [n.type, n.speed > 0 ? tr('link {0}', link(n.speed)) : '', '↓ ' + throughput(v.received), '↑ ' + throughput(v.sent)].filter(Boolean).join(' · ');
      plot(k.curve, h, Math.max(64 * 1024, ...h));
    }
    if (cards.battery && stats.battery) {
      const b = stats.battery, k = cards.battery;
      k.value.textContent = b.charge + ' %';
      k.word.textContent = b.mains ? tr('Plugged in') : b.remaining > 0 ? tr('{0} left', duration(b.remaining)) : tr('On battery');
      const lit = Math.ceil(b.charge / 10);
      k.segments.forEach((s, i) => s.className = i < lit ? (b.charge <= 15 && !b.mains ? 'low' : 'full') : '');
      k.el.classList.toggle('charging', !!b.mains && b.charge < 100);
      k.el.dataset.level = b.charge <= 15 && !b.mains ? 'up' : '';
      k.facts.textContent = '';
      if (b.charge <= 15 && !b.mains) alerts.push(tr('Battery low'));
    }

    if (cards.temperature) {
      const t = stats.temperature, k = cards.temperature;
      k.value.textContent = t != null ? Math.round(t) + ' °C' : '–';
      k.word.textContent = t == null ? '' : tr(t < 60 ? 'Cool' : t < 85 ? 'Warm' : 'Hot');
      k.el.dataset.level = t >= 85 ? 'up' : t >= 70 ? 'medium' : '';
      if (t != null) k.needle.style.transform = `rotate(${(-90 + Math.max(0, Math.min(1, (t - 20) / 80)) * 180).toFixed(1)}deg)`;
    }

    const health = $('m-health');
    if (health) {
      health.textContent = alerts.length ? alerts[0] : tr('All good');
      health.parentElement.classList.toggle('alert', alerts.length > 0);
    }
    if (inv) renderPanel();
  }

  function choose(key) {
    choice = key;
    mark();
    renderPanel();
  }

  function mark() {
    for (const c of zone.querySelectorAll('.m-card')) c.classList.toggle('chosen', c.dataset.key === choice);
  }

  const ICONS_ROWS = {
    'Model': '<rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M2.5 19.5h19"/>',
    'Windows': '<path d="M4 5.5 11 4.5v7H4zM13 4.2l7-1v8.3h-7zM4 13h7v7l-7-1zM13 13h7v8l-7-1z"/>',
    'Version': '<path d="M4 12V4.5h7.5l8.5 8.5-7.5 7.5z"/><circle cx="8.5" cy="8.5" r="1.3"/>',
    'Up since': '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    'Temperature': '<path d="M10 14.5V5a2 2 0 0 1 4 0v9.5a4 4 0 1 1-4 0z"/>',
    'Cores': '<rect x="6.5" y="6.5" width="11" height="11" rx="1.5"/><rect x="9.5" y="9.5" width="5" height="5" rx=".8"/>',
    "Threads": '<path d="M5 6h14M5 10h14M5 14h14M5 18h14"/>',
    'Base clock': '<path d="M3 12h3l2-5 4 10 2-5h7"/>',
    'Current clock': '<path d="M3 12h3l2-5 4 10 2-5h7"/>',
    'Refresh rate': '<path d="M3 12h3l2-5 4 10 2-5h7"/>',
    'Usage': '<path d="M4.5 16.5a7.5 7.5 0 1 1 15 0"/><path d="m12 16.5 3.5-4.5"/>',
    'Activity': '<path d="M4.5 16.5a7.5 7.5 0 1 1 15 0"/><path d="m12 16.5 3.5-4.5"/>',
    'L2 cache': '<path d="m12 4 8 4-8 4-8-4zM4 12l8 4 8-4M4 16l8 4 8-4"/>',
    'L3 cache': '<path d="m12 4 8 4-8 4-8-4zM4 12l8 4 8-4M4 16l8 4 8-4"/>',
    'Installed': '<rect x="3.5" y="7" width="17" height="9" rx="1.2"/><path d="M7 10v3M10.5 10v3M14 10v3M17.5 10v3"/>',
    'Used': '<rect x="3.5" y="7" width="17" height="9" rx="1.2"/><path d="M7 10v3M10.5 10v3"/>',
    'Memory in use': '<rect x="3.5" y="7" width="17" height="9" rx="1.2"/><path d="M7 10v3M10.5 10v3"/>',
    'Dedicated memory': '<rect x="3.5" y="7" width="17" height="9" rx="1.2"/><path d="M7 10v3M10.5 10v3M14 10v3M17.5 10v3"/>',
    'Slots': '<rect x="4" y="5" width="4" height="14" rx="1"/><rect x="10" y="5" width="4" height="14" rx="1"/><rect x="16" y="5" width="4" height="14" rx="1" stroke-dasharray="2 2"/>',
    'Maximum': '<path d="M12 4v16M5 11l7-7 7 7"/>',
    'Capacity': '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 14h16"/>',
    'Size': '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 14h16"/>',
    'Type': '<path d="M4 12V4.5h7.5l8.5 8.5-7.5 7.5z"/><circle cx="8.5" cy="8.5" r="1.3"/>',
    'Speed': '<path d="M4.5 16.5a7.5 7.5 0 1 1 15 0"/><path d="m12 16.5 3.5-4.5"/>',
    'Manufacturer': '<path d="M3.5 20V10l5 3V10l5 3V6l7 4v10z"/>',
    'Part number': '<path d="M5 5v14M8 5v14M11 5v14M15 5v14M19 5v14"/>',
    'Driver': '<circle cx="12" cy="12" r="3"/><path d="M12 3.5v2.5M12 18v2.5M20.5 12H18M6 12H3.5M18 6l-1.8 1.8M7.8 16.2 6 18M18 18l-1.8-1.8M7.8 7.8 6 6"/>',
    'Playing': '<path d="M12 4v12M7 11l5 5 5-5M5 20h14"/>',
    'Write': '<path d="M12 20V8M7 13l5-5 5 5M5 4h14"/>',
    'Received': '<path d="M12 4v12M7 11l5 5 5-5M5 20h14"/>',
    'Sent': '<path d="M12 20V8M7 13l5-5 5 5M5 4h14"/>',
    'Name': '<path d="M4 12V4.5h7.5l8.5 8.5-7.5 7.5z"/><circle cx="8.5" cy="8.5" r="1.3"/>',
    'Used': '<path d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5H12z"/>',
    'Free': '<circle cx="12" cy="12" r="8.5" stroke-dasharray="3 3"/>',
    'Adapter': '<rect x="3.5" y="7" width="17" height="10" rx="1.5"/><path d="M7 17v2.5M11 17v2.5M15 17v2.5"/>',
    'Link': '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    'Charge': '<rect x="3.5" y="8" width="15" height="8" rx="1.5"/><path d="M21 11v2M6.5 11v2M9.5 11v2"/>',
    'Power': '<path d="M9 3.5v4M15 3.5v4M7 7.5h10v3a5 5 0 0 1-10 0zM12 15.5v5"/>',
    'Time left': '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    'Diagonal': '<rect x="3.5" y="5" width="17" height="12" rx="1.5"/><path d="M6.5 14 17.5 8"/>',
    'Resolution': '<rect x="3.5" y="5" width="17" height="12" rx="1.5"/><path d="M8 9v4M12 9v4M16 9v4"/>',
    'Scaling': '<path d="M14 4h6v6M20 4l-7 7M10 20H4v-6M4 20l7-7"/>',
    'Port': '<path d="M9 3.5v4M15 3.5v4M7 7.5h10v3a5 5 0 0 1-10 0zM12 15.5v5"/>',
    'Year': '<rect x="4" y="5.5" width="16" height="14" rx="2"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
  };
  const POINT = '<circle cx="12" cy="12" r="2"/>';

  function group(title, rows) {
    const h = document.createElement('h2');
    h.textContent = title;
    const g = document.createElement('div');
    g.className = 'group';
    for (const [label, value] of rows.filter(l => l && l[1] != null && l[1] !== '')) {
      const l = document.createElement('div');
      l.className = 'row';
      l.innerHTML = '<span class="caption"><svg class="glyph glyph--small" viewBox="0 0 24 24" aria-hidden="true">' + (ICONS_ROWS[label] || POINT) + '</svg><span></span></span><span class="value"></span>';
      l.querySelector('.caption > span').textContent = label;
      l.querySelector('.value').textContent = value;
      l.querySelector('.value').title = value;
      g.append(l);
    }
    return [h, g];
  }

  function renderPanel() {
    const s = inv.system, sections = [];
    const lit = s.startup ? (Date.now() - new Date(s.startup)) / 1000 : 0;
    sections.push(...group('System', [
      ['Model', [s.manufacturer, s.model].filter(Boolean).join(' ')],
      ['Windows', (s.windows || '').replace(/^Microsoft\s+/, '')],
      ['Version', s.version],
      ['Up since', lit > 0 ? duration(lit) : null],
      ['Temperature', stats && stats.temperature != null ? stats.temperature.toLocaleString(LOCALE) + ' °C' : null],
    ]));

    const p = inv.processor || {};
    if (choice === 'processor') sections.push(...group('Processor', [
      ['Model', shortName(p.name)],
      ['Cores', p.cores], ['Threads', p.threads],
      ['Base clock', p.frequency ? ghz(p.frequency) : null],
      ['Current clock', stats && stats.processor.frequency ? ghz(stats.processor.frequency) : null],
      ['Usage', stats ? pct(stats.processor.total) : null],
      ['L2 cache', p.l2 ? size(p.l2 * 1024) : null], ['L3 cache', p.l3 ? size(p.l3 * 1024) : null],
    ]));

    if (choice === 'memory') {
      const m = inv.memory;
      sections.push(...group('Memory', [
        ['Installed', size(m.modules.reduce((t, b) => t + b.capacity, 0), 0)],
        ['Used', stats ? size(stats.memory.used, 1) : null],
        ['Slots', tr('{0} of {1} in use', m.modules.length, Math.max(m.slots, m.modules.length))],
        ['Maximum', m.max ? size(m.max, 0) : null],
      ]));
      for (const b of m.modules) sections.push(...group(b.slot || 'Module', [
        ['Capacity', size(b.capacity, 0)], ['Type', b.type], ['Speed', b.speed ? b.speed + ' MT/s' : null],
        ['Manufacturer', b.manufacturer], ['Part number', b.reference],
      ]));
    }

    if (choice.startsWith('graphics-')) {
      const g = inv.graphics[Number(choice.slice('graphics-'.length))] || {};
      sections.push(...group('Graphics', [
        ['Model', g.name],
        ['Usage', stats && choice === 'graphics-0' ? pct(stats.graphics.usage) : null],
        ['Memory in use', stats && choice === 'graphics-0' ? size(stats.graphics.memory, 1) : null],
        ['Dedicated memory', g.memory > 0 ? size(g.memory, 0) : null],
        ['Driver', g.driver],
      ]));
    }

    if (choice.startsWith('disk-')) {
      const d = inv.disks.find(x => 'disk-' + x.number === choice), v = stats && stats.disks[choice.slice('disk-'.length)];
      if (d) {
        sections.push(...group('Storage', [
          ['Model', d.name], ['Type', [d.type, d.bus].filter(Boolean).join(' ')], ['Capacity', size(d.size, 0)],
          ['Activity', v ? pct(v.activity) : null], ['Playing', v ? throughput(v.playback) : null], ['Write', v ? throughput(v.write) : null],
        ]));
        for (const vol of d.volumes) sections.push(...group(tr('Volume {0}', vol.letter), [
          ['Name', vol.name], ['Size', size(vol.size, 0)], ['Used', size(vol.size - vol.free, 0)], ['Free', size(vol.free, 0)],
        ]));
      }
    }

    if (choice.startsWith('network-')) {
      const r = inv.networks.find(x => 'network-' + x.id === choice), v = stats && stats.networks[choice.slice('network-'.length)];
      if (r) sections.push(...group('Network', [
        ['Adapter', r.name], ['Type', r.type], ['Link', r.speed > 0 ? link(r.speed) : null],
        ['Received', v ? throughput(v.received) : null], ['Sent', v ? throughput(v.sent) : null],
      ]));
    }

    if (choice === 'battery' && inv.battery) {
      const b = stats && stats.battery;
      sections.push(...group('Battery', [
        ['Model', inv.battery.name], ['Charge', b ? b.charge + ' %' : null],
        ['Power', b ? (b.mains ? 'Mains' : 'Battery') : null],
        ['Time left', b && !b.mains && b.remaining > 0 ? duration(b.remaining) : null],
      ]));
    }

    if (choice === 'screens')
      for (const e of inv.screens) sections.push(...group(tr('Screen {0}', e.n) + (e.primary ? tr(' · main') : ''), [
        ['Manufacturer', e.manufacturer], ['Model', e.name && e.name !== e.manufacturer ? e.name : e.code],
        ['Diagonal', e.inches ? tr('{0} in', e.inches.toLocaleString(LOCALE)) : null],
        ['Resolution', `${e.w} × ${e.h}`], ['Refresh rate', e.hz ? e.hz + ' Hz' : null],
        ['Scaling', e.scale ? e.scale + ' %' : null], ['Port', e.port], ['Year', e.year || null],
      ]));

    $('m-details').replaceChildren(...sections);
  }

  function event(m) {
    if (m.type === 'hardware.inventory') {
      inv = m;

      const exists = key => key === 'processor' || key === 'memory' || key === 'screens' || (key === 'battery' && inv.battery)
        || (key.startsWith('graphics-') && Number(key.slice('graphics-'.length)) < inv.graphics.length)
        || inv.disks.some(d => 'disk-' + d.number === key) || inv.networks.some(r => 'network-' + r.id === key);
      if (!exists(choice)) choice = 'processor';
      build();
      renderPanel();
    } else if (m.type === 'hardware.stats') {
      stats = m;
      if (inv) update();
    }
  }

  function visible(yes) {
    shown = yes;
    clearInterval(timer);
    if (!yes) return;
    send('hardware.inventory');
    send('hardware.stats');
    timer = setInterval(() => {
      if (!shown || document.visibilityState !== 'visible') return;
      send('hardware.stats');
    }, 1000);
  }

  Bramble.hardware = { event, visible };
})();
