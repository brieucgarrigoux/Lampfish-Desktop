'use strict';

(function () {
  let report = null, shown = false, checking = false;
  const TITLES = {
    antivirus: 'Antivirus', firewall: 'Firewall', updates: 'Windows updates', restart: 'Restart', encryption: 'Disk encryption',
    secureBoot: 'Secure Boot', uac: 'Account control', space: 'Disk space', startup: 'Startup',
  };
  const MEASURES = { processor: 'Processor', memory: 'Memory', disk: 'Disk activity', uptime: 'Since restart', startup: 'At startup', free: 'Free space', heat: 'Heat' };
  const ACTIONS = { 'view:files': 'Open Folders', 'view:tasks': 'Open Tasks', 'view:hardware': 'Open Hardware', free: 'Free up memory' };
  const STATES = { ok: 'Fine', warn: 'Be careful', bad: 'Risky', neutral: 'Not reported' };
  const LAMPS = { ok: 'high', warn: 'medium', bad: 'low' };
  const COLORS = { ok: ['#e2d0ff', '#9461f3'], warn: ['#ffe9b8', '#f0b955'], bad: ['#ffc2c8', '#ff5566'] };
  const worst = list => list.some(x => x.level === 'bad') ? 'bad' : list.some(x => x.level === 'warn') ? 'warn' : 'ok';
  const state = level => level === 'unknown' ? 'neutral' : level;

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
  const GAUGE = '<svg class="seal__gauge" viewBox="0 0 24 24" aria-hidden="true"><path d="M4.2 16.5a8.2 8.2 0 1 1 15.6 0"/><path d="m12 15.8 4.2-5.2"/><circle cx="12" cy="15.8" r="1.5"/></svg>';

  function act(action) {
    if (action.startsWith('view:')) showView(action.slice(5));
    else if (action === 'free') { if (Bramble.tasks) Bramble.tasks.free(); else showView('tasks'); }
    else send('health.open', { target: action });
  }

  function check(level, title, detail, value, action) {
    const el = document.createElement('div');
    el.className = 'check check--' + state(level);
    el.innerHTML = '<span class="jewel" role="img"></span><div class="check__what"><span class="check__title"></span><span class="check__detail"></span></div>';
    el.querySelector('.jewel').setAttribute('aria-label', tr(STATES[state(level)]));
    el.querySelector('.check__title').textContent = title;
    el.querySelector('.check__detail').textContent = el.querySelector('.check__detail').title = detail || '';
    const shown = value ? Object.assign(document.createElement('span'), { className: 'check__value' }) : null;
    if (shown) { shown.append(Object.assign(document.createElement('span'), { textContent: value })); el.append(shown); }
    if (action) {
      const b = Object.assign(document.createElement('button'), { className: 'link check__open', textContent: tr(ACTIONS[action] || 'Open') });
      b.addEventListener('click', () => act(action));
      (shown || el).append(b);
    }
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

  function renderSlow() {
    const card = $('health-slow');
    const slow = report.slow, bad = slow.filter(f => f.level !== 'ok');
    card.className = 'security health-card security--' + LAMPS[worst(slow)];
    const top = head(GAUGE, bad.length ? tr(bad.length === 1 ? '1 thing slows this PC' : '{0} things slow this PC', bad.length) : tr('Nothing slows this PC'),
      tr('Processor, memory, disk, restarts, startup, space, energy and heat'));
    const screen = Object.assign(document.createElement('span'), { className: 't-memory__screen health-time', textContent: checking ? tr('Checking…') : tr('Checked at {0}', report.when) });
    top.append(screen);
    const parts = [top];
    if (bad.length) {
      const list = document.createElement('div');
      list.className = 'security__checks health-findings';
      list.append(...bad.map(f => check(f.level, f.title, f.detail, null, f.action)));
      parts.push(list);
    }
    const measures = document.createElement('div');
    measures.className = 'health-measures';
    for (const m of report.measures || []) {
      const el = document.createElement('div');
      el.className = 'health-measure check--' + state(m.level);
      el.innerHTML = '<span class="jewel" role="img"></span><span class="health-measure__name"></span><b></b>';
      el.querySelector('.jewel').setAttribute('aria-label', tr(STATES[state(m.level)]));
      el.querySelector('.health-measure__name').textContent = tr(MEASURES[m.id] || m.id);
      el.querySelector('b').textContent = m.value;
      measures.append(el);
    }
    parts.push(measures);
    card.replaceChildren(...parts, next(bad.length ? tr('Each button opens what helps, nothing is changed without you') : tr('Measured now: Bramble reads, it changes nothing'), true));
  }

  function renderRadar() {
    const card = $('health-radar');
    const checks = report.checks, bad = checks.filter(c => c.level === 'warn' || c.level === 'bad');
    card.className = 'security health-card security--' + LAMPS[worst(checks)];
    const top = head(shield('health-shield'), bad.length ? tr(bad.length === 1 ? '1 point to look at' : '{0} points to look at', bad.length) : tr('Every check is fine'),
      tr('{0} checks read without administrator rights', checks.length));
    // One light per check, in its own color, instead of a score.
    const meter = document.createElement('div');
    meter.className = 'security__meter health-lights';
    meter.setAttribute('aria-hidden', 'true');
    for (const c of checks) {
      const i = document.createElement('i');
      if (COLORS[c.level]) { i.className = 'on'; i.style.setProperty('--lamp-hi', COLORS[c.level][0]); i.style.setProperty('--lamp', COLORS[c.level][1]); }
      i.title = tr(TITLES[c.id] || c.id);
      meter.append(i);
    }
    top.append(meter);
    const list = document.createElement('div');
    list.className = 'security__checks';
    list.append(...checks.map(c => check(c.level, tr(TITLES[c.id] || c.id), c.detail, c.value, c.level === 'ok' && c.id !== 'startup' ? null : c.action)));
    const first = checks.find(c => c.level === 'bad') || checks.find(c => c.level === 'warn');
    card.replaceChildren(top, list, next(first ? tr('Start with {0}: {1}', tr(TITLES[first.id] || first.id), first.detail) : tr('Read only: each button opens the right place in Windows'), false));
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
    if (checking && !report) {
      $('health-slow').replaceChildren(Object.assign(document.createElement('div'), { className: 'row loading', textContent: tr('Checking') }));
      return;
    }
    if (!report || report.failed) {
      $('health-slow').className = 'security health-card security--medium';
      $('health-slow').replaceChildren(head(GAUGE, tr('Windows could not be read'), tr('Check again in a moment')), next('', true));
      $('health-radar').replaceChildren();
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
    if (yes) send('health.scan', { again: false });
  }

  Bramble.health = { event, visible };
})();
