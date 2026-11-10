'use strict';

(function () {
  let report = null, shown = false, checking = false, toggled = {};
  const TITLES = {
    antivirus: 'Antivirus', firewall: 'Firewall', updates: 'Windows updates', restart: 'Restart', encryption: 'Disk encryption',
    secureBoot: 'Secure Boot', uac: 'Account control', space: 'Disk space', startup: 'Startup',
  };
  const ICONS = {
    antivirus: 'shield-check',
    firewall: 'lf-firewall',
    updates: 'arrows-clockwise',
    restart: 'arrow-clockwise',
    encryption: 'lock-simple',
    secureBoot: 'lf-secure-boot',
    uac: 'user-gear',
    space: 'hard-drive',
    startup: 'rocket-launch',
    processor: 'cpu',
    memory: 'lf-memory',
    disk: 'hard-drive',
    uptime: 'clock',
    free: 'chart-pie',
    heat: 'thermometer-simple',
  };
  const MEASURES = { processor: 'Processor', memory: 'Memory', disk: 'Disk activity', uptime: 'Since restart', startup: 'At startup', free: 'Free space', heat: 'Heat' };
  const ACTIONS = { 'view:files': 'Open Storage', 'view:tasks': 'Open Tasks', 'view:hardware': 'Open Hardware', free: 'Free up memory', startup: 'Open the startup apps', power: 'Choose the power mode' };
  const STATES = { ok: 'Fine', warn: 'Be careful', bad: 'Risky', neutral: 'Not reported' };
  const LAMPS = { ok: 'high', warn: 'medium', bad: 'low' };
  const worst = list => list.some(x => x.level === 'bad') ? 'bad' : list.some(x => x.level === 'warn') ? 'warn' : 'ok';
  const state = level => level === 'unknown' ? 'neutral' : level;

  function act(action) {
    if (action.startsWith('view:')) showView(action.slice(5));
    else if (action === 'free') { if (Lampfish.tasks) Lampfish.tasks.free(); else showView('tasks'); }
    else send('health.open', { target: action });
  }

  function link(action) {
    const b = Object.assign(document.createElement('button'), { className: 'link', innerHTML: icon(action === 'free' ? 'broom' : 'arrow-square-out') });
    b.append(tr(ACTIONS[action] || 'Open'));
    b.addEventListener('click', () => act(action));
    return b;
  }

  function readout(level, symbol, title, detail, value, action) {
    const el = document.createElement('div');
    el.className = 'readout check--' + state(level);
    el.innerHTML = `<svg class="ph glyph" role="img"><use href="icons.svg#${symbol || ICONS.antivirus}"/></svg><span class="readout__what"><span class="readout__title"></span><span class="readout__detail"></span></span><span class="readout__end"></span>`;
    el.firstChild.setAttribute('aria-label', tr(STATES[state(level)]));
    el.querySelector('.readout__title').textContent = title;
    el.querySelector('.readout__detail').textContent = el.querySelector('.readout__detail').title = detail || '';
    const end = el.lastChild;
    if (value) {
      const v = Object.assign(document.createElement('span'), { className: 'readout__value', innerHTML: '<i></i><span></span>' });
      v.lastChild.textContent = v.lastChild.title = value;
      end.append(v);
    }
    if (action) end.append(link(action));
    return el;
  }

  // A round instrument with a screen in a metal bezel beside it, as on a dashboard.
  function head(seal, title, sub, extra) {
    const h = document.createElement('div');
    h.className = 'security__head';
    h.innerHTML = `<span class="seal">${seal}</span><div class="bezel"><div class="bezel__glass"><div class="bezel__text"><span class="led-text"></span><span class="bezel__sub"></span></div></div></div>`;
    h.querySelector('.led-text').textContent = title;
    h.querySelector('.bezel__sub').textContent = sub;
    if (extra) h.querySelector('.bezel__glass').append(extra);
    return h;
  }

  // Startup has its own card and disk space its own measure, so the protection checks keep only what protects the PC.
  const radar = r => r.checks.filter(c => c.id !== 'startup' && c.id !== 'space');
  const findings = r => r.slow.filter(f => f.level !== 'ok');

  function protection(r) {
    const bad = radar(r).filter(c => c.level === 'warn' || c.level === 'bad');
    return bad.length ? tr(bad.length === 1 ? '1 point to look at' : '{0} points to look at', bad.length) : tr('Every check is fine');
  }

  // One cause: its own words. Several: they are named, each one explained in the list below.
  function verdict(r) {
    const bad = findings(r);
    if (bad.length === 1 && bad[0].verdict) return bad[0].verdict;
    if (bad.length > 1 && bad.every(f => f.cause)) return tr('{0} causes slow this PC: {1}', bad.length, bad.map(f => f.cause).join(', '));
    return bad.length ? tr(bad.length === 1 ? '1 thing slows this PC' : '{0} things slow this PC', bad.length) : tr('Nothing slows this PC');
  }

  const face = (id, level) => faceLight(id, LAMPS[level] || 'medium');


  // The lights show the value itself, so they read like the number above them; what counts as a lot differs from one measure to the other.
  const MEANINGS = {
    processor: ['How busy the processor is right now', '80 %'], memory: ['Share of the memory in use', '75 %'], disk: ['Share of the time the disk is busy', '90 %'],
    uptime: ['Time since the last real restart', '7 days'], free: ['Free room on the system drive', '10 %'], heat: ['Temperature of the processor thermal zone', '90 °C'],
  };
  const SCALES = { processor: 100, memory: 100, disk: 100, uptime: 7, free: 100, heat: 100 };
  const TARGETS = { processor: 'view:tasks', memory: 'free', disk: 'view:tasks', free: 'view:files', heat: 'view:hardware' };
  function word(m) {
    const v = parseFloat(m.value) || 0;
    switch (m.id) {
      case 'processor': case 'memory': case 'disk': return tr(v < 15 ? 'Idle' : v < 50 ? 'Moderate' : v < 85 ? 'Busy' : 'Maxed out');
      case 'heat': return tr(v < 60 ? 'Cool' : v < 85 ? 'Warm' : 'Hot');
      case 'uptime': return tr(m.level === 'ok' ? 'Restarted lately' : 'Restart advised');
      case 'free': return tr(m.level === 'ok' ? 'Enough room' : m.level === 'warn' ? 'Getting full' : 'Almost no room');
    }
    return '';
  }

  function fill(m) {
    let v = parseFloat(String(m.value).replace(',', '.')) || 0;
    if (m.id === 'uptime' && /h/.test(m.value)) v /= 24;
    return Math.max(0, Math.min(1, v / (SCALES[m.id] || 100)));
  }



  function renderSlow() {
    const card = $('health-slow');
    const bad = findings(report), level = worst(report.slow);
    card.className = 'security health-card security--' + LAMPS[level];
    const parts = [head(face('health-face', level), verdict(report), checking ? tr('Checking…') : bad.length === 1 && bad[0].verdict ? bad[0].detail : tr('Checked at {0}', report.when))];
    if (bad.length) {
      const list = document.createElement('div');
      list.className = 'readouts';
      list.append(...bad.map(f => readout(f.level, ICONS[f.icon] || ICONS.processor, f.title, bad.length === 1 && f.verdict ? '' : f.detail, null, f.action)));
      parts.push(list);
    }
    const measures = document.createElement('div');
    measures.className = 'dials dials--rows health-measures';
    const shownMeasures = (report.measures || []).filter(m => m.id !== 'startup');
    measures.style.setProperty('--count', shownMeasures.length);
    dials(measures, shownMeasures.map(m => ({ key: m.id, part: fill(m) * 100, value: m.value, label: tr(MEASURES[m.id] || m.id), level: LAMPS[m.level] || 'high',
      sub: m.top ? tr('Mostly {0}', m.top) : '',
      action: TARGETS[m.id] ? () => act(TARGETS[m.id]) : null,
      details: { title: tr(MEASURES[m.id] || m.id), value: m.value, note: MEANINGS[m.id] ? tr(MEANINGS[m.id][0]) : '',
        lines: [[tr('Status'), word(m)], ...(m.top ? [[tr('Busiest'), m.top + ', ' + m.topShare + ' %']] : []), [m.id === 'free' ? tr('Watch below') : tr('Watch from'), MEANINGS[m.id] ? tr(MEANINGS[m.id][1]) : '']] } })));
    parts.push(measures);
    card.replaceChildren(...parts, next('', true));
  }

  function renderRadar() {
    const card = $('health-radar');
    const checks = radar(report);
    card.className = 'security health-card security--' + LAMPS[worst(checks)];
    const list = document.createElement('div');
    list.className = 'readouts readouts--two';
    list.append(...checks.map(c => readout(c.level, ICONS[c.id], tr(TITLES[c.id] || c.id), c.detail, c.value, c.level === 'ok' ? null : c.action)));
    const flagged = checks.filter(c => c.level === 'warn' || c.level === 'bad').map(c => tr(TITLES[c.id] || c.id));
    card.replaceChildren(head(shieldLight('health-shield', LAMPS[worst(checks)]), protection(report), flagged.length ? flagged.join(', ') : tr('Checked at {0}', report.when)), list);
    renderStartup(report.checks.find(c => c.id === 'startup'), (report.startup || []).filter(i => typeof i === 'object'));
  }

  // Startup is a list to tidy rather than a yes or no check: what these programs cost, each one with its logo and its switch.
  function renderStartup(c, items) {
    const zone = $('health-startup');
    if (!c) { zone.replaceChildren(); return; }
    // A switch flipped since the last report keeps its new place while Windows is read again.
    items = items.map(i => i.id in toggled ? Object.assign({}, i, { enabled: toggled[i.id] }) : i);
    const on = items.filter(i => i.enabled).length;
    const card = document.createElement('div');
    card.className = 'health-startup check--' + state(c.level);
    card.innerHTML = `<div class="health-startup__head">${icon(ICONS.startup, 'glyph')}<span class="health-startup__title"></span><span class="health-startup__state"></span></div>`
      + '<p class="health-startup__help"></p><div class="readouts health-startup__apps"></div><div class="health-startup__foot"><span></span></div>';
    card.querySelector('.health-startup__title').textContent = on === 1 ? tr('1 program starts with Windows') : tr('{0} programs start with Windows', on);
    // Fewer than eleven needs no word; more than that gets a lamp and the reason.
    const warning = card.querySelector('.health-startup__state');
    if (c.level === 'ok') warning.remove(); else { warning.classList.add('state', 'state--warn'); warning.textContent = tr('More than 10 slows the start'); }
    card.querySelector('.health-startup__help').textContent = tr('They open by themselves at every start, before anything is clicked. Each one makes the start longer and keeps some memory afterwards.');
    card.querySelector('.health-startup__apps').append(...items.map(startupRow));
    card.querySelector('.health-startup__foot span').textContent = tr('Turned off, a program stays installed and still opens when launched.');
    const open = Object.assign(document.createElement('button'), { className: 'button', innerHTML: icon('rocket-launch') });
    open.append(tr('Startup apps of Windows'));
    open.addEventListener('click', () => act('startup'));
    card.querySelector('.health-startup__foot').append(open);
    zone.replaceChildren(card);
  }

  function startupRow(item) {
    const row = document.createElement('div');
    row.className = 'readout health-app' + (item.enabled ? '' : ' health-app--off');
    row.innerHTML = '<span class="health-app__logo"></span><span class="readout__what"><span class="readout__title" translate="no"></span><span class="readout__detail" translate="no"></span></span><span class="readout__end"></span>';
    const logo = row.querySelector('.health-app__logo');
    if (item.icon) logo.append(Object.assign(document.createElement('img'), { src: item.icon, alt: '' }));
    else logo.innerHTML = icon(ICONS.startup);
    row.querySelector('.readout__title').textContent = item.name;
    row.querySelector('.readout__detail').textContent = item.publisher || '';
    const end = row.querySelector('.readout__end');
    if (item.machine) {
      end.append(Object.assign(document.createElement('span'), { className: 'health-app__lock', textContent: tr(item.enabled ? 'On, for every user' : 'Off, for every user'), title: tr('Needs administrator rights: change it in the startup apps of Windows') }));
    } else {
      const toggle = Object.assign(document.createElement('label'), { className: 'toggler' });
      const box = Object.assign(document.createElement('input'), { type: 'checkbox', checked: item.enabled });
      box.setAttribute('aria-label', item.name);
      box.addEventListener('change', () => { toggled[item.id] = box.checked; row.classList.toggle('health-app--off', !box.checked); send('health.startup', { id: item.id, on: box.checked }); });
      toggle.append(box);
      end.append(toggle);
    }
    return row;
  }

  const EYE = 'eye';
  const PRIVACY = {
    ads: ['Advertising ID', 'Lets apps show ads based on activity', 'megaphone-simple'],
    tailored: ['Tailored experiences', 'Tips and ads drawn from diagnostic data', 'sparkle'],
    suggestions: ['Suggestions in Windows', 'Tips and app ads in Start, Settings and the lock screen', 'lightbulb'],
    typing: ['Inking and typing data', 'Sends typing and handwriting to improve recognition', 'lf-keyboard-keys'],
    languages: ['Language list for websites', 'Websites can read the languages of Windows', 'translate'],
    launches: ['App launch tracking', 'Windows notes the apps opened to sort Start and search', 'squares-four'],
    speech: ['Online speech recognition', 'The voice goes to Microsoft to be recognized', 'microphone'],
    feedback: ['Feedback requests', 'Windows asks for an opinion from time to time', 'chat'],
    cloudSearch: ['Cloud search', 'Windows Search also looks in Microsoft accounts', 'cloud'],
  };
  let privacy = null;
  function renderPrivacy() {
    const zone = $('health-privacy');
    if (!privacy) { zone.replaceChildren(); return; }
    const focused = zone.contains(document.activeElement) ? document.activeElement.dataset.privacy : null;
    const on = privacy.filter(p => p.on).length;
    const card = document.createElement('div');
    card.className = 'health-startup check--' + (on ? 'warn' : 'ok');
    card.innerHTML = `<div class="health-startup__head">${icon(EYE, 'glyph')}<span class="health-startup__title"></span><span class="health-startup__state"></span></div>`
      + '<p class="health-startup__help"></p><div class="readouts health-startup__apps"></div><div class="health-startup__foot"><span></span></div>';
    card.querySelector('.health-startup__title').textContent = on === 0 ? tr('Windows shares nothing extra') : on === 1 ? tr('1 kind of sharing is on') : tr('{0} kinds of sharing are on', on);
    card.querySelector('.health-startup__state').textContent = tr('{0} of {1}', on, privacy.length);
    card.querySelector('.health-startup__help').textContent = tr('What Windows sends or shows about how this PC is used. Each switch is the one of the Windows settings, for this user only.');
    card.querySelector('.health-startup__apps').append(...privacy.filter(p => PRIVACY[p.id]).map(privacyRow));
    card.querySelector('.health-startup__foot span').textContent = tr('Turned off, Windows works the same, with fewer ads and suggestions.');
    const open = Object.assign(document.createElement('button'), { className: 'button', innerHTML: icon('lock-key') });
    open.append(tr('Privacy settings of Windows'));
    open.addEventListener('click', () => act('privacy'));
    card.querySelector('.health-startup__foot').append(open);
    zone.replaceChildren(card);
    if (focused) { const box = card.querySelector(`[data-privacy="${focused}"]`); if (box) box.focus(); }
  }

  function privacyRow(p) {
    const [title, detail, symbol] = PRIVACY[p.id];
    const row = document.createElement('div');
    row.className = 'readout health-app' + (p.on ? '' : ' health-app--off');
    row.innerHTML = `<span class="health-app__logo">${icon(symbol)}</span><span class="readout__what"><span class="readout__title"></span><span class="readout__detail"></span></span><span class="readout__end"></span>`;
    row.querySelector('.readout__title').textContent = tr(title);
    row.querySelector('.readout__detail').textContent = tr(detail);
    const end = row.querySelector('.readout__end');
    if (p.managed) {
      end.append(Object.assign(document.createElement('span'), { className: 'health-app__lock', textContent: tr(p.on ? 'On, set by the organization' : 'Off, set by the organization') }));
      return row;
    }
    const toggle = Object.assign(document.createElement('label'), { className: 'toggler' });
    const box = Object.assign(document.createElement('input'), { type: 'checkbox', checked: p.on });
    box.dataset.privacy = p.id;
    box.setAttribute('aria-label', tr(title));
    box.addEventListener('change', () => { row.classList.toggle('health-app--off', !box.checked); send('health.privacySet', { id: p.id, on: box.checked, title: tr(title) }); });
    toggle.append(box);
    end.append(toggle);
    return row;
  }

  function next(tip, again) {
    const n = document.createElement('div');
    n.className = 'security__next';
    if (tip) n.append(Object.assign(document.createElement('span'), { className: 'security__tip', textContent: tip }));
    if (again) {
      const b = document.createElement('button');
      b.className = 'keycap-pill keycap-test';
      b.dataset.state = checking ? 'progress' : 'ready';
      b.disabled = checking;
      b.innerHTML = '<span class="dome">' + icon('arrows-clockwise', 'i-ready') + icon('lf-spinner', 'i-progress') + '</span><span></span>';
      b.lastChild.textContent = tr(checking ? 'Checking…' : 'Check again');
      b.addEventListener('click', () => send('health.scan', { again: true }));
      n.append(b);
    }
    return n;
  }

  function render() {
    if (Lampfish.home && Lampfish.home.health) Lampfish.home.health(report && !report.failed ? { level: worst(report.slow), text: verdict(report), protectionLevel: worst(radar(report)), protection: protection(report) } : null);
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
    renderPrivacy();
  }

  function event(m) {
    if (m.type === 'health.privacy') { privacy = m.items; if (shown) renderPrivacy(); return; }
    if (m.type === 'health.scanning') { checking = true; render(); return; }
    if (m.type !== 'health.report') return;
    checking = false;
    report = m;
    toggled = {};
    render();
  }

  function visible(yes) {
    shown = yes;
    if (yes) { render(); send('health.scan', { again: false }); send('health.privacy'); }
  }

  Lampfish.health = { event, visible };
})();
