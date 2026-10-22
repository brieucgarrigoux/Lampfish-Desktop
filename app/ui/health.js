'use strict';

(function () {
  let report = null, shown = false, checking = false;
  const TITLES = {
    antivirus: 'Antivirus', firewall: 'Firewall', updates: 'Windows updates', restart: 'Restart', encryption: 'Disk encryption',
    secureBoot: 'Secure Boot', uac: 'Account control', space: 'Disk space', startup: 'Startup',
  };
  const ICONS = {
    antivirus: '<path d="M12 3.5 19 6v5.5c0 4.3-3 7.6-7 9-4-1.4-7-4.7-7-9V6z"/><path d="m9 12 2 2 4-4"/>',
    firewall: '<rect x="4" y="5.5" width="16" height="13" rx="1.5"/><path d="M4 9.8h16M4 14.2h16M9.5 5.5v4.3M14.5 9.8v4.4M9.5 14.2v4.3"/>',
    updates: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4v4h-4"/>',
    restart: '<path d="M12 3.5v8"/><path d="M7 6.3a7 7 0 1 0 10 0"/>',
    encryption: '<rect x="5.5" y="10.5" width="13" height="10" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5M12 14.5v2.5"/>',
    secureBoot: '<rect x="6.5" y="6.5" width="11" height="11" rx="1.5"/><path d="m9.5 12 1.8 1.8 3.2-3.6M9.5 3.5v3M14.5 3.5v3M9.5 17.5v3M14.5 17.5v3M3.5 9.5h3M3.5 14.5h3M17.5 9.5h3M17.5 14.5h3"/>',
    uac: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>',
    space: '<rect x="3.5" y="6.5" width="17" height="11" rx="2"/><path d="M6.5 12h6"/><circle cx="16.5" cy="12" r="1.2"/>',
    startup: '<path d="M12 3.5c3 2 4.5 5 4.5 9l-2 3h-5l-2-3c0-4 1.5-7 4.5-9z"/><path d="M9.5 15.5 8 20.5l4-2 4 2-1.5-5"/><circle cx="12" cy="9.5" r="1.5"/>',
    processor: '<rect x="6.5" y="6.5" width="11" height="11" rx="1.5"/><rect x="9.5" y="9.5" width="5" height="5" rx=".8"/><path d="M9.5 3.5v3M14.5 3.5v3M9.5 17.5v3M14.5 17.5v3M3.5 9.5h3M3.5 14.5h3M17.5 9.5h3M17.5 14.5h3"/>',
    memory: '<rect x="3.5" y="7" width="17" height="9.5" rx="1.5"/><path d="M7.5 10.5v2.5M11 10.5v2.5M14.5 10.5v2.5M6 16.5v2.5M18 16.5v2.5"/>',
    disk: '<rect x="3.5" y="6.5" width="17" height="11" rx="2"/><path d="M6.5 12h6"/><circle cx="16.5" cy="12" r="1.2"/>',
    uptime: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    free: '<path d="M4 15.5a8 8 0 1 1 16 0"/><path d="M12 15.5 15.5 10"/><path d="M4 19.5h16"/>',
    heat: '<path d="M10 14.5V5a2 2 0 0 1 4 0v9.5a4 4 0 1 1-4 0z"/><path d="M12 11v5"/>',
  };
  const MEASURES = { processor: 'Processor', memory: 'Memory', disk: 'Disk activity', uptime: 'Since restart', startup: 'At startup', free: 'Free space', heat: 'Heat' };
  const ACTIONS = { 'view:files': 'Open Folders', 'view:tasks': 'Open Tasks', 'view:hardware': 'Open Hardware', free: 'Free up memory', startup: 'Open the startup apps' };
  const STATES = { ok: 'Fine', warn: 'Be careful', bad: 'Risky', neutral: 'Not reported' };
  const LAMPS = { ok: 'high', warn: 'medium', bad: 'low' };
  const worst = list => list.some(x => x.level === 'bad') ? 'bad' : list.some(x => x.level === 'warn') ? 'warn' : 'ok';
  const state = level => level === 'unknown' ? 'neutral' : level;
  const svg = path => `<svg viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;

  // The gradients of an inline SVG resolve their colors where they are defined, so each seal needs its own ids.
  function shield(id) {
    return `<svg class="seal__shield" viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="${id}-body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--lamp-hi)"/><stop offset=".5" style="stop-color:var(--lamp)"/><stop offset="1" style="stop-color:var(--lamp-lo)"/></linearGradient>`
      + `<linearGradient id="${id}-face" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--lamp)"/><stop offset="1" style="stop-color:var(--lamp-lo)"/></linearGradient>`
      + `<linearGradient id="${id}-rim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></linearGradient>`
      + `<linearGradient id="${id}-gloss" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`
      + `<filter id="${id}-shadow" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="2.2" stdDeviation="2.2" flood-color="#000" flood-opacity=".8"/></filter><filter id="${id}-bloom" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4"/></filter></defs>`
      + `<path d="M32 6 54 14v16c0 14-9 24-22 29C19 54 10 44 10 30V14z" style="fill:var(--lamp)" opacity=".55" filter="url(#${id}-bloom)"/><g filter="url(#${id}-shadow)"><path d="M32 6 54 14v16c0 14-9 24-22 29C19 54 10 44 10 30V14z" fill="url(#${id}-body)"/>`
      + `<path d="M32 6 54 14v16c0 14-9 24-22 29C19 54 10 44 10 30V14z" fill="none" stroke="url(#${id}-rim)" stroke-width="1.6"/><path d="M32 11.5 49 17.6V30c0 10.6-6.8 18.4-17 22.6C21.8 48.4 15 40.6 15 30V17.6z" fill="url(#${id}-face)"/>`
      + `<path d="M32 11.5 49 17.6V30c0 10.6-6.8 18.4-17 22.6C21.8 48.4 15 40.6 15 30V17.6z" fill="none" stroke="#000" stroke-opacity=".35" stroke-width="1"/>`
      + `<path d="M23 31.5 29.6 38 42 24.5" fill="none" stroke="#000" stroke-opacity=".5" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" transform="translate(0 1.3)"/><path d="M23 31.5 29.6 38 42 24.5" fill="none" stroke="#fff" stroke-opacity=".95" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/>`
      + `<path d="M32 11.5 49 17.6V28c-6 3-11 4.4-17 4.4S21 31 15 28V17.6z" fill="url(#${id}-gloss)" opacity=".7"/></g></svg>`;
  }

  function act(action) {
    if (action.startsWith('view:')) showView(action.slice(5));
    else if (action === 'free') { if (Bramble.tasks) Bramble.tasks.free(); else showView('tasks'); }
    else send('health.open', { target: action });
  }

  function link(action) {
    const b = Object.assign(document.createElement('button'), { className: 'link check__open', textContent: tr(ACTIONS[action] || 'Open') });
    b.addEventListener('click', () => act(action));
    return b;
  }

  function check(level, icon, title, detail, value, action) {
    const el = document.createElement('div');
    el.className = 'check health-check check--' + state(level);
    el.innerHTML = `<span class="health-icon" role="img">${svg(icon || ICONS.antivirus)}</span><div class="check__what"><span class="check__title"></span><span class="check__detail"></span></div>`;
    el.firstChild.setAttribute('aria-label', tr(STATES[state(level)]));
    el.querySelector('.check__title').textContent = title;
    el.querySelector('.check__detail').textContent = el.querySelector('.check__detail').title = detail || '';
    const shown = value ? Object.assign(document.createElement('span'), { className: 'check__value' }) : null;
    if (shown) { shown.append(Object.assign(document.createElement('span'), { textContent: value })); el.append(shown); }
    if (action) (shown || el).append(link(action));
    return el;
  }

  function head(seal, title, why) {
    const h = document.createElement('div');
    h.className = 'security__head';
    h.innerHTML = `<span class="seal">${seal}</span><div class="security__verdict"><span class="security__title"></span><span class="security__why"></span></div>`;
    h.querySelector('.security__title').textContent = title;
    h.querySelector('.security__why').textContent = why;
    return h;
  }

  // The state of the whole PC, from the findings and the checks: also shown on Home.
  function overall(r) {
    const all = r.slow.concat(r.checks);
    return worst(all);
  }

  function verdict(r) {
    const bad = r.slow.filter(f => f.level !== 'ok');
    return bad.length ? tr(bad.length === 1 ? '1 thing slows this PC' : '{0} things slow this PC', bad.length) : tr('Nothing slows this PC');
  }

  function face(id, level) {
    const mouth = { ok: 'M21.5 35.5Q32 46.5 42.5 35.5', warn: 'M22.5 39.5H41.5', bad: 'M21.5 43Q32 33 42.5 43' }[level];
    return `<svg class="seal__shield seal__face" viewBox="0 0 64 64" aria-hidden="true"><defs><radialGradient id="${id}-body" cx=".38" cy=".32" r=".75"><stop offset="0" style="stop-color:var(--lamp-hi)"/><stop offset=".45" style="stop-color:var(--lamp)"/><stop offset="1" style="stop-color:var(--lamp-lo)"/></radialGradient>`
      + `<linearGradient id="${id}-gloss" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".5"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`
      + `<filter id="${id}-shadow" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="2.2" stdDeviation="2.2" flood-color="#000" flood-opacity=".8"/></filter><filter id="${id}-bloom" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4"/></filter></defs>`
      + `<circle cx="32" cy="32" r="22" style="fill:var(--lamp)" opacity=".55" filter="url(#${id}-bloom)"/><g filter="url(#${id}-shadow)"><circle cx="32" cy="32" r="22" fill="url(#${id}-body)"/>`
      + `<circle cx="32" cy="32" r="21.3" fill="none" stroke="#000" stroke-opacity=".35" stroke-width="1"/>`
      + `<g fill="none" stroke="#000" stroke-opacity=".45" stroke-width="5" stroke-linecap="round" transform="translate(0 1.2)"><path d="M25.5 25v3.5M38.5 25v3.5"/><path d="${mouth}"/></g>`
      + `<g fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"><path d="M25.5 25v3.5M38.5 25v3.5"/><path d="${mouth}"/></g>`
      + `<path d="M15 26a17 13 0 0 1 34 0c-6 3-11 4-17 4s-11-1-17-4z" fill="url(#${id}-gloss)" opacity=".6"/></g></svg>`;
  }

  // How full each measure is, for its row of lights: what counts as a lot differs from one to the other.
  const SCALES = { processor: 100, memory: 100, disk: 100, uptime: 14, startup: 20, free: 100, heat: 100 };
  function fill(m) {
    let v = parseFloat(String(m.value).replace(',', '.')) || 0;
    if (m.id === 'uptime' && /h/.test(m.value)) v /= 24;
    if (m.id === 'free') v = 100 - v;
    return Math.max(0, Math.min(1, v / (SCALES[m.id] || 100)));
  }

  function renderSlow() {
    const card = $('health-slow');
    const bad = report.slow.filter(f => f.level !== 'ok');
    card.className = 'security health-card security--' + LAMPS[worst(report.slow)];
    const top = document.createElement('div');
    top.className = 'security__head';
    top.innerHTML = `<span class="seal">${face('health-face', overall(report))}</span><div class="security__verdict"><span class="led-panel"><span class="led-text"></span></span></div>`;
    top.querySelector('.led-text').textContent = verdict(report);
    const screen = Object.assign(document.createElement('span'), { className: 't-memory__screen health-time', textContent: checking ? tr('Checking…') : tr('Checked at {0}', report.when) });
    top.append(screen);
    const parts = [top];
    if (bad.length) {
      const list = document.createElement('div');
      list.className = 'security__checks health-findings';
      list.append(...bad.map(f => check(f.level, ICONS[f.icon] || ICONS.processor, f.title, f.detail, null, f.action)));
      parts.push(list);
    }
    const measures = document.createElement('div');
    measures.className = 'health-measures';
    for (const m of report.measures || []) {
      const el = document.createElement('div');
      el.className = 'health-measure check--' + state(m.level) + ' security--' + (LAMPS[m.level] || 'high');
      el.innerHTML = `<span class="health-measure__head"><span class="health-measure__icon" role="img">${svg(ICONS[m.id] || ICONS.processor)}</span><span class="health-measure__name"></span></span>`
        + '<span class="health-measure__screen"><b class="led-text"></b></span><span class="health-measure__lights" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>';
      el.querySelector('.health-measure__icon').setAttribute('aria-label', tr(STATES[state(m.level)]));
      el.querySelector('.health-measure__name').textContent = tr(MEASURES[m.id] || m.id);
      el.querySelector('b').textContent = m.value;
      const lit = Math.max(1, Math.round(fill(m) * 8));
      [...el.querySelector('.health-measure__lights').children].forEach((i, k) => i.classList.toggle('on', k < lit));
      measures.append(el);
    }
    parts.push(measures);
    card.replaceChildren(...parts, next(bad.length ? tr('Each button opens what helps, nothing is changed without you') : tr('Measured now: Bramble reads, it changes nothing'), true));
  }

  function renderRadar() {
    const card = $('health-radar');
    const checks = report.checks.filter(c => c.id !== 'startup'), bad = checks.filter(c => c.level === 'warn' || c.level === 'bad');
    card.className = 'security health-card security--' + LAMPS[worst(checks)];
    const top = head(shield('health-shield'), bad.length ? tr(bad.length === 1 ? '1 point to look at' : '{0} points to look at', bad.length) : tr('Every check is fine'),
      tr('{0} checks read without administrator rights', checks.length));
    const list = document.createElement('div');
    list.className = 'security__checks';
    list.append(...checks.map(c => check(c.level, ICONS[c.id], tr(TITLES[c.id] || c.id), c.detail, c.value, c.level === 'ok' ? null : c.action)));
    const first = checks.find(c => c.level === 'bad') || checks.find(c => c.level === 'warn');
    card.replaceChildren(top, list, next(first ? tr('Start with {0}: {1}', tr(TITLES[first.id] || first.id), first.detail) : tr('Read only: each button opens the right place in Windows'), false));
    renderStartup(report.checks.find(c => c.id === 'startup'));
  }

  // Startup is a list to tidy rather than a yes or no check, so it has its own card with what it means and where to change it.
  function renderStartup(c) {
    const zone = $('health-startup');
    if (!c) { zone.replaceChildren(); return; }
    const row = document.createElement('div');
    row.className = 'health-startup check--' + state(c.level);
    row.innerHTML = `<span class="health-icon" role="img">${svg(ICONS.startup)}</span><div class="health-startup__what"><span class="health-startup__title"></span><span class="health-startup__names"></span><span class="health-startup__help"></span></div>`;
    row.querySelector('.health-startup__title').textContent = c.value;
    row.querySelector('.health-startup__names').textContent = c.detail;
    row.querySelector('.health-startup__help').textContent = tr('Each one starts with Windows and stays in memory. They can be turned off in the startup apps of Windows, without uninstalling them.');
    const open = Object.assign(document.createElement('button'), { className: 'button', textContent: tr('Open the startup apps') });
    open.addEventListener('click', () => act('startup'));
    row.append(open);
    zone.replaceChildren(row);
  }

  function next(tip, again) {
    const n = document.createElement('div');
    n.className = 'security__next';
    n.innerHTML = '<span class="security__tip"></span>';
    n.firstChild.textContent = tip;
    if (again) {
      const b = document.createElement('button');
      b.className = 'keycap-pill keycap-test';
      b.dataset.state = checking ? 'progress' : 'ready';
      b.disabled = checking;
      b.innerHTML = '<span class="dome"><svg class="i-ready" viewBox="0 0 24 24" aria-hidden="true"><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4v4h-4"/></svg><svg class="i-progress" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5a8.5 8.5 0 1 1-8.5 8.5"/></svg></span><span></span>';
      b.lastChild.textContent = tr(checking ? 'Checking…' : 'Check again');
      b.addEventListener('click', () => send('health.scan', { again: true }));
      n.append(b);
    }
    return n;
  }

  function render() {
    if (Bramble.home && Bramble.home.health) Bramble.home.health(report && !report.failed ? { level: overall(report), text: verdict(report) } : null);
    if (!shown) return;
    if (checking && !report) {
      $('health-slow').replaceChildren(Object.assign(document.createElement('div'), { className: 'row loading', textContent: tr('Checking') }));
      return;
    }
    if (!report || report.failed) {
      $('health-slow').className = 'security health-card security--medium';
      $('health-slow').replaceChildren(head(face('health-face', 'warn'), tr('Windows could not be read'), tr('Check again in a moment')), next('', true));
      $('health-radar').replaceChildren();
      $('health-startup').replaceChildren();
      return;
    }
    renderSlow();
    renderRadar();
  }

  function event(m) {
    if (m.type === 'health.scanning') { checking = true; render(); return; }
    if (m.type !== 'health.report') return;
    checking = false;
    report = m;
    render();
  }

  function visible(yes) {
    shown = yes;
    if (yes) { render(); send('health.scan', { again: false }); }
  }

  Bramble.health = { event, visible, face };
})();
