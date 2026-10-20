'use strict';

(function () {
  const POINTS = 60;
  const GLYPHS = {
    wifi: '<path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.5 16a5 5 0 0 1 7 0"/><circle cx="12" cy="19.2" r="1.1"/>',
    cable: '<rect x="8" y="3.5" width="8" height="7" rx="1.2"/><path d="M10 3.5V6M14 3.5V6M12 10.5v10"/>',
    none: '<path d="M2.5 9a14 14 0 0 1 19 0M8.5 16a5 5 0 0 1 7 0M4 4l16 16"/>',
    ip: '<rect x="3.5" y="5" width="17" height="11" rx="1.5"/><path d="M8 20h8M12 16v4"/>',
    world: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 3.5 5.4 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.4-3.5-8.5s1-5.9 3.5-8.5z"/>',
    box: '<rect x="3.5" y="12" width="17" height="7" rx="1.5"/><path d="M7.5 15.5h.01M11 15.5h.01M8 12 6 5M16 12l2-7"/>',
    dns: '<rect x="3.5" y="4.5" width="17" height="6" rx="1.6"/><rect x="3.5" y="13.5" width="17" height="6" rx="1.6"/><path d="M7 7.5h.01M7 16.5h.01M11 7.5h6M11 16.5h6"/>',
    mask: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 12h16"/>',
    mac: '<rect x="5" y="5" width="14" height="14" rx="2"/><path d="M9 9h6v6H9z"/>',
    card: '<rect x="3.5" y="7" width="17" height="10" rx="1.5"/><path d="M7 17v2.5M11 17v2.5M15 17v2.5M7.5 10.5h4"/>',
    speed: '<path d="M4.5 16.5a7.5 7.5 0 1 1 15 0"/><path d="m12 16.5 3.5-4.5"/>',
    signal: '<path d="M5 19v-3M10 19v-7M15 19V9M20 19V5"/>',
    standard: '<path d="M12 20.5a8.5 8.5 0 1 1 0-17 8.5 8.5 0 0 1 0 17z"/><path d="M9 9.5h6M9 12h6M9 14.5h4"/>',
    strip: '<path d="M3 12c2-4 4-4 6 0s4 4 6 0 4-4 6 0"/>',
    shield: '<path d="M12 3.5 19 6v5.5c0 4.2-2.9 7.6-7 9-4.1-1.4-7-4.8-7-9V6z"/><path d="m9 12 2 2 4-4"/>',
    profile: '<circle cx="12" cy="9" r="3.5"/><path d="M5.5 19.5a6.5 6.5 0 0 1 13 0"/>',
    vpn: '<circle cx="8" cy="15" r="3.5"/><path d="m10.5 12.5 8-8M16 7l2 2M14 9l1.5 1.5"/>',
    lock: '<rect x="5.5" y="10.5" width="13" height="9.5" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
    call: '<rect x="3.5" y="6.5" width="12" height="11" rx="2"/><path d="m15.5 10.5 5-3v9l-5-3"/>',
    game: '<path d="M7 9h10a4 4 0 0 1 4 4v1.5a3 3 0 0 1-5.4 1.8L14.5 15h-5l-1.1 1.3A3 3 0 0 1 3 14.5V13a4 4 0 0 1 4-4z"/><path d="M8 11.5v2.5M6.8 12.8h2.5M15.5 12.2h.01M17.5 13.6h.01"/>',
    film: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M3.5 9h17M3.5 15h17M8 5v4M12 5v4M16 5v4M8 15v4M12 15v4M16 15v4"/>',
    download: '<path d="M12 4v12M7 11l5 5 5-5M5 20h14"/>',
    upload: '<path d="M12 20V8M7 13l5-5 5 5M5 4h14"/>',
    chrono: '<circle cx="12" cy="13" r="7.5"/><path d="M12 9v4l2.5 1.5M10 3.5h4"/>',
    cloud: '<path d="M7 18.5a4.5 4.5 0 0 1-.5-9 6 6 0 0 1 11.5 1.5 3.8 3.8 0 0 1-.5 7.5z"/><path d="M12 16v-5M9.8 13.2 12 11l2.2 2.2"/>',
  };

  const STEPS = [['gateway', 'Router', 'box'], ['internet', 'Internet', 'world'], ['dns', 'DNS', 'dns'], ['download', 'Download', 'download'], ['upload', 'Upload', 'upload']];

  const TICKS = [0, 5, 10, 25, 50, 100, 250, 500, 1000];
  const part = v => Math.min(1, Math.log10(1 + Math.max(0, v)) / Math.log10(1001));

  let cx = null, publicIp = null, test = null, shown = false, infoTimer = 0, trafficTimer = 0, history = [];
  const received = [], sent = [];

  const UNITS = ['B', 'KB', 'MB', 'GB'].map(u => tr(u));
  function throughput(o) {
    let i = 0;
    while (o >= 1024 && i < UNITS.length - 1) { o /= 1024; i++; }
    return (i === 0 ? '0 ' + UNITS[1] : o.toLocaleString(LOCALE, { maximumFractionDigits: o >= 100 ? 0 : 1 }) + ' ' + UNITS[i]) + '/s';
  }
  const link = bits => bits >= 1e9 ? (bits / 1e9).toLocaleString(LOCALE, { maximumFractionDigits: 1 }) + ' Gbit/s' : Math.round(bits / 1e6) + ' Mbit/s';
  const mbits = v => v.toLocaleString(LOCALE, { maximumFractionDigits: v >= 100 ? 0 : 1 });
  const ms = v => Math.round(v).toLocaleString(LOCALE) + ' ms';
  const glyph = name => '<svg class="glyph" viewBox="0 0 24 24" aria-hidden="true">' + GLYPHS[name] + '</svg>';

  function copy(text) {
    navigator.clipboard.writeText(text).then(() => toast(tr('Copied: {0}', text), false, 2000));
  }

  function renderHeader() {
    const type = !cx ? 'none' : !cx.connected ? 'none' : cx.wifi ? 'wifi' : 'cable';
    $('r-type').innerHTML = GLYPHS[type];
    $('r-header').classList.toggle('offline', !cx || !cx.connected);
    if (!cx) return;
    if (!cx.connected) {
      $('r-name').textContent = 'No connection';
      $('r-detail').textContent = 'Neither Wi-Fi nor cable in use';
      $('r-ip').textContent = '';
      $('r-trust').hidden = true;
      $('r-bars').hidden = true;
      return;
    }
    $('r-name').textContent = cx.wifi ? (cx.network || 'Wi-Fi') : 'Cable';
    $('r-detail').textContent = [cx.wifi ? cx.standard || 'Wi-Fi' : 'Ethernet', cx.wifi && cx.strip ? cx.strip : '', cx.wifi && cx.signal >= 0 ? tr('signal {0} %', cx.signal) : '', cx.card].filter(Boolean).join(' · ');
    $('r-ip').textContent = cx.ipv4 || '';
    const t = trust(), pill = $('r-trust');
    pill.hidden = !t;
    if (t) { pill.className = 'pill trust ' + TRUST[t.level][1]; pill.textContent = tr(TRUST[t.level][0]); pill.title = tr(t.why); }
    $('r-bars').hidden = !cx.wifi || cx.signal < 0;
    [...$('r-bars').children].forEach((b, i) => b.classList.toggle('full', cx.signal > i * 25));
  }

  function plot() {
    const max = Math.max(64 * 1024, ...received, ...sent);
    const path = values => values.map((v, i) =>
      (i ? 'L' : 'M') + (600 * (i + POINTS - values.length) / (POINTS - 1)).toFixed(1) + ' ' + (116 - 108 * v / max).toFixed(1)).join('');
    if (received.length < 2) return;
    const r = path(received);
    $('r-row-received').setAttribute('d', r);
    $('r-area-received').setAttribute('d', r + 'L600 120L' + (600 * (POINTS - received.length) / (POINTS - 1)).toFixed(1) + ' 120Z');
    $('r-row-sent').setAttribute('d', path(sent));
  }

  Chart.bind($('r-curve'), (f, y) => {
    if (received.length < 2) return null;
    const slot = Math.round(f * (POINTS - 1)), i = slot - (POINTS - received.length);
    if (i < 0 || i >= received.length) return null;
    const max = Math.max(64 * 1024, ...received, ...sent);
    const yDown = (116 - 108 * received[i] / max) / 120, ySent = (116 - 108 * sent[i] / max) / 120;
    const downHot = Math.abs(y - yDown) <= Math.abs(y - ySent);
    return {
      at: slot / (POINTS - 1), title: tr('Live traffic'), note: tr('Data received and sent by this connection, once per second'), when: Chart.ago(received.length - 1 - i),
      lines: [
        { color: '#9561f3', label: tr('Download'), value: throughput(received[i]), y: yDown, hot: downHot },
        { color: '#a9abb8', label: tr('Upload'), value: throughput(sent[i]), y: ySent, hot: !downHot },
      ],
    };
  });

  const LEDS = 48;
  const leds = [];
  (function ticks() {
    const g = $('r-leds');
    for (let i = 0; i < LEDS; i++) {
      const a = 135 + i * 270 / (LEDS - 1);
      const d = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      d.setAttribute('x', 127.6); d.setAttribute('y', 14); d.setAttribute('width', 4.8); d.setAttribute('height', 12); d.setAttribute('rx', 1.4);
      d.dataset.mix = (i / (LEDS - 1)).toFixed(3);
      d.setAttribute('transform', `rotate(${a + 90} 130 130)`);
      d.setAttribute('class', 'led');
      g.append(d);
      leds.push(d);
    }
    let html = '';
    for (const v of TICKS) {
      const an = (135 + part(v) * 270) * Math.PI / 180;
      const x1 = 130 + 94 * Math.cos(an), y1 = 130 + 94 * Math.sin(an), x2 = 130 + 86 * Math.cos(an), y2 = 130 + 86 * Math.sin(an);
      const tx = 130 + 72 * Math.cos(an), ty = 130 + 72 * Math.sin(an) + 3.5;
      html += `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}"/><text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}">${v >= 1000 ? '1G' : v}</text>`;
    }
    $('r-ticks').innerHTML = html;
  })();

  const ledColor = t => t > .85 ? '#efe4ff' : t > .6 ? '#c3a1ff' : t > .3 ? '#9561f3' : '#7a3fe0';
  let target = 0, displayed = 0, loop = 0, litBefore = -2;
  function gauge(v) {
    target = part(v);
    if (!loop) loop = requestAnimationFrame(animate);
  }
  function animate() {
    loop = 0;
    displayed += (target - displayed) * 0.14;
    if (Math.abs(target - displayed) < 0.0005) displayed = target;
    $('r-needle').style.transform = `rotate(${(-135 + displayed * 270).toFixed(2)}deg)`;
    const lit = displayed > 0.002 ? Math.round(displayed * (LEDS - 1)) : -1;
    if (lit !== litBefore) {
      litBefore = lit;
      leds.forEach((d, i) => {
        const on = i <= lit;
        d.classList.toggle('lit', on);
        const color = on ? ledColor(Number(d.dataset.mix)) : '';
        d.style.fill = color;
        d.style.stroke = color;
      });
    }
    if (displayed !== target) loop = requestAnimationFrame(animate);
  }

  const res = key => test && test.r[key];
  const ok = key => !!(res(key) && res(key).ok);
  const grade = (v, good, excellent) => v <= excellent ? 'excellent' : v <= good ? 'good' : 'slow';
  const NOTES = { excellent: 'Excellent', good: 'Good', slow: 'Slow', failure: 'Failed' };
  GLYPHS.charge = '<path d="M4 17h4l2-8 4 12 2-6h4"/>';
  GLYPHS.jitter = '<path d="M3 12h3l2-4 3 8 3-10 3 12 2-6h2"/>';
  GLYPHS.loss = '<path d="M4 7h16M4 12h10M4 17h6"/><path d="m16 15 4 4m0-4-4 4"/>';

  function renderTest() {
    const running = !!(test && test.running);
    $('r-tester').classList.toggle('testing', running);

    const keycap = $('r-test');
    keycap.disabled = running;
    keycap.querySelector(':scope > span:last-child').textContent = tr(running ? 'Testing…' : test ? 'Test again' : 'Run the test');
    keycap.dataset.state = running ? 'progress' : test ? 'done' : 'ready';

    const direct = test && test.direct;
    const next = STEPS.find(([c]) => !res(c));
    if (running && direct) {
      $('r-value').textContent = mbits(direct.mbits);
      $('r-unit').textContent = 'Mbit/s';
      $('r-phase').textContent = tr(direct.phase === 'upload' ? 'Upload' : 'Download');
      gauge(direct.mbits);
    } else if (running) {
      const last = [...STEPS].reverse().find(([c]) => ok(c) && res(c).ms != null);
      $('r-value').textContent = last ? Math.round(res(last[0]).ms) : '…';
      $('r-unit').textContent = last ? 'ms' : '';
      $('r-phase').textContent = next ? tr(next[1]) : '';
      gauge(0);
    } else if (ok('download')) {
      $('r-value').textContent = mbits(res('download').mbits);
      $('r-unit').textContent = 'Mbit/s';
      $('r-phase').textContent = tr('Download');
      gauge(res('download').mbits);
    } else {
      $('r-value').textContent = test ? '' : '0';
      $('r-unit').textContent = test ? '' : 'Mbit/s';
      $('r-phase').textContent = tr(test ? 'Measurement failed' : 'Ready');
      gauge(0);
    }

    $('r-value').classList.toggle('idle', !test && !running);

    $('r-steps').replaceChildren(...STEPS.map(([key, name, icon]) => {
      const li = document.createElement('li');
      const r = res(key);
      li.className = r ? (r.ok ? 'done' : 'failed') : running && next && next[0] === key ? 'active' : '';
      if (li.className === 'active' && test.direct && test.direct.phase === key) { li.classList.add('measuring'); li.style.setProperty('--progress', Math.round(test.direct.progress * 100) + '%'); }
      li.innerHTML = '<i>' + glyph(icon) + '</i><span></span>';
      li.querySelector('span').textContent = name;
      return li;
    }));

    const down = res('download'), up = res('upload'), net = res('internet');
    const size = o => throughput(o).replace('/s', '');
    const key = (icon, title, r, value, unit, detail) => {
      const d = document.createElement('div');
      d.className = 'key';
      d.innerHTML = '<span class="key__title">' + glyph(icon) + '<span></span></span><span class="key__value"><b></b><small></small></span><span class="key__detail"></span>';
      d.querySelector('.key__title > span').textContent = title;
      d.classList.toggle('key--empty', !(r && r.ok));
      d.querySelector('b').textContent = r && r.ok ? value : running ? tr('Measuring…') : tr('Not measured');
      d.querySelector('small').textContent = r && r.ok ? unit : '';
      const det = d.querySelector('.key__detail');
      det.textContent = !r ? '' : r.ok ? detail : tr(r.reason);
      det.classList.toggle('error', !!(r && !r.ok));
      return d;
    };
    $('r-keys').replaceChildren(
      key('download', tr('Download'), down, down && down.ok ? mbits(down.mbits) : '', 'Mbit/s', down && down.ok ? tr('{0} received', size(down.bytes)) : ''),
      key('upload', tr('Upload'), up, up && up.ok ? mbits(up.mbits) : '', 'Mbit/s', up && up.ok ? tr('{0} sent', size(up.bytes)) : ''),
      key('chrono', tr('Latency'), net, net && net.ok ? String(Math.round(net.ms)) : '', 'ms', net && net.ok ? tr('jitter {0}', ms(net.jitter)) : ''),
    );

    const sv = res('server');
    $('r-server').textContent = sv && sv.ok
      ? tr('Cloudflare server in {0} ({1}) · provider {2}', sv.city || sv.colo, sv.colo, sv.provider || '–') + (down && down.server === 'OVH' ? ' · ' + tr('download measured at OVH (Cloudflare was limiting tests)') : '')
      : tr('Router, Internet, DNS then speed, in about twenty seconds');
    $('r-server').title = $('r-server').textContent;

    renderQuality(running);
    renderUsages();
  }

  function measure(icon, name, help, value, verdict, verdictText) {
    const l = document.createElement('div');
    l.className = 'row measure';
    l.innerHTML = '<span class="caption">' + glyph(icon) + '<span><span></span><small></small></span></span><span class="measure__value"></span><span class="pill"></span>';
    l.querySelector('.caption > span > span').textContent = tr(name);
    l.querySelector('small').textContent = tr(help);
    l.querySelector('.measure__value').textContent = value;
    const p = l.querySelector('.pill');
    p.textContent = verdictText || '';
    p.className = 'pill' + (verdict ? ' ' + verdict : '');
    return l;
  }

  function renderQuality(running) {
    const empty = running ? '…' : '', waiting = running ? tr('In progress') : tr('After a test');
    const pingRow = (key, icon, name, help, good, excellent) => {
      const r = res(key);
      if (!r) return measure(icon, name, help, empty, 'waiting', waiting);
      if (!r.ok) return measure(icon, name, help, '×', 'slow', tr(r.reason));
      const q = grade(r.ms, good, excellent);
      return measure(icon, name, help, ms(r.ms), q, tr(NOTES[q]));
    };
    const net = res('internet'), dns = res('dns'), ch = res('charge');
    const rows = [
      pingRow('gateway', 'box', 'Router', 'Router response time', 40, 10),
      pingRow('internet', 'world', 'Internet', "Response time of a server on the Internet", 80, 30),
    ];
    if (net && net.ok) {
      const qg = grade(net.jitter, 30, 8);
      rows.push(measure('jitter', 'Jitter', "Steadiness: a large spread makes calls stutter", ms(net.jitter), qg, tr(NOTES[qg])));
      const rate = Math.round(100 * (net.lost || 0) / Math.max(1, net.sent || 10));
      rows.push(measure('loss', 'Loss', 'Packets that never arrived', rate + ' %', rate === 0 ? 'excellent' : rate <= 2 ? 'good' : 'slow', tr(rate === 0 ? 'None' : rate <= 2 ? 'Low' : 'High')));
    } else {
      rows.push(measure('jitter', 'Jitter', "Steadiness: a large spread makes calls stutter", empty, 'waiting', waiting));
      rows.push(measure('loss', 'Loss', 'Packets that never arrived', empty, 'waiting', waiting));
    }
    rows.push(!dns ? measure('dns', 'DNS', "Time to look up a site's address", empty, 'waiting', waiting)
      : !dns.ok ? measure('dns', 'DNS', "Time to look up a site's address", '×', 'slow', tr(dns.reason))
      : measure('dns', 'DNS', "Time to look up a site's address", ms(dns.ms), grade(dns.ms, 120, 40), tr(NOTES[grade(dns.ms, 120, 40)])));
    if (ch && ch.ok) {
      const q = ch.note === 'A' || ch.note === 'B' ? 'excellent' : ch.note === 'C' ? 'good' : 'slow';
      rows.push(measure('charge', 'Busy line', 'Latency added when the line is busy', '+' + ms(ch.added), q, tr('Grade {0}', ch.note)));
    } else rows.push(measure('charge', 'Busy line', 'Latency added when the line is busy', empty, 'waiting', waiting));
    $('r-results').replaceChildren(...rows);
  }

  function renderUsages() {
    const down = ok('download') ? res('download').mbits : null, up = ok('upload') ? res('upload').mbits : null;
    const p = ok('internet') ? res('internet').ms : 999, g = ok('internet') ? res('internet').jitter : 999;
    const note = ok('charge') ? res('charge').note : null;
    const done = !!test && !test.running && down != null;
    const USAGES = [
      ['call', 'HD video calls', 'Needs 4 Mbit/s and under 100 ms', () => down >= 4 && up >= 3 && p <= 100 && g <= 30 && note !== 'F' ? 2 : down >= 1.5 && up >= 1 ? 1 : 0],
      ['game', 'Online gaming', 'Needs under 40 ms and low jitter', () => p <= 40 && g <= 10 && (!note || note === 'A' || note === 'B') ? 2 : p <= 80 && g <= 25 ? 1 : 0],
      ['film', '4K streaming', 'Needs 25 Mbit/s download', () => down >= 25 ? 2 : down >= 8 ? 1 : 0],
      ['cloud', 'Cloud uploads', 'Needs 50 Mbit/s upload', () => up >= 50 ? 2 : up >= 10 ? 1 : 0],
    ];
    const VERDICTS = [['slow', 'Hard'], ['good', 'OK'], ['excellent', 'Great']];
    $('r-usages').replaceChildren(...USAGES.map(([icon, name, need, f]) => {
      if (!done) return measure(icon, name, need, '', 'waiting', tr(test && test.running ? 'In progress' : 'After a test'));
      const n = f();
      return measure(icon, name, need, '', VERDICTS[n][0], tr(VERDICTS[n][1]));
    }));
  }

  function renderHistory() {
    $('r-count-history').textContent = history.length || '';
    $('r-forget').hidden = !history.length;
    const zone = $('r-history');
    if (!history.length) { zone.innerHTML = '<div class="row empty">No tests yet</div>'; return; }
    const max = Math.max(...history.map(h => h.down || 0), 1);
    const header = document.createElement('div');
    header.className = 'row test-pass test-pass--header';
    header.innerHTML = '<span>Date</span><span></span><span class="number">Download</span><span class="number">Upload</span><span class="number">Latency</span><span class="note-test">Grade</span>';
    zone.replaceChildren(header, ...history.slice(0, 8).map(h => {
      const l = document.createElement('div');
      l.className = 'row test-pass';
      l.innerHTML = '<span class="when"></span><span class="bar-test"><i></i></span><span class="number down"></span><span class="number up"></span><span class="number ping"></span><span class="note-test"></span>';
      l.querySelector('.when').textContent = new Date(h.when).toLocaleString(LOCALE, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      l.querySelector('.bar-test i').style.width = (100 * (h.down || 0) / max).toFixed(1) + '%';
      l.querySelector('.down').textContent = '↓ ' + mbits(h.down || 0);
      l.querySelector('.up').textContent = '↑ ' + mbits(h.up || 0);
      l.querySelector('.ping').textContent = h.ping ? ms(h.ping) : '–';
      l.querySelector('.note-test').textContent = h.note || '';
      return l;
    }));
  }

  function row(icon, title, help, value) {
    const l = document.createElement('div');
    l.className = 'row';
    l.innerHTML = '<span class="caption">' + glyph(icon) + '<span><span></span><small></small></span></span><span class="value"></span>';
    l.querySelector('.caption > span > span').textContent = title;
    l.querySelector('small').textContent = help || '';
    const v = l.querySelector('.value');
    if (value instanceof Node) v.append(value);
    else if (value) {
      const b = document.createElement('button');
      b.className = 'copyable';
      b.textContent = value;
      b.title = value;
      b.addEventListener('click', () => copy(value));
      v.append(b);
    } else v.textContent = '–';
    return l;
  }
  const text = t => { const s = document.createElement('span'); s.textContent = t || '–'; if (t) s.title = t; return s; };


  const authName = a => {
    const clean = (a || '').replace(/\s*-\s*/g, '-');
    return LANGUAGE === 'fr' ? clean.replace(/Enterprise/i, 'Entreprise').replace(/Personal/i, 'Personnel').replace(/^Open$/i, 'Ouvert')
      : clean.replace(/Entreprise/i, 'Enterprise').replace(/Personnel/i, 'Personal').replace(/^Ouvert$/i, 'Open');
  };
  const TRUST = { high: ['Trusted', 'excellent'], medium: ['Be careful', 'good'], low: ['Risky', 'slow'] };
  function trust() {
    if (!cx || !cx.connected) return null;
    const auth = (cx.security || '').toLowerCase(), cipher = (cx.cipher || '').toLowerCase();
    const enterprise = /entreprise|enterprise/.test(auth);
    let enc;
    if (!cx.wifi) enc = 'wired';
    else if (!auth) enc = 'unknown';
    else if (/open|ouvert/.test(auth) || /none|aucun/.test(cipher)) enc = 'none';
    else if (/wep|tkip/.test(auth + ' ' + cipher) || !/wpa2|wpa3/.test(auth)) enc = 'weak';
    else if (/wpa3/.test(auth) || enterprise) enc = 'strong';
    else enc = 'good';
    const shared = cx.profile === 'public';
    let level = enc === 'none' || enc === 'weak' ? 'low' : enc === 'strong' ? 'high' : enc === 'unknown' || shared ? 'medium' : 'high';
    if (cx.vpn && level !== 'high') level = level === 'low' ? 'medium' : 'high';
    const why = level === 'low' ? (enc === 'none' ? 'People nearby could read unencrypted traffic' : 'Old encryption that is easy to break')
      : level === 'medium' ? (cx.vpn ? 'Weak network, but your traffic goes through a VPN' : enc === 'unknown' ? 'Windows does not report the encryption' : 'Encrypted, but shared with people you do not know')
      : cx.vpn ? 'Encrypted, and your traffic goes through a VPN' : enterprise ? 'Each user signs in with their own account' : enc === 'strong' ? 'Latest Wi-Fi protection' : 'Encrypted network you marked as private';
    return { level, enc, enterprise, why };
  }

  const SECURITY_GLYPHS = {
    ok: '<circle cx="12" cy="12" r="8.5"/><path d="m8.5 12.3 2.4 2.4 4.6-5"/>',
    warn: '<path d="M12 4 21 19.5H3z"/><path d="M12 10v4.5M12 17v.01"/>',
    bad: '<circle cx="12" cy="12" r="8.5"/><path d="m9 9 6 6M15 9l-6 6"/>',
    neutral: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 12h7"/>',
  };
  const ENC_TEXT = { none: 'Traffic sent in the clear', weak: 'Outdated protection', good: 'Shared Wi-Fi password', unknown: 'Not reported by Windows',
    wired: 'Cable, no radio to listen to', strong: 'Latest Wi-Fi protection' };
  const CIPHERS = { ccmp: 'AES', gcmp: 'AES-GCMP', 'gcmp-256': 'AES-GCMP-256', tkip: 'TKIP', wep: 'WEP' };
  const PROFILES = { public: ['Public', 'Your PC is hidden from other devices'], private: ['Private', 'Your PC is visible on this network'], domain: ['Work', 'Managed by your organization'] };

  function securityChecks(t) {
    const cipher = cx.cipher ? CIPHERS[cx.cipher.toLowerCase()] || cx.cipher : '';
    const risky = t.level !== 'high';
    const enc = {
      icon: 'lock', title: 'Encryption',
      state: t.enc === 'none' || t.enc === 'weak' ? 'bad' : t.enc === 'unknown' ? 'warn' : 'ok',
      value: cx.wifi ? [authName(cx.security), cipher].filter(Boolean).join(' · ') : tr('Wired'),
      detail: t.enterprise ? 'Personal sign-in for each user' : ENC_TEXT[t.enc],
      advice: t.enc === 'none' ? 'Avoid entering passwords here, or turn on a VPN'
        : t.enc === 'weak' ? 'Ask for WPA2 or WPA3 on the router, or use a VPN' : t.enc === 'unknown' ? 'Check the network protection in Windows settings' : '',
    };
    const profile = PROFILES[cx.profile];
    const exposed = cx.profile === 'private' && (t.enc === 'none' || t.enc === 'weak' || t.enc === 'unknown');
    const prof = {
      icon: 'profile', title: 'Windows profile',
      state: exposed ? 'warn' : profile ? 'ok' : 'neutral',
      value: profile ? tr(profile[0]) : '',
      detail: profile ? profile[1] : 'Not reported by Windows',
      advice: exposed ? 'Set this network to Public in Windows settings' : '',
    };
    const vpn = {
      icon: 'vpn', title: 'VPN',
      state: cx.vpn ? 'ok' : risky ? 'warn' : 'neutral',
      value: cx.vpn || tr('Off'),
      detail: cx.vpn ? 'Your traffic goes through a tunnel' : risky ? 'Your traffic is not hidden on this network' : 'Optional on a trusted network',
      advice: !cx.vpn && risky ? 'Turn on a VPN while you use this network' : '',
    };
    return [enc, prof, vpn];
  }

  function renderSecurity(t) {
    const zone = $('r-security');
    $('r-security-title').hidden = zone.hidden = !t;
    if (!t) { zone.replaceChildren(); return; }
    const checks = securityChecks(t);
    const level = { high: 3, medium: 2, low: 1 }[t.level];
    zone.className = 'security security--' + t.level;
    $('r-security-note').textContent = tr(cx.wifi ? 'Read from the Wi-Fi connection' : 'Read from the cable connection');

    const head = document.createElement('div');
    head.className = 'security__head';
    head.innerHTML = '<span class="seal"><svg class="seal__shield" viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="seal-body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--lamp-hi)"/><stop offset=".5" style="stop-color:var(--lamp)"/><stop offset="1" style="stop-color:var(--lamp-lo)"/></linearGradient><linearGradient id="seal-face" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--lamp)"/><stop offset="1" style="stop-color:var(--lamp-lo)"/></linearGradient><linearGradient id="seal-rim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></linearGradient><linearGradient id="seal-gloss" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><filter id="seal-shadow" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="2.2" stdDeviation="2.2" flood-color="#000" flood-opacity=".8"/></filter><filter id="seal-bloom" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4"/></filter></defs><path d="M32 6 54 14v16c0 14-9 24-22 29C19 54 10 44 10 30V14z" style="fill:var(--lamp)" opacity=".55" filter="url(#seal-bloom)"/><g filter="url(#seal-shadow)"><path d="M32 6 54 14v16c0 14-9 24-22 29C19 54 10 44 10 30V14z" fill="url(#seal-body)"/><path d="M32 6 54 14v16c0 14-9 24-22 29C19 54 10 44 10 30V14z" fill="none" stroke="url(#seal-rim)" stroke-width="1.6"/><path d="M32 11.5 49 17.6V30c0 10.6-6.8 18.4-17 22.6C21.8 48.4 15 40.6 15 30V17.6z" fill="url(#seal-face)"/><path d="M32 11.5 49 17.6V30c0 10.6-6.8 18.4-17 22.6C21.8 48.4 15 40.6 15 30V17.6z" fill="none" stroke="#000" stroke-opacity=".35" stroke-width="1"/><path d="M23 31.5 29.6 38 42 24.5" fill="none" stroke="#000" stroke-opacity=".5" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" transform="translate(0 1.3)"/><path d="M23 31.5 29.6 38 42 24.5" fill="none" stroke="#fff" stroke-opacity=".95" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M32 11.5 49 17.6V28c-6 3-11 4.4-17 4.4S21 31 15 28V17.6z" fill="url(#seal-gloss)" opacity=".7"/></g></svg></span><div class="security__verdict"><span class="security__title"></span><span class="security__why"></span></div><div class="security__meter" aria-hidden="true"><i></i><i></i><i></i></div>';
    head.querySelector('.security__title').textContent = tr(TRUST[t.level][0]);
    head.querySelector('.security__why').textContent = tr(t.why);
    [...head.querySelector('.security__meter').children].forEach((b, i) => b.classList.toggle('on', i < level));

    const list = document.createElement('div');
    list.className = 'security__checks';
    for (const c of checks) {
      const item = document.createElement('div');
      item.className = 'check check--' + c.state;
      item.innerHTML = `<span class="jewel" role="img"><svg viewBox="0 0 24 24" aria-hidden="true">${SECURITY_GLYPHS[c.state]}</svg></span><div class="check__what"><span class="check__title"></span><span class="check__detail"></span></div><span class="check__value"></span>`;
      item.querySelector('.jewel').setAttribute('aria-label', tr({ ok: 'Fine', warn: 'Be careful', bad: 'Risky', neutral: 'Not reported' }[c.state]));
      item.querySelector('.check__title').textContent = tr(c.title);
      item.querySelector('.check__detail').textContent = tr(c.detail);
      item.querySelector('.check__value').textContent = c.value;
      list.append(item);
    }

    const todo = checks.find(c => c.state === 'bad' && c.advice) || checks.find(c => c.state === 'warn' && c.advice);
    const next = document.createElement('div');
    next.className = 'security__next';
    next.innerHTML = '<span class="security__tip"></span><button class="security__key" hidden></button>';
    next.querySelector('.security__tip').textContent = todo ? tr(todo.advice) : tr('Nothing to fix on this network');
    if (todo) {
      const open = next.querySelector('.security__key');
      open.hidden = false;
      open.textContent = tr('Network settings');
      open.addEventListener('click', () => send('network.settings'));
    }
    zone.replaceChildren(head, list, next);
  }

  function renderPanel() {
    const a = $('r-addresses'), w = $('r-wifi'), c = $('r-card');
    const t = trust();
    renderSecurity(t);
    if (!cx || !cx.connected) {
      a.innerHTML = '<div class="row empty">' + (cx ? 'No connection' : 'Reading the connection') + '</div>';
      w.replaceChildren(); c.replaceChildren();
      $('r-wifi-title').hidden = w.hidden = true;
      return;
    }
    let publicIpNode = publicIp;
    if (publicIp === null) {
      publicIpNode = document.createElement('button');
      publicIpNode.className = 'link';
      publicIpNode.textContent = 'Show';
      publicIpNode.addEventListener('click', () => { publicIp = 'waiting'; renderPanel(); send('network.publicip'); });
    } else if (publicIp === 'waiting') publicIpNode = document.createTextNode('…');
    else if (publicIp === 'missing') publicIpNode = document.createTextNode('Not found');
    a.replaceChildren(
      row('ip', 'Local IP', "Address on the network", cx.ipv4),
      row('world', 'Public IP', 'Seen from the Internet', publicIpNode),
      row('box', 'Router', 'The gateway', cx.gateway),
      row('dns', 'DNS', 'Site names → addresses', cx.dns && cx.dns.join(', ')),
      row('mask', 'Subnet mask', 'Size of the local network', cx.mask),
      row('ip', 'IPv6', 'Next generation', cx.ipv6),
    );
    $('r-wifi-title').hidden = w.hidden = !cx.wifi;
    if (cx.wifi) w.replaceChildren(
      row('wifi', 'Network', 'Wi-Fi name', text(cx.network)),
      row('signal', 'Signal', 'Received strength', text(cx.signal >= 0 ? cx.signal + ' %' : '')),
      row('standard', 'Standard', 'Wi-Fi generation', text(cx.standard)),
      row('strip', 'Band', 'Frequency and channel', text([cx.strip, cx.channel ? tr('channel {0}', cx.channel) : ''].filter(Boolean).join(' · '))),
      row('speed', 'Radio rate', 'Download / upload', text(cx.received ? `${Math.round(cx.received)} / ${Math.round(cx.sent)} Mbit/s` : '')),
    );
    c.replaceChildren(
      row('card', 'Adapter', cx.wifi ? 'Wi-Fi' : 'Ethernet', text(cx.card)),
      row('speed', 'Link speed', 'Up to the router', text(cx.speed > 0 ? link(cx.speed) : '')),
      row('mac', 'MAC address', 'Adapter ID', cx.mac),
    );
  }

  function event(m) {
    if (m.type === 'network.infos') {
      cx = m;
      if (m.history) { history = m.history; renderHistory(); }
      renderHeader();
      renderPanel();
    } else if (m.type === 'network.publicip') {
      publicIp = m.ip || 'missing';
      renderPanel();
    } else if (m.type === 'network.traffic') {
      received.push(m.received); sent.push(m.sent);
      if (received.length > POINTS) { received.shift(); sent.shift(); }
      $('r-received').textContent = '↓ ' + throughput(m.received);
      $('r-sent').textContent = '↑ ' + throughput(m.sent);
      plot();
    } else if (m.type === 'network.direct') {
      if (!test || !test.running) return;
      test.direct = m;
      renderTest();
    } else if (m.type === 'network.test') {
      if (!test) test = { running: true, r: {} };
      if (m.step === 'end') {
        test.running = false;
        test.direct = null;
        if (m.history) { history = m.history; renderHistory(); }
      } else {
        test.r[m.step] = m.result;
        if (m.step === 'download' || m.step === 'upload') test.direct = null;
      }
      renderTest();
    }
  }

  function visible(yes) {
    shown = yes;
    clearInterval(infoTimer);
    clearInterval(trafficTimer);
    if (!yes) return;
    send('network.infos');
    send('network.traffic');
    infoTimer = setInterval(() => { if (shown && document.visibilityState === 'visible') send('network.infos'); }, 10000);
    trafficTimer = setInterval(() => { if (shown && document.visibilityState === 'visible') send('network.traffic'); }, 1000);
  }

  $('r-test').addEventListener('click', () => { test = { running: true, r: {} }; renderTest(); send('network.test'); });
  $('r-ip').addEventListener('click', () => { if (cx && cx.ipv4) copy(cx.ipv4); });
  $('r-forget').addEventListener('click', () => send('network.forget'));
  renderHeader();
  renderTest();
  renderPanel();
  renderHistory();

  Bramble.network = { event, visible };
})();
